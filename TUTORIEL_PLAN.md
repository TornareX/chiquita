# Mode tutoriel — plan

> Objectif : un mode `?mode=tutoriel` qui montre chaque coup du jeu, quand le jouer, sur quels boutons
> appuyer et comment le réussir, avec un retour visuel des boutons pressés pour que le joueur sache
> toujours ce qu'il a fait, quelle que soit sa manette.
>
> Statut : étapes 1 et 2 du §5 faites : retour d'entrées, symboles selon la manette, « Teste ta
> manette », puis le squelette du mode (`?mode=tutoriel`) avec 3 leçons (coup normal, direction,
> bandeja). Voir `STATUS.md`. Reste : les autres leçons (étape 3), la démo enregistrée, le menu. S'appuie sur ce qui existe déjà : `Duel.playSituation()` et les
> situations du labo (`src/sim/situations.ts`), l'événement `duel.shot` (`DuelShot` : type, variante,
> style, parfait, volée, timing, pression, erreur), et la boucle du labo (`src/modes/labo.ts`), qui
> rejoue une situation à l'identique.

---

## 1. Le problème des boutons : « X n'est pas le même sur ma manette »

La Gamepad API ne donne pas des lettres, elle donne des **positions** (disposition « standard ») :

| Index | Position | Xbox | PlayStation | Switch Pro / 8BitDo (mode Switch) | Coup |
|---|---|---|---|---|---|
| 0 | bas | A | ✕ Croix | **B** | Normal |
| 1 | droite | B | ○ Rond | **A** | Au-dessus de la tête |
| 2 | gauche | X | □ Carré | **Y** | Coupé |
| 3 | haut | Y | △ Triangle | **X** | Lob |

Sur une manette PlayStation, « appuie sur X » envoie le joueur sur ✕ (le coup normal) au lieu de □
(le coupé). Sur une manette Nintendo, les lettres sont carrément inversées. Trois mesures, de la plus
importante à la moins importante :

1. **Ne jamais écrire une lettre seule.** Partout dans le jeu (tutoriel, HUD, réglages, indices des
   situations du labo), un bouton s'affiche comme un **losange de 4 pastilles dont une est allumée**
   (la position), avec à côté le libellé de la manette détectée. Le losange marche pour tout le monde,
   même si la détection se trompe.
2. **Détecter la famille de manette** à partir de `gamepad.id` (identifiant fabricant USB :
   `045e` Microsoft, `054c` Sony, `057e` Nintendo ; sinon les mots « Xbox », « DualSense »,
   « DualShock », « Pro Controller » dans le nom). Trois jeux d'icônes : Xbox (lettres colorées),
   PlayStation (symboles), Nintendo. Inconnu → losange seul + libellé de position (« bouton du bas »).
   Choix forcé possible dans les réglages, au cas où la détection se trompe (manettes génériques).
   Au clavier : afficher la touche réelle (`J`, `K`, `L`, `I` ou celles du joueur 2), en lisant le
   caractère via `navigator.keyboard.getLayoutMap()` quand il existe (AZERTY/QWERTY).
3. **Retour en direct des entrées** (« input display »), visible pendant tout le tutoriel et activable
   en match et dans le labo :
   - une petite manette en bas d'écran : le stick (point qui bouge dans un cercle, avec la zone morte
     dessinée) et les 4 boutons ; le bouton maintenu s'allume, sa couleur suit l'état du coup
     (gris = armé, vert = relâché dans la fenêtre, doré = parfait, rouge = trop tôt / trop tard) ;
   - au relâcher, une étiquette brève au-dessus du joueur : « ○ Au-dessus de la tête → bandeja »,
     « □ Coupé → chiquita (stick vers toi) », « ✕ relâché trop tôt » ;
   - un **historique** des 5 dernières actions (bouton + direction du stick à l'impact + résultat),
     pour comprendre après coup pourquoi on a eu une víbora au lieu d'une bandeja.

### Étape 0 du tutoriel : « Teste ta manette »

Avant toute leçon, un écran de 30 secondes :
- « Appuie sur n'importe quel bouton » → le jeu affiche la manette détectée (« Manette PlayStation
  détectée ») avec un bouton « Ce n'est pas ma manette » pour changer de jeu d'icônes ;
- « Appuie sur ✕ » puis les 3 autres, une à la fois : la pastille s'allume quand c'est le bon bouton,
  et si le joueur appuie sur un autre, on lui montre lequel il a pressé (« Ça, c'est □ ») ;
- « Fais un tour complet avec le stick » : le point suit le stick, on vérifie qu'il atteint les bords
  (repère aussi un stick qui dérive).

## 2. Les coups à enseigner

Classés par palier (`GAME_DESIGN.md` §10). « Dans le jeu » = déjà implémenté sur `feat/etape-d`.
Notation : **Normal** = bouton du bas, **Au-dessus** = bouton de droite, **Coupé** = bouton de gauche,
**Lob** = bouton du haut (affichés avec les icônes de la manette du joueur, jamais en lettres seules).

### Palier 1 — Les bases

| # | Leçon | Boutons | Quand | Comment bien le faire | Validé quand | Dans le jeu |
|---|---|---|---|---|---|---|
| 1 | Se déplacer | Stick | Toujours : revenir au centre après chaque coup | Aller au-devant de la balle, l'assistance ne fait que le dernier mètre et demi | Rejoindre 3 cibles au sol | Oui |
| 2 | Coup normal (lift) | Normal : maintenir, relâcher | Balle à bonne hauteur, du fond | Appuyer tôt (préparation ≥ 0,6 s), **relâcher quand la balle arrive à côté du joueur**, l'anneau de timing aide | 5 balles dans le terrain | Oui |
| 3 | Diriger | Stick **au moment du relâcher** | À chaque coup | Stick à gauche/droite = côté ; vers l'avant = profond ; vers soi = court ; sans stick = sûr, au centre | Toucher 2 zones ciblées sur 3 | Oui |
| 4 | Le service | Normal ou Lob, maintenir puis relâcher | Début de chaque point | Balle lâchée, frappée au relâcher après son rebond ; stick pour viser le coin du carré de service | 3 services dans le carré | Oui |
| 5 | Le timing parfait | Tout coup | Tout coup | Relâcher dans la sous-fenêtre dorée : arrêt sur image, son, balle plus rapide et plus précise. Trop tôt = coup dans le vide (on peut réarmer) ; trop tard = la balle part large et long | 3 frappes parfaites | Oui |

### Palier 2 — Le padel

| # | Leçon | Boutons | Quand | Comment bien le faire | Validé quand | Dans le jeu |
|---|---|---|---|---|---|---|
| 6 | Défense après la vitre du fond | Normal | Balle profonde qui va toucher ta vitre | **Ne pas la prendre** : reculer, la laisser rebondir sur la vitre, la jouer quand elle revient. Le coup part plus lent : remets-la haute ou lobe | 3 balles jouées après la vitre | Oui |
| 7 | Le lob (globo) | Lob | Adversaire au filet, balle **verte** (du temps) | Profond par défaut ; stick vers soi = lob court (risqué). Parfait = plus profond, plus dur à smasher | 3 lobs qui passent le joueur au filet | Oui |
| 8 | La volée | Normal, sans rebond | Au filet | Se placer à 3-4 m du filet ; relâcher tôt, elle part sèche (×1,45) et ouverte. Viser court et croisé du côté libre | 3 volées gagnantes ou qui font reculer | Oui |
| 9 | Lire la pression (vert / jaune / rouge) | — | Tout coup | La couleur de l'anneau dit la difficulté de la balle reçue. Rouge : fenêtre parfaite plus étroite, pas de lob ni d'attaque, remets en coupé | Garder la balle en jeu sur 3 balles rouges | Oui |
| 10 | Le coupé (slice) | Coupé | Balle basse, ou pour gagner du temps | La balle reste basse et meurt après le rebond (rebond écrasé). Mieux qu'un normal sur balle basse | 3 coupés qui rebondissent sous 0,6 m | Oui |
| 11 | Le blocage | Normal ou Coupé, appui **tardif** | Frappe au corps au filet, pas le temps d'armer | Moins de 0,3 s de préparation = coup bloqué, lent. À éviter quand on peut : appuyer plus tôt. À savoir faire quand on ne peut pas | Renvoyer 3 frappes au corps | Oui |

### Palier 3 — Joueur confirmé

| # | Leçon | Boutons | Quand | Comment bien le faire | Validé quand | Dans le jeu |
|---|---|---|---|---|---|---|
| 12 | La bandeja | Au-dessus, stick neutre | Lob pas assez haut pour smasher, tu es au filet | Coup sûr, 65-78 km/h, profond vers le coin. Sert à **garder le filet**, pas à gagner le point | 3 bandejas, rester au filet | Oui |
| 13 | La víbora | Au-dessus + stick sur le côté | Même balle, pour attaquer | Plus rapide, effet latéral : la balle file dans la vitre latérale et y meurt. Plus risqué | 2 víboras qui touchent la vitre latérale | Oui |
| 14 | La volée coupée (amortie de volée) | Coupé, de volée | Balle **verte** flottante, prise au-dessus de 0,9 m | Courte, rasante, elle meurt avant la vitre. Sous pression, ça redevient un blocage | 3 balles mortes (2e rebond avant la vitre) | Oui |
| 15 | La chiquita | Coupé + **stick vers soi**, après rebond | Adversaires au filet, balle facile | Lente, basse, dans les pieds du volleyeur : il doit la remonter. Alternative au lob | 3 chiquitas qui forcent une volée basse | Oui |
| 16 | La bajada | Au-dessus + stick vers l'avant, sur balle qui ressort de la vitre du fond | Balle haute qui rebondit fort sur ta vitre | Attaquer depuis le fond au lieu de défendre | 2 bajadas | Oui |
| 17 | Le placement manuel | Stick pendant la préparation | Quand on a le temps | Se placer soi-même coupe l'assistance : frappe plus tôt, angles plus ouverts | 3 coups manuels dans les zones larges | Oui |

### Palier 4 — Maîtrise

| # | Leçon | Boutons | Quand | Comment bien le faire | Validé quand | Dans le jeu |
|---|---|---|---|---|---|---|
| 18 | Le remate | Au-dessus + stick vers l'avant | Lob court, tu es à moins de 4 m du filet, balle au-dessus de 2,2 m | Plat, 125-131 km/h. Non parfait : profond, il revient de la vitre (rattrapable) | 3 remates gagnants | Oui |
| 19 | Por tres / por cuatro | Remate **parfait** + stick sur le côté / dans l'axe | Même situation | Le remate parfait rebondit haut et sort du terrain : sur le côté (por tres) ou au fond (por cuatro) | 1 por tres, 1 por cuatro | Oui |
| 20 | Salida de pista | Stick vers la porte | L'adversaire a fait sortir la balle | Courir vers la porte près du filet, pousser contre le mur pour glisser dehors, la renvoyer (part en lob) | 1 balle rattrapée dehors | Oui |
| 21 | Défendre un smash | Normal / Lob | Remate adverse | Rester au fond, attendre la vitre ; s'il sort par trois, salida | 3 smashs défendus | Oui |
| 22 | Double vitre | Normal | Balle qui touche fond puis côté (ou l'inverse) | Lire le 2e rebond, se placer là où elle ressort | 2 balles jouées après double vitre | Oui (physique) |
| 23 | Contrapared | — | Dernier recours | Renvoyer contre sa propre vitre | — | **Non** : le coup existe (`CHANTIERS_PLAN.md`, étape 4), leçon à écrire ; situation « Lob qui passe » du labo |
| 24 | Feinte / annulation | — | — | — | — | **Non** (RB prévu au §4, pas codé) |
| 25 | Jeu à deux (appels, couverture) | — | 2 contre 2 | — | — | **Non** (étape C) |

Les leçons 23-25 restent dans la liste, grisées « bientôt », pour que le tutoriel suive le jeu.

## 3. Démarche d'une leçon (la même pour toutes)

Chaque leçon suit cinq temps, inspirés des packs d'entraînement de Rocket League et des tutoriels
de Virtua Tennis :

1. **Comprendre (10 s)** — Une carte : nom du coup, une phrase « quand », les boutons en icônes de la
   manette du joueur, un mini-schéma vu de dessus (trajectoire, rebond, vitre). Bouton pour passer.
2. **Voir (une démo)** — Le jeu joue le coup seul, une fois, ralenti à 50 %, avec le **retour d'entrées
   de la démo affiché** : on voit le bouton s'allumer, le stick bouger, le moment du relâcher. Le bot
   existant (`src/sim/bot.ts`) sert de démonstrateur, en forçant le coup et un relâcher parfait.
3. **Essayer, guidé** — La situation se rejoue en boucle (comme le labo). Pendant le premier essai :
   ralenti léger (70 %), pastille clignotante sur le bon bouton au bon moment (« maintenant :
   relâche ! »), cible au sol si la direction compte. L'aide s'efface après 2 réussites.
4. **Réussir, seul** — Même situation, vitesse normale, sans indications. Compteur « 3 / 5 ».
   À chaque échec, **une seule phrase** qui dit pourquoi, tirée de `DuelShot` :
   - mauvais bouton : « Tu as appuyé sur ✕ (normal). Pour la víbora : ○ + stick sur le côté » ;
   - mauvaise variante : « Bandeja : le stick était au centre au moment de la frappe » ;
   - timing : « Relâché 0,12 s trop tard : la balle part large » / « trop tôt : coup dans le vide » ;
   - préparation : « Appuyé trop tard : coup bloqué. Appuie dès que la balle part de chez Rouge » ;
   - position : « Trop loin du filet pour un remate (5,2 m, il faut moins de 4 m) ».
5. **Maîtriser (facultatif)** — Une étoile de plus pour N frappes **parfaites**, une deuxième pour la
   même chose avec des variantes de la situation (balle plus rapide, plus à gauche, pression jaune).

Après 3 échecs d'affilée, on propose de revoir la démo. On peut toujours passer une leçon.
Progression sauvegardée (localStorage, comme `feelStorage.ts`) : étoiles par leçon, paliers ouverts
au fur et à mesure, mais tout reste jouable (aucune leçon verrouillée en dur, seulement recommandée).

## 4. Ce qu'il faut construire

| Morceau | Fichier(s) | Notes |
|---|---|---|
| Détection de manette + icônes | `src/input/padStyle.ts` (nouveau), `src/ui/buttonIcons.ts` | `gamepad.id` → `'xbox' \| 'playstation' \| 'nintendo' \| 'generic'` ; rendu SVG du losange ; choix forcé dans `duelSettings.ts` |
| Retour d'entrées | `src/ui/inputDisplay.ts` | Lit le `PadState` déjà échantillonné (pas de seconde lecture), plus `duel.shot` pour le résultat ; utilisable en match, labo, tutoriel |
| Remplacer les lettres en dur | `situations.ts` (indices), `duelSettings.ts`, `duelHud.ts`, `GAME_DESIGN.md` | Indices écrits avec des jetons (`{normal}`, `{overhead}`) rendus en icônes |
| Leçons | `src/sim/lessons.ts` | Données pures : situation de départ (réutilise `opening()`/`playSituation`), coup attendu, critère de réussite = fonction de `DuelShot` + suite du point, messages d'échec. Testable sans navigateur |
| Mode | `src/modes/tutoriel.ts`, `main.ts` (`?mode=tutoriel`), entrée dans le menu | Calqué sur `labo.ts` : boucle de rejeu, mais pilotée par l'état de la leçon (carte → démo → guidé → seul) |
| Ralenti | `labo.ts`/`tutoriel.ts` | Multiplier `frameTime` avant `loop.advance` : la simulation reste déterministe |
| Démo | `src/sim/bot.ts` | Option « coup imposé, relâcher parfait » ; enregistrer ses commandes pour les afficher dans le retour d'entrées |
| Tests | `tests/sim/lessons.test.ts` | Pour chaque leçon : le bot démonstrateur la réussit, et un mauvais bouton / mauvais stick produit le bon message d'échec |

## 5. Ordre de réalisation proposé

1. **Retour d'entrées + icônes de manette** (utile tout de suite, en match et au labo, et c'est le
   problème signalé). Inclut l'écran « Teste ta manette ».
2. **Squelette du mode** avec 3 leçons (coup normal, direction, bandeja) pour valider la démarche en
   cinq temps à la manette.
3. **Toutes les leçons « Dans le jeu »** (1 à 22), avec leurs tests.
4. Démo ralentie, étoiles, sauvegarde, menu.
5. Leçons 23-25 quand les coups existeront.

## 6. Questions à trancher

- Le tutoriel se lance-t-il automatiquement au premier démarrage (au moins l'étape « Teste ta
  manette » et le palier 1), ou seulement depuis le menu ?
- Textes : français seulement pour l'instant ?
- Le retour d'entrées doit-il être visible par défaut en match (débutants) ou désactivé par défaut ?
