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

## Phase 0 faite : rollback, faux réseau, maths déterministes (19-21/10/2026, branche du worktree `epic-davinci-74c02a`)

Fait : les six points de la phase 0.

**Maths déterministes (21/10).** `src/sim/dmath.ts` : `dsin`, `dcos`, `datan` (algorithmes de fdlibm, seulement
`+ - * /`), `dhypot` (`Math.sqrt`) et `sq` (au lieu de `x ** 2`, lui aussi « approché » par la norme). Les 19 appels
de la sim sont remplacés ; `tests/sim/dmath.test.ts` vérifie l'écart avec `Math` (quelques derniers chiffres binaires,
sur 400 000 valeurs) et **refuse** toute fonction approchée dans `src/sim` (sin, cos, tan, atan, exp, log, pow,
hypot, `**`…). Les stats IA contre IA n'ont pas bougé (32 min simulées, simple et double : mêmes points, mêmes coups
par point, mêmes coups gagnants). Test croisé : `tests/e2e/determinisme.spec.ts` joue le même match d'IA de 30 s
(`src/net/crossMatch.ts`) dans Node, Chromium, Firefox et WebKit et compare l'empreinte seconde par seconde : les
quatre donnent `bcf20ffd`, à chaque seconde (Windows, Firefox 157, WebKit 27.2). À savoir : sur ce PC, l'ancienne sim
(avec `Math.sin`…) donnait déjà la même empreinte dans les quatre moteurs. Les maths déterministes sont une garantie
pour ce qui n'est pas testé ici (Safari sur Mac et iPhone, processeurs ARM, autres bibliothèques mathématiques),
que la norme autorise à différer.

| Pièce | Où | Ce qu'elle fait |
|---|---|---|
| Commandes arrondies | `src/net/codec.ts` | Stick sur 1 octet par axe (-127..127), boutons sur 2 octets : 4 octets par joueur et par pas. Arrondies **avant** la sim, pour l'humain et pour l'IA, avec ou sans `?reseau` (`src/modes/duel.ts`). |
| Empreinte | `src/net/hash.ts` | 32 bits sur tout l'état d'un `Duel`, au bit près (clés triées, flottants par leurs 64 bits). |
| Moteur de rollback | `src/net/rollback.ts` | Générique, sans réseau : instantané à chaque pas prédit (`deepClone`, ~30 µs), prédiction = dernière commande reçue, retour et rejeu à l'arrivée d'une commande qui contredit la prédiction, délai d'entrée, fenêtre max au-delà de laquelle on attend. |
| Paquets | `src/net/peer.ts` | Chaque machine renvoie ses commandes tant que l'autre n'en a pas accusé réception : un paquet perdu ne perd rien. |
| Faux réseau | `src/net/link.ts`, `src/net/duelNet.ts` | Deux « machines » dans la même page, A (les humains, la partie dessinée) et B (les IA), reliées par deux fausses liaisons (latence, gigue, perte, paquets dans le désordre). |
| Sons et effets | `src/net/fakeNet.ts` (`EventGate`) | Chaque frappe, rebond, fin de point est daté (pas + joueur) : rejoué par un rollback, il ne repart pas. |
| Lissage de la balle | `src/render/duelScene.ts` (`correctBall`) | Quand une correction déplace la balle, elle est dessinée à l'ancienne place puis glisse vers la bonne en 80 ms. La sim n'est pas touchée. |
| Animations en ligne | `src/render/duelScene.ts` (`correctPlayer`, `setOnline`) | Un joueur déplacé par une correction glisse en 100 ms ; sa foulée suit une vitesse lissée (60 ms) ; une préparation qui disparaît sans frappe derrière garde sa pose 120 ms. Seulement avec `?reseau`. |

**Animations des IA qui « recommençaient » sans cesse (corrigé le 20/10, après le premier essai de Xavier).** Cause :
l'IA décide de garder son bouton en lisant son propre bouton tenu dans la partie (`heldShot`). Avec un délai
d'entrée, elle le voyait en retard sur ses commandes, relâchait puis réappuyait en boucle ; la prédiction de l'autre
machine prolongeait chaque relâcher, et la préparation apparaissait puis disparaissait toutes les 2 ou 3 images.
Correction : la machine des IA joue sans délai d'entrée (`inputDelayB: 0`, comme une IA sur le serveur plus
tard), plus les protections du rendu ci-dessus. Mesuré (à-coup moyen de la pose par image, `tests/e2e/reseau.spec.ts`) :
avant, 2 à 7 fois celui du jeu hors ligne ; après, le même qu'hors ligne, à 120 ms comme à 200 ms de ping avec 10 %
de perte.

Changements de la sim, petits et mécaniques : les maths ci-dessus, et `bounceCache` (dans `Duel.passesBehind`). Il se
remplissait au premier appel, et la lecture de la manette l'appelle **hors du pas** (`counterWallReady`) : deux
machines dont l'une a lu la manette et l'autre non calculaient le rebond prévu à des instants différents. Depuis le
21/10, il est calculé dans `hit()`, une fois par frappe, et une question posée de l'extérieur ne change plus rien
(test : `tests/net/rollback.test.ts`, « même sans garde »). Le faux réseau garde ses lectures « sans trace »
(`withoutTrace`) pour l'autre cache, `ownerCache`, que seule l'IA lit.

Mesuré :
- Tests (`tests/net/`) : un match en double joué à travers le faux réseau (ping 120 ms, gigue 20 ms, perte 5 % ;
  et ping 80, gigue 40, perte 30 %, sans délai) finit **avec la même empreinte, au bit près**, que le même match
  rejoué sans réseau avec les mêmes commandes, sur les deux machines. Ping 400 ms : la machine attend, le match
  reste juste.
- Coût dans le navigateur : les deux machines, rollbacks, sons et effets compris, **~0,7 ms par image** à 60 i/s
  (ping 120, gigue 20, perte 5 %).
- Ping 120 ms, délai d'une image : un rollback typique remonte de 8 à 15 pas (30 à 60 ms).

## Comment tester

Lancer le jeu (`npm run dev`), brancher une manette, puis ouvrir une de ces adresses. Le joueur à la manette est
« chez lui » ; les IA sont « chez quelqu'un d'autre », derrière la fausse liaison. On voit donc les corrections
comme en vrai : les adversaires et le partenaire IA sautent parfois un peu, la balle se recale après leurs frappes.

| Adresse | Pour sentir |
|---|---|
| `/?reseau=0&delai=0` | Le rollback seul, sans latence (les IA arrivent un pas en retard) : doit se jouer comme le jeu normal (référence). |
| `/?reseau=40` | Un bon réseau en France. |
| `/?reseau=80&gigue=10` | Un réseau européen moyen. |
| `/?reseau=120&gigue=20&perte=5` | Un réseau médiocre : le cas à juger. |
| `/?reseau=120&gigue=20&perte=5&delai=2` | Même chose avec 2 images de délai d'entrée : moins de corrections, frappe un peu plus molle ? |
| `/?reseau=120&delai=0` | Sans délai : la frappe est immédiate, mais plus de corrections. |
| `/?reseau=400` | Trop loin : 200 ms dans chaque sens, la fenêtre de 150 ms ne suffit plus, la partie attend (« attentes » grimpe) et ralentit. |
| `/?reseau=400&fenetre=300` | Même ping, fenêtre plus grande : plus fluide, corrections plus grosses. |

Ajouter `&double=1` pour un 2 contre 2 (partenaire et adversaires IA), `&ai=fort` pour des adversaires plus durs.

Paramètres : `reseau` = ping aller-retour (ms) ; `gigue` = ± ms par paquet ; `perte` = % de paquets perdus ;
`delai` = délai d'entrée en images de 1/60 s (1 par défaut) ; `fenetre` = rollback au plus, en ms (150 par défaut).

Quoi regarder :
- L'encart en bas à droite : le réseau simulé, les **pas rejoués par image** (moyenne et pire sur la demi-seconde ;
  un pas = 1/240 s), le plus long retour en arrière (ms), les **corrections** de la balle et des joueurs (sauts
  lissés) et les **attentes** (pas où la partie a dû attendre).
- Sa propre frappe : elle doit partir aussi net qu'hors ligne (`delai=0` ou `1`), ou un poil plus tard (`2`).
- La balle après une frappe adverse : elle doit se recaler sans téléporter. Si on voit encore le saut, allonger le
  fondu (`BALL_CORRECTION_FADE`, 80 ms) ; s'il « flotte », le raccourcir.
- Les adversaires et le partenaire : ils doivent s'animer comme hors ligne, sans bras qui retombent ni foulée qui se
  retourne ; quand une correction les déplace, ils glissent (100 ms) au lieu de sauter. Comparer `/?double=1` et
  `/?double=1&reseau=120&gigue=20&perte=5` en regardant un adversaire préparer un smash ou une bandeja.
- Les sons : une frappe, un rebond ou une réaction du public ne doivent jamais s'entendre deux fois.

Limites de ce mode : pas de ralenti du coup gagnant ni de micro-pause à la frappe (la sim ne peut pas s'arrêter
pour un seul joueur) ; changer un réglage dans le menu ou l'assistance (bouton) repart de l'état de la partie,
sans perdre le score ; la « machine distante » fait jouer les IA sur ce qu'elles voient de la partie là-bas,
avec leur propre retard sur l'humain.

## Phase 1, première étape : parties privées en ligne (21/10/2026, même branche)

Le vrai jeu en ligne, en local ou sur un réseau : un serveur, des salles à code, deux à quatre humains, les places
libres jouées par l'IA du serveur.

| Pièce | Où | Ce qu'elle fait |
|---|---|---|
| Serveur | `server/main.ts` (`npm run serveur`, port 2567) | Serveur HTTP + WebSocket (paquet `ws`). Ne fait que brancher les messages sur le salon. |
| Salon | `src/net/lobby.ts` | Salles à code de 4 lettres (sans I ni O), places, hôte (règle simple ou double, niveau de l'IA, lance), départ d'un joueur = une IA prend sa place, salle fermée quand elle est vide. |
| Match du serveur | `src/net/matchServer.ts` | Il **retient** la commande de chaque joueur à chaque pas (en retard : la précédente, personne n'attend un joueur lent), fait jouer les IA sans délai, calcule le match (c'est son score qui compte), envoie à tous les commandes retenues et, chaque seconde, son empreinte. |
| Navigateur | `src/net/onlineClient.ts`, `src/net/connection.ts` | Cale son horloge sur celle du serveur (pings), calcule un peu en avance (moitié du ping + 25 ms) pour que ses commandes arrivent à temps, joue les siennes tout de suite, prédit les autres, et corrige par rollback quand arrivent les commandes retenues, les siennes comprises si le serveur a dû les remplacer. Compare son empreinte à celle du serveur chaque seconde. |
| Protocole | `src/net/protocol.ts` | Salle en JSON ; commandes en binaire (en-tête de 8 octets + 4 octets par joueur et par pas). La configuration du match (format, places, réglages de chaque humain, graine) part du serveur : tout le monde part de la même partie. |
| Salon dans le jeu | `src/modes/online.ts`, `src/ui/onlineLobby.ts` | `?enligne` : nom, créer ou rejoindre (code), places, et pour l'hôte simple/double, niveau de l'IA, « Lancer le match ». |

Choix fait en route : `ws` plutôt que Colyseus pour cette étape. Colyseus apporte surtout sa synchronisation d'état,
que nous n'utilisons pas (nous synchronisons des commandes et faisons du rollback) ; pour des salles à code, `ws`
tient en une centaine de lignes que nous maîtrisons et testons. Colyseus (ou équivalent) reviendra peut-être pour le
matchmaking (phase 3).

Vérifié :
- `tests/net/online.test.ts` : serveur + deux navigateurs à travers de fausses liaisons (80 et 40 ms de ping, avec
  gigue ; l'horloge d'un navigateur décalée de 12 s) : 19 empreintes sur 19 identiques au serveur pour chacun. Avec
  un joueur à la connexion instable (90 ms ±70) : le serveur remplace 784 de ses commandes arrivées trop tard, son
  navigateur se corrige, toujours 13 empreintes sur 13 identiques.
- `tests/net/lobby.test.ts` : salles, codes, places, hôte, lancement, départ remplacé par l'IA.
- `tests/e2e/enligne.spec.ts` : deux onglets de Chromium passent par le salon et le vrai serveur, jouent un double
  (deux humains virtuels, deux IA du serveur) : 12 empreintes sur 12 identiques au serveur pour chacun, les quatre
  joueurs frappent. (Une première version du test divergeait : sa manette virtuelle faisait jouer une IA qui
  remplissait un cache de la partie hors du pas, ce qu'une vraie manette ne fait pas. Corrigé dans le test.)

Pas encore fait (suite de la phase 1) : se reconnecter après une coupure (aujourd'hui : bandeau « connexion perdue »,
le match continue sans soi, joué par l'IA) ; renvoyer l'état à un joueur qui diverge (aujourd'hui : l'encart l'affiche
en rouge) ; deux joueurs sur la même machine dans un même navigateur ; le salon à la manette ; héberger le serveur
sur Internet (Fly.io, région Paris) ; numéro de version de la sim.

## Comment tester en ligne

1. Dans le dossier du worktree, lancer le serveur de jeu dans un terminal, et le jeu dans un autre :

   ```
   npm run serveur
   npm run dev
   ```

2. Ouvrir **http://localhost:5173/?enligne** dans deux onglets (ou deux navigateurs). Dans le premier : son nom,
   « Créer une salle » ; un code de 4 lettres s'affiche. Dans le second : son nom, le code, « Rejoindre ».
3. Chacun prend une place (les places libres sont jouées par l'IA). L'hôte choisit simple ou double et le niveau de
   l'IA, puis « Lancer le match ». La manette (ou le clavier) choisie pour la première place humaine dans les
   réglages joue sa propre place.
4. Avec un ami sur le même réseau (Wi-Fi de la maison) : lancer le jeu avec `npm run dev -- --host`, puis il ouvre
   `http://<adresse de ton PC>:5173/?enligne` (Windows peut demander d'autoriser Node dans le pare-feu). Par
   Internet, il faudra d'abord héberger le serveur.

Options d'URL : `&serveur=hote:port` (autre serveur), `&delai=1` (délai d'entrée, images), `&fenetre=250` (rollback au
plus, ms).

Quoi regarder, dans l'encart en bas à droite : le **ping** mesuré, l'**avance** sur le serveur (en pas de 1/240 s),
les pas rejoués, les corrections, et surtout **« empreintes : N identiques au serveur »** : si elle passe à
« DÉSYNCHRONISÉ », les deux machines ne calculent plus le même match (à me signaler). « commandes remplacées par le
serveur » compte celles des siennes arrivées trop tard. Deux onglets dans le même navigateur : un onglet en arrière-plan
est ralenti par le navigateur, mieux vaut deux fenêtres côte à côte.
