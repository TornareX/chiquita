# Padel Smash — Document de game design

> Vision du jeu complet, au-delà du MVP « Padel Trainer » (`PADEL_MVP.md`).
> Quand les deux documents divergent, celui-ci l'emporte pour la direction du jeu ;
> `PADEL_MVP.md` reste la référence pour la physique, les règles FIP et l'architecture.
> Les valeurs **[VT4]** seront mesurées sur Virtua Tennis 4 (voir `research/vt4/PLAN.md`).

---

## 1. Pitch

**Un jeu de padel arcade en 2 contre 2, à jouer entre potes sur le canapé.**
Les déplacements et la frappe ont le feeling de Virtua Tennis 4 : on prend la manette, on court,
on frappe, ça marche tout de suite. Les règles et les coups sont ceux du padel, et les **vitres**
apportent la profondeur, comme les murs de Rocket League : plus on joue, plus on découvre de
façons de s'en servir.

**Directive n° 1 : facile à prendre en main, difficile à maîtriser.**

## 2. Piliers

1. **Prise en main immédiate.** Quatre boutons et un stick. Un débutant renvoie la balle dès sa
   première partie grâce à la course assistée.
2. **Profondeur qui émerge.** Les techniques avancées naissent de la physique et du terrain
   (vitres, grillage, sortie de court), pas d'une liste de combos.
3. **Physique cohérente.** Même action, même résultat. Aucun hasard dans les rebonds. C'est ce
   qui rend chaque technique apprenable.
4. **Le spectacle vient du talent.** Pas de super-coup gagné par une jauge. Les moments qui font
   crier le canapé (por tres, sortie de vitre impossible, plongeon) sont le fruit de l'habileté.
5. **Jouer ensemble.** Le 2 contre 2 est le cœur. Se coordonner avec son partenaire est une
   compétence en soi, comme les rotations de Rocket League.

## 3. Ce qui change par rapport au MVP « Padel Trainer »

| Sujet | MVP Trainer | Padel Smash |
|---|---|---|
| Caméra | Première personne | Troisième personne, derrière l'équipe (§8) |
| Contrôles | Clavier/souris, geste de swing | **Manette d'abord**, frappe au stick droit (§4). Clavier en option |
| Frappe | Zone de portée + geste | Course assistée + fenêtre de timing + direction (§4) |
| Profil physique | `realistic` | Nouveau profil `arcade`, même moteur (§6) |
| Joueurs | Seul face à la machine | 2 contre 2, humains et IA mélangés (§7) |
| Corps du joueur | Seule la raquette visible | Personnages complets, animés, style cartoon (§9) |
| Machine à balles + aides | Le cœur du jeu | **Outil de réglage et de test** pour les développeurs. Le cœur du jeu, c'est l'échange contre un adversaire. Un mode entraînement viendra tard, repensé autour des techniques (§7) |

**On garde :** la simulation à pas fixe (240 Hz), le déterminisme et le PRNG à seed (base d'un
futur netcode à rollback), la physique de balle, les collisions vitre/grillage, les règles,
`predict.ts` (qui servira à la course assistée), les commandes abstraites et le joueur
automatique de test.

**On abandonne :** la vue première personne, le geste de swing à la souris et le format
« exercices face à la machine » comme expérience principale.

## 4. Système de frappe

### Commandes (manette)

La frappe se fait au **stick droit**, comme le « Skill Stick » de NHL (`src/input/swingStick.ts`) :
une seule préparation, trois fins de geste, et la balle (au sol, de volée, au-dessus de la tête)
choisit la famille du coup.

| Geste au stick droit | Au sol | De volée | Au-dessus de la tête |
|---|---|---|---|
| Tiré vers soi, puis **tout droit** vers l'avant | Coup normal | Volée coupée | Smash (remate) |
| Tiré vers soi, puis vers l'avant **en arc** | Lob | — | Víbora |
| Tiré vers soi, puis **lâché** | Chiquita | — | Feinte de smash |
| **Coup sec** vers l'avant, sans préparation | Coup sans préparation | Volée bloquée | Bandeja |

| Entrée | Action |
|---|---|
| Stick gauche | Déplacement ; au moment de l'impact : **direction et profondeur** du coup |
| Stick droit | Frappe (tableau ci-dessus) |
| **LB** *(prévu)* | Appel au partenaire (« j'y vais » / « à toi ») |
| **RT** *(prévu)* | Sprint court (repositionnement, sortie de court) |

Les boutons de face (A/X/Y/B) sont cachés et sans effet ; `?boutons=1` les remet pour tester.
Au clavier : mêmes actions sur des touches, pour 1 ou 2 joueurs par clavier.

### Le plancher (compris en 30 secondes)

- **Course assistée** : dès que tu prépares un coup au stick droit, ton joueur court vers le point
  d'impact de la première balle jouable. Débutant, tu renvoies quand même.
- **Direction au stick gauche** au moment de l'impact. Sans direction : coup sûr, au centre.
- **La situation choisit la variante** : le même geste donne un coup normal au sol, une volée
  coupée de volée et un smash au-dessus de la tête (seuil aux épaules, au moins aux yeux après un
  rebond).

### Le plafond (découvert en jouant)

- **Préparer tôt, mais sans jauge** (décision §13) : le temps entre le début de la préparation et
  la frappe compte. Sous 0,3 s, le coup est seulement bloqué (60 % de la vitesse, angles réduits) ;
  la vitesse monte ensuite jusqu'à être pleine à 0,6 s, et au-delà plus rien ne change. Le temps
  laissé par l'adversaire compte aussi : moins on en a, plus le coup est imprécis (pression).
- **Fenêtre de timing** : finir son geste avant la balle donne un coup normal ; en retard, la balle
  part large et long ; trop tard, elle est passée, c'est un coup dans le vide.
- **Frappe parfaite** : une fenêtre étroite autour du point idéal (de 70 ms avant à 50 ms après,
  resserrée sous pression), soulignée par un arrêt sur image, un son et un éclat. La balle part
  plus vite et plus précise. [à calibrer en jouant]
- **Placement manuel** : toucher au stick pendant la préparation coupe l'assistance. Le joueur
  qui se place lui-même frappe plus tôt et ouvre de meilleurs angles. Risque/récompense.
- **Famille du smash selon le geste** : bandeja au coup sec (sûre, garde le filet), víbora en arc
  (effet latéral qui longe la vitre), remate tout droit (plat, puissant, risqué).
  Le « smash parfait » qui sort la balle du court n'est pas une variante à part : c'est le
  résultat d'une frappe parfaite sur un remate bien dirigé.
- **Feinte de smash** : préparer comme un smash puis lâcher le stick ; l'adversaire recule et la
  balle part lentement, elle meurt vers la vitre après son deuxième rebond.

## 5. Les vitres et le terrain : la vraie profondeur

- **Bajada** : attaquer la balle qui revient de la vitre du fond.
- **Défense après la vitre** : laisser passer, se retourner, jouer après le rebond sur la vitre.
- **Double vitre** : lire une balle qui touche le fond puis le côté (ou l'inverse).
- **Contrapared** : renvoyer contre sa propre vitre, en dernier recours.
- **Angles latéraux** : víbora et coups croisés qui meurent dans la vitre latérale adverse.
- **Por tres / por cuatro** : smash qui fait sortir la balle du court par-dessus les murs.
  L'adversaire peut **sortir par la porte** pour la rattraper (salida de pista) : le moment
  arcade par excellence.
- **Grillage** : rebonds moins prévisibles visuellement mais toujours déterministes ; une balle qui
  s'y coince ou y meurt.

## 6. Physique et réglage arcade

- Même moteur, **profil `arcade`** : balle un peu plus lente en l'air (plus de temps pour lire),
  rebonds plus francs, joueurs plus rapides et plus réactifs qu'en vrai. On cherche le
  **rythme de VT**, pas la simulation. **[VT4 : vitesses de balle, temps de vol typiques,
  vitesse de course, accélération]**
- Déterminisme strict : aucune part d'aléatoire dans un rebond ou une frappe.
- **Juice** : arrêt sur image à l'impact parfait, léger tremblement de caméra sur les smashes,
  son de vitre sec, traînée sur la balle, ralenti automatique sur le point gagnant.
- **Assistance réglable par joueur** (course assistée complète / partielle / désactivée, marqueur
  de point de chute) : un débutant peut jouer avec un expert sans changer les règles.

## 7. Modes de jeu

- **Match 2 contre 2 local** : jusqu'à 4 joueurs, n'importe quel mélange humains/IA.
  Règles FIP complètes : service à la cuillère en diagonale, comptage tennis, option
  **punto de oro** (point décisif à 40-40), jeux et sets configurables.
- **Solo** : toi + un partenaire IA contre deux IA. Le partenaire réagit aux appels (LB).
- **Entraînement (tard)** : des **défis qui enseignent les techniques cachées** (« réussis 5
  bajadas », « place une víbora le long de la vitre », « fais un por tres »), comme les packs
  d'entraînement de Rocket League. Il se conçoit une fois les techniques stabilisées par le jeu
  réel ; la machine à balles actuelle en fournira la mécanique, pas le design.
- **En ligne : plus tard.** L'architecture déterministe le permet (rollback).

### IA

- Niveaux de difficulté qui jouent sur la lecture (anticipation, placement) et la précision,
  **pas** sur une triche physique.
- L'IA partenaire respecte les positions classiques (un au filet, un au fond, ou les deux) et
  les appels du joueur.

## 8. Caméra

- Derrière l'équipe du joueur, **cadrée comme une retransmission télé** : téléobjectif haut et loin
  (8,7 m de haut, 20 m derrière le fond, champ de 20°). Tout le terrain et les vitres du fond restent
  dans le champ, et la perspective aplatie garde le joueur du fond lisible.
- Proportions réelles (joueur de 1,80 m, raquette de 45,5 cm). Seule la balle est agrandie au loin,
  comme à la télé et dans VT ou Top Spin : jamais moins de 0,9 % de la hauteur de l'écran, avec une
  traînée sur les balles rapides.
- À 4 en local : caméra partagée derrière une équipe ; l'autre équipe joue côté lointain, comme
  dans VT en multijoueur.
- Ombre de balle très marquée au sol et marqueur de hauteur pour lire la profondeur.

## 9. Style visuel et audio

- **Stylisé / cartoon** : lisibilité (balle surdimensionnée, couleurs d'équipe vives), coût de
  production compatible avec un jeu web en Three.js, ton fun.
- Personnages inventés, expressifs (célébrations, réactions aux points).
- Audio : impacts de balle distincts selon le coup et la qualité, son de vitre et de grillage
  différenciés, ambiance de public qui réagit au spectaculaire.

## 10. Progression des techniques (ce que le joueur découvre)

| Palier | Le joueur sait… |
|---|---|
| 1. Premiers échanges | Se déplacer, frapper au stick droit, servir, diriger au stick gauche |
| 2. Joueur de club | Bien timer sa frappe (éviter la faute de retard), jouer la profondeur, volleyer, renvoyer après la vitre du fond, lober |
| 3. Joueur confirmé | Frappes parfaites, bandeja/víbora, bajada, chiquita, placement manuel, contrapared |
| 4. Maîtrise | Por tres/cuatro, salida de pista, double vitre, feintes de smash, jeu d'équipe (croisements, couverture du partenaire) |

Chaque palier doit être **découvrable sans tutoriel** et **enseigné** dans le mode entraînement.

## 11. Ce que Virtua Tennis 4 doit nous apprendre

Par ordre de priorité (détail dans `research/vt4/PLAN.md`, constats dans
`research/vt4/MECANIQUES.md`) :
1. ~~Fenêtres de timing, charge~~ **Tranché** (voir §13 et `MECANIQUES.md` §5) : VT4 n'a pas de
   charge progressive ; nous gardons un bonus de préparation plafonné, en plus de la fenêtre de
   timing. Lecture de la direction au moment de l'impact : pas encore mesurée.
2. Course assistée : comment le joueur est amené au point d'impact (vitesse, freinage,
   pas d'ajustement, « aimant »).
3. Trajectoires : simulées ou calculées depuis une cible ? Temps de vol, hauteur au filet.
4. Rebond et effets (lift, slice).
5. Durées d'animation : swing, image d'impact, portée, plongeons.

Les vitres, le grillage et les règles du padel sont entièrement à nous.

## 12. Feuille de route

| Étape | Contenu | Validé quand… |
|---|---|---|
| **A. Premier échange jouable** | Caméra troisième personne, manette (Gamepad API), deux joueurs visibles (formes simples), course assistée, coups A/X/Y, profil `arcade`. **1 contre 1 à deux manettes**, échange libre sans score. La machine à balles sert seulement à régler et tester | Deux humains tiennent un échange de 10 coups et ont envie de rejouer ; ça « fait VT » à la manette |
| **B. Match 1 contre 1** | Service, score complet, adversaire IA de base | Un match complet se joue du début à la fin, contre un ami ou l'IA |
| **C. 2 contre 2 local** | 4 joueurs, IA partenaire, appels, caméra partagée | Une partie à 4 manettes sans accroc |
| **D. Au-dessus de la tête** | Bandeja, víbora, smash, sortie de court, salida de pista | Un por tres est réalisable et rattrapable |
| **E. Style et juice** | Personnages cartoon animés, sons, ralenti, public | Ça donne envie d'y jouer en vidéo |
| **F. Entraînement et défis** | Défis par technique, conçus à partir du jeu réel | Chaque technique du §10 a son défi |
| **Plus tard** | En ligne (rollback), terrains variés, personnalisation | — |

Pourquoi commencer par deux humains plutôt que contre l'IA : le feeling se juge entre joueurs,
et une IA médiocre fausserait le verdict. On valide le cœur (l'échange) avant d'empiler le reste.

Les mesures de VT4 alimentent surtout l'étape A (feeling de frappe et de course), puis D.

## 13. Décisions prises

- **Bonus de préparation plafonné, plus une fenêtre de timing** (détail au §4 ; le code fait foi :
  `preparation()` dans `src/sim/duel.ts`, réglages `blockPrep`, `fullPrep`, `blockSpeed`,
  `perfectBefore`, `perfectAfter`, `lateWindow` dans `src/sim/profile.ts`). VT4 n'a pas de charge
  progressive (`research/vt4/MECANIQUES.md` §5 : tenir plus longtemps ne change quasiment pas la
  vitesse, trop tard fait rater). Nous nous en écartons volontairement : préparer tôt rend le coup
  plus fort, ce qui récompense la lecture du jeu et donne au coup sec sans préparation un rôle
  défensif clair (bloquer). Ce n'est pas une jauge : le bonus plafonne à 0,6 s, ce qui reste
  cohérent avec le pilier n°4. La famille du coup se choisit par la fin du geste et la hauteur de
  la balle, pas par un niveau de préparation.

## 14. Questions ouvertes

- Nom définitif du jeu.
- Personnages : nombre, caractéristiques (tous identiques, ou profils puissance/vitesse/contrôle ?).
  Des stats différentes ajoutent du choix mais nuisent à la lisibilité « même action, même
  résultat ».
- Terrains : intérieur/extérieur, vitres panoramiques, variations de vitesse de surface ?
- Méta-progression (déblocages, cosmétiques) ou jeu purement « on allume et on joue » ?
