# Menus et modes de jeu : plan (21/10/2026)

But : réunir le jeu local et le jeu en ligne dans des menus propres, utilisables à la manette, avec les deux modes
disponibles en même temps. **Fonctionnel d'abord** : des écrans qui marchent, un style volontairement neutre. Le
design et l'UX viendront ensuite, dans une passe à part, avec le skill de design d'impeccable.style
(https://impeccable.style/designing/), à installer dans Claude Code à ce moment-là. Tout ce qui suit est pensé pour
que cette passe puisse tout restyler sans toucher au comportement.

Point de départ : main après la fusion de la branche en ligne (`research/en-ligne/PLAN_EN_LIGNE.md` : rollback,
serveur `npm run serveur`, salles à code, reprise après coupure, caméra dans le dos de son joueur).

## 1. Ce qui existe aujourd'hui

- **Pas d'accueil.** Tout passe par l'adresse : `?mode=tutoriel` (`&lecon=…`), `?mode=labo`, `?mode=trainer`,
  `?mode=animations`, `?enligne` (salon en ligne), sinon le match local, réglé par des paramètres (`?double=1`,
  `?bot=…`, `?ai=…`, `?free=1`, `?sets=…`, `?pression=…`, `?reseau=…`, etc.).
- **Un seul menu en match** (Échap ou Start, `src/ui/duelSettings.ts`), qui mélange quatre choses : Équipes (qui tient
  chaque place), Jeu (assistance, préparation, gaucher, pression, son, affichage des entrées, directions du joueur
  du fond), Manette (symboles, « Teste ta manette »), Match (simple/double, sets, jeux, punto de oro, échange libre).
- **Le salon en ligne** (`src/ui/onlineLobby.ts`) : à la souris seulement.
- **Les réglages** tiennent dans un seul objet, `DuelSettings`, enregistré dans le navigateur (`loadSettings`,
  `saveSettings`).

## 2. Les écrans visés

| Écran | Contenu |
|---|---|
| **Accueil** | Jouer · En ligne · Entraînement · Réglages |
| **Jouer (local)** | Simple ou double ; qui tient chaque place (manette 1-4, clavier bleu/rouge, IA facile/normale/forte) ; règles du match (sets, jeux, punto de oro, échange libre, pression) → Lancer |
| **En ligne** | Le salon actuel : nom, « Je joue avec », créer ou rejoindre par code, places, et pour l'hôte simple/double, niveau de l'IA, Lancer |
| **Entraînement** | Tutoriel (liste des leçons) ; outils (labo, machine à balles, animations) selon la question 2 |
| **Réglages** (à soi, pour toutes les parties) | Son ; affichage des entrées ; symboles des boutons ; « Teste ta manette » ; préférences de joueur : assistance, stick pendant la préparation, gaucher/droitier, « je joue avec » par défaut |
| **Pause** (Échap / Start, en match) | Reprendre · Réglages (son, affichage) · Recommencer (local seulement) · Quitter vers l'accueil (en ligne : quitter la salle, l'IA prend la place) |

## 3. Séparer deux sortes de réglages (le cœur du travail)

| Préférences de joueur (à soi, partout) | Configuration d'un match (choisie avant de lancer) |
|---|---|
| son, affichage des entrées, symboles des boutons | simple ou double |
| assistance, stick pendant la préparation, main | qui tient chaque place, niveau des IA |
| périphérique par défaut (« je joue avec ») | sets, jeux, punto de oro, échange libre |
| directions du joueur du fond (`farOwnView`, jeu à deux sur un écran) | pression |

- En ligne : les préférences partent au serveur avec le nom (comme aujourd'hui `PlayerPrefs`) ; la configuration est
  celle de l'hôte et ne change plus pendant le match.
- En local à plusieurs : chaque place humaine garde ses propres assistance et main (comme aujourd'hui
  `assists[i]`, `hands[i]`), pré-remplies avec les préférences de joueur.
- Les réglages déjà enregistrés dans le navigateur sont repris (migration de `DuelSettings`, sans perte).

## 4. Choix techniques (pour que le design reste libre)

- **Les écrans décrits comme des données** : pour chaque menu, ses entrées, leurs choix, leurs actions. Un seul
  composant les affiche et gère la navigation : manette (stick ou croix pour se déplacer, A valider, B revenir),
  clavier (flèches, Entrée, Échap) et souris. Le salon en ligne et la pause passent aussi par lui.
- **Toute l'apparence dans une feuille de style à part** : classes CSS stables, couleurs, tailles et espacements en
  variables. Aucun style dans la logique. Style neutre en attendant : celui du menu des réglages actuel.
- **Lancer un match local recharge la page** avec l'adresse correspondante (le menu fabrique `?double=1&bot=…`) :
  l'adresse reste la seule source de vérité, les tests actuels continuent de marcher, coût 1 à 2 s. « Quitter vers
  l'accueil » revient à `/`. En ligne, salon et match restent dans la même page (comme aujourd'hui). Passer d'un écran
  à l'autre sans recharger demanderait de démonter proprement la scène 3D : plus tard, si le rechargement gêne.
- **Les adresses actuelles restent des raccourcis** : une adresse avec des paramètres de jeu saute l'accueil et lance
  directement (tests, habitudes de réglage). `/` sans paramètre affiche l'accueil.

## 5. Étapes (chacune testée et commitée à part)

1. Séparer préférences de joueur et configuration de match, avec reprise des réglages enregistrés. Tests unitaires
   de la migration.
2. Composant de menu commun (données → écran, navigation manette/clavier/souris, focus visible). Tests du
   navigateur : se déplacer et valider à la manette virtuelle, au clavier.
3. Accueil et écran « Jouer » ; la pause remplace le menu Échap actuel.
4. Salon en ligne et écran Réglages sur le composant commun (le salon devient utilisable à la manette).
5. Écran Entraînement (leçons du tutoriel) et rangement des outils.
6. Tests des parcours (accueil → jouer → pause → accueil ; accueil → en ligne → salle → match ; raccourcis d'adresse),
   joueur automatique de jouabilité inchangé, tests existants verts.

Puis, dans une passe à part : design et UX avec le skill d'impeccable.style, sur ces écrans qui marchent.

## 6. Questions ouvertes (à trancher par Xavier au début de la session)

1. **Outils à l'accueil** : labo, machine à balles et animations sont-ils pour le joueur (dans « Entraînement ») ou
   des outils cachés (visibles seulement avec `?debug`) ?
2. **Fond de l'accueil** : un match d'IA qui tourne derrière les menus (comme dans les jeux de sport), ou un écran
   simple ? (Le fond animé relève plutôt de la passe design.)
3. **Pendant un match local**, peut-on encore changer les places et les règles depuis la pause, ou seulement avant de
   lancer ?
4. **Serveur introuvable** : le bouton « En ligne » affiche simplement « serveur introuvable », ça va ?
5. **Faux réseau** (`?reseau=…`, outil pour juger le rollback) : reste un raccourci d'adresse, ou une option dans
   « Entraînement » / « Outils » ?

### Réponses de Xavier (21/10/2026)

1. **Outils** : le joueur accède au tutoriel et au labo (ses situations de match sont un entraînement). Les animations
   ne servent qu'au développement. « Entraînement » = Tutoriel + Situations de match (le labo) ; la machine à balles
   (ancienne vue à la première personne) et les animations n'apparaissent qu'avec `?debug`.
2. **Fond de l'accueil** : écran simple (le fond animé se décidera dans la passe design).
3. **Places et règles** : seulement avant de lancer ; la pause garde Reprendre, Réglages, Recommencer, Quitter.
4. **Serveur introuvable** : un message dans l'écran « En ligne », avec « Réessayer » et « Retour ».
5. **Faux réseau** : reste un raccourci d'adresse (`?reseau=…`), rien dans les menus.

## 7. Environnement

- Travailler dans un worktree neuf partant de main (les menus touchent `src/modes/duel.ts` et les réglages, comme le
  travail de gameplay sur main) ; ramener main dedans régulièrement.
- `npm run dev` pour le jeu, `npm run serveur` pour le serveur en ligne. Les tests du navigateur démarrent les deux
  (ports 5173 et 2567, ou `E2E_PORT`, `E2E_SERVEUR`).
- Les tests du navigateur se lancent un par un (`--workers=1`) : en parallèle, le chargement des modèles 3D dépasse
  parfois 5 s.
