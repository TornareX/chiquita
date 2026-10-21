---
version: 1
slug: "src-ui-menu-css"
primary_target: "src/ui/menu.css"
related_targets: ["src/ui/menu.ts","src/ui/screens","src/ui/pauseMenu.ts","src/ui/onlineLobby.ts"]
---

# Menus de Padel Smash

## Scope

Tous les écrans affichés par le composant de menu commun (`src/ui/menu.ts`, apparence dans `src/ui/menu.css`) :
accueil, Jouer, Réglages, Entraînement, salon et salle en ligne, pause. Le HUD de match aura son propre brief.

Mode : **Operate**. Le joueur vient lancer une partie, régler sa place ou ses préférences, puis jouer ; l'écran
doit se lire depuis le canapé et se piloter à la manette sans hésiter.

## Audience and job

- Joueurs sur un canapé, à 2-3 m d'une télé, manette en main (jusqu'à 4) ; clavier et souris possibles.
- Tâches : lancer un match en quelques secondes ; choisir le format, qui tient chaque place, le niveau des IA et
  les règles ; régler ses préférences ; créer ou rejoindre une salle à code ; reprendre ou quitter en pause.
- États qui comptent : focus (toujours visible), entrée principale (« Lancer »), choix à flèches, interrupteur,
  désactivé, saisie de nom, place allumée quand une manette se signale, place à soi en ligne, message d'erreur
  (serveur introuvable).

## Constraints

- Comportement inchangé : mêmes entrées, même navigation (haut/bas, gauche/droite sur les choix, A/Entrée, B/Échap),
  mêmes classes et attributs (`data-screen`, `data-item`, `.is-focused`…) dont dépendent les tests.
- L'apparence passe par les variables et les classes de `menu.css` ; aucun style dans la logique.
- Fond de l'accueil fixe (encre et maille), titre en typo seule, tout en français, pas de sons dans cette passe.
- Police embarquée, rien chargé depuis un service tiers.
- Lisible en 1280×720 comme en 1920×1080 ; zone de sécurité de 5 % sur les bords d'une télé.

## Direction contract

THESIS : Un menu de jeu de sport compétitif construit avec la grammaire du grillage de padel : chaque entrée est
une plaque biseautée à 45°, le focus est la balle qui frappe la maille. Il refuse le menu par défaut des jeux web :
un panneau gris arrondi centré, une liste de boutons pâles et un liseré de focus.

OWN-WORLD : Fond encre `#0D0B1A` traversé d'une maille violette à 45° (`#7A3CFF` très bas en opacité). Plaques
`#1B1631` aux coins coupés à 45° ; titres et valeurs en Archivo étroite italique 900, texte courant en Archivo
normale. Bleu `#2F6BFF` et rouge `#FF4D3D` marquent les équipes en bande épaisse sur la plaque. Le jaune balle
`#E6FF2E` est réservé au focus et à l'action principale. Petits repères en losange.

STORY : Le joueur comprend d'un coup d'œil où il est (titre d'écran), ce qu'il a sélectionné (la plaque jaune) et
ce que fait chaque bouton de la manette (barre d'aides en bas). Il lance un match sans lire un mot de trop.

FIRST VIEWPORT : Accueil : titre « PADEL SMASH » en grand, italique, à gauche, légèrement penché, au-dessus de la
liste. Les quatre entrées (Jouer, En ligne, Entraînement, Réglages) en plaques larges et hautes ; « Jouer » a le
focus au départ, en jaune. Barre d'aides manette en bas (A Valider, B Retour) et repères des manettes branchées en
losanges à droite. Les écrans de réglage gardent la liste verticale, plus dense, avec le titre en haut à gauche.

FORM : Monde « Grillage », piste B de la planche du 21/10/2026, imposée par l'utilisateur, sans tirage. Mouvement
signature : le focus, une plaque qui passe au jaune balle et glisse de quelques pixels avec un rebond court, comme
une balle dans la maille. seed: none (roll skipped: world imposed by the user, Xavier, from the 21/10/2026 board)

FINISH : unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Passer d'une entrée à l'autre à la croix : les plaques s'allument l'une après l'autre en jaune, avec le petit
rebond, comme une balle qui court le long du grillage.

## Unresolved

- ~~Accueil : liste ou tuiles~~ : tranché le 21/10/2026, **tuiles** (`layout: 'tiles'`, gauche/droite et haut/bas
  déplacent le focus ; titre au-dessus des tuiles, à gauche, et non au-dessus d'une liste). Le titre reste blanc :
  jaune balle réservé au focus et à l'action principale.
- Visuel de la tuile « Jouer » (image ou illustration, comme la maquette) : pas encore décidé.
- ~~Organisation de l'écran Jouer~~ : tranché le 21/10/2026, **les deux moitiés du court** (`layout: 'columns'` :
  Bleu à gauche, Rouge à droite, règles dessous sur deux colonnes, « Lancer » en bas à droite ; LB/RB ou Tab changent
  de colonne). Repères des manettes affichés sur Jouer aussi.
- ~~Situations de match trop longues~~ : tranché le 21/10/2026, **liste et fiche** (`layout: 'detail'` : noms à
  gauche, explication de l'entrée sélectionnée dans une plaque à droite). Pause en bandeau à gauche, match visible.
- Couleur d'équipe des repères des manettes branchées.
- Ombre violette décalée, sans flou, de « SMASH » dans le titre de l'accueil : reprise de la maquette de la piste B
  choisie par Xavier (planche du 21/10/2026), le seul aplat décalé du monde ; aucune autre ombre portée.
- Salle pleine : « Je joue avec » reste réglable pour qui regarde sans place, puisqu'il peut prendre une place qui
  se libère (finish review de l'étape 10).
- 4:3 : l'échelle reste celle d'un écran 16:9 (texte plus petit, bas de l'écran vide) ; à reprendre plus tard, avec
  une disposition plus étroite (choix de Xavier, étape 10).
- Taille minimale du texte courant, à valider depuis le canapé (cible de départ ~24 px à 1080p).
