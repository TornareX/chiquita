---
version: 1
slug: "src-ui-hud-css"
primary_target: "src/ui/hud.css"
related_targets: ["src/ui/duelHud.ts","src/render/effectsView.ts","src/modes/replay.ts","src/ui/netHud.ts","src/ui/pauseMenu.ts"]
---

# HUD de match de Padel Smash

## Scope

Tout ce qui s'affiche par-dessus la scène 3D pendant un match : score (sets, jeux, points, balle de service, punto
de oro), compteur d'échange, annonces au centre (service, faute, let, point gagné et pourquoi, por tres, por
cuatro, fin du match), retour sur les frappes marquantes (`#feedback`), ligne « qui joue avec quoi » (`#players`),
grand bandeau des effets (`#effect-banner`), badge du ralenti, bouton de pause et encart réseau en ligne. Le retour
des entrées, le guide du geste et les écrans annexes sont à l'étape 9 (variables communes seulement).

Mode : **Operate**, en plein jeu. Le joueur ne lit pas le HUD : il l'aperçoit entre deux frappes.

## Audience and job

- Deux à quatre joueurs sur un canapé, à 2-3 m d'une télé, les yeux sur la balle.
- Tâches : savoir le score et qui sert sans chercher ; comprendre en un coup d'œil pourquoi le point est fini ;
  sentir les grands moments (por tres, fin du match) ; savoir qui tient quelle place entre les points.
- États : service (premier, second), échange (compteur), point gagné (équipe et raison), faute et let, por tres et
  por cuatro, jeu et set gagnés, punto de oro, fin du match, ralenti, simple et double, caméra côté bleu ou côté
  rouge, en ligne (encart réseau), échange libre sans score (record).

## Constraints

- Lisible à 3 m en plein échange : chiffres et noms en Archivo étroite italique 900, gros ; aucun texte utile sous
  ~22 px à 1080p.
- Jamais sur le court, la balle, les joueurs ni les vitres : coins et haut de l'écran ; les annonces au-dessus du
  mur du fond (dans le public, sous le score), jamais sur le joueur du fond.
- Zone de sécurité télé de 5 % ; tout en `--ui-px`, pareil en 720p et en 1080p.
- Trois mots au plus par annonce ; la raison en dessous, plus petite, courte.
- Aucun coût en images par seconde pendant l'échange : pas de `backdrop-filter`, pas de grosses ombres animées, pas
  de `filter` sur un élément qui bouge ; formes en `clip-path`, maille en dégradés ; mesuré avec `?perf`.
- Ne pas doubler le juice existant (hitstop, ralenti, flash, bandeau des effets) : les annonces entrent vite
  (~120 ms, léger dépassement) et ne tremblent pas.
- Tout en français (« Por tres » reste le nom du coup).
- Caméra côté bleu ou côté rouge (`?bot=1`, double) : le score garde Bleu à gauche, Rouge à droite.
- Comportement et tests inchangés : ids (`#score`, `#point`, `#feedback`, `#players`, `#rally`, `#replay-badge`,
  `#effect-banner`, `#net-hud`), `style.display` du badge du ralenti, `data-tone`, textes testés.

## Direction contract

THESIS : Le HUD est le tableau d'affichage accroché au grillage d'un court de compétition : deux plaques biseautées
à 45°, bleue et rouge, que sépare un bout de filet, et des annonces criées au-dessus du mur du fond comme sur un
écran géant. Il refuse le HUD de jeu web par défaut : des pastilles grises arrondies semi-transparentes posées sur
le jeu, avec du texte en police système.

OWN-WORLD : Encre `#0D0B1A`, plaques aux coins coupés à 45°, bleu et rouge d'équipe en aplats francs (petit texte
sur rouge en encre), chiffres blancs en Archivo étroite italique 900 sur cases blanches ou encre, maille à 45° en
dégradés, losanges pour le service et les petits repères. Le jaune balle `#E6FF2E` ne marque que l'instant :
service, balle de jeu, punto de oro, por tres.

STORY : Le joueur sait qui mène et qui sert sans quitter la balle des yeux, comprend pourquoi le point s'arrête en
trois mots, et le por tres lui saute aux yeux sans cacher la balle qui ressort.

FIRST VIEWPORT : Tableau au centre (choix de Xavier). En haut au centre, dans la zone de sécurité : plaque Bleu
(nom et losange de service) | jeux | points, un bout de filet maillé, points | jeux | plaque Rouge ; dessous, une
bande encre avec les sets, l'appel du point (punto de oro) en jaune balle et le compteur d'échange. L'annonce, penchée
de 4°, se pose sur la bande et le bandeau LED, au-dessus des têtes du fond. Coin haut gauche : qui joue avec quoi,
entre les points ; haut droit : pause, puis ralenti ; bas droit : encart réseau.

FORM : Monde « Grillage », piste B de la planche du 21/10/2026, imposé par l'utilisateur, sans tirage. Mouvement
signature : l'annonce qui claque sur sa plaque penchée en ~120 ms avec un léger dépassement, comme une balle dans la
maille, puis disparaît sans traîner. seed: none (unavailable)

FINISH : unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Le por tres : la balle sort par la porte, une plaque violette maillée « POR TRES ! » claque au-dessus du mur du fond,
penchée, pendant que le joueur court dehors la rattraper.

## Unresolved

- ~~Organisation du HUD~~ : tranché le 21/10/2026, **tableau au centre** (maquettes A, B coin, C sous le court).
- ~~Couleurs d'équipe~~ : tranché le 21/10/2026, **bleu ciel partout** : Bleu `#3CC4FF` (partenaire `#A6E6FF`),
  Rouge `#FF4D3D` (partenaire `#FF9E94`), pour le HUD, les menus et la 3D, d'une seule source ; texte encre sur les
  deux couleurs d'équipe.
- Étiquettes au-dessus des joueurs (maquette) : pas dans cette étape.
- Taille minimale du texte, à valider depuis le canapé.
