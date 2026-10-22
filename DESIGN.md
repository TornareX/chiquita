---
name: Padel Smash
description: Jeu de padel arcade en 2 contre 2, à la manette, devant la télé ; interface « Grillage ».
colors:
  ball: "#e6ff2e"
  violet: "#7a3cff"
  blue: "#3cc4ff"
  blue-partner: "#a6e6ff"
  red: "#ff4d3d"
  red-partner: "#ff9e94"
  ink: "#0d0b1a"
  plate: "#1b1631"
  plate-raised: "#261f45"
  white: "#ffffff"
  ink-fg: "#f3f0ff"
  ink-soft: "#e4deff"
  ink-muted: "#b3a9de"
  ink-line: "#6e6596"
  mesh-wire: "rgba(122, 60, 255, 0.16)"
  pill-bg: "rgba(13, 11, 26, 0.9)"
  panel-bg: "rgba(13, 11, 26, 0.94)"
  quality-good: "#3fe39a"
  quality-warn: "#ff8a1f"
  quality-bad: "#ff3b6b"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(184 * var(--ui-px))"
    fontWeight: 900
    lineHeight: 0.84
    fontVariation: "'wdth' 62"
  banner:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(104 * var(--ui-px))"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(68 * var(--ui-px))"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 62"
  call:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(62 * var(--ui-px))"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 62"
  tile:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(56 * var(--ui-px))"
    fontWeight: 900
    lineHeight: 0.9
    fontVariation: "'wdth' 62"
  score-points:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(52 * var(--ui-px))"
    fontWeight: 900
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 62"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(26 * var(--ui-px))"
    fontWeight: 900
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 62"
  value:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(27 * var(--ui-px))"
    fontWeight: 900
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 75"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(24 * var(--ui-px))"
    fontWeight: 600
    lineHeight: 1.3
  body-hud:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(22 * var(--ui-px))"
    fontWeight: 500
    lineHeight: 1.3
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(20 * var(--ui-px))"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "calc(21 * var(--ui-px))"
    fontWeight: 800
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 80"
rounded:
  pad-key: "50%"
  pad-key-pair: "calc(18 * var(--ui-px))"
spacing:
  safe-x: "5vw"
  safe-y: "5vh"
  plate-gap: "calc(5 * var(--ui-px))"
  plate-inset: "calc(26 * var(--ui-px))"
  row: "calc(52 * var(--ui-px))"
  row-sub: "calc(42 * var(--ui-px))"
  tile-gap: "calc(26 * var(--ui-px))"
  column-gap: "calc(56 * var(--ui-px))"
  focus-shift: "calc(12 * var(--ui-px))"
components:
  menu-plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink-fg}"
    typography: "{typography.body}"
    height: "{spacing.row}"
    padding: "0 calc(26 * var(--ui-px))"
  menu-plate-hover:
    backgroundColor: "{colors.plate-raised}"
    textColor: "{colors.ink-fg}"
  menu-plate-focused:
    backgroundColor: "{colors.ball}"
    textColor: "{colors.ink}"
  menu-plate-primary:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ball}"
    typography: "{typography.value}"
  menu-plate-primary-focused:
    backgroundColor: "{colors.ball}"
    textColor: "{colors.ink}"
  menu-tile:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink-fg}"
    typography: "{typography.tile}"
    height: "calc(360 * var(--ui-px))"
  text-input:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-fg}"
    height: "calc(40 * var(--ui-px))"
    padding: "0 calc(16 * var(--ui-px))"
  team-heading-blue:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.ink}"
    padding: "calc(4 * var(--ui-px)) calc(34 * var(--ui-px)) calc(4 * var(--ui-px)) calc(24 * var(--ui-px))"
  team-heading-red:
    backgroundColor: "{colors.red}"
    textColor: "{colors.ink}"
    padding: "calc(4 * var(--ui-px)) calc(34 * var(--ui-px)) calc(4 * var(--ui-px)) calc(24 * var(--ui-px))"
  pad-key:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pad-key}"
    size: "calc(36 * var(--ui-px))"
  score-team-blue:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.ink}"
    width: "calc(212 * var(--ui-px))"
    height: "calc(70 * var(--ui-px))"
  score-team-red:
    backgroundColor: "{colors.red}"
    textColor: "{colors.ink}"
    width: "calc(212 * var(--ui-px))"
    height: "calc(70 * var(--ui-px))"
  score-games:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    width: "calc(56 * var(--ui-px))"
  score-points:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.score-points}"
    width: "calc(96 * var(--ui-px))"
  call-plate:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.call}"
    padding: "calc(4 * var(--ui-px)) calc(46 * var(--ui-px)) calc(8 * var(--ui-px))"
  call-plate-big:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.ball}"
    typography: "{typography.call}"
  hud-pill:
    backgroundColor: "{colors.pill-bg}"
    textColor: "{colors.ink-fg}"
    typography: "{typography.body-hud}"
---

# Design System: Padel Smash

## Overview

**Creative North Star: "Le grillage fait l'interface"**

Chaque pièce de l'interface vient du court de padel, et d'abord de son grillage : des plaques aux coins coupés à 45°
comme une maille, des bandeaux en parallélogramme, des losanges pour les repères, et la maille elle-même tendue en
fond, violette et discrète, sur une encre presque noire. L'énergie est celle d'un jeu de sport compétitif ; le
niveau visuel, celui d'une retransmission de padel professionnel, sans copier ni l'un ni l'autre. Tout se lit depuis
un canapé, à 2 ou 3 m d'une télé, manette en main.

La densité est faible et le contraste fort : peu de plaques, grandes, des titres criés en Archivo étroite italique
900 et en capitales, un texte courant en Archivo droite, court et en français. Le jaune balle est le seul accent
chaud : il dit « c'est ici » (le focus, l'action principale) ou « c'est maintenant » (service, punto de oro, por
tres). Le violet de l'arène porte la maille, les intertitres et les grandes annonces ; le bleu ciel et le rouge
appartiennent aux équipes, et à elles seules.

En match, l'interface se tient sur les bords et en haut de l'écran, dans la zone de sécurité télé, et ne passe
jamais sur le court, la balle, les joueurs ni les vitres. Ce monde refuse le menu de jeu web par défaut (panneau
gris arrondi centré, boutons pâles, liseré de focus) et le HUD de pastilles grises semi-transparentes en police
système.

**Key Characteristics:**
- Plaques biseautées à 45° en `clip-path`, jamais d'arrondi (hors les touches de manette dessinées).
- Encre `ink` maillée de violet en fond ; plaques `plate` posées directement dessus, sans panneau.
- Archivo variable embarquée : étroite italique 900 en capitales pour titres, valeurs et chiffres ; droite pour le texte.
- Jaune balle réservé au focus, à l'action principale et à l'instant fort.
- Une seule échelle, `--ui-px` : 1 unité = 1 px en 1920×1080, qui suit la fenêtre (720p à 4K, 4:3, ultra-large).
- Aucune ombre d'élévation, aucun flou : la profondeur vient des aplats et du biseau.

## Colors

Une encre violacée très sombre, un jaune balle électrique qui marque l'action, un violet d'arène, et deux couleurs
d'équipe franches qui se séparent aussi par la clarté.

### Primary
- **Jaune balle** (`ball`) : le focus (la plaque sélectionnée devient jaune, texte encre), l'action principale
  (« Lancer », « Reprendre » : liseré et mot jaunes au repos, plaque pleine au focus), le curseur de saisie, la
  sélection de texte, et en match l'instant : losange de service, appel du point (punto de oro), mot des grandes
  annonces, lettre en cours d'un code. C'est aussi la couleur « parfait » d'une frappe.

### Secondary
- **Violet arène** (`violet`) : la maille du fond (`mesh-wire`, ce violet à 16 %), le losange des intertitres, la
  lueur montante au bas de l'accueil, le fond maillé des grandes annonces (faute, let, por tres, bandeau des effets,
  ralenti), l'ombre décalée de « SMASH » sur l'accueil.

### Tertiary
- **Bleu ciel** (`blue`) et **Bleu partenaire** (`blue-partner`) : l'équipe Bleu (plaque du tableau, bandeau de
  colonne, losange de place, maillots de la 3D) ; le partenaire en double porte la teinte claire.
- **Rouge** (`red`) et **Rouge partenaire** (`red-partner`) : l'équipe Rouge, mêmes usages ; aussi le bandeau
  « Copa Canapé », le losange des messages d'erreur et le losange qui bat quand le match continue en ligne.
- Une plaque d'équipe dans les menus est un mélange : `plate` à 74 % avec `blue`, `plate` à 80 % avec `red`
  (en oklab).

### Neutral
- **Encre** (`ink`) : le fond de tout écran, les cases de jeux du tableau, les bandes et les annonces neutres, le
  texte posé sur jaune, bleu ou rouge.
- **Plaque** (`plate`) et **Plaque levée** (`plate-raised`) : les entrées au repos et au survol de la souris ;
  `plate-raised` sert aussi aux cases de lettres.
- **Blanc** (`white`) : titres d'écran, cases de points du tableau, touches A/B dessinées, liseré de « ma place » en
  ligne.
- **Texte** (`ink-fg`), **Texte doux** (`ink-soft`), **Texte éteint** (`ink-muted`) : texte courant, intertitres et
  secondaires, aides et explications (toutes lisibles sur l'encre et la plaque).
- **Fil** (`ink-line`) : traits, fil des intertitres, losanges vides des manettes absentes, barre de défilement.
- **Encre de plaque** (`pill-bg`, `panel-bg`) : l'encre à 90 % et 94 % sous les petites plaques du HUD et les
  panneaux posés sur la scène 3D.

### Status
- **Réussi** (`quality-good`), **Imprécis** (`quality-warn`), **Raté** (`quality-bad`), avec `ball` pour
  **Parfait** : qualité d'une frappe ou d'un essai. Teintes éloignées et clarté qui descend de l'une à l'autre (OKLab
  0,95 → 0,82 → 0,75 → 0,66), toujours accompagnées du mot écrit.

### Named Rules
**The Ball Rule.** Le jaune balle ne marque que deux choses : où est le focus (et l'action principale), et l'instant
fort du match. Un titre, un décor ou un état ordinaire n'est jamais jaune.

**The Team Ownership Rule.** Bleu et rouge n'appartiennent qu'aux équipes et aux joueurs, d'une seule source
(`src/render/teamColors.ts`, repris par `theme.css`). Le bleu reste nettement plus clair que le rouge (daltonisme).

**The Ink-On-Color Rule.** Tout texte posé sur bleu, rouge ou jaune est en encre, jamais en blanc.

## Typography

**Display Font:** Archivo (variable en largeur 62–125 % et en graisse 100–900, embarquée en woff2, licence OFL), avec
system-ui et sans-serif en secours
**Body Font:** Archivo, même fichier, en largeur normale et droite
**Label/Mono Font:** Archivo étroite (80 %) italique 800 pour les aides manette ; pas de police mono dans l'interface

**Character:** Une seule famille qui crie et qui parle : l'étroite italique 900 en capitales a l'élan d'un tableau
d'affichage de sport, la droite reste calme et lisible pour expliquer.

### Hierarchy
Toutes les tailles sont en `--ui-px` (les nombres ci-dessous valent des pixels en 1080p).
- **Display** (900 italique, étroite 62 %, 184, interligne 0,84, capitales) : le titre « PADEL SMASH » de l'accueil,
  penché de −3°.
- **Banner** (900 italique, étroite 62 %, 104, capitales) : le bandeau des effets (por tres) ; les codes de salle
  montent à 100–112.
- **Headline** (900 italique, étroite 62 %, 68, interligne 0,9, −0,01em, capitales, blanc) : titre de chaque écran,
  menus et écrans annexes.
- **Call** (900 italique, étroite 62 %, 62, capitales) : annonces du match, trois mots au plus ; la raison dessous en
  24, italique 700, étroite 85 %.
- **Tile** (900 italique, étroite 62 %, 56, capitales) : les tuiles de l'accueil ; 88 pour « Jouer ». Les grandes
  entrées-titres (Entraînement, Lancer) sont en 40.
- **Score** (900 italique, étroite 62 %, chiffres tabulaires) : points 52, jeux 42, noms d'équipe 40, bande des sets
  et compteur d'échange 26 en étroite 75 %.
- **Title** (900 italique, étroite 62 %, 26, +0,04em, capitales, `ink-soft`) : intertitres, précédés d'un losange
  violet et suivis d'un fil ; 30 et blancs dans les Réglages, 32 dans les bandeaux d'équipe.
- **Value** (900 italique, étroite 75 %, 27, chiffres tabulaires) : la valeur d'un choix à flèches ou d'un interrupteur.
- **Body** (600, 24, interligne 1,3) : texte des entrées de menu et des écrans annexes ; le HUD est en 500, 22.
- **Small** (20) : aides, explications, informations ; c'est le plancher des menus.
- **Label** (800 italique, étroite 80 %, 21, +0,06em, capitales) : barre d'aides manette (A Valider, B Retour) et
  nombre de manettes.

### Named Rules
**The Shout-And-Say Rule.** Ce qui se crie (titres, valeurs, chiffres, annonces, tuiles) est en étroite italique 900
et en capitales ; ce qui s'explique est en Archivo droite, en casse normale. Pas de troisième voix.

**The Couch Floor Rule.** Le texte courant vise 24 `--ui-px` dans les menus et 22 dans le HUD ; aucun texte de menu
sous 20. Les panneaux qui doivent tenir en 720p (labo, retour des entrées, aide) gardent un plancher en pixels
(12 à 13 px).

## Layout

L'interface est pensée en 1920×1080 et mesurée en `--ui-px`, qui vaut `min(100vw, 100vh × 16/9) / 1920` : elle garde
ses proportions de 720p à 4K. La zone de sécurité télé est de 5 % sur chaque bord (`safe-x`, `safe-y`). Sur un écran
plus large que 16:9, les menus se cadrent dans 1728 `--ui-px` centrés (`--ui-frame-x`) pour que les colonnes ne
s'étirent pas ; en 4:3, l'échelle reste celle d'un écran 16:9 (le texte est plus petit et le bas reste vide).

Les menus n'ont pas de panneau : les plaques posent sur la maille. Quatre dispositions :
- **Liste** : colonne de plaques de 52 de haut, espacées de 5, dans 840 de large ; un fondu masque le bas tant qu'il
  reste des entrées.
- **Tuiles** (accueil) : le titre en haut à gauche, quatre tuiles de 360 de haut sur toute la largeur, espacées de
  26, au-dessus de la barre d'aides.
- **Colonnes** (Jouer, en ligne) : les deux moitiés du court, Bleu à gauche et Rouge à droite, espacées de 56, les
  règles dessous sur deux colonnes, « Lancer » en bas à droite ; plaques de 58.
- **Liste et fiche** (situations) : noms à gauche, l'explication de l'entrée choisie dans une grande plaque maillée à
  droite, 40 caractères par ligne au plus.

La barre d'aides manette tient en bas, dans la zone de sécurité, sur toute la largeur du cadre. La pause est un
bandeau à gauche : le match reste visible à droite et le tableau s'y déplace.

En match, le tableau est au centre du haut, les annonces juste dessous, penchées, au-dessus du mur du fond ; « qui
joue avec quoi » en haut à gauche, pause et ralenti en haut à droite, le retour des entrées en bas à gauche, l'encart
réseau en bas à droite. La fin du match descend l'annonce en bas de l'écran.

## Elevation & Depth

Le système est plat et sans ombre d'élévation : ni `box-shadow` portée, ni flou, ni `backdrop-filter`, ni `filter` sur
un élément qui bouge (coût nul pendant l'échange). La profondeur vient du contraste d'aplats : encre, plaque, plaque
levée au survol, plaque pleine au focus ; et, pour ce qui pose sur la scène 3D, d'une encre presque opaque (90 à 95 %)
qui empêche les lignes du court de traverser le texte. Le focus avance au lieu de se soulever : la plaque glisse de
12 vers la droite (16 vers le haut pour les tuiles).

### Shadow Vocabulary
- **Liseré de losange** (`box-shadow: 0 0 0 calc(2 * var(--ui-px)) var(--ink)` ; 3 dans le HUD) : un anneau d'encre
  qui détache un losange d'équipe ou de service de la plaque colorée. Ce n'est pas une élévation.
- **Liseré intérieur** (`box-shadow: inset 0 0 0 calc(3 * var(--ui-px)) <couleur>`) : la place d'une équipe en
  ligne, une place fautive.
- **Ombre de texte sur la scène** (`text-shadow: 0 calc(2 * var(--ui-px)) calc(6 * var(--ui-px)) rgba(13, 11, 26, 0.9)`) :
  seulement pour un texte des écrans annexes posé sans plaque sur la 3D.

### Named Rules
**The Flat Plate Rule.** Une plaque ne flotte jamais : elle change de teinte (repos, survol, focus) et glisse, elle
ne prend pas d'ombre.

## Shapes

La forme de base est la maille : un rectangle aux coins haut-gauche et bas-droite coupés à 45°, en `clip-path`. Le
biseau grandit avec la plaque : 8 pour une case de lettre, 10 pour un champ, 12 pour les plaques des écrans annexes
et les messages, 16 pour une entrée de menu, 22 pour les plaques d'équipe du tableau, 36 pour une tuile. Le liseré
d'une plaque est une deuxième plaque coupée pareil, 3 (4 pour les tuiles) plus grande, peinte dessous.

Les bandeaux (bande des sets, compteur, raison d'une annonce, bandeau d'équipe, « Copa Canapé ») sont des
parallélogrammes ; les grandes annonces et le bandeau des effets aussi, avec un biseau de 28 à 40. Les plaques
d'équipe du tableau ne coupent que le coin extérieur. Les repères sont des losanges (carrés tournés de 45°) : service,
équipe, place, interrupteur (plein pour oui, vide pour non), manettes branchées, intertitres. Les flèches d'un choix
sont des triangles dessinés. Seules les touches de manette dessinées sont rondes (A, B ; LB RB en pilule de 18), parce
qu'elles reproduisent la manette.

## Components

### Buttons
Des plaques de maille qui s'allument comme une balle frappe le grillage.
- **Shape:** maille coupée à 45° (biseau de 16 `--ui-px`), liseré de 3 transparent au repos.
- **Primary:** « Lancer » et « Reprendre » : liseré et mot en jaune balle sur la plaque au repos, en étroite italique
  900 capitales (30 ; 40 à 44 en bas de Jouer et en pause) ; au focus, la plaque entière devient jaune et le mot passe
  en encre.
- **Hover / Focus:** survol souris : la plaque passe en plaque levée. Focus manette ou clavier : plaque et liseré en
  jaune balle, texte en encre, la plaque glisse de 12 en 220 ms sur un rebond court (`cubic-bezier(0.3, 1.9, 0.55, 1)`).
  Sans mouvement (`prefers-reduced-motion`), pas de glissement animé.
- **Secondary / Ghost:** une entrée ordinaire, plaque `plate`, texte 24 en 600. Désactivée : opacité 0,42.
  « Tester ma manette » : liseré `ink-soft`. Ma place en ligne : liseré blanc.

### Chips
- **Style:** pas de puce ; les petits marqueurs sont des losanges (14 dans les menus, 15 dans le HUD) liserés d'encre.
- **State:** interrupteur en losange vide (non) ou plein (oui) ; manettes branchées en losanges pleins `ink-soft`,
  absentes en losanges vides `ink-line`.

### Cards / Containers
- **Corner Style:** biseau 45° de 36 pour les tuiles de l'accueil, de 12 pour les plaques des écrans annexes.
- **Background:** tuiles et fiches : la maille par-dessus la plaque ; panneaux sur la scène : `panel-bg`.
- **Shadow Strategy:** aucune (voir Elevation & Depth).
- **Border:** le liseré-plaque (4 pour les tuiles), jaune au focus.
- **Internal Padding:** 32 sur les côtés d'une tuile, le mot calé en bas ; la phrase d'aide en 22 sous le mot.

### Inputs / Fields
- **Style:** un champ d'encre coupé à 45° (biseau 10) dans la plaque, 40 de haut, texte 700 `ink-fg`, indication
  `ink-muted`.
- **Focus:** la plaque entière prend le focus jaune ; le curseur est jaune balle.
- **Editing (manette):** la plaque redevient encre liserée de jaune ; le champ laisse place à des cases de lettres
  (`plate-raised`, biseau 8) et la lettre en cours est une case jaune balle.
- **Error:** une plaque teintée de rouge (plaque à 78 % avec `red`), texte blanc 700, précédée d'un losange rouge ;
  une attente est une plaque neutre au losange violet qui bat.

### Navigation
- **Style:** titre d'écran en haut à gauche (Headline, blanc), intertitres en losange violet et fil ; barre d'aides
  manette en bas : touche A pleine blanche, touche B en anneau blanc, libellés en Label. LB RB n'apparaît que sur les
  écrans en colonnes.
- **States:** une seule plaque au focus à la fois, toujours visible à 3 m. Quand une manette se signale, sa place
  s'allume : éclair blanc, cadre qui se resserre sur la plaque, losange d'équipe qui grossit puis retombe (1 s).

### Tableau de score (signature)
Le tableau accroché au grillage, au centre du haut : plaque Bleu (nom et losange de service) | jeux en case d'encre |
points en case blanche | un bout de filet maillé blanc sur encre | points | jeux | plaque Rouge. Hauteur 70, plaques
d'équipe de 212, coin extérieur coupé de 22. Dessous, une bande d'encre en parallélogramme (40 de haut) porte les
sets, l'appel du point en jaune balle et, à droite, le compteur d'échange. Le losange de service garde sa place même
caché, pour que le nom ne bouge pas. Bleu reste à gauche quel que soit le côté de la caméra.

### Annonce (signature)
Trois mots au plus sur une plaque en parallélogramme penchée de −4°, au-dessus du mur du fond, la raison en dessous
sur une bande plus petite. Ton : service en encre et texte blanc ; faute, let et por tres en violet maillé et texte
jaune balle ; point et fin du match à la couleur de l'équipe, texte encre. Elle claque à l'arrivée (échelle 1,35 →
0,96 → 1, en 160 ms) puis disparaît sans traîner ; rien ne bouge sans mouvement réduit.

## Do's and Don'ts

### Do:
- **Do** mesurer toute taille en `--ui-px` (1 = 1 px en 1920×1080) et garder tout texte utile dans la zone de
  sécurité de 5 %.
- **Do** couper les plaques à 45° en `clip-path` (biseau de 8 à 36 selon la taille) et dessiner les repères en
  losanges.
- **Do** réserver le jaune balle `#e6ff2e` au focus, à l'action principale et à l'instant fort du match.
- **Do** écrire en encre `#0d0b1a` sur le bleu, le rouge et le jaune.
- **Do** prendre les couleurs d'équipe dans `theme.css` (`--blue`, `--red` et leurs partenaires), alignées sur
  `src/render/teamColors.ts`.
- **Do** écrire titres, valeurs et chiffres en Archivo étroite italique 900 et en capitales, le reste en Archivo
  droite.
- **Do** accompagner chaque couleur de qualité de son mot (« parfait ! », « raté »).
- **Do** couper le glissement du focus et le claquement des annonces quand le mouvement réduit est demandé.

### Don't:
- **Don't** arrondir une plaque, un panneau ou un bouton : seules les touches de manette dessinées sont rondes.
- **Don't** poser une ombre portée, un flou ou un `backdrop-filter` sur l'interface ; le HUD ne doit rien coûter
  pendant l'échange.
- **Don't** mettre de l'interface sur le court, la balle, les joueurs ou les vitres.
- **Don't** écrire du texte blanc sur une couleur d'équipe ni sur le jaune balle.
- **Don't** utiliser le bleu ou le rouge pour autre chose qu'une équipe, un joueur ou une erreur.
- **Don't** reprendre l'ombre violette décalée de « SMASH » ailleurs : c'est une exception du titre de l'accueil,
  venue de la maquette choisie, pas un procédé du monde.
- **Don't** charger une police ou une image depuis un service tiers : Archivo est embarquée.
- **Don't** dépasser trois mots dans une annonce de match.
