# Jouer en ligne à 4 — analyse et plan (19/10/2026)

Objectif : 4 joueurs humains, chacun chez soi, dans un même match 2 contre 2 ; puis matchmaking et classement.
Rien n'est codé, c'est une analyse. Le gameplay reste la priorité : la phase 0 se fait à côté, sans toucher au ressenti.

## 1. Ce que le code permet déjà (mesuré aujourd'hui)

| Constat | Où | Pourquoi ça compte |
|---|---|---|
| Simulation séparée du rendu, sans Three.js | `src/sim/` | Le même code peut tourner sur un serveur Node, sans navigateur |
| Pas fixe à 240 Hz, entrée unique `Duel.step(commands[])` | `src/sim/duel.ts:618`, `src/sim/loop.ts` | Le match est entièrement décrit par « l'état de départ + les commandes de chaque tick » |
| Hasard à graine (`Prng`), aucun `Math.random` dans la sim | `src/sim/bot.ts` | Deux machines qui ont les mêmes commandes calculent le même match |
| Copie d'état + rejeu existe déjà | `src/modes/replay.ts` (`deepClone`, rejeu depuis instantané) | C'est exactement ce que fait un rollback |
| **Un pas à 4 joueurs + 4 IA : ~28 µs** | banc d'essai dans vitest | Rejouer 150 ms (36 pas) coûte ~1 ms par image : sans souci |
| **Copie de l'état : ~34 µs, ~10 Ko en JSON** | idem | On peut garder un instantané à chaque pas |
| **Deux parties à même graine : identiques** | idem | Le déterminisme tient, au moins dans un même moteur JS |

Seul point faible : la sim appelle `Math.sin`, `Math.cos`, `Math.atan`, `Math.hypot` (19 appels). Leur résultat
n'est pas garanti identique au bit près entre Chrome (V8), Firefox et Safari. `+ - * /` et `Math.sqrt` le sont.

## 2. Les trois façons de faire

| | A. Pair à pair + rollback (WebRTC) | B. Serveur qui fait autorité, envoie l'état | **C. Serveur relais + rollback, sim aussi sur le serveur** |
|---|---|---|---|
| Principe | Chaque joueur envoie ses commandes aux 3 autres ; chacun prédit puis corrige | Le serveur calcule le match et envoie la position de tout ; les clients interpolent | Le serveur reçoit les commandes, les date au tick, les renvoie à tous et recalcule lui-même le match |
| Ressenti de la frappe | Très bon (sa propre frappe est immédiate) | Moyen : sa frappe arrive avec la latence, ou prédiction compliquée de la balle | Très bon, comme A |
| Triche, classement fiable | Non : chaque client dit ce qu'il veut | Oui | **Oui** : le score qui compte est celui du serveur |
| Réseau | 6 liaisons à 4, NAT, serveurs TURN | Simple | **Simple** : chacun ne parle qu'au serveur |
| Un joueur lent ou parti | Bloque ou casse le match des autres | Sans effet | Sans effet : le serveur remplace ses commandes manquantes (et une IA peut prendre sa place) |
| Bande passante | Faible | Plus forte (état de 4 joueurs + balle) | Très faible (quelques octets par joueur et par image) |
| Coût serveur | ~0 | Une sim par match | Une sim par match (28 µs × 240/s ≈ 0,7 % d'un cœur) |

**Recommandation : C.** C'est le modèle de Photon Quantum ou des jeux de combat récents. Il garde la réactivité
du rollback (indispensable pour le timing au relâcher) et donne un résultat fiable pour le classement. Notre code
est presque taillé pour : la sim est déjà déterministe, rapide et rejouable.

### Ce que ça donne en jeu, au padel

- Le joueur voit sa propre course et sa propre frappe sans délai.
- Les coups des autres arrivent avec ~30-80 ms de retard en Europe. Le rollback les remet à leur vrai moment.
  Quand un adversaire frappe, la balle continue un court instant sur l'ancienne trajectoire, puis repart sur la
  bonne. Une balle de padel vole 0,8 à 1,5 s entre deux coups : on a le temps de lisser ce saut à l'écran (fondu
  de 60 à 100 ms), sans toucher à la sim.
- On ajoute un petit délai d'entrée fixe (1 à 2 images, 16-33 ms) pour limiter les corrections visibles. C'est
  réglable : ce sera à juger à la manette, comme le reste.
- Sons et effets : ils doivent être déclenchés par des événements datés (tick + joueur), pour ne pas jouer deux
  fois un impact après un rejeu.

## 3. Stack recommandée

| Brique | Choix | Pourquoi | Écarté |
|---|---|---|---|
| Client | Le jeu actuel (Vite + TypeScript + Three.js), servi en statique (Cloudflare Pages ou Netlify) | Rien à changer, jouable par lien | — |
| Code partagé | `src/sim` déplacé dans un paquet commun (`packages/sim`) utilisé par le client et le serveur | Une seule vérité des règles | Réécrire la sim côté serveur |
| Serveur de jeu | Node.js + TypeScript, avec **Colyseus** pour les salles, les codes de salle, la reconnexion et le matchmaker, en messages binaires (pas son système de synchro d'état) | Libre (MIT), actif, fait pour les salles de jeu dans le navigateur ; on garde notre propre netcode | Nakama : complet (comptes, classements, files), mais sa logique serveur tourne dans un moteur JS lent, mal adapté à une sim à 240 Hz. Serveur entièrement maison : faisable, mais on refait la plomberie |
| Transport | **WebSocket** d'abord ; **WebTransport** (datagrammes non fiables) ensuite si les pertes de paquets se voient | WebSocket marche partout tout de suite. WebTransport est disponible dans tous les navigateurs récents depuis Safari 26.4 (mars 2026), mais encore jeune | WebRTC pair à pair (voir A) |
| Hébergement des serveurs | Une machine en Europe (Fly.io, région Paris, ou un petit VPS) au début ; Edgegap si un jour il faut plusieurs régions | Quelques euros par mois suffisent pour des dizaines de matchs en même temps | **Hathora : fermé le 5 mai 2026**, ne pas s'en servir |
| Comptes, base, classement | **Supabase** (Postgres + connexion Google/Discord/e-mail) | Gratuit pour commencer ; le serveur de jeu écrit les résultats, les clients ne font que lire | Firebase (moins adapté aux requêtes de classement) |
| Note des joueurs | **OpenSkill** (paquet npm `openskill`, méthode Weng-Lin) | Fait pour les équipes : une note par joueur, même en 2 contre 2, avec des coéquipiers qui changent. Libre, plus rapide que TrueSkill | Elo : mal adapté aux équipes qui changent |

## 4. Le flux du joueur

```
Lien du jeu → pseudo (invité) ou connexion
  ├─ Partie privée : « Créer une salle » → code à 4 lettres → les amis rejoignent → chacun choisit sa place
  │                  (places vides = IA) → match
  └─ Partie classée : file « 2c2 solo » ou « 2c2 avec un ami »
        → le matchmaker regroupe 4 joueurs de niveau proche, dans la même région
        → équipes équilibrées par la note → match
        → le serveur envoie le résultat à la base → notes mises à jour → classement
```

Matchmaker : il cherche d'abord dans un écart de note étroit, puis l'élargit avec l'attente (ex. +50 points toutes
les 10 s). Classement affiché : rang par paliers (Bronze → Diamant) calculé depuis la note prudente
(`moyenne − 3 × incertitude`), 5 matchs de placement, saisons.

## 5. Découpage

### Phase 0 — préparer la sim (faisable maintenant, à côté du gameplay)
1. Fonctions mathématiques déterministes (`sin`, `cos`, `atan`, `hypot` écrites avec `+ - * /` et `sqrt`) et une
   règle qui interdit les autres dans `src/sim`.
2. Test croisé avec Playwright : le même match d'IA de 30 s dans Chrome, Firefox, WebKit et Node doit donner la
   même empreinte d'état. (Playwright est déjà dans le projet.)
3. Commandes arrondies à des entiers (stick sur 1 octet par axe) **avant** d'entrer dans la sim, en local aussi,
   pour que tout le monde calcule avec les mêmes valeurs ; encodage binaire de quelques octets.
4. Empreinte de l'état (`hash`) à chaque pas, pour détecter un écart entre machines.
5. Moteur de rollback local + **mode « faux réseau »** (ex. `?reseau=120ms,5%`) : on joue à la manette contre
   l'IA avec une latence simulée. C'est la vraie vérification : on sait si le rollback est agréable avant d'avoir
   un serveur.
6. Sons et effets déclenchés par événements datés, sûrs en cas de rejeu.

### Phase 1 — parties privées à 4
Serveur Colyseus, salles à code, relais des commandes, sim sur le serveur, vérification des empreintes (si un
client diverge, le serveur lui renvoie l'état), reconnexion, IA qui remplace un joueur parti. Contrôle de version :
les 4 clients et le serveur doivent avoir la même version de la sim.

### Phase 2 — comptes et historique
Supabase : profils, historique des matchs, ralentis possibles (un match = graine + commandes, quelques centaines
de Ko).

### Phase 3 — matchmaking et classement
Files classées, OpenSkill, classement, saisons, signalements.

## 6. Ce qu'il faut garder en tête dès maintenant
- **Toute nouvelle règle de gameplay doit passer par `Duel.step(commands)`** : aucune lecture de l'heure, de la
  souris ou du rendu dans `src/sim`, aucun `Math.random`. C'est déjà le cas, il suffit de le garder.
- Les réglages par joueur (`assist`, préparation…) doivent faire partie de l'état de départ du match, pour que
  les 4 machines les connaissent.
- Un changement de sim change la version : deux joueurs de versions différentes ne peuvent pas jouer ensemble.

## Sources
- Colyseus : https://colyseus.io/framework
- WebTransport dans Safari 26.4 : https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready
- OpenSkill (npm) : https://npmjs.com/package/openskill
- Fermeture d'Hathora : https://crux.supercraft.host/blog/hathora-shut-down-where-to-go-after-may-2026/ ,
  https://docs.edgegap.com/docs/tools-and-integrations/switch-from-hathora
