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
6. **Pause, Réglages, Entraînement.**
7. **En ligne** : salon, code de salle, places, erreurs (serveur introuvable, salle pleine, coupure).
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
