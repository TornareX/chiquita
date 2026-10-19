# Polish visuel — analyse des techniques et plan

Recherche du 18/10/2026. But : rendre Padel Smash plus beau et plus « vrai » sans trahir
`GAME_DESIGN.md` §9 (stylisé / cartoon, lisibilité d'abord, jeu web en Three.js).

> **Ce que « réaliste » veut dire ici.** On ne vise pas le photoréalisme (TopSpin 2K25) : nos
> personnages sont en toon avec contour, et un terrain photoréaliste à côté jurerait. On vise un
> rendu **crédible** : une lumière de vraie salle de nuit, des matières qui se reconnaissent
> (gazon synthétique sablé, verre, métal), des objets qui touchent le sol. C'est l'approche de Team
> Fortress 2 (« stylisation avec un but ») : simplifier les formes, mais soigner lumière et matière.

---

## 1. Diagnostic du rendu actuel

Constaté dans le code (`src/render/`) et sur `screenshots/50-arene-clameur.png` :

| Point | État | Effet à l'écran |
|---|---|---|
| Tone mapping | aucun (`duelScene.ts:289`, `scene.ts:37`) | couleurs « brutes », blancs qui saturent, pas de contraste maîtrisé |
| Ombres portées | aucune ; seulement des disques sous joueurs et balle | personnages qui « flottent », terrain plat |
| Environnement (reflets) | aucun `scene.environment` | verre et métal sans reflet, tout semble en plastique mat |
| Matières | `MeshLambert` / `MeshBasic` partout hors personnages | terrain bleu uni, vitres = boîtes grises, poteaux sans matière |
| Personnages | `MeshToon` 3 aplats gris + contour par coque inversée | bien, mais ombres grises (pas teintées), pas de liseré de lumière |
| Arène | projecteur unique, brouillard, LED, public | bonne base ; les projecteurs eux-mêmes ne brillent pas |
| Post-traitement | aucun (MSAA natif seul) | pas de halo sur les lumières, pas d'étalonnage |
| Juice | déjà riche : éclats, onde de vitre, grillage qui vibre, secousse, zoom, traînée | à compléter, pas à refaire |

Deux défauts dominent : **absence d'ombres portées** et **absence de tone mapping**. Ce sont
aussi les moins chers à corriger.

---

## 2. Principes à respecter (les « règles d'or »)

1. **La balle reste l'objet le plus lisible de l'écran.** Aucun effet (halo, occlusion,
   étalonnage, vignette) ne doit baisser son contraste ni celui de son ombre au sol, qui est une
   information de jeu (hauteur de la balle). Vérification : capture en niveaux de gris.
2. **Lumière d'abord, détails ensuite.** Les artistes 3D règlent valeurs (clair/sombre) et
   lumière avant les textures : une bonne lumière sur des formes simples bat de belles textures
   mal éclairées.
3. **Ombres teintées, pas grises** (TF2, ombrage de Gooch) : zones éclairées légèrement chaudes,
   ombres froides et un peu plus saturées. Donne de la « peinture » au lieu de la « saleté ».
4. **Hiérarchie des valeurs** : terrain et joueurs clairs, arène sombre (déjà le cas), le regard
   va vers le terrain. Le vignettage et le brouillard renforcent ça.
5. **Un changement à la fois, avant/après sur la même image.** On a déjà les captures Playwright
   (`screenshots/`) : on fige une scène et on compare.
6. **Budget de performance fixé avant de commencer** : 60 i/s à 1080p sur une carte graphique
   intégrée récente. Chaque passe plein écran se paie.
7. **Tout effet se coupe** par l'URL, comme `?effets=0` ou `?models=off` aujourd'hui :
   `?rendu=simple` pour revenir au rendu actuel (comparaison et machines faibles).

---

## 3. Analyse des techniques

Note : gain visuel / coût de dev / coût GPU, de 1 (faible) à 3 (fort).

### 3.1 Tone mapping et exposition — gain 3 · dev 1 · GPU 1

Convertit la lumière calculée (sans plafond) en couleurs d'écran, avec une courbe « film ».
- **ACES Filmic** : classique, contrasté, mais décale les teintes (les bleus et rouges d'équipe
  virent) — problème connu signalé par les mainteneurs de Three.js.
- **AgX** (celui de Blender 4) : plus doux, respecte mieux les teintes, un peu terne sans réglage.
- **Neutral** (Khronos PBR Neutral) : garde les couleurs les plus proches de l'original ;
  candidat naturel pour un jeu aux couleurs vives.
- Réglage : `renderer.toneMappingExposure`, puis **remonter les intensités des lumières**.
- Piège : les objets d'interface 3D (aides, marqueurs de rebond, zone de timing) doivent garder
  leur couleur exacte → `toneMapped: false` sur leurs matériaux.

**Verdict : à faire en premier.** Essayer Neutral et AgX côte à côte.

### 3.2 Ombres portées — gain 3 · dev 1-2 · GPU 2

Le projecteur au-dessus du terrain (`SpotLight`, `duelScene.ts:303`) est idéal pour porter les
ombres : il est vertical, comme les vrais projecteurs de salle.
- `renderer.shadowMap.enabled`, `castShadow` sur joueurs, raquettes, filet et poteaux ;
  `receiveShadow` sur le sol.
- **Régler la caméra d'ombre serrée sur le terrain** (20 × 10 m) — le réglage par défaut est
  presque toujours faux et donne des ombres floues ou crénelées.
- Taille 2048 suffit pour un terrain ; `PCFSoftShadowMap` est plus doux mais plus cher sur
  machines faibles (rapports du forum Three.js) → `PCFShadowMap` en qualité basse.
- Un seul projecteur porte les ombres (chaque lumière qui porte une ombre redessine la scène).
- **Garder le disque d'ombre de la balle** : c'est une aide de jeu, plus lisible qu'une ombre
  réelle de 6 cm.
- Ne pas faire porter d'ombre aux contours des personnages (coque inversée) : seulement au corps.

**Verdict : le plus gros gain de « réalisme » perçu.**

### 3.3 Environnement pour les reflets — gain 2 · dev 1 · GPU 1

`RoomEnvironment` + `PMREMGenerator` (fournis avec Three.js, pas de fichier HDR à télécharger)
donnent une pièce lumineuse virtuelle qui sert de reflet et de lumière douce à tous les matériaux
`MeshStandard`/`MeshPhysical`. Le PMREM est préflouté selon la rugosité, donc peu coûteux.
Ne touche ni les `MeshLambert` ni les `MeshToon` : il faut passer en `MeshStandardMaterial` les
objets qui doivent briller (poteaux, cadre de raquette, structure des vitres).
Mieux encore à terme : fabriquer l'environnement à partir de l'arène elle-même (projecteurs en
taches lumineuses) pour que les reflets correspondent à la salle.

### 3.4 Matières du terrain — gain 3 · dev 2 · GPU 1

Un vrai court de padel indoor : gazon synthétique bleu **chargé de sable**, légèrement moucheté,
plus clair et usé là où on joue (derrière la ligne de service, au filet), lignes blanc cassé.
- Texture procédurale par canvas (comme le grillage actuel) : bruit fin + variations douces de
  teinte + zones d'usure → pas d'asset externe, poids nul.
- Carte de rugosité/normales légère pour que la lumière du projecteur « accroche » le sol.
- Attention au **moiré** : texture avec mipmaps et filtrage anisotrope
  (`texture.anisotropy = renderer.capabilities.getMaxAnisotropy()`), vue rasante oblige.

### 3.5 Vitres — gain 2 · dev 2 · GPU 1-2

Aujourd'hui : un plan gris à 16 % d'opacité. Une vraie vitre se lit par **ses bords et ses reflets**.
- Effet de Fresnel : plus opaque et plus réfléchissante vue de biais, presque invisible de face
  (shader simple ou `MeshPhysicalMaterial` sans transmission + environnement).
- Éviter `transmission` (réfraction) : cher, et signalé capricieux sur le forum Three.js.
- Liseré lumineux sur la tranche, montants métalliques, très légères traces (texture faible).
- Reflet du projecteur qui glisse quand la caméra bouge : c'est ce qui « vend » le verre.
- Garder la vitre côté caméra coupée (`clipNearWall`) : la lisibilité prime.

### 3.6 Personnages toon — gain 2 · dev 2 · GPU 1

- **Ombres teintées** : `MeshToonMaterial` ne lit que le canal rouge de sa rampe ; pour des
  ombres froides, modifier le shader (`onBeforeCompile`) et mélanger vers une couleur d'ombre.
  Équivalent du « lightwarp » de TF2.
- **Liseré de lumière (rim light)** : terme de Fresnel ajouté au shader, détache le joueur du
  fond sombre. Attention au scintillement quand la caméra bouge (rapporté sur des shaders Unity).
- **Contour d'épaisseur constante à l'écran** : la coque inversée grossit avec la proximité ;
  le joueur du fond a un contour trop fin. Épaissir selon la distance caméra.
- Animation secondaire (bandeau, maillot, cheveux qui suivent avec retard), petit écrasement à
  la réception des sauts et au freinage : déjà dans l'esprit du « juice ».

### 3.7 Post-traitement — gain 3 · dev 2 · GPU 2-3

Avec Three.js 0.186 en `WebGLRenderer`, la bibliothèque **pmndrs/postprocessing** est le bon
choix : son `EffectPass` fusionne plusieurs effets en une seule passe. (Le système natif de
`WebGPURenderer`/TSL est l'avenir mais imposerait une migration du rendu : pas maintenant ; ne pas
mélanger les deux.)

Pile conseillée, dans l'ordre :
1. **Rendu sans MSAA** + **SMAA** en sortie (l'occlusion ambiante casse le MSAA natif).
2. **N8AO** (occlusion ambiante) en demi-résolution : assombrit les contacts (pieds au sol, coins
   vitre/sol, sous le filet). Propre dès 6 échantillons, bien moins cher que l'ancien SSAO.
3. **Bloom** à seuil élevé : seuls les projecteurs, la bande LED, les éclats d'impact et la
   traînée de balle brillent. Le tone mapping désature les très clairs : c'est voulu avec le bloom.
4. **Étalonnage par LUT** (fichier `.cube`) : l'identité visuelle d'un coup (nuit froide, terrain
   éclatant). Se fabrique en retouchant une capture dans un logiciel photo.
5. **Vignettage** léger. Pas de grain ni d'aberration chromatique (nuisent à la lecture de la balle).

Coût : chaque passe plein écran coûte, et la simple activation d'un compositeur fait perdre des
images d'après des retours de développeurs → mesurer, et prévoir un niveau de qualité automatique.

### 3.8 Ambiance de salle — gain 2 · dev 1-2 · GPU 1

- Projecteurs **visibles** : rangées de lampes émissives au plafond + bloom.
- Faux rayons de lumière : cônes additifs très transparents sous chaque projecteur (le brouillard
  léger d'une salle). Pas de vrai volumétrique, trop cher.
- Reflets brillants du projecteur sur le sol (sol légèrement satiné).
- Public : variations de taille/couleur, lèvent les bras sur les gros points (déjà amorcé).

### 3.9 Juice et mise en scène — gain 2 · dev 2 · GPU 1

Déjà en place : éclats, secousse, zoom, traînée, grillage qui vibre. À ajouter :
- **Arrêt sur impact (hit-stop)** de 50 à 100 ms sur un smash ou une frappe parfaite : la frappe
  « pèse ». Toucher au temps touche au gameplay → à essayer à la manette, réglable, coupable.
- **Poussière de sable** quand un joueur freine ou glisse (comme la terre battue de TopSpin 2K25) —
  très « padel », le sable est réel sur ces courts.
- **Arc de raquette** (traînée du cadre pendant le geste, plus marquée sur les coups forts).
- Écrasement de la balle à l'impact et au rebond (une image suffit).
- Ralenti du coup gagnant entre les points, avec flou de profondeur (là, le coût n'importe pas).
- Règle : effets en trois tailles (petit/moyen/grand) proportionnels au coup ; secousse discrète.

---

## 4. Plan

Ordre choisi par rapport gain/effort, et pour que chaque étape soit visible seule. Rien ne
touche `src/sim/` sauf le hit-stop (étape V7).

| Étape | Contenu | Validé quand… |
|---|---|---|
| **V0 — Banc d'essai** | Scène fixe de référence (3 cadrages : vue de jeu, `?camera=proche`, ralenti) capturée par Playwright ; compteur d'images en mode debug ; drapeau `?rendu=simple` ; planche de références (captures de retransmissions Premier Padel de nuit) | on peut comparer deux versions sur la même image et lire le temps par image |
| **V1 — Lumière et couleur** | Tone mapping (Neutral vs AgX), exposition, intensités recalibrées, ciel/sol de l'hémisphère teintés chaud/froid, `toneMapped: false` sur les aides | les couleurs d'équipe et la balle gardent leur teinte ; image plus contrastée sans blancs brûlés |
| **V2 — Ombres** | Projecteur qui porte les ombres, caméra d'ombre serrée, joueurs/raquettes/filet/poteaux | les pieds « touchent » le sol ; ombre de balle (disque) inchangée ; 60 i/s tenus |
| **V3 — Matières** | Texture procédurale du gazon sablé avec usure, lignes blanc cassé, environnement `RoomEnvironment`, métal des poteaux, vitres à Fresnel avec liseré et reflet | on reconnaît sol, verre et métal sur une capture fixe |
| **V4 — Personnages** | Ombres toon teintées, liseré de lumière, contour d'épaisseur constante, écrasement aux réceptions | le joueur du fond se détache autant que celui de devant |
| **V5 — Salle** | Projecteurs visibles, cônes de lumière, sol satiné | la salle a une source de lumière crédible |
| **V6 — Post-traitement** | pmndrs/postprocessing : SMAA, N8AO demi-résolution, bloom à seuil, LUT, vignette ; qualité auto (haute/basse) | gain visible sur la capture ; ≤ 4 ms de plus par image ; balle aussi lisible en niveaux de gris |
| **V7 — Juice** | Poussière de sable, arc de raquette, écrasement de balle, ralenti du coup gagnant ; hit-stop en option | jugé à la manette (règle « gameplay d'abord ») |

Chaque étape : avant/après dans `screenshots/`, mesure du temps par image, puis une partie à la
manette pour vérifier que la lecture de la balle n'a pas souffert.

## 4 bis. Fait (18/10/2026)

**V0 — banc d'essai.**
- `?figer=5.2` (mode match) : la simulation s'arrête net à 5,2 s de jeu, le rendu continue. Même graine,
  même pas : la même image d'une version à l'autre.
- `tests/e2e/rendu.spec.ts` : 3 scènes figées (`jeu`, `proche`, `double`) en `?rendu=simple` et en rendu
  soigné, en couleur et en niveaux de gris, dans `screenshots/rendu/` ; planches `comparaison-*.png`
  (en haut simple | soigné, en bas les mêmes en gris). `jeu-avant*.png` : le rendu d'avant tout changement.
- Mesure : `window.__perf` en debug, `?perf` l'affiche à l'écran (i/s, ms, appels de dessin, triangles).
  Le banc lance Chromium sur la vraie carte graphique ; `RENDU_LOGICIEL=1` force le rendu logiciel (sans
  ombres ni reflets, voir plus bas). `RENDU_LABEL`, `RENDU_QUERY`, `RENDU_SCENE` pour régler vite.

```bash
npx playwright test tests/e2e/rendu.spec.ts
```

**V1 — lumière et couleur** (`src/render/look.ts`, lumières dans `duelScene.ts`) :
- **Neutral** retenu. Comparé sur la même image (`jeu-agx.png`, `jeu-aces.png`) : AgX délave tout (couleurs
  d'équipe pastel), ACES éclaircit et décale. `?tons=agx|aces` reste pour comparer.
- Exposition 0,95 ; ambiance plus basse (2,2 → 1,6), projecteur plus fort (2,2 → 3,0) : plus de contraste
  terrain / salle. Lumières légèrement chaudes, sol de l'ambiance bleu froid (ombres froides).
- **Environnement avancé de V3 à V1** : `court.glb` est en matériaux physiques (structure métallique à 0,6),
  qui sans environnement restaient noirs. `RoomEnvironment` à 0,35 : la structure et les tranches de vitre
  accrochent enfin la lumière.
- Repères de jeu (`exactColor`) hors courbe de tons : anneaux, rebond, ombre de balle, vitre, zone cible, aides.
- Coût : RTX 4070, 60 i/s tenus dans les deux rendus, ~1 à 2 ms côté processeur, pas d'écart mesurable.
  En rendu logiciel, l'environnement triplait le temps d'image (~150 → ~400 ms) et faisait rater les tests
  qui dépendent du temps réel : il est coupé automatiquement sans accélération graphique (`softwareRendering`).
- Constat honnête : gain réel mais modeste. Le blanc tire un peu vers le crème (casquette) ; le sol reste
  terne parce que sa **texture** est gris-bleu : c'est le travail de V3, pas de la lumière.
- Le hit-stop existe déjà (40 ms sur frappe parfaite, `modes/duel.ts`) : V7 n'a qu'à le régler.

**V1 validé en jeu par Xavier** (comparé à `?rendu=simple`). Suite : V2 (ombres portées), puis V3 (matière du sol).

**V2 — ombres portées** (18/10/2026, 1d24161 ; `enableShadows` / `setShadows` dans `look.ts`) :
- Le projecteur du terrain porte les ombres (le soleil sans l'arène) ; carte 2048, cône limité au terrain,
  `PCFShadowMap` avec un rayon de 3 (`PCFSoftShadowMap` n'existe plus dans three 0.186).
- Portent : volumes opaques (joueurs sans leur contour, raquettes, poteaux, bande du filet, structure).
  Ne portent pas : vitres, grillage, toile du filet, balle (son disque reste l'aide de jeu).
- Une ombre n'assombrit que la lumière qui la porte : avec les ombres, le projecteur passe à ×1,35, le soleil
  à ×0,45 et l'ambiance à ×0,85, sinon elles restaient pâles. Le disque sous les pieds descend à 0,18.
- Coupées en `?rendu=simple`, en rendu logiciel et par `?ombres=0`.
- Coût : RTX 4070, 60 i/s tenus ; +48 appels de dessin (passe d'ombre) en simple, +95 en double. Pas mesuré
  sur une petite carte graphique.
- Constat : net en double et de près (`comparaison-v2-*.png` : V1 à gauche, V2 à droite) ; discret dans la
  vue de jeu, parce que le projecteur est presque vertical et que l'ombre tombe sous le joueur.

**V2 validé en jeu par Xavier** (comparé à `?ombres=0`). Suite : V3 (matière du sol).

**V3 — matière du sol : tapis façon Premier Padel** (18/10/2026, 762e2a5 ; `src/render/turf.ts`) :
- Référence : la surface officielle de Premier Padel et de la FIP est le **Premier Supercourt X3 de Mondo**,
  trois monofilaments texturés sur sable de silice ([Mondo](https://www.mondoworldwide.com/na/en/sport/padel/)).
  Les fibres texturées tiennent debout avec peu de sable : à la télé, une moquette d'un bleu vif uniforme, un peu
  plus claire au fond (vue de biais) ; de près, des fibres bleues et de fins grains de silice clairs.
- **Premier essai abandonné** : gazon chargé de sable avec usure, lés et sable contre les vitres. Jugé par Xavier
  trop « club » et pas assez Premier Padel.
- Tapis : `MeshPhysicalMaterial` bleu vif (`CARPET_COLOR` 0x00349c) qui remplace le sol ; le grain de la texture
  du modèle ne garde que ses nuances de clarté ; velours par le `sheen` des matériaux physiques (fait pour les
  tissus), qui éclaircit le fond du terrain ; reflet spéculaire presque nul (un tissu n'a pas de vernis) ; grains de
  silice tirés des grains les plus clairs de la texture, donc lissés au loin par les mipmaps, sans scintiller.
- Piège trouvé : la courbe de tons Neutral désature les couleurs très lumineuses ; un albédo bleu trop clair
  virait au lavande. D'où un albédo plus sombre qu'on ne l'imagine.
- Mesuré contre une capture TV de Premier Padel (Milan P1, `reference-premier-padel.png`, image de retransmission, pas à nous : à garder hors du dépôt) : sol proche
  (40, 99, 198) contre (6, 94, 190), fond (15, 91, 233) contre (7, 112, 225).
- Lignes : `MeshStandardMaterial` blanc net (0xf7f8fb), éclairées, qui reçoivent les ombres sans en porter.
- Lisibilité (en gris) : sol plus sombre qu'en V2 (94 contre 114), donc balle, lignes et joueurs ressortent mieux ;
  maillot bleu à 132 sur ce sol. À surveiller en jeu : équipe bleue sur terrain bleu.
- Coût : nul mesurable (60 i/s, mêmes appels de dessin).
- `?gazon=0` garde le sol de V2 ; `comparaison-v3-*.png` : V2 à gauche, V3 à droite.

**V3 validé en jeu par Xavier** (comparé à `?gazon=0`). Suite : V4 (personnages).

**V4 — personnages** (18/10/2026, code dans f22220f ; `src/render/toonLook.ts`) :
- **Ombres teintées** (ombrage illustré de TF2) : le dégradé toon à trois aplats est remplacé dans le shader ;
  l'aplat d'ombre tire vers un bleu froid (×0,66 / 0,8 / 1,25), l'aplat du milieu gagne un peu de chaleur
  (×1,08 / 0,98 / 0,92), la lumière reste blanche.
- **Liseré de lumière** : terme de Fresnel en aplat net (`smoothstep`), seulement sur les bords tournés vers le
  haut (les projecteurs), bleu très clair à 0,45. Souligne épaules, cuisses, casquette et cheveux.
- **Contour d'épaisseur constante à l'écran** : la coque gonflée de 1,8 cm s'élargit avec la distance à la
  caméra (vertex shader), pour un trait de ~1,6 px à 720 lignes ; jamais plus fin qu'avant (gros plans
  inchangés). Le joueur du fond garde le même trait que celui de devant. Suit le champ de la caméra (dézoom).
- Pas fait : écrasement à la réception des sauts (touche à l'animation, à voir avec V7).
- Coût : nul mesurable (60 i/s, mêmes appels de dessin). `?toon=0` garde les personnages de V3.
- `comparaison-v4-*.png` (V3 | V4) et `gros-plan-v4-*.png` (joueurs agrandis, V3 | V4).

**V4 validé en jeu par Xavier** (comparé à `?toon=0`). Suite : V5 (salle).

**V5 — salle** (18/10/2026 ; `src/render/hall.ts`) :
- Constat de cadrage : la caméra télé (8,7 m, champ de 20°) ne voit rien au-dessus de ~3 m au fond de la salle ;
  des rampes au plafond seraient hors cadre, donc pas faites. On travaille ce qui est dans l'image.
- **Halos** sur les quatre projecteurs des montants du modèle (x ±4,85, y 4,8, z ±4,95) : sprites additifs à
  dégradé radial, en attendant un vrai bloom (V6).
- **Faisceaux** : un cône additif par projecteur, dirigé vers le terrain, dense près de la lampe, bords fondus
  (shader), opacité 0,09 au plus : une brume qui éclaircit un peu le terrain sous les projecteurs. Clarté
  moyenne du sol inchangée en gris (100 contre 99), balle aussi lisible.
- **Ambiance** façon Premier Padel : fond et brouillard bleu nuit (0x070a18), tribunes bleutées, sol de la
  salle sombre et mat.
- **Essai abandonné** : sol de salle satiné. La caméra le voit en rasant et un sol satiné y renvoie presque
  toute la lumière (Fresnel) : il devenait gris clair.
- Coût : +8 appels de dessin, 60 i/s. `?salle=0` garde la salle de V4 ; `comparaison-v5-*.png` (V4 | V5).

À juger en jeu (`?salle=0` pour comparer).

**V6 — post-traitement** (19/10/2026 ; `src/render/postfx.ts`) :
- Dépendances ajoutées : `postprocessing` 6.39.5 (pmndrs, compatible three < 0.187) et `n8ao` 2.0.1 (sans types :
  `src/n8ao.d.ts`).
- Chaîne : rendu en tampon flottant → **N8AO** (occlusion, demi-résolution, qualité « Performance », rayon 0,6 m)
  → **bloom** à seuil haut (4, en lumière linéaire) → **courbe Neutral** (déplacée du moteur au compositeur, même
  exposition) → contraste +0,03 → **vignette** douce → **SMAA** (le MSAA du moteur est coupé).
- Pièges trouvés :
  - les lignes et la casquette, sous le projecteur, valent plus de 3 fois le blanc : seuil du bloom à 4, et les
    projecteurs ont un **cœur** très intense (×14, 45 cm) au centre de leur halo doux, seul à fleurir ;
  - le compositeur mélange les transparents en lumière linéaire : à opacité égale, les **vitres** devenaient
    laiteuses. Opacité ×0,4 avec le post-traitement (`linearGlass`) ;
  - +0,06 de saturation poussait le bleu vers le violet : retiré. Vignette à 0,35 (à 0,5, elle assombrissait de
    20 % les coins où se tiennent les joueurs).
- Couleur du sol au centre : (35, 91, 224) contre (43, 108, 216) en V5 ; balle aussi lisible en gris.
- Coût, sans plafond à 60 i/s (RTX 4070, 1280 × 720) : +0,45 ms par image en vue de jeu (1,47 contre 1,02 ms),
  +0,5 ms en double. Pas mesuré sur une petite carte graphique.
- **Qualité automatique** : sous 45 i/s en moyenne pendant 3 s (après 2 s de mise en route, onglet visible), le
  post-traitement se coupe pour la partie et le moteur reprend sa courbe de tons. Coupé aussi en rendu
  logiciel et par `?postfx=0`.
- Le banc d'essai échoue désormais sur une erreur de console (shader qui ne compile pas). Les avertissements
  du compilateur Direct3D sur les shaders de N8AO/SMAA (précision, dérivée dans une boucle) sont sans effet.
- `RENDU_SANS_VSYNC=1` : le banc mesure sans plafond à 60 i/s. `comparaison-v6-*.png` (V5 | V6).
- Pas fait : étalonnage par LUT (contraste et courbe suffisent pour l'instant).
- **Flashs blancs** (signalés par Xavier, 19/10/2026) : de temps en temps, une image entièrement blanche.
  Reproduit en IA contre IA (graine 3, vers 88 s : 2 images à 250/255 de clarté contre ~55 d'habitude), puis isolé
  variante par variante : présent sans occlusion et sans effets d'impact, absent sans post-traitement et **sans
  bloom**. Cause : un pixel infini ou NaN, venu d'un matériau sous un angle rare, que le flou du bloom étale sur
  tout l'écran. Correction : une passe de nettoyage avant le bloom (`sanitizePass`), qui plafonne à 64 et ramène
  à 0 au moins ; sous Direct3D, `min` et `max` écartent les NaN, alors que `isnan` peut disparaître à la
  compilation (un marquage en magenta n'a donc rien montré, et le matériau fautif n'est pas identifié). Vérifié :
  0 flash sur la même partie de 95 s, ni sur 150 s de double. Test de non-régression `renduFlash.spec.ts`
  (95 s, lancé avec `RENDU_FLASH=1`).

À juger en jeu (`?postfx=0` pour comparer).

## 5. Risques

- **Lisibilité** : le principal risque. Halo, occlusion ou étalonnage qui noient la balle jaune
  sur le fond. Contrôle systématique en niveaux de gris et en simulation daltonien.
- **Performance** : ombres douces et post-traitement sur machines faibles → niveaux de qualité.
- **Cohérence** : mélanger toon et matières physiques peut jurer. Garder des matières simples,
  rugosité élevée, peu de détails fins ; le contour reste réservé aux personnages.
- **Tests e2e par capture** : toute retouche de lumière change les images de référence ; à mettre
  à jour volontairement, étape par étape.

## Sources

- Three.js Journey, « Realistic render » : https://www.threejs-journey.com/lessons/realistic-render
- Forum Three.js, améliorer le rendu de base : https://discourse.threejs.org/t/how-to-improve-vanilla-three-js-fidelity/55837
- Forum Three.js, tone mapping (ACES/AgX) : https://discourse.threejs.org/tag/tone-mapping
- Forum Three.js, ombres et performance : https://discourse.threejs.org/t/how-to-optimize-shadow-rendering-in-three-js-for-better-performance/64681
- Forum Three.js, PCFSoft sur mobile : https://discourse.threejs.org/t/performance-drop-in-mobile-portrait-mode-android-chrome-firefox/2080
- Docs Three.js, RoomEnvironment / PMREMGenerator / LUTPass : https://threejs.org/docs/pages/RoomEnvironment.html · https://threejs.org/docs/pages/PMREMGenerator.html · https://threejs.org/docs/pages/LUTPass.html
- Forum Three.js, verre et envMap : https://discourse.threejs.org/t/reflections-in-meshphysicalmaterial-with-runtime-generated-envmap-not-looking-right/46238
- pmndrs/postprocessing : https://github.com/pmndrs/postprocessing
- N8AO : https://github.com/N8python/n8ao
- Forum Three.js, coût de l'anticrénelage : https://discourse.threejs.org/t/performance-of-different-antialiasing-techniques/56740
- Manuel Three.js, post-traitement WebGPU : https://threejs.org/manual/en/webgpu-postprocessing.html
- Valve, « Illustrative Rendering in Team Fortress 2 » (SIGGRAPH 2007) : https://www.advances.realtimerendering.com/s2007/Mitchell-IllustrativeRenderingInTF2(Siggraph07%20Course%20Notes).pdf
- Valve, « Stylization with a Purpose » (GDC 2008) : https://cdn.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf
- Valve Developer Wiki, Lightwarp : https://developer.valvesoftware.com/wiki/Lightwarp
- Unity Toon Shader, prise en main : https://docs.unity3d.com/Packages/com.unity.toonshader@0.13/manual/GettingStarted.html
- 2K, TopSpin 2K25 (surfaces, glissades) : https://2k.com/games/topspin-2k/topspin-2k25/centre-court-report/gameplay/
- Game feel / juice : https://www.wayline.io/learn/game-feel/1 · https://bugnet.io/blog/game-feel-why-juice-matters-and-how-to-add-it
