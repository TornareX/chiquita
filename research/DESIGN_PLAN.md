# Passe design : menus, HUD et écrans hors gameplay (21/10/2026)

But : donner au jeu son identité visuelle sur tout ce qui n'est pas la scène 3D (menus, HUD de match, écrans
annexes), dans la piste **B « Grillage »** retenue le 21/10/2026, sans toucher au comportement.

- Planche des pistes de DA : https://claude.ai/artifact/AVB8b8JhokD7j8afyviDQ9 (B = rangée « Grillage »).
- Outil : le skill Impeccable (https://impeccable.style, dépôt `pbakaus/impeccable`).
- Point de départ : les menus fonctionnels de `research/MENUS_PLAN.md` (étapes 1 à 6 faites).

## 1. La DA en une page (piste B « Grillage »)

**Idée : le terrain fait l'interface.** Chaque élément reprend une pièce du court ; ici, le grillage. Énergie
compétitive à la Rocket League, niveau visuel d'une retransmission Premier Padel, sans copier ni l'un ni l'autre.

| | |
|---|---|
| Formes | Plaques biseautées à 45° (les mailles du grillage) ; bandeaux en parallélogramme ; losanges pour les petits repères ; motif de maille en fond, discret |
| Typo | Archivo (licence OFL) : étroite, italique, 900 pour les titres et chiffres ; Archivo normale pour le texte courant |
| Couleurs | Encre `#0D0B1A` (fond) · bleu `#2F6BFF` · rouge `#FF4D3D` · **balle `#E6FF2E` = l'action et le focus** · violet arène `#7A3CFF` · blanc |
| Ton | Court, crié pour les moments forts (« POR TRES ! », « POINT ! »), clair partout ailleurs. Tout en français |

Règles qui valent partout :
- Le HUD vit dans les coins et le haut de l'écran : jamais sur le court, jamais sur la balle ni les vitres.
- Bleu et rouge se distinguent aussi par la clarté (daltonisme) ; petit texte sur rouge : en encre, pas en blanc
  (le blanc sur `#FF4D3D` ne passe pas le contraste).
- Le focus manette se voit toujours, à 3 m de la télé.
- En match, trois mots au plus par annonce.

## 2. Ce qui existe aujourd'hui

| Surface | Fichiers | État du style |
|---|---|---|
| Menus (accueil, Jouer, En ligne, Réglages, Entraînement, pause) | `menu.ts`, `menu.css`, `screens/*`, `pauseMenu.ts`, `onlineLobby.ts` | **Prêt** : classes stables et variables dans `menu.css` |
| HUD de match | `duelHud.ts` (31 styles en ligne), `netHud.ts`, ralenti dans `modes/replay.ts` | Styles écrits dans le code |
| Affichage des entrées | `inputDisplay.ts` (40) | Styles écrits dans le code |
| Tutoriel et guides | `tutorialPanel.ts` (19), `swingGuide.ts` (19), `buttonIcons.ts` | Styles écrits dans le code |
| Labo, test manette | `laboPanel.ts`, `modes/labo.ts`, `padTest.ts` (30) | Styles écrits dans le code |
| Outils de développement | `modes/animations.ts`, `perfMeter.ts`, `hud.ts` (machine à balles) | Hors passe design |

Conséquence : les menus peuvent être restylés tout de suite ; le HUD et les écrans annexes doivent d'abord sortir
leurs styles du code (étape 2), comme les menus l'ont fait.

## 3. La démarche

1. **Le pourquoi avant le comment.** On écrit d'abord qui joue, où, avec quoi (`PRODUCT.md`), puis le système visuel
   (`DESIGN.md`). Impeccable les relit à chaque commande : c'est ce qui l'empêche de produire une interface d'appli
   générique.
2. **Tokens avant écrans.** Couleurs, typo, formes, espacements et mouvements deviennent des variables CSS
   partagées. Les écrans ne font que les utiliser.
3. **Composants avant écrans.** Les éléments du menu commun (entrée, choix à flèches, interrupteur, saisie, aides
   manette) se dessinent une fois ; tous les écrans en profitent.
4. **Maquette avant code** pour chaque écran qui change de structure : sur la planche, validée par Xavier, puis
   implémentée. Un simple restylage passe directement au code.
5. **Un écran, une étape** testée et commitée, avec captures avant/après.
6. **Juger depuis le canapé** : à la manette, sur la télé, en 1280×720 et 1920×1080. Une capture ne remplace pas ça.
7. **Le comportement ne bouge pas** : tests du navigateur des menus et joueur automatique verts à chaque étape.

Commandes Impeccable par moment :

| Moment | Commandes |
|---|---|
| Fondations | `init` (PRODUCT.md), `document` puis réécriture (DESIGN.md), `extract` (tokens) |
| Concevoir un écran | `shape` (structure), `live` / `generate` (variantes dans le navigateur) |
| Améliorer | `typeset`, `layout`, `colorize`, `bolder` (le ton compétitif), `animate` (entrées d'annonces, focus) |
| Juger | `critique` (hiérarchie, clarté, émotion), captures avant/après |
| Finir | `audit` (contraste, focus, tailles), `harden` (cas limites), `clarify` (textes), `polish` |
| Garde-fou | `npx impeccable detect src/` (règles fixes, sans IA) ; hook après édition (question 6) |

Impeccable vient du web et ne connaît pas les jeux : `PRODUCT.md` doit dire noir sur blanc les contraintes du
canapé (§5, étape 1). Ses avis sur le HUD se jugent à la manette, pas sur parole.

## 4. Décisions techniques

- **Une échelle unique** : l'interface est pensée en 1920×1080 et suit la taille de la fenêtre (taille de base en
  fonction de `min(vw, vh × 16/9)`), pour être lisible pareil sur un portable et sur une télé. Zone de sécurité de
  5 % sur les bords.
- **Textes lisibles à distance** : taille minimale à fixer à l'étape 1 et à valider depuis le canapé (cible de départ :
  ~24 px à 1080p pour le texte courant du HUD).
- **Police embarquée** : Archivo en `woff2` dans `public/`, pas de chargement depuis Google Fonts (le jeu doit marcher
  sans réseau tiers). Licence OFL à joindre.
- **Couleurs d'équipe à une seule source** : le bleu et le rouge du HUD et ceux de la scène 3D (maillots, repères au
  sol) viennent des mêmes constantes.
- **Performance** : pas d'effets coûteux sur le HUD pendant l'échange (flou d'arrière-plan, grosses ombres animées) ;
  coût vérifié avec `?perf`. Les biseaux en `clip-path` et le motif de maille en dégradés CSS sont bon marché.
- **Mouvement** : les annonces entrent vite (~120 ms, léger dépassement) et se calent sur le juice existant
  (hitstop, ralenti), sans le doubler.

## 5. Étapes (chacune testée et commitée à part)

0. **Préparer.** Worktree neuf depuis main. Installer Impeccable dans le projet
   (`npx impeccable install --providers=claude --scope=project`), télémétrie coupée
   (`npx impeccable telemetry off`), lignes `.gitignore` du README. Script Playwright de **captures de référence** de
   chaque surface du §2 (1280×720 et 1920×1080) dans `screenshots/design/avant/`.
   *Fait.* Le skill est commité dans `.claude/skills/impeccable/` et `.claude/agents/` ; son moteur (19 Mo, ignoré
   par git) se télécharge au premier lancement. Le hook vit dans `.claude/settings.local.json` (local, non commité) :
   sur une autre machine, relancer `npx impeccable install --providers=claude --scope=project`. Captures :
   `npm run captures` (`CAPTURES=apres npm run captures` pour l'après ; `E2E_PORT`/`E2E_SERVEUR` si les ports sont
   pris).
1. **Fondations.** `/impeccable init` → `PRODUCT.md` : jeu de canapé en 2 contre 2, manette d'abord, télé à 2-3 m,
   références (Premier Padel, Rocket League), ton, contraintes HUD du §1. Puis le **contrat de direction** des menus
   (`.impeccable/surfaces/src-ui-menu-css.md`) : thèse, monde Grillage, premier écran, mouvement signature.
   *Fait.* Changement de méthode : Impeccable n'écrit pas `DESIGN.md` avant de construire. Son agent documentaliste
   l'écrit à la fin, à partir de ce qui est réellement construit (avec `.impeccable/design.json`), après la relecture
   finale. Le HUD aura son propre contrat à l'étape 8.
2. **Tokens et nettoyage.** `src/ui/theme.css` (variables communes), échelle unique du §4, police embarquée.
   `menu.css` passe sur ces variables. Les styles écrits dans le code du HUD et des écrans annexes deviennent des
   classes (`hud.css`…), **sans changer leur apparence** : les captures doivent rester quasi identiques.
   *Fait.* `src/ui/theme.css` (variables, tons, couleur par place `data-player`), `hud.css` (HUD de match, icônes de
   boutons, effets, ralenti, décompte, encart réseau), `annexes.css` (tutoriel, panneau du labo et de la machine à
   balles, test manette). Règle suivie : le code ne garde que le comportement (afficher/cacher, positions calculées,
   fondus) ; une couleur qui est une donnée (symbole d'une manette) passe par la variable `--glyph`. Archivo est dans
   `src/ui/fonts/` (et non `public/`) pour que Vite gère le chemin, même sous un sous-dossier comme sur itch.io ;
   l'échelle `--ui-px` est définie mais pas encore appliquée. Restent hors de cette étape : les couleurs d'équipe
   communes avec la 3D (`TEAM_COLORS` de `duelScene.ts`, à unifier à l'étape 3 puisque les teintes changent), et les
   outils de développement (`perfMeter.ts`, `modes/animations.ts`, textes de la machine à balles dans `index.html`).
   Vérification : captures identiques au pixel pour tous les menus et le test manette ; en match, seules la 3D et
   les nombres changent. Le script de captures couvre aussi le bandeau des effets, le ralenti, le décompte,
   l'encart réseau, la carte et la démo du tutoriel.
3. **Composants du menu commun** en Grillage : entrée, entrée principale, choix à flèches, interrupteur, saisie et
   lettres, titres, aides manette en bas d'écran. États : repos, focus, désactivé, allumé, édition.
   *Fait.* `theme.css` porte la palette Grillage (`--ink`, `--plate`, `--ball`, `--blue`, `--red`, `--violet`, textes
   `--ink-*`, motif `--mesh`), Archivo pour tout le texte des menus, la zone de sécurité (`--ui-safe-x/y`) ; les
   menus sont entièrement en `--ui-px`. Les variables du HUD et des annexes gardent leurs anciennes valeurs (étapes 8
   et 9). Décisions :
   - Plus de panneau : les plaques posent sur l'encre et la maille (accueil), ou sur la partie assombrie et maillée
     (pause). Plaque = `clip-path` à 6 sommets (deux coins coupés) ; liseré et fond dessinés par `::before`/`::after`,
     les états ne changent que des variables (`--plate-bg`, `--plate-edge`, `--plate-fg`).
   - Focus : plaque jaune balle, texte encre, glissement de 12 px avec rebond court (transition, donc seulement quand
     le focus bouge, pas quand une valeur change). `detect` signale l'élastique en simple avis : gardé, c'est le
     mouvement signature du contrat. Coupé avec `prefers-reduced-motion`.
   - Action principale : liseré et mot jaunes au repos, plaque pleine au focus ; titres, intertitres, valeurs et
     action principale en Archivo étroite italique 900, en capitales.
   - Équipes : plus de bordure épaisse à gauche ; la plaque prend une teinte de l'équipe et un losange de sa couleur
     précède le nom (les sous-entrées « Course », « Main » sont en retrait, sans losange). `detect` ne signale plus
     rien d'autre.
   - Interrupteur : losange plein (oui) ou vide (non) devant la valeur. Flèches des choix dessinées en CSS (le
     caractère ‹ › reste dans le bouton pour les tests, masqué). Édition à la manette : plaque encre liserée de jaune,
     la lettre en cours en jaune. Ma place en ligne : liseré blanc (l'ancienne règle « (toi) » ne s'appliquait pas
     aux actions ; le nom porte déjà « (toi) »). Message d'erreur : rouge éclairci avec un losange rouge. Code de
     salle : grosse valeur sur sa plaque. Bouton de pause : petite plaque en capitales.
   - Barre d'aides manette (A Valider, B Retour) ajoutée par `menu.ts` sans toucher à la navigation ; B disparaît
     quand il ne fait rien (`data-back="non"`, accueil). `menu.ts` importe aussi `theme.css` (les pages de test le
     chargent alors seules).
   - Liste plus haute que l'écran : le bas s'efface en fondu tant qu'il reste des entrées dessous (animation liée au
     défilement).
   - Couleurs d'équipe de la 3D **pas unifiées** : essayé, le bleu `#2F6BFF` se confond avec le court, bleu lui aussi
     (déjà vrai avec l'ancien bleu). À trancher avec le HUD (étape 8) : changer le bleu des maillots, ou du court.
   Restent pour la suite : « Jouer » en double et en simple ne tient plus sur un écran (« Lancer le match » est sous
   le pli, la liste défile) : à reprendre à l'étape 5 ; titres en haut à gauche et repères des manettes branchées en
   losanges dans la barre d'aides (étape 4) ; symboles des boutons selon la manette dans la barre d'aides (A/B fixes
   pour l'instant) ; bleu et rouge ne se distinguent en clarté que modérément (le nom de l'équipe est toujours écrit) ;
   le jugement depuis le canapé, à la manette.
4. **Accueil** : titre en typo seule, fond fixe avec le motif de maille, disposition en tuiles.
   *Fait.* Xavier a choisi les **tuiles** de la maquette (plutôt que la liste verticale mise en scène). Décisions :
   - Le menu commun gagne une disposition par écran, `layout: 'tiles'` (`data-layout` sur la racine, `list` par
     défaut) : sur un écran en tuiles, gauche et droite passent d'une entrée à l'autre, en boucle ; haut et bas
     continuent de marcher (même ordre). Les autres écrans restent en liste, sans changement de navigation :
     captures identiques, aux variations de la scène 3D et du code de salle près (et du survol laissé par la souris
     des captures, qui tombe sur une autre entrée après le clic sur une tuile).
   - Disposition : grand titre « PADEL SMASH » sur deux lignes (184 `--ui-px`), penché de 3°, en haut à gauche dans
     la zone de sécurité ; « SMASH » porte une ombre violette décalée (`::first-line` l'enlève de « PADEL »), le titre
     reste blanc : le jaune balle reste réservé au focus et à l'action principale (sur la maquette, « SMASH » était
     jaune). Sous le titre, « Copa Canapé » en bandeau rouge, texte encre (le `hint` de l'écran). Quatre tuiles égales
     en bas, au-dessus de la barre d'aides, nom en Archivo étroite italique 900 et aide de l'entrée en dessous (textes
     inchangés). Focus : la tuile passe au jaune et **monte** de 16 px avec le même rebond ; « Jouer » garde liseré et
     nom jaunes au repos (action principale). Maille aussi dans les plaques des tuiles.
   - Repères des manettes branchées : quatre losanges à droite de la barre d'aides, pleins pour chaque manette
     branchée (`.menu-pads`, `data-count`), mis à jour par la boucle de lecture des manettes ; affichés sur l'accueil
     seulement pour l'instant. Retouche après essai de Xavier, qui ne comprenait pas les losanges seuls : un libellé
     les précède, dans le style des aides A/B, « 1 manette », « 2 manettes »…, et sans manette « Aucune manette :
     appuie sur un bouton » (le navigateur ne voit une manette qu'après un premier appui).
   - Pas d'image dans la tuile « Jouer » ni de bande de couleur en haut des autres (maquette) : pas de visuel embarqué
     prêt, et la bande colorée ressemble trop à la bordure latérale écartée à l'étape 3.
   - Test du navigateur ajouté (`menu.spec.ts`) : gauche/droite et bas sur l'accueil, au clavier et à la manette,
     repères des manettes, et droite qui ne déplace plus le focus sur un écran en liste.
   Restent : une image ou une illustration pour la tuile « Jouer » (à décider avec Xavier) ; les repères des manettes
   sur les autres écrans (Jouer surtout) et leur couleur d'équipe ; l'accent circonflexe d'« ENTRAÎNEMENT » touche le
   haut de la ligne dans les titres d'écran en liste (interligne 0,9, étape 6) ; le jugement depuis le canapé.
5. **Jouer** : l'écran le plus dense (places des 4 joueurs, IA, règles). Maquette d'abord (`shape`).
   *Fait.* Trois organisations proposées (colonnes par équipe, places en cartes avec règles repliées, deux colonnes
   « qui joue / le match ») ; Xavier a choisi **les deux moitiés du court**. Décisions :
   - Nouvelle disposition du menu commun, `layout: 'columns'`, et regroupement des entrées (`group` sur une entrée,
     rendu en `.menu-group[data-group]`) ; les autres écrans n'en ont pas et ne changent pas (captures identiques, au
     survol de la souris et au code de salle près). La liste `.menu-items` passe en `display: contents` et le panneau
     devient une grille : titre à gauche et « Format » à droite, l'aide sur une ligne, **Bleu à gauche, Rouge à
     droite** (chaque place suivie de sa course et de sa main), la ligne des manettes, puis les **règles sur deux
     colonnes** alignées sur celles des équipes (échange libre, sets, jeux | punto de oro, pression, qui prend la
     hauteur de deux entrées avec son explication), et en bas à droite **« Lancer le match »** en grande plaque,
     « Retour » juste avant. Plaques un peu plus hautes que dans une liste (58 et 46 `--ui-px`).
   - Tout tient dans la zone de sécurité sans défiler, en 1280×720 et 1920×1080, en simple comme en double, y compris
     le pire cas (quatre places humaines, quatre lignes « Course ») ; « Lancer » reste au-dessus de la barre d'aides.
   - Nom de l'équipe en tête de sa moitié : bandeau en parallélogramme à sa couleur (blanc sur bleu, encre sur rouge).
   - Navigation, première version (remplacée par la retouche ci-dessous) : haut et bas suivaient l'ordre de lecture
     (Format → Bleu → Rouge → règles → Lancer → Retour), gauche et droite changeaient la valeur. **LB/RB** (Tab et Maj+Tab au clavier) sautent à
     l'entrée de la colonne voisine la plus proche en hauteur (Bleu ↔ Rouge, règles de gauche ↔ de droite, Retour ↔
     Lancer), en boucle avec deux colonnes. Seulement sur un écran en colonnes ; l'aide « LB RB Colonne » s'ajoute
     alors à la barre d'aides. Test du navigateur ajouté (`menu.spec.ts`) : 720p et 1080p, pire cas sans défilement,
     équipes de part et d'autre, Tab, LB/RB, place allumée, et Tab sans effet sur un écran en liste.
   - **Retouche après essai à la manette** (Xavier) : l'ordre de lecture ne suivait pas l'écran (en bas de la
     colonne Bleu, bas menait en haut de la colonne Rouge ; « Retour », à gauche de « Lancer », s'atteignait par le
     bas). La croix est désormais **spatiale** sur un écran en colonnes : haut et bas restent dans la colonne (l'entrée
     suivante qui la chevauche) et, au bout, vont à l'entrée la plus proche dans ce sens (le bas de la colonne Bleu
     mène aux règles de gauche puis à « Retour », celui de Rouge aux règles de droite puis à « Lancer », sans boucler) ;
     gauche et droite gardent la valeur des choix et des interrupteurs, et ailleurs (« Lancer », « Retour ») passent à
     la colonne voisine ; LB/RB et Tab changent de colonne depuis n'importe quelle entrée. Après avoir quitté un groupe,
     la direction inverse ramène à l'entrée quittée, même après un pas de côté dans le nouveau groupe (de « Retour » à
     « Lancer », haut ramène à la colonne d'où l'on venait). Le stick garde sa lecture (le vertical l'emporte au-delà du
     seuil) : une diagonale descend, ne change jamais de colonne. Les autres écrans gardent leur navigation. Test du
     navigateur ajouté : descendre chaque colonne jusqu'en bas, atteindre « Retour » et « Lancer », revenir, Tab dans
     les règles, LB/RB depuis un choix, stick en diagonale et stick tenu vers le bas (répétition) sans passer à droite.
   - Place allumée (`is-lit`) plus visible : un cadre blanc épais qui se resserre sur la plaque (1 s), et le losange
     de l'équipe qui grossit puis retombe. Seul l'écran Jouer allume des places.
   - Repères des manettes (losanges et libellé) affichés aussi sur Jouer, à droite de la barre d'aides ; la ligne
     sous Bleu garde le nom de chaque manette.
   Restent : couleur d'équipe des repères des manettes ; « (pas branchée) » allonge beaucoup la valeur d'une place
   (à raccourcir avec `clarify`, étape 10) ; symboles LB/RB selon la manette ; le jugement depuis le canapé, à la
   manette, surtout le saut LB/RB et la lisibilité de l'allumage.
6. **Pause, Réglages, Entraînement.**
   *Fait.* Les trois restent des listes, sauf les situations de match : douze entrées dont certaines ont trois lignes
   d'explication ne tenaient pas. Deux organisations proposées (liste et fiche, grille de deux colonnes) ; Xavier a
   choisi **la liste et sa fiche**. Décisions :
   - Nouvelle disposition du menu commun, `layout: 'detail'` (`data-layout`) : les noms en liste courte à gauche,
     l'explication de l'entrée sélectionnée dans une grande plaque maillée à droite (`.menu-detail`, titre et texte,
     mise à jour avec le focus, cachée sur « Retour » qui n'en a pas). Les explications sous les entrées restent dans
     la page (cachées). Navigation d'une liste : haut et bas seulement, rien ne défile, en 720p comme en 1080p.
   - Les explications des situations écrivaient les jetons de boutons tels quels (« {slice} de volée ») : ils
     passent par `plainButtons` avec la famille de la première manette (« bouton du haut » sans manette reconnue).
   - Réglages et Entraînement partent du coin en haut à gauche de la zone de sécurité, comme les titres de l'accueil
     et de Jouer (avant : liste centrée). L'accent d'« ENTRAÎNEMENT » n'est plus coupé (marge au-dessus du titre).
   - **Réglages** tient sans défiler (la ligne vide du message ne prend plus de place) ; intertitres plus gros et
     blancs ; « Tester ma manette » liseré de blanc et écrit comme un titre. Pas de regroupement en colonnes : la
     liste tient, et la navigation reste haut/bas.
   - **Entraînement** : Tutoriel et Situations en grandes plaques (76 `--ui-px`), nom en Archivo étroite italique 900.
   - **Pause** : un bandeau d'encre presque opaque à gauche, au bord coupé en biais et liseré de violet, porte le
     menu ; le match reste visible à droite, à peine assombri. Plaques non sélectionnées plus claires
     (`--plate-raised`), plus hautes, texte plus gros ; titre « PAUSE » en grand ; « Reprendre » en grande plaque
     comme « Lancer ». En ligne, un losange rouge qui bat précède « Le match continue pour les autres… » (repérée par
     l'absence de « Recommencer »). Les réglages ouverts depuis la pause gardent le bandeau, plus large.
   - Tests du navigateur ajoutés (`menu.spec.ts`) : Réglages, Entraînement, situations, pause et ses réglages tiennent
     sans défiler en 720p et 1080p ; la fiche suit la sélection, sans jeton, à droite de la liste ; « Retour » sans
     fiche. Captures ajoutées : `07b-situations-fiche-longue`, `13-pause-en-ligne`, `22b-pause-reglages`.
   Restent : le bandeau de la pause cache le score du HUD en haut à gauche (à revoir avec le HUD, étape 8 : le score
   en pause se lit-il ailleurs ?) ; la moitié droite de Réglages et d'Entraînement est vide ; l'intertitre « Mes
   places (pré-remplies dans « Jouer » et en ligne) » est long (`clarify`, étape 10) ; le jugement depuis le canapé,
   à la manette, surtout la lisibilité de la pause sur un match qui bouge.
7. **En ligne** : salon, code de salle, places, erreurs (serveur introuvable, salle pleine, coupure).
   *Fait.* Xavier a choisi **les deux moitiés + le code en haut** pour la salle et **Créer | Rejoindre** pour le
   salon. Les deux écrans passent en `layout: 'columns'` (navigation spatiale, LB/RB et Tab). Décisions :
   - Salon : nom et « Je joue avec » en haut ; à gauche « Créer une salle » en grande plaque maillée avec sa phrase,
     à droite le code (champ en grandes lettres espacées, quatre traits en attente) et « Rejoindre » ; « Retour » en
     bas à gauche. Serveur introuvable : « Réessayer » devient l'action principale en bas à droite et prend le focus.
   - Salle : le code en héros en haut à droite (168 `--ui-px`, lettres espacées, plaque maillée), la phrase pour le
     donner à gauche ; Bleu à gauche, Rouge à droite ; chaque place montre **qui la tient en grand** et, dessous, la
     place et ce que fait A. Humain : losange plein ; IA : losange vide, sur la maille, plus pâle ; la place d'un autre
     ne s'estompe plus ; la sienne : « (toi) » et un liseré blanc épais. Le match dessous (« Je joue avec » à gauche,
     format et niveau à droite pour l'hôte) ; « Quitter » sous la colonne de gauche, « Lancer » sous celle de droite ;
     l'invité voit « En attente de X » à la place de « Lancer ».
   - Erreurs : `menu.message(texte, 'error' | 'status')` (`data-tone`) ; erreur en plaque rouge avec losange, attente
     (« Connexion au serveur… ») en plaque neutre. Code inconnu et match commencé disent quoi faire (textes du
     serveur). Salle pleine : « Salle pleine : toutes les places sont prises, tu regarderas le match. » ; l'hôte voit
     qui regarde sans place. Coupure en salle : « Connexion perdue. » devant le message. Coupure en match : le bandeau
     `#online-banner` passe en CSS (plaque encre liserée de rouge, losange qui bat), sans styles dans le code.
   - Saisie à la manette : les cases remplacent le champ pendant l'édition (toutes pour un code, les lettres tapées
     et la case en cours pour un nom), avec la légende de la croix ; une case vide part de A en montant.
   - Repères des manettes aussi sur les écrans en ligne.
   - Tests : `parcoursEnLigne.spec.ts` (720p/1080p sans défilement, disposition, croix spatiale ; code inconnu et
     salle pleine) ; le parcours atteint « Lancer » par la droite depuis « Quitter ». Captures ajoutées : `10b`,
     `11b`, `11c`, `11d`, `12b`, `14-coupure`.
   Restent : le jugement à la manette depuis le canapé ; la valeur longue « Clavier bleu (ZQSD + …) » de « Je joue
   avec » dans une demi-colonne en 720p, pas vérifiée à l'œil ; le test `menu.spec.ts` de saisie à la manette a
   échoué une fois en série (tape de 80 ms manquée sous charge), vert seul trois fois.
8. **HUD de match**, maquette d'abord : score et sets, service, punto de oro, annonces (point, faute, por tres,
   ralenti), étiquettes des joueurs, état réseau en ligne. Simple et double, les deux côtés de la caméra.
9. **Écrans annexes** : tutoriel et guides de coups, labo, test manette, affichage des entrées. Tokens et
   composants seulement, sans maquette ni passe complète.
10. **Finitions** : `audit`, `harden` (noms longs, 4 manettes, déconnexion, 4:3, 1366×768, 4K, ultra-large),
    `clarify`, `polish`, `detect`. Captures après dans `screenshots/design/apres/`.

Les outils de développement (animations, perf, machine à balles) gardent un style neutre commun, sans passe design.

## 6. Questions ouvertes (à trancher par Xavier au début de la session)

1. **Fond de l'accueil** : écran fixe avec le motif de maille, ou un match d'IA qui tourne derrière (plus vivant,
   coûte la scène 3D sur l'accueil) ?
2. **Logo** : titre en typo seule pour l'instant, ou on dessine un vrai logo (vectoriel) dans cette passe ?
3. **Sons d'interface** (déplacement, validation, retour) : dans cette passe ou plus tard ?
4. **Annonces en espagnol** mêlées au français (« ¡POR TRES! », « ¡VAMOS! ») : on garde ?
5. **Écrans annexes** (tutoriel, labo, test manette) : passe complète ou simple application des tokens ?
6. **Hook d'Impeccable** (analyse automatique après chaque modification d'interface) : on l'active ?

### Réponses de Xavier (21/10/2026)

1. **Fond de l'accueil** : fixe, encre et motif de maille. Le match d'IA en fond pourra venir plus tard.
2. **Logo** : typo seule (« PADEL SMASH » en Archivo italique) dans cette passe.
3. **Sons d'interface** : plus tard, dans une passe à part. Celle-ci reste visuelle.
4. **Annonces** : tout en français, pas d'espagnol dans l'interface. (« Por tres » reste le nom du coup.)
5. **Écrans annexes** : tokens seulement (couleurs, typo, composants), pas de passe complète.
6. **Hook d'Impeccable** : activé (réglage local, non commité).
