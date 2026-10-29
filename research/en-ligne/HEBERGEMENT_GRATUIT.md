# Mettre les matchs en ligne sur Internet, à 0 € (29/10/2026)

Suite du plan `PLAN_EN_LIGNE.md`. La phase 1 est faite et dans `main` : serveur `server/main.ts` (Node + `ws`),
salles à code, sim qui fait autorité sur le serveur, rollback dans le navigateur, reprise après coupure. Il manque
une seule chose : **un serveur joignable depuis Internet**. Cette note cherche où le faire tourner sans payer.

## 1. Ce dont notre serveur a besoin (lu dans le code)

| Besoin | D'où il vient | Conséquence |
|---|---|---|
| **Un processus qui reste allumé** pendant tout le match | `setInterval(() => lobby.tick(), 4)`, salles en mémoire | Exclut les fonctions « serverless » (Vercel, Netlify, Lambda, Cloud Run) |
| **WebSocket sécurisé (`wss://`)** | Le jeu est servi en HTTPS par GitHub Pages ; un navigateur refuse `ws://` depuis une page HTTPS | Il faut un certificat TLS devant le serveur |
| **Europe** | Joueurs en France ; le rollback tient bien jusqu'à ~120 ms de ping | Un serveur aux États-Unis ajoute ~90-110 ms : exclu |
| **Peu de CPU, mais régulier** | Un pas à 4 joueurs + IA ≈ 28 µs, 240 pas/s ≈ 0,7 % d'un cœur par match | Le volume n'est pas le souci ; **les à-coups** le sont (voir § 3) |
| **Bande passante modeste** | Le serveur envoie à chaque tour de boucle (toutes les 4 ms, ~250 messages/s par joueur) les commandes retenues | ~20-25 Ko/s par joueur avec les en-têtes TCP/WebSocket, **~0,3-0,4 Go par heure de match à 4** |
| Pas de disque, pas de base | Tout est en mémoire ; un redémarrage ferme les salles | N'importe quel hébergement éphémère convient |

À corriger dans le code quel que soit l'hébergeur :
- **L'adresse du serveur dans le jeu publié.** `src/net/connection.ts` prend `hôte de la page:2567` par défaut, soit
  `tornarex.github.io:2567` sur GitHub Pages : ne marche pas. Il faut une adresse fixée au build (ex.
  `VITE_SERVEUR=wss://…` dans `pages.yml`), `?serveur=` restant pour les essais.
- **Grouper les envois du serveur** toutes les ~16 ms au lieu de 4 ms : 4 fois moins de messages, à peu près 4 fois
  moins de bande passante et de travail réseau, pour 12 ms de plus au pire (déjà couverts par l'avance du client,
  à vérifier au compteur « commandes remplacées »).
- **Filtrer l'origine** des WebSockets (`tornarex.github.io`, `localhost`) et limiter salles et connexions par
  adresse, pour qu'un serveur public ne se fasse pas remplir.
- **Réveil du serveur** : à l'ouverture du menu en ligne, un `fetch` sur l'adresse HTTP du serveur, et un message
  « réveil du serveur… » tant qu'il ne répond pas (les offres gratuites endorment le serveur inutilisé).
- **Même version des deux côtés** : `version.ts` refuse déjà un client d'une autre version. Il faut que le serveur et
  GitHub Pages se redéploient sur le même commit (déploiement automatique des deux à chaque push sur `main`).
- `tsx` est en `devDependencies` : un hébergeur qui installe en mode production ne l'aura pas. Le passer en
  dépendance, ou compiler le serveur en un seul fichier JS au build.

## 2. Les options

### A. Render, service web gratuit (Francfort) — le plus simple
- 512 Mo, **0,1 CPU partagé**, 750 h/mois (assez pour un seul service allumé tout le mois). Pas de carte bancaire.
  WebSocket et HTTPS fournis, adresse fixe `https://padel-smash.onrender.com`, déploiement à chaque push GitHub.
- S'endort après 15 min sans requête ni message WebSocket ; **depuis février 2026 un WebSocket actif le garde
  éveillé** (un match en cours ne coupe donc pas). Réveil : **~1 min**.
- Redémarrage ou déploiement = salles perdues (acceptable pour des parties privées).
- Limite de bande passante mensuelle annoncée différemment selon les sources (5 Go ou 100 Go) : à lire sur la page
  de facturation du compte. À 5 Go, on tiendrait ~15 heures de match à 4 par mois sans grouper les envois, ~50
  en les groupant.
- Risque principal : le **0,1 CPU** (voir § 3).

### B. Koyeb, instance gratuite (Francfort) — équivalent de Render
- 512 Mo, 0,1 vCPU, un seul service, Francfort ou Washington. S'endort après 1 h sans trafic, réveil en quelques
  secondes (bien mieux que Render).
- Une carte peut être demandée « si la vérification automatique échoue ». Koyeb est en cours de rachat par Mistral
  AI (février 2026) : l'offre gratuite peut changer.
- Même risque CPU que Render. Bonne solution de rechange si Render déçoit.

### C. Oracle Cloud « Always Free », ARM (Paris ou Marseille) — le plus puissant
- Une vraie machine virtuelle : 2 à 4 cœurs ARM et 12 à 24 Go selon les sources (Oracle aurait réduit l'offre en
  juin 2026, à vérifier). Gratuite sans limite de durée, en France : ~10-20 ms de ping pour des joueurs français.
- **Carte bancaire exigée** à l'inscription (vérification, pas de débit). Souvent « plus de capacité » dans une
  région ; la région choisie à l'inscription est définitive.
- Oracle peut **reprendre une instance gratuite jugée inactive** (CPU très bas pendant 7 jours) : notre serveur est
  justement presque toujours au repos. À surveiller, ou passer le compte en « paiement à l'usage » (toujours gratuit
  tant qu'on reste dans les limites, mais il faut alors être vigilant).
- Plus de travail : installer Node, un service `systemd`, Caddy pour le HTTPS (certificat automatique), un nom de
  domaine gratuit (DuckDNS, ou `sslip.io` qui fait un nom à partir de l'adresse IP), mises à jour du système.

### D. Ton PC + un tunnel (Cloudflare Tunnel ou Tailscale Funnel) — pour les essais entre amis
- `npm run serveur` sur ton PC, et un tunnel qui donne une adresse `https://` publique sans ouvrir de port :
  - **Cloudflare « quick tunnel »** : `cloudflared tunnel --url http://localhost:2567`, sans compte, adresse
    `https://<mots-au-hasard>.trycloudflare.com` qui change à chaque lancement (on la passe par
    `?serveur=wss://…`). Passe par le centre Cloudflare de Paris : quelques ms de plus.
  - **Tailscale Funnel** : adresse fixe `https://<pc>.<réseau>.ts.net`, compte Tailscale gratuit.
- Le meilleur CPU possible, 0 €, aucune carte, rien à déployer. Mais **le serveur n'existe que quand ton PC est
  allumé**, et ta connexion montante porte tout le trafic (0,4 Go/h par match : sans souci en fibre).
- Le plus rapide à mettre en place : **une soirée de test réelle est possible dès aujourd'hui**, sans changer le code
  (sauf l'adresse dans l'URL).

### E. Cloudflare Durable Objects — gratuit et mondial, mais à réécrire et quotas serrés
- Une « salle » = un objet qui vit près du premier joueur, WebSocket compris. Notre `Lobby`/`MatchServer` est du
  TypeScript pur, portable ; `server/main.ts` serait à refaire (API Cloudflare au lieu de `ws`, un objet par salle,
  un aiguillage code → salle).
- Quotas du plan gratuit, par jour : 100 000 requêtes (un message WebSocket **reçu** compte pour 1/20) et
  13 000 Go·s de durée (l'objet est compté à 128 Mo tant qu'il tourne). Nos clients envoient ~60 messages/s :
  4 joueurs ≈ 12 requêtes/s ≈ 43 000 par heure de match ⇒ **~2 h de match par jour**, ~4-5 h en envoyant 30 fois par
  seconde. Au-delà, les connexions échouent jusqu'à minuit UTC.
- Une boucle à 4 ms qui ne s'arrête jamais n'est pas l'usage prévu (Cloudflare pousse à « hiberner »). Faisable,
  mais c'est le choix le plus risqué techniquement pour le gain le plus lointain (plusieurs régions).

### F. Pair à pair : le navigateur de l'hôte fait le serveur (WebRTC)
- `MatchServer` tourne dans un Web Worker chez l'hôte de la salle ; les autres s'y relient en WebRTC (canaux de
  données non fiables : mieux que TCP pour nos paquets). Il faut seulement :
  - un **petit service de mise en relation** (échange des offres WebRTC, codes de salle) : peu de trafic, tient
    sur Render/Koyeb gratuit ou Cloudflare Workers sans problème de CPU ;
  - un **relais TURN** pour les ~10-20 % de connexions que le NAT empêche : Cloudflare offre 1 000 Go/mois gratuits
    (les identifiants doivent être fabriqués par un petit service, la clé ne peut pas être dans le jeu).
- Gratuit quelle que soit l'audience. Mais : l'hôte joue avec 0 ms de ping (avantage), le match s'arrête si l'hôte
  part ou met son onglet en arrière-plan (le navigateur ralentit alors ses minuteries), aucun classement fiable
  possible (l'hôte peut tricher), et beaucoup de travail réseau (WebRTC, NAT, tests). Ce serait revenir sur le choix
  C de `PLAN_EN_LIGNE.md`.

### Écartés
| Service | Pourquoi |
|---|---|
| Fly.io | Plus d'offre gratuite depuis octobre 2024 (essai de 7 jours / 2 h) |
| Google Cloud e2-micro | Gratuit seulement aux États-Unis : +100 ms de ping |
| Railway | 1 $ de crédit par mois : ne garde rien allumé un mois |
| Vercel, Netlify, Lambda, Cloud Run | Pas de processus qui reste allumé ; Cloud Run épuiserait son quota en 2 jours |
| Deno Deploy | Plusieurs instances indépendantes : deux joueurs d'une même salle peuvent tomber sur deux instances qui ne se connaissent pas |
| Azure F1 | Carte exigée, 60 min de CPU par jour, peu de WebSockets simultanés |
| Hathora | Fermé le 5 mai 2026 |

## 3. Le vrai risque des offres gratuites : les à-coups du CPU à 0,1

Render et Koyeb donnent **0,1 CPU** : le système laisse le processus calculer 10 ms par tranche de 100 ms. En
moyenne un match ne demande que ~1-3 % (sim + boucle à 4 ms + messages), donc ça passe. Mais dès qu'un pic dépasse
les 10 ms d'une tranche (ramasse-miettes, envoi d'un état complet à un joueur qui se reconnecte, plusieurs matchs en
même temps), **le processus est gelé jusqu'à la tranche suivante, jusqu'à ~90 ms**. Pendant ce gel le serveur ne
retient plus les pas ; à la reprise, il retient d'un coup des pas pour lesquels il n'a peut-être pas encore les
commandes (il les remplace alors par les précédentes) et les envoie en rafale.

Effet probable : un joueur sent parfois sa frappe « remplacée » (corrigée par le rollback, mais visible). Rien qui
désynchronise (le serveur reste la référence), mais du ressenti en moins. **Ça se mesure** : l'encart affiche déjà
« commandes remplacées par le serveur ». À ajouter au serveur : le retard maximal de sa boucle sur la dernière
minute, dans la réponse HTTP de `/`.

Ordre de grandeur attendu : 1 match à la fois, probablement correct ; 3-4 en même temps, sans doute dégradé.

## 4. Comparaison

| | Coût | Carte | Ping (France) | Toujours dispo | CPU | Travail | Avenir (classement) |
|---|---|---|---|---|---|---|---|
| **A. Render** | 0 € | non | ~20-30 ms | oui (réveil 1 min) | 0,1 ⚠ | **faible** | oui |
| B. Koyeb | 0 € | parfois | ~20-30 ms | oui (réveil quelques s) | 0,1 ⚠ | faible | oui |
| **C. Oracle ARM** | 0 € | **oui** | ~10-20 ms | oui (risque de reprise) | 2-4 cœurs | moyen | **oui** |
| **D. PC + tunnel** | 0 € | non | ~10-30 ms | **non** (PC allumé) | ton PC | **très faible** | non |
| E. Durable Objects | 0 € | non | proche de chacun | oui, ~2 h de match/jour | ok | fort | oui |
| F. Pair à pair | 0 € | non | direct | tant que l'hôte reste | hôte | très fort | **non** |

## 5. Recommandation

On garde l'architecture choisie (serveur qui fait autorité + rollback) : c'est la bonne, et elle est faite. Seul
l'hébergement change, par étapes, sans réécriture. Le jeu lui-même reste sur GitHub Pages ; seul le serveur de match
est ailleurs. Le PC + tunnel (D) est écarté par Xavier : il faut un vrai serveur.

1. **Render gratuit à Francfort (A)** : choisi le 29/10/2026, préparé (§ 6).
   - Si le 0,1 CPU se sent : essayer Koyeb (même travail, réveil plus rapide) ; s'il se sent aussi, **Oracle (C)**,
     si tu acceptes de donner une carte pour la vérification.
2. **Plus tard, si le jeu a du monde** : Oracle, ou un petit serveur payant (~4-5 €/mois, Hetzner ou Fly à Paris).
   Le serveur ne change pas : c'est le même `npm run serveur` partout. Comptes et classement (phases 2 et 3) :
   Supabase gratuit, comme prévu.

Durable Objects (E) et le pair à pair (F) ne sont pas à faire maintenant : beaucoup de travail pour résoudre un
problème d'échelle qu'on n'a pas, et F interdit le classement.

## 6. Render : ce qui est prêt (29/10/2026)

| Pièce | Où | Ce qu'elle fait |
|---|---|---|
| Plan du service | `render.yaml` | Service web gratuit `padel-smash` à Francfort, `npm ci` puis `npm run serveur`, redéployé à chaque push sur `main` (comme le jeu sur GitHub Pages : même version des deux côtés) |
| Adresse dans le jeu publié | `src/net/connection.ts` (`serverUrl`), `.github/workflows/pages.yml` | `VITE_SERVEUR` au build, lu dans la variable GitHub `SERVEUR_EN_LIGNE` ; `?serveur=` garde la main pour les essais |
| Réveil | `src/net/connection.ts` (`wakeServer`), `src/modes/online.ts` | Avant d'ouvrir le WebSocket, le jeu interroge le serveur en HTTP jusqu'à sa réponse (2 min au plus) ; après 1,5 s, « Réveil du serveur en ligne… ». Serveur local ou de la maison : un seul essai (il ne dort pas) |
| Filtre et limites | `server/main.ts` | `ORIGINES` (pages autorisées, sinon refus 403), 200 connexions en tout, 8 par adresse, messages de 64 Ko au plus |
| Envois groupés | `server/main.ts` (`BOUCLE_MS`, 16 ms par défaut) | Quatre fois moins de messages qu'à 4 ms. [à juger à la manette ; `BOUCLE_MS=4` pour comparer] |
| Santé du serveur | `server/main.ts`, réponse JSON de `/` | Version, salles, connexions, **retard maximal de la boucle sur la dernière minute** (à-coups du CPU partagé), temps depuis le démarrage |
| `tsx` | `package.json` | Passé en dépendance : le serveur démarre même si l'hébergeur n'installe pas les outils de développement |

Vérifié en local : `npm run typecheck`, `tests/net` (24 tests), les tests en ligne de bout en bout
(`enligne.spec.ts`, `parcoursEnLigne.spec.ts`, 7 sur 7, lancés un par un ; lancés en parallèle et deux fois chacun,
plusieurs tombent, `reseau.spec.ts` compris qui n'utilise pas le serveur : charge de la machine). Origine autorisée :
connexion ouverte ; autre site : refus 403.

### Ce qu'il reste à faire, à la main (une fois)
1. Pousser ces changements sur `main` (GitHub).
2. Sur https://render.com : créer un compte avec GitHub (gratuit, sans carte), **New → Blueprint**, choisir le dépôt :
   Render lit `render.yaml` et crée `padel-smash`. Noter son adresse (ex. `https://padel-smash.onrender.com` ; si le
   nom est pris, Render en ajoute un suffixe).
3. Sur GitHub : **Settings → Secrets and variables → Actions → Variables → New repository variable**,
   `SERVEUR_EN_LIGNE` = `wss://<adresse Render>` (sans `https://`, avec `wss://`).
4. Relancer la mise en ligne de GitHub Pages (onglet Actions → « Mise en ligne » → Run workflow), ou pousser un commit.
5. Ouvrir `https://tornarex.github.io/chiquita/?enligne` : la première fois, « Réveil du serveur… » jusqu'à une minute.
   Ouvrir l'adresse Render dans un onglet pour lire `retardBoucleMaxMs` pendant un match.

## Sources
- Render, WebSocket et mise en veille : https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages ,
  https://render.com/docs/free
- Koyeb, instance gratuite : https://www.koyeb.com/docs/run-and-scale/scale-to-zero ,
  https://snapdeploy.dev/blog/koyeb-vs-free-container-tier
- Comparatif des offres gratuites (septembre 2026) : https://flaviocopes.com/hosting-free-tiers/
- Fly.io sans offre gratuite : https://temps.sh/blog/fly-io-pricing-2026
- Oracle Always Free : https://medium.com/@imvinojanv/setup-always-free-vps-with-4-ocpu-24gb-ram-and-200gb-storage-the-ultimate-oracle-cloud-guide-bed5cbf73d34 ,
  https://www.techzine.eu/news/infrastructure/81311/oracle-launches-cloud-region-in-paris/
- Durable Objects, prix et limites : https://developers.cloudflare.com/durable-objects/platform/pricing ,
  https://developers.cloudflare.com/durable-objects/platform/limits
- Cloudflare TURN : https://developers.cloudflare.com/realtime/ , https://www.cloudflare.com/products/turn-sfu/
- Tailscale Funnel : https://oneuptime.com/blog/post/2026-01-28-tailscale-funnel-service-publishing/view
- Google Cloud gratuit seulement aux États-Unis : https://wikidocs.net/blog/@infoplant/25939/
