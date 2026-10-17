# État du projet — padel-smash

**En une phrase :** Padel Smash, padel arcade en 2 contre 2. L'avancement est détaillé passe par passe ci-dessous.
## Passe « jouer par les vitres » (17/10/2026, non commitée)

220 tests OK, typecheck OK, joueur automatique de jouabilité inchangé. **Pas encore joué à la manette.**

Changements (réglages marqués [à calibrer en jouant]) :
- Course assistée : une balle qui va à la vitre se laisse passer si l'impact serait à moins de
  1,8 m d'elle, et se joue après la vitre, une fois décollée de 60 cm (`glassRoom`, `glassGap`,
  `glassBonus`, `predictBall().glassStep`).
- Vitre arcade moins vive (0,7 → 0,55) ; coup sans direction plus profond (normal 7,5 m, coupé
  6,5 m) ; attente en défense à 8,5 m du filet.
- Coup joué après la vitre plus lent (×0,8) : c'est un coup défensif, attaquable au filet.
- Volée plus sèche (×1,45) et plus ouverte (×1,3 en largeur) : c'est elle qui conclut.
- Dérive de retard réduite (2,5 → 1,5 m en largeur, 4,5 → 2,6 m en profondeur) : un coup au neutre
  relâché en toute fin de fenêtre sort encore, mais le retard ne fait plus 80 % des fins de point.
- IA (niveaux normal et fort) : monte au filet après un service, un lob, une volée ou une frappe
  parfaite ; à la volée, vise court et croisé du côté libre.

Mesuré, IA normale contre IA normale (15 min simulées), avant → après :
- coups gagnants : 0 → ~30 % des points (pros : ~1/3), le reste sur fautes ;
- coups par point : 6,6 → ~7-8 (pros : 8-11) ; coups du fond joués après la vitre : ~90 % ;
- volées : 0 → ~100 par partie. Le fort bat le facile sur presque tous les points.
Verrouillé par `tests/sim/glass.test.ts`.

Reste : jouer à la manette pour juger le ressenti (surtout : la volée à ×1,45 est-elle trop
punitive pour un humain resté au fond ?), puis l'étape D (smash, bandeja) qui doit fournir le
gros des coups gagnants au padel.

## Frappe au relâcher et assistance « aimant » (18/10/2026, non commitée)

Demandé par Xavier après un test : la course assistée faisait tout, et la balle ne se jouait qu'au
point prévu, souvent en fin de trajectoire.
- **La frappe part au relâcher** : balle à portée à cet instant (de volée ou après rebond, partout
  dans son camp) = frappée là. Relâché trop tôt = coup dans le vide, on peut réarmer. Maintenu sans
  relâcher = pas de frappe. Le timing (parfait, normal, en retard) se lit sur la position de la balle
  par rapport au point idéal à côté du joueur (`contactTiming`, `swingWindow`, `sweetSpot`).
- **Assistance « aimant » par défaut** : le joueur court au stick ; l'assistance ne fait que les
  derniers 1,5 m. Le point d'impact suit sa position (aller au-devant = la prendre plus tôt). Les
  anciens niveaux restent accessibles avec la touche d'assistance.
- Corrigé au passage : un point d'impact recalculé après le premier rebond prenait le rebond suivant
  pour le premier ; un point hors d'atteinte n'était jamais recalculé ; l'assistance visait des
  balles tout en haut de la zone frappable.
- IA normale contre IA normale : ~7 coups par point, ~35 % de coups gagnants. 225 tests OK.

## Étape D : coups au-dessus de la tête (17/10/2026, branche `feat/etape-d`, non commitée)

254 tests OK (dont `tests/sim/overhead.test.ts`, 27 tests), typecheck OK, joueur automatique de
jouabilité OK, 10/11 tests navigateur du premier coup (le chargement des modèles 3D a dépassé 5 s en
parallèle, OK relancé seul). **Pas encore joué à la manette.**

- **B** (manette), **I** (clavier bleu), **4 du pavé** ou **M** (QWERTY) / **,** (AZERTY) (rouge) :
  au-dessus de la tête sur une balle entre 1,9 et 3 m. Variante au stick à l’impact : bandeja par défaut
  (65-78 km/h, profonde, retard moins puni), víbora au stick latéral (80-97 km/h, effet latéral, vers le coin),
  remate au stick vers l'avant à moins de 4 m du filet sur une balle à plus de 2,2 m (125-131 km/h) ;
  sinon bandeja. B sur une balle basse : coupé défensif. Pas de service en B (sert comme A).
- **Por tres / por cuatro** : un remate parfait est visé court et en angle, il rebondit haut et sort ;
  non parfait, il est visé profond et reste dans le terrain. Sortie après le rebond = point au frappeur
  quand la balle touche le sol dehors ; avant, elle reste jouable.
- **Salida de pista implémentée** : une porte dans chaque mur latéral, de chaque côté du filet (0,1-1 m
  du filet, 2 m de haut ; la balle passe aussi par là). Zone praticable dehors : 8 m sur les côtés, 6 m
  derrière le fond, de son côté du filet. Course assistée et IA passent par la porte ; au stick, pousser
  contre le mur près de la porte y fait glisser. Une balle rattrapée dehors repart en lob ; si elle
  retombe hors du terrain, faute.
- **Lob** : 2,6 s de vol (2,8 parfait, +0,5 m), 1,6 s pour un lob court ; relâché tôt, il raccourcit
  (jusqu'à 3 m). Profondeurs arcade 5,5 / 7,6 / 8,8 m.
- **Double vitre** : un coup joué sur une balle sortie d'un coin retombe 1 m plus court (la víbora paie).
- **IA** : au filet, B sur un lob atteignable à moins de 7 m du filet (6,4 facile, 7,4 fort), remate s'il
  est à portée de filet, sinon víbora ou bandeja ; recule et joue après le rebond sinon. Après un lob, elle
  ne monte que si l'adversaire n'arme pas un smash. Le fort relâche un peu moins juste (±0,1 s au lieu de
  ±0,085).

Mesuré, IA normale contre IA normale, 3 × 15 min : 10,1 coups/point (pros 8-11), 43 % de gagnants,
dont 40 % de remates (pros 35-43 %), 34 % des lobs passent le joueur au filet (pros ~28 %), 31 sorties
dont 10 rattrapées dehors. Fort contre fort : 23 coups/point (14 avant l'étape D) : le fort ne rate
presque jamais. Les matchs IA durent ~2 fois plus longtemps (35 min simulées pour un set).

Reste : jouer à la manette (bandeja/víbora/remate au stick, timing d'un remate parfait, sortie par la
porte), vérifier la position des portes sur le modèle 3D (placées au jugé à côté du filet), la caméra
quand on sort loin sur les côtés, et l'animation (raquette levée, frappe vers le bas, très simple).

## Pression : balles vertes, jaunes, rouges (17/10/2026, même branche, non commitée)

Demandé par Xavier après un premier test de l'étape D : rester au filet était trop facile et la défense
ne souffrait pas. 262 tests OK (dont `tests/sim/pressure.test.ts`), typecheck OK. **Pas encore joué.**

- Chaque balle reçue a une pression (`src/sim/pressure.ts`), de verte (du temps, à bonne hauteur, lente)
  à rouge (basse, rapide, sans temps de préparation ; une volée forte reste dure après la vitre). Le coupé
  remet mieux une balle basse. L'anneau de timing prend la couleur de la balle à venir.
- Sous pression, la sous-fenêtre parfaite rétrécit (jusqu'à moitié). L'erreur du coup vient de la pression
  et de la précision du contact (trop tôt ou trop tard = trop devant ou trop derrière la balle, balle loin
  du point idéal), et coûte plus cher sur une balle dure. Une erreur fait passer la balle plus haut sur le
  filet (jusqu'à +0,7 m), moins vite, plus long (+0,7 m) ; un lob mal frappé raccourcit (jusqu'à 2 m).
- `?pression=0` pour comparer sans, `?pression=0.5` ou `1.5` pour l'atténuer ou la renforcer.
- IA : lit la couleur de la balle ; lobe surtout sur une balle verte ; sur une balle rouge face à un
  joueur au filet, coupé court dans les pieds. Remate du niveau normal ramené à 35 % des occasions.
- Remplace le « lob relâché tôt » et la « double vitre plus courte » d'avant : les deux passent par l'erreur.

Mesuré, IA normale contre IA normale (10 × 15 min) : 10,7 coups/point, 25 % de gagnants (sans pression
~38 %), remate 41 % des gagnants, 23 % des lobs passent ; une balle rouge passe en moyenne à 2 m au-dessus
du filet contre 1,2-1,5 m pour les autres. Les balles rouges restent rares entre IA (~2 %) : la course
assistée les place toujours bien. Fort contre fort toujours long (24 coups/point).

## Toucher : volée coupée, chiquita, blocage, course plus lente (17/10/2026, non commitée)

Demandé par Xavier : pouvoir tuer une balle flottante, bloquer quand on n'a pas le temps d'armer,
choisir la chiquita sur une balle facile, des échanges moins longs, une course moins rapide.
277 tests OK (dont `tests/sim/touch.test.ts`), typecheck OK, test navigateur à deux manettes OK.
**Pas encore joué.** Ajouts aussi : menu de réglages (Échap ou Start, `src/ui/duelSettings.ts`).

- **Balle coupée** : au sol, l'effet rétro écrase le rebond (restitution réduite jusqu'à 60 %,
  `slicedBounce`). Vaut pour tous les coups coupés.
- **Volée coupée** : X de volée sur une balle flottante (verte, prise au-dessus de 0,9 m) : courte,
  rasante, très coupée ; elle rebondit à 15-35 cm et meurt avant la vitre. Sous pression, X reste un blocage.
- **Chiquita** : X stick vers soi sur une balle après rebond : 7-8 m/s, courte (2,5-4 m), basse.
- **Préparation** : le temps entre l'appui et la frappe arme le coup. Moins de 0,3 s : coup bloqué
  (vitesse × 0,6, moins d'angle) ; plein à 0,6 s ; rien de plus au-delà (pas une jauge).
- **Course** : 7,5 → 6 m/s.
- **IA** : sur balle verte face au filet, choisit entre lob, chiquita et frappe au corps ; volée coupée
  sur balle flottante.

Mesuré, IA normale contre IA normale (5 × 15 min) : 8,8 coups/point, 13,8 s/point, 29 % de gagnants,
remate 41 % des gagnants, 23 % des lobs passent ; ~90 chiquitas, ~35 volées coupées, ~40 blocages.

## Boutons selon la manette, retour des entrées, « Teste ta manette » (17/10/2026, non commitée)

Demandé par Xavier : « X » n'est pas le même bouton sur toutes les manettes. Première étape du plan
`TUTORIEL_PLAN.md`. 300 tests OK (dont `tests/input/buttons.test.ts`), typecheck OK, tests navigateur
`tests/e2e/inputs.spec.ts` OK avec une manette PlayStation virtuelle. **Pas encore essayé avec une vraie manette.**

- **Symboles par manette** (`src/input/padStyle.ts`, `src/ui/buttonIcons.ts`) : famille détectée sur `gamepad.id`
  (Xbox ✓ A B X Y, PlayStation ✕ ○ □ △, Nintendo B A Y X, sinon position seule), toujours avec un petit losange
  qui montre la position du bouton. Choix forcé dans Réglages → Manette. Au clavier : les vraies touches
  (disposition AZERTY lue par le navigateur quand il le permet). L'aide, la consigne de service et les indices
  du labo (jetons `{normal}`, `{overhead}`, `{slice}`, `{lob}`) suivent la manette du joueur.
- **Retour des entrées** (`src/ui/inputDisplay.ts`), en bas à gauche, en match et au labo : stick, 4 boutons
  (maintenu = allumé ; au relâcher, doré parfait, vert réussi, orange imprécis, rouge dans le vide), ce que le
  relâcher a donné (« víbora parfait ! · stick avant gauche ») et les 5 précédents. Désactivable (Réglages,
  ou `?entrees=0`) ; `?manette=playstation` impose des symboles.
- **« Teste ta manette »** (`src/ui/padTest.ts`, bouton dans Réglages) : détecte la manette, fait trouver les
  4 boutons de coup en disant lequel a été pressé quand ce n'est pas le bon, puis un tour complet de stick
  (signale un stick qui dérive). Partie en pause pendant le test.
- `playwright.config.ts` : `E2E_PORT` pour lancer les tests navigateur quand le port 5173 est déjà pris.

## Mode tutoriel : squelette et 3 leçons (17/10/2026, non commitée)

Étape 2 de `TUTORIEL_PLAN.md`. 321 tests OK (dont `tests/sim/lessons.test.ts`), typecheck OK, 15 tests
navigateur OK (dont `tests/e2e/tutorial.spec.ts` : la leçon du coup normal jouée jusqu'au bout avec une
manette virtuelle). **Pas encore joué à la vraie manette.**

- `?mode=tutoriel` (bouton « Tutoriel » dans les Réglages ; `&lecon=bandeja` ouvre une leçon) : liste des
  leçons avec étoiles, carte (quand, comment, boutons aux symboles de la manette), **démo** au ralenti ×0,5
  jouée par le bot avec ses boutons affichés, **2 essais guidés** au ralenti ×0,7 (« Appuie sur ✕ ! »,
  « Garde ✕ enfoncé… », « Relâche ! »), puis **seul** jusqu'à l'objectif. Après 3 échecs d'affilée, la
  démo repasse. Une étoile en réussissant, deux avec au moins 3 frappes parfaites. Navigation au stick et
  au bouton du coup normal, retour par Start ou Échap.
- Leçons (`src/sim/lessons.ts`, données pures) : **coup normal** (5 balles dans le terrain), **diriger**
  (4 zones tour à tour : droite, gauche, court, profond, dessinées au sol), **bandeja** (3, au filet sur un
  lob). Rouge envoie la balle de l'essai puis ne joue plus ; l'essai se juge au premier rebond. Chaque échec
  dit pourquoi en une phrase (pas appuyé, relâché trop tôt, mauvais bouton et lequel, coup bloqué, retard,
  mauvaise zone, víbora ou remate au lieu de bandeja).
- Bot : option `forced` (bouton et stick imposés) pour le démonstrateur.

## Hauteur de frappe de la bandeja et de la víbora (17/10/2026, non commitée)

Remarque de Xavier : la bandeja et la víbora se frappent légèrement au-dessus de la tête, devant et sur
le côté ; trop haut, la balle rebondit plus ; trop bas, c'est le filet. Ce timing fait la différence entre
un bon et un mauvais joueur. 330 tests OK (dont `tests/sim/contactHeight.test.ts`), typecheck OK.

- Hauteur idéale `bandejaIdeal` 2,35 m ± `overheadBand` 0,22 m (le remate garde `overheadIdeal` 2,55 m,
  plus haut, bras tendu). `overheadHeightOff` (`shots.ts`) mesure l'écart, de -1 à 1.
- **Trop haute** : effet perdu (jusqu'à tout, `overheadHighSpin`) et +0,8 m de profondeur : sur la
  situation de la leçon, rebond max 0,5 m propre → 1,9 m à 2,78 m → 2,5 m tout en haut.
- **Trop basse** : vitesse verticale retirée (jusqu'à 7 m/s, `overheadLowDip`) : au plancher (1,9-2 m),
  filet ; un peu basse, elle passe plus près de la bande.
- Hors de la bande idéale, pas de frappe parfaite. Sur un lob qui redescend, c'est le moment du relâcher
  qui choisit la hauteur : trop tôt = trop haute, trop tard = trop basse.
- Retour : l'encadré des boutons dit « bandeja prise trop haute : relâche plus tard » ; la leçon bandeja
  l'explique (trop haute = ratée, trop basse au filet = ratée, un peu basse = réussie avec remarque).
- IA normale contre IA normale, 6 × 15 min, avec / sans : ~7 coups par point et ~30 % de gagnants dans
  les deux cas ; coups hauts 42 % / 32 % des gagnants (pros 40-56 %) ; lobs qui passent 19 % / 27 %
  (pros ~28 %). Environ 1/3 des bandejas de l'IA normale sont hors bande ; une sur deux trop basse part
  au filet. Seuil du test des lobs abaissé de 10 % à 5 % (mesure bruitée sur 3 parties). **À recaler en jouant.**

### Révision : impact aux yeux, taille du joueur, frappe même trop bas (17/10/2026, non commitée)

Retour de Xavier à la manette : trop simple ; les joueurs auront des tailles différentes ; trop bas, le
joueur ne faisait pas le geste et laissait passer la balle. Puis : l'impact parfait, c'est la hauteur des
yeux. 331 tests et 15 tests navigateur OK. **À rejouer à la manette.**

- **Hauteur idéale = les yeux du joueur** : sa taille (`DuelPlayer.height`, 1,80 m par défaut,
  `PLAYER_HEIGHT`) moins `eyesBelowHead` 0,12 m, soit 1,68 m, ± `overheadBand` **0,12 m** (avant 0,22) :
  la balle qui redescend y passe en ~1/20 s. Un joueur plus grand frappe plus haut.
- Le coup haut se joue dès `overheadLow` **1,45 m** (épaules ; avant 1,9). Trop haute : effet perdu,
  rebond. Un peu basse (jusqu'à ~1,33 m) : elle passe, plus court ; plus bas : filet.
- **Trop tard, le joueur frappe quand même** (jusqu'aux genoux, `overheadMissLow` 0,6 m, 0,4 s de retard) :
  la balle part au filet au lieu de passer derrière lui. Au-delà, coup dans le vide, avec le geste
  (animation de la raquette sur un coup dans le vide, avant absente), et le message dit « trop tard ».
- **Remate** : préparé si le stick est vers l'avant **au moment d'appuyer** ; la course assistée vise alors
  la hauteur du remate (2,55 m, bras tendu) près du filet. Sinon elle vise les yeux. `Duel.overheadReleaseTick`
  donne le bon moment selon le coup ; l'anneau de timing, le « Relâche ! » du tutoriel et l'IA s'en servent.
  Le timing parfait du remate se mesure à sa hauteur ; la bandeja et la víbora sont parfaites par la hauteur.
- IA : précision propre aux coups hauts (`overheadRelease` : facile ±0,04 s, normale ±0,02, forte ±0,01).
- IA normale contre IA normale, 6 parties : 6,8 coups/point ; coups hauts 17 % des gagnants (bandeja/víbora
  ~9 %, pros 5-13 % ; avant ~28 %, trop) ; remate 3-8 % (pros 35-43 %, déjà faible avant) ; lobs qui passent
  ~42 % (pros ~28 %). Seuils de `overhead.test.ts` recalés en conséquence. **Le smash reste le chantier.**

### Le lob court se fait punir : remate et reprise de la chiquita (17/10/2026, non commitée)

Le remate ne faisait que 3 % des gagnants entre IA (pros 35-43 %). Trois causes : l'IA normale ne le
choisissait qu'une fois sur trois ; la zone du remate (4 m) excluait les lobs tombés juste avant la ligne
de service ; et elle le visait près de l'axe, où le défenseur le reprend après le rebond. Corrigé dans le
sens donné par Xavier : un bon lob tombe sur la ligne de service ou derrière ; plus court, il se fait smasher.
333 tests OK, typecheck OK. **À rejouer à la manette.**

- `remateZone` 4 → **5 m** : nos lobs montent à 5-6 m ; un lob tombé avant la ligne de service (6,95 m) passe
  à hauteur de remate (2,55 m) vers 4,9 m du filet. Vaut aussi pour le joueur humain.
- IA normale : remate sur un lob court **85 %** du temps (avant 35 %), visé ouvert vers le côté libre pour
  sortir par la vitre latérale (por tres). Il gagne le point ~52 % du temps.
- **Chiquita** : le joueur au filet tapait dans le vide sur ~1 point sur 6. La course assistée lui prévoyait
  une volée à 25 cm juste avant le rebond, et 0,06 s de retard suffisait à la rater. Elle ne prévoit plus de
  volée sous `volleyLow` **0,6 m** : la balle se reprend après le rebond, sous le filet, et remonte (balle rouge :
  plus lente, plus haute). Comme le demande Xavier, elle reste le plus souvent profonde et lente (75 %), parfois
  neutre, presque jamais gagnante (4 sur ~280, des volées croisées prises juste sous la bande).
- Ramassée sous 0,35 m et mal frappée (erreur > 0,5), elle perd de la hauteur (`pressure.netLow`, `netDip`
  3 m/s) et finit **parfois dans le filet** (~2 % de ces balles).
- IA normale contre IA normale, 6 × 15 min (graines 3, 11, 29, 41, 57, 73), avant → après :
  - remate : **3 % → 27 %** des gagnants (pros 35-43 %) ; coups hauts 17 % → 32 % (bandeja/víbora ~6 %) ;
  - coups par point : 6,8 → **6,9** (le remate seul les faisait tomber à 6,3 ; la chiquita corrigée compense) ;
  - gagnants 29 % → 38 % des points ; lobs qui passent 42 % → 38 % (pros ~35 %).
  Sur 6 autres graines : remate 21 %, 7,2 coups/point. La mesure est bruitée (±0,3 coup/point d'une série à l'autre).
- Tests : `overhead.test.ts` passe à 6 parties (seuils : plus de 6,5 coups/point, remate plus de 20 % des
  gagnants) ; `touch.test.ts` vérifie la reprise de la chiquita en retard et la balle ramassée qui part au filet.

### Volée coupée (carré / X) aussi rapide que la volée normale (17/10/2026, non commitée)

Retour de Xavier : le carré ne servait à rien, la croix suffisait partout. Au padel, la volée se joue coupée
et aussi fort ; mais le coupé demande de la préparation : sur une balle qui arrive vite, il rate plus.
334 tests OK, typecheck OK. **À rejouer à la manette.**

- Le carré à la volée est **toujours une volée coupée** (avant : seulement sur une balle flottante, sinon
  un coupé lent à ~47 km/h). Vitesse de la volée normale (`cut` 26/30 m/s au départ, ~60 km/h mesurés en
  jeu, comme la croix ; avant ~40), mêmes profondeurs, plus d'effet rétro (-0,4, -0,6 parfaite ; croix
  -0,25) : elle rebondit plus bas.
- **Elle demande du temps** : son erreur est multipliée par 1 + `pressure.cutRush` (1,5) × pression. Sur une
  balle rapide, basse ou sans préparation, elle part plus haute et plus longue que la volée normale. Sans
  aucune préparation, X reste un blocage. Au fond de court, rien ne change (coupé défensif, chiquita).
- Essais : effet -0,6 (-0,95 parfaite) et profondeur courte = elle concluait un point sur deux, trop.
- IA normale contre IA normale, 6 parties, avant → après : coups par point 6,9 → **6,4** ; gagnants
  38 % → 35 % des points ; remate 27 % → **20 %** des gagnants (la volée coupée lui prend des points) ;
  volées ~40 % → ~47 % des gagnants (pros ~30 %). Seuils de `overhead.test.ts` abaissés (plus de 6,2
  coups/point, remate plus de 17 %). Pas encore d'amortie (X stick vers soi à la volée).

## Essai : frappe au stick droit, le coup choisi à la fin du geste (17/10/2026, non commitée)

Demandé par Xavier : en défense, on cache son coup. Même préparation, et c'est à la fin du geste qu'on
choisit entre le coup normal et le lob (on pousse sur les jambes et on continue le geste), ou la chiquita
sur une balle facile. Inspiré du « Skill Stick » de NHL et du « Pro Stick » de NBA 2K. 341 tests et 16 tests
navigateur OK (dont `tests/input/swingStick.test.ts` et `tests/e2e/swing.spec.ts`), puis 359 tests avec les leçons.
**Pas encore joué à la vraie manette.**

- **Stick droit** (`src/input/swingStick.ts`), en plus des boutons, qui gardent la priorité :
  tiré vers soi = préparation (comme maintenir A) ; ramené **tout droit** vers l'avant = coup normal, frappé
  à l'arrivée devant ; ramené **par un côté** (geste ample, par en dessous) = lob ; **lâché**, le stick revient
  au centre et y reste 40 ms = toucher : chiquita après le rebond, volée coupée de volée.
- Le coup change au dernier pas sans perdre la préparation : pas de coup bloqué pour avoir choisi tard.
- Côté simulation, seul ajout : `ArcadeCommands.touch` (chiquita demandée sans le stick gauche vers soi).
- Retour des entrées : un 2e stick dessiné avec la trace du geste ; badge **R** sur les coups joués au geste.
- **Guide du geste** (`src/ui/swingGuide.ts`), à côté du retour des entrées, dès qu'on arme au stick : le stick en
  grand avec les trois fins (coup tout droit, lob par un côté, chiquita en lâchant). Le chemin suivi s'allume,
  puis le coup lu reste affiché un instant.
- **Trois leçons au tutoriel**, une par geste, en fin de liste : `?mode=tutoriel&lecon=stick-coup`,
  `stick-lob`, `stick-chiquita`. Démo où le guide dessine le geste du démonstrateur, essais guidés
  (« Tire le stick droit vers toi ! », « Garde le stick tiré… », puis « Tout droit ! », « Par un côté ! »
  ou « Lâche ! »), puis seul. Un geste mal lu est expliqué (« ton geste est allé tout droit : c'est un coup normal »).
- `?geste=0` désactive le stick droit.
- Réglages à caler en jouant (`SWING`) : seuils de préparation (0,6) et d'arrivée devant (0,5), passage par
  le côté (|x| ≥ 0,7), durée au centre pour le toucher (40 ms, ce qui retarde d'autant la chiquita).

**Coups au-dessus de la tête au stick** (idée de Xavier) : on arme selon le coup voulu, l'axe dominant
du stick décide.
- **Stick sur un côté, à gauche ou à droite** (la raquette derrière la tête ; droitier ou gaucher, coup droit
  ou revers) : ramené **tout droit vers l'autre côté** (ou lâché) = bandeja ; vers l'autre côté **en arc, par
  le haut ou par le bas** = víbora. Même préparation pour les deux. Le côté ne change rien d'autre au coup.
- **Stick en haut** : ramené **vers le bas** (ou lâché) = remate ; bajada sur une balle sortie de la vitre
  du fond ; bandeja si la balle est trop loin du filet ou trop basse (mêmes règles qu'aux boutons).
- La variante part avec la commande (`ArcadeCommands.overhead`, lue jusqu'au relâcher) : le stick de
  déplacement ne sert plus qu'à viser. Sans elle (boutons, IA), rien ne change. `Duel.overheadVariant` et
  `Duel.rematePrepared` regroupent la règle.
- Après une frappe, le stick doit repasser par le centre avant de ré-armer (un coup au sol fini en haut
  n'arme pas un smash).
- Le guide dessine les gestes de la préparation en cours ; trois leçons de plus : `stick-bandeja`,
  `stick-vibora`, `stick-remate`. 380 tests et 16 tests navigateur OK. **Pas encore joué à la manette.**
- **Remate lu comme une bandeja** (retour de Xavier) : la leçon envoyait un lob trop court, qui passait à
  ~2 m au moment de frapper, sous le minimum du remate (2,2 m). Lob de la leçon allongé (6,2 m) : le remate
  passe sur ~0,3 s de fenêtre. Quand un remate demandé au geste devient une bandeja, le jeu dit pourquoi
  (« balle trop basse pour un remate (1,9 m, il faut 2,2 m) : finis ton geste plus tôt », ou trop loin du
  filet), dans la leçon et dans l'encadré des entrées (`DuelShot.asked`, `remateRefusal`).
- Test navigateur du retour des entrées fiabilisé : le relâcher du service se fait dans la page (Playwright
  ratait parfois la fenêtre quand toute la suite tournait). 383 tests et 16 tests navigateur OK, deux fois.

**Volées au stick** (retour de Xavier : « pas logique, je n'arrive pas à en faire »). Le geste de volée
partait comme aux boutons, mais il demandait un grand armé vers soi au filet (~0,6 s pour tout faire), et
pousser le stick vers l'avant armait le smash : sur une balle basse, on obtenait un coupé défensif.
Schéma de Xavier :
- **Coup de stick sec vers le haut = volée bloquée** : sans préparation, la frappe part quand le stick revient
  au centre (blocage : moins vite). Tenu plus longtemps, c'est une volée pleine.
- **Tiré vers soi puis ramené tout droit, de volée = volée coupée** (`ArcadeCommands.cutVolley`).
- **Stick en haut** : remate seulement sur une balle à hauteur de remate (2,2 m, `remateLow`), dans la course
  assistée comme à la frappe ; plus bas, volée (`Duel.overheadFloor`, `Duel.lowShotKind`). Aux boutons, B
  garde les épaules comme seuil.
- Lâcher le stick ne coûte plus 40 ms pour les coups hauts (lâcher et finir y donnent le même coup) : seule la
  chiquita attend.
- Guide : notes « de volée : tout droit = volée coupée » et « balle basse : volée (coup sec = bloquée) » ; le
  coup réellement joué s'y affiche (« volée bloquée », « bandeja : balle trop basse… »). Un blocage voulu au
  stick n'affiche plus « appuie plus tôt pour armer ».
- Leçons `stick-volee-bloquee` et `stick-volee-coupee`. 401 tests et 16 tests navigateur OK. **Pas encore
  joué à la manette.**
- Retour de Xavier : « le geste fonctionne, mais le tuto montre le geste d'un remate ». Le guide regarde
  maintenant la balle : stick en haut sur une balle qui n'atteindra pas 2,2 m = dessin de la volée bloquée
  (coup sec vers le haut, puis lâche ; tenu : volée pleine). Le démonstrateur de la leçon appuie au dernier
  moment (`Lesson.demoReaction`, 0,4 s après la frappe de Rouge) : il bloque vraiment, au lieu d'une volée
  pleine. 402 tests et 16 tests navigateur OK.
- Retour de Xavier : la balle de l'exercice de volée coupée arrivait trop vite. Elle est maintenant flottante :
  un coupé raté de Rouge, 45 km/h, ~1 s pour arriver (avant 76 km/h, ~0,6 s), à hauteur de poitrine. Le
  blocage garde la balle rapide (c'est quand on n'a pas le temps qu'on bloque).
- Retour de Xavier : au fond, en défense, le stick vers l'avant doit faire un coup normal, pas une volée
  bloquée. Le blocage (pas de préparation, balle moins vite) ne vaut plus que de volée près du filet
  (`volleyZone`, 4,5 m) ; ailleurs, le coup de stick vers l'avant sur une balle basse est un coup normal plein.
  Le guide l'affiche (« coup normal : vers l'avant, et lâche »). 403 tests OK.
- Retour de Xavier : on ne doit pas pouvoir préparer un coup haut si la balle ne passe pas au-dessus de la
  tête. Au stick, la bandeja et la víbora sont **refusées** sous le bas de la zone idéale aux yeux (~1,56 m
  pour 1,80 m) : la préparation est annulée, relâcher ne frappe rien, et le jeu le dit (guide en rouge
  « Balle basse : pas de bandeja ni de víbora », note dans l'encadré ; `DuelPlayer.overheadRefusedTick`).
  Le stick en haut sur une balle basse reste un coup normal (fond) ou une volée (filet), jamais un remate.
  B aux boutons garde son coupé défensif. Une balle qui ressort de la vitre du fond à hauteur des yeux reste
  jouable en bandeja. 405 tests OK.

Pas encore fait : l'adversaire qui lit la préparation (un lob annoncé avec Y se voit, un lob décidé au
dernier moment surprend), le lob raté sur une balle basse et tendue, le geste au-dessus
de la tête (B reste aux boutons).

## Schéma simplifié aux sticks, boutons cachés (17/10/2026, non commité)

Décidé avec Xavier après les essais : **remplace** les gestes des sections précédentes (préparation sur le
côté, stick vers le haut, refus de la bandeja, etc.). 418 tests et 18 tests navigateur OK. **Pas encore joué
à la manette.**

**Une seule préparation** : stick droit tiré vers soi (comme armer un gros tir dans NHL). Plus on a le temps de
préparer, plus le coup est fort et précis. Le coup se choisit à la fin du geste, et la balle décide de la famille :

| | Préparé, tout droit | Préparé, en arc | Préparé, lâché | Sans préparation (coup sec ↑) |
|---|---|---|---|---|
| Au sol (après rebond, sous le seuil) | coup normal | lob | chiquita | coup moins fort, moins précis |
| De volée (sous le seuil) | volée coupée | volée coupée | volée coupée | volée bloquée |
| Au-dessus de la tête | smash (bajada après la vitre) | víbora | feinte de smash (nouveau) | bandeja |

- **Seuil des coups hauts** : les épaules par défaut, réglable `?coupshauts=yeux` ou `?coupshauts=tete`. Après un
  rebond, au moins les yeux : une balle de fond qui ressort de la vitre à hauteur d'épaules se joue au sol ; un
  lob qui rebondit très haut se joue en bajada.
- **Course assistée au stick** : elle prend la première balle jouable (au-dessus de la tête si elle y passe
  d'abord, un lob ; sinon au sol ou de volée). Sans préparation, pas de course assistée.
- **Smash** : de trop loin du filet ou mal minuté, il reste dans le terrain (pas de por tres) : l'adversaire peut
  contrer.
- **Feinte de smash** (`OverheadKind` `feinte`, réglages `rally.feinte`) : lente (~32 km/h), coupée, elle tombe vers
  5,5 m. [à calibrer en jouant : son deuxième rebond doit mourir vers la vitre]
- Simulation : `ArcadeCommands.swing` (préparé, fin du geste) remplace les indications d'avant ; `Duel.highFloor`,
  `Duel.swingFloor`, `Duel.lowShotKind`, `Duel.overheadVariant`.
- **Boutons cachés et sans effet sur la manette** : plus de losange de boutons, aide et consigne de service aux
  sticks, symboles R dans l'encadré. `?boutons=1` remet tout (les anciens tests navigateur des boutons tournent
  avec). Les boutons servent encore à valider dans les menus. Le clavier frappe toujours (pas de stick).
- **Guide** : un seul dessin (préparation vers soi, trois fins), les noms des coups suivent la balle (au sol, de
  volée, au-dessus de la tête), et une ligne rappelle le coup sec sans préparation.
- **Tutoriel** : dix leçons au stick (`stick-normal`, `stick-lob`, `stick-chiquita`, `stick-sansPrep`,
  `stick-voleeBloquee`, `stick-voleeCoupee`, `stick-bandeja`, `stick-smash`, `stick-vibora`, `stick-feinte`) ; sans
  `?boutons=1`, la liste ne montre qu'elles. Le démonstrateur joue avec le geste de la leçon (la feinte aussi).
- Retour de Xavier : un arc par le côté qui ne remontait pas jusqu'en haut, puis stick lâché, donnait une
  chiquita. Maintenant, dès que le geste est passé par un côté, il finit en arc (lob, víbora) quand le stick
  remonte un peu vers l'avant (`SWING.arcEnd`, 0,2) ou est lâché. Puis, Xavier voyait encore « coup normal » :
  l'arc devait aller trop loin sur le côté (|x| ≥ 0,7) et un arc lent dépassait la durée maximale du geste
  (0,45 s, fini d'office tout droit). Maintenant : |x| ≥ 0,45 suffit, durée maximale 0,8 s, et un arc trop lent
  reste un arc. Un geste tout droit qui dévie un peu (|x| ≈ 0,25) reste tout droit. 422 tests OK.
- **Bug corrigé** (lob et chiquita lus comme « coup normal » à la manette) : au relâcher, la fusion manette +
  clavier (`mergePads`) gardait la fin du geste du clavier, vide ; la simulation jouait alors tout droit. Les
  tests passaient car ils envoyaient le geste directement : un test suit maintenant le vrai chemin (manette
  virtuelle → `readGamepad` → `mergePads` → `toCommands`). Confirmé par Xavier à la manette. 423 tests OK.
- Tutoriel : la démo au ralenti se passe avec le bouton de validation (✕ / A, ou Entrée) : direct aux essais
  guidés. La consigne de la démo le rappelle.
- Pas encore fait : l'adversaire qui lit la préparation (lob caché), le lob raté sur une balle basse et tendue,
  la volée préparée lâchée ou en arc (amortie, lob de volée : volontairement absents pour l'instant).

## Étape C : 2 contre 2 local (17/10/2026, branche `feat/etape-c`)

D'après `research/tactique/TACTIQUE_2V2.md`. 431 tests OK (dont `tests/sim/doubles.test.ts`, 8 tests), typecheck
OK, 20 tests navigateur OK (dont `tests/e2e/doubles.spec.ts` : quatre manettes virtuelles jouent des points, chacune
frappe). Le simple ne bouge pas (mêmes échanges, mêmes tests). **Pas encore joué à quatre vraies manettes.**

- **Lancer** : Réglages → Match → « 2 contre 2 », puis « Nouvelle partie » ; ou `?double=1`. Manette 1 = Bleu 1,
  2 = Rouge 1, 3 = Bleu 2, 4 = Rouge 2 ; les places sans manette prennent une IA (Bleu 2 et Rouge 2 en IA normale
  par défaut). `?bot=none` : tout le monde humain ; `?bot=2,3,4` : ces joueurs en IA.
- **Simulation** (`Duel`, format `simple` | `double`) : le joueur `i` est dans l'équipe `i % 2` ; 0 et 1 jouent à
  droite (drive), 2 et 3 à gauche (revés), et gardent leur côté. Le premier des deux partenaires qui touche la
  balle la joue ; seul le receveur renvoie le service. Score par équipe.
- **Service** : rotation A1, B1, A2, B2 à chaque jeu, jeu décisif compris (`Match.serveTurn`). Reçoit le joueur
  adverse du côté servi. Le partenaire du serveur attend au filet, celui du receveur un pas derrière la ligne de
  service.
- **Qui prend la balle** (`Duel.owner`) : celui qui s'est engagé le premier ; sinon le propriétaire de la moitié ;
  au milieu (±0,7 m), celui qui arrive nettement le premier (0,15 s), sinon le joueur de gauche ; si l'un ne peut
  pas l'atteindre et l'autre si, l'autre (cambio). Les IA s'en servent ; un humain reste libre.
- **Annonces** : s'engager sur une balle affiche « ¡Mía! » au-dessus du joueur (humain aussi) ; l'IA qui laisse
  la balle à son partenaire annonce « ¡Tuya! ».
- **IA en double** : les deux au filet (2,8 m) ou les deux au fond (8,2 m), décidé sur le dernier coup de la
  paire ; lobée, la paire recule ensemble. Elle glisse vers le frappeur adverse (`doubles.shift` : 0,15 facile,
  0,3 normal, 0,4 fort), écart de 3,2 m au filet et 3 m au fond. Vise le milieu entre les deux adversaires
  (`doubles.middle` : 30 / 55 / 70 %) ou le plus grand trou. Avec un partenaire humain, elle se cale sur sa
  profondeur.
- **Rendu** : partenaires en teinte plus claire de la couleur d'équipe ; la caméra suit à peine le milieu de la
  paire bleue. HUD : « Bleus / Rouges », noms Bleu 1, Rouge 2… ; à plus de deux humains, le retour des entrées
  passe en compact (sans historique).

Mesuré, quatre IA normales, un set : 80 points, 7,8 coups/point, coups par joueur 125 / 123 / 196 / 189 (le joueur
de gauche prend le milieu), paire coupée filet/fond 2,4 % du temps, jamais deux partenaires sur la même balle ni
l'un sur l'autre. Les fins de point ressemblent au simple (deuxième rebond surtout, volées gagnantes au filet).

Reste : jouer à 4 vraies manettes (critère de l'étape) ; calibrer les profondeurs et l'écart ; escalonné, poach
du joueur de gauche, recroisement après un cambio, lecture du lob adverse (demi-pas en arrière) ; la caméra quand
les quatre sont au filet.
