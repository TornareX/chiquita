# Padel Trainer — Spécification du MVP

> Document de référence pour développer le MVP avec Claude Code.
> À placer à la racine du dépôt. Les valeurs marquées **[à calibrer]** sont des points de départ, à ajuster en jouant.

---

## 1. Vision

Un jeu de padel en 3D, vue première personne, où l'on s'entraîne seul face à une **machine à balles** qui envoie des trajectoires choisies (vitre de fond, double vitre, lob, grillage…). Le but est d'apprendre à **lire les rebonds sur les vitres** et à renvoyer la balle.

**Priorité absolue : le ressenti.** Se déplacer et renvoyer la balle doit être agréable et satisfaisant, tout en respectant la physique et les contraintes réelles du padel.

**Philosophie de design (modèle Rocket League)** :
- facile à prendre en main, difficile à maîtriser ;
- physique **déterministe et cohérente** : même geste, même résultat. C'est ce qui permet de progresser ;
- les techniques avancées (double vitre, contrapared, por tres…) doivent **émerger de la physique**, pas être codées comme des coups spéciaux ;
- on joue à plusieurs niveaux grâce à des **aides désactivables**, pas grâce à des règles différentes.

**Plus tard (hors MVP, mais l'architecture doit le permettre)** : 2v2 où chacun contrôle son joueur et sa raquette, mode arcade plus casual, online.

---

## 2. Périmètre du MVP

### Inclus
- Terrain aux dimensions officielles FIP, avec vitres, grillage et filet.
- Physique de balle réaliste : gravité, traînée, effet Magnus, rebonds différenciés sol / vitre / grillage, transfert de spin au rebond.
- Joueur en première personne : déplacement, préparation et frappe avec une raquette physique.
- Contrôles clavier/souris.
- Machine à balles avec exercices prédéfinis et un mode aléatoire.
- Retour après chaque balle (renvoyée valide / faute / ratée) et statistiques simples de la session.
- Aides d'entraînement activables.
- Assets 3D du terrain, des balles et de la raquette (voir §9), avec un repli en formes simples.

### Exclus
- Adversaire, IA de jeu, score et règles de match complètes, service.
- Multijoueur (local ou online).
- Animation du corps du joueur (seule la raquette est visible).
- Gameplay arcade, menus élaborés, audio musical.
- Coups au-dessus de la tête (smash, bandeja, víbora) et support manette : prévus après le MVP.

---

## 3. Stack technique

| Rôle | Choix |
|---|---|
| Langage | TypeScript (strict) |
| Rendu 3D | Three.js |
| Build / dev server | Vite |
| Tests unitaires | Vitest |
| Tests navigateur | Playwright (Chromium headless) |
| Format des modèles | glTF binaire (`.glb`) |

**Pas de moteur physique tiers** : la physique de la balle est écrite à la main pour garder un contrôle total et le déterminisme.

---

## 4. Architecture

Règle principale : **la simulation est séparée du rendu.**

```
src/
  sim/              # Pur TypeScript, AUCUNE dépendance à Three.js ni au DOM
    constants.ts    # Dimensions FIP, specs balle, coefficients
    vec3.ts         # Maths vectorielles minimales
    ball.ts         # État et intégration de la balle
    court.ts        # Géométrie de collision (plans, zones vitre/grillage)
    collisions.ts   # Détection et réponse aux rebonds
    racket.ts       # Arc de swing, détection du contact, calcul du coup
    player.ts       # Déplacement, inertie, split-step
    machine.ts      # Machine à balles et exercices
    rules.ts        # Validité d'un renvoi
    world.ts        # Assemble tout, avance d'un pas fixe
  input/            # Clavier/souris → commandes abstraites
  render/           # Three.js : scène, caméra, chargement des .glb, effets
  ui/               # HUD, panneau des aides, stats
  main.ts
tests/
  sim/              # Vitest
  e2e/              # Playwright
```

**Principes :**
- **Pas de temps fixe** : simulation à 240 Hz (sous-pas pour la balle rapide), rendu interpolé.
- **Déterminisme** : mêmes entrées → même résultat. Tout aléatoire passe par un PRNG à seed.
- **Commandes abstraites** : le joueur reçoit des commandes (`move`, `prepare`, `swing`, `softShot`…), indépendantes de la source (clavier, manette, réseau, IA). Prépare le 2v2.
- **Profils de physique** : tous les coefficients regroupés dans un profil (`realistic`, plus tard `arcade`), modifiables à chaud via un panneau de debug.
- **Mode debug** exposant l'état de la simulation (`window.__sim`) pour les tests Playwright.

Repère : **unités en mètres, Y vers le haut**, origine au centre du filet au sol, axe Z dans la longueur du terrain, le joueur côté Z négatif.

---

## 5. Contraintes réelles du padel (règles FIP)

### Terrain
- Intérieur : **20 m × 10 m**.
- Filet : **0,88 m au centre, 0,92 m aux extrémités**.
- Lignes de service : **6,95 m** du filet.
- Murs du fond : **3 m de vitre + 1 m de grillage au-dessus** (4 m au total).
- Murs latéraux, variante 1 (à utiliser par défaut) : à chaque extrémité, un panneau vitré de **3 m de haut sur 2 m**, puis un de **2 m de haut sur 2 m**. Le reste est en grillage, jusqu'à 3 m de haut dans les 6 m centraux et 4 m aux extrémités.
- Variante 2 (« crystal », hors MVP) : un panneau de 3 m de haut sur 4 m à chaque extrémité, sans marche.

### Balle
- Diamètre : **6,35 à 6,77 cm** (MVP : 6,5 cm).
- Masse : **56,0 à 59,4 g** (MVP : 57,5 g).
- Rebond : **135 à 145 cm lorsqu'elle tombe de 2,54 m** sur une surface dure. Coefficient de restitution au sol d'environ **0,74** (√(1,40 / 2,54)).

### Règles qui s'appliquent à l'exercice
Pour la balle envoyée par la machine (côté joueur) :
- Elle doit rebondir **une seule fois au sol** de ton côté, avant ou après avoir touché les vitres. Après le rebond au sol, elle peut toucher les vitres et le grillage et rester en jeu.
- Tu peux la jouer **de volée** (avant le rebond) ou après le rebond, mais **avant le deuxième rebond au sol**.

Pour ton renvoi :
- Il doit franchir le filet et **rebondir au sol dans le camp adverse avant de toucher un mur** adverse. Toucher directement une vitre ou le grillage adverse = faute.
- Il peut **toucher ta propre vitre** avant de passer le filet (contrapared), c'est valide.
- Toucher **ton propre grillage** = faute.
- Toucher le filet puis passer et rebondir correctement = valide. Toucher le filet puis un mur adverse = faute.

---

## 6. Physique de la balle

### Forces
- **Gravité** : 9,81 m/s².
- **Traînée** : `F = ½ ρ Cd A |v| v`, ρ = 1,2 kg/m³, Cd ≈ 0,55 **[à calibrer]**.
- **Magnus** : `F = ½ ρ Cl A |v| (ω̂ × v)`, Cl dépend du rapport spin/vitesse, environ 0,1–0,3 **[à calibrer]**.
- Le spin décroît lentement en vol.
- Intégration semi-implicite (ou RK4) à pas fixe.

### Rebonds
Pour chaque rebond, décomposer la vitesse en composante normale et tangentielle :
- **Normale** : multipliée par `-e` (coefficient de restitution).
- **Tangentielle et spin** : modèle de friction avec glissement et roulement. C'est ce qui fait qu'une balle liftée « sort » de la vitre et qu'une balle slicée « meurt ».

| Surface | Restitution `e` | Friction | Remarque |
|---|---|---|---|
| Sol (gazon synthétique) | 0,74 | moyenne | Calé sur la spec FIP |
| Vitre | ~0,65 **[à calibrer]** | faible | Rebond régulier et prévisible |
| Grillage | ~0,3 **[à calibrer]** | élevée | Rebond amorti et irrégulier |

Irrégularité du grillage : perturbation de la normale à partir d'un **bruit déterministe fonction du point d'impact**. C'est imprévisible pour le joueur, mais reproductible.

Coins et double vitre : gérer correctement deux rebonds rapprochés (sous-pas plus fins, résolution séquentielle).

---

## 7. Joueur et raquette : contrôles

Le cœur du ressenti. **Aucune frappe automatique et aucune animation ne décide à la place du joueur.**

### Déplacement
- **ZQSD** (AZERTY, avec support QWERTY), avec **inertie** : accélération et freinage, pas de démarrage instantané.
- **Split-step** : un petit saut (Espace) au bon moment, pendant que la machine frappe. Il donne un **premier pas plus rapide** pendant un court instant. Mal synchronisé, il est sans effet.
- Vitesse réduite pendant la préparation du coup, pour forcer à se placer avant.
- Collision avec les murs et le filet. Le joueur ne peut pas passer dans le camp adverse.
- **Souris** : regarder (pointer lock). Champ de vision large (90–100°) par défaut.

### Raquette
- La raquette est un **objet physique** attaché au joueur, visible en bas de l'écran. Coup droit ou revers (à une main) est choisi automatiquement selon le côté de la balle.
- **Maintenir le clic gauche = préparation** : la raquette s'arme. Préparer tôt est récompensé (swing plus ample et plus stable).
- **Relâcher = swing** : la raquette balaie un arc. Le contact est détecté par **collision balle/tamis** (sweep pour ne pas traverser à haute vitesse).
- **Qualité du contact** : selon où la balle touche le tamis. Au centre, coup propre. Sur le bord, coup faible et dévié.
- **Mouvement de souris pendant le swing** :
  - vers le haut → lift, lob ;
  - vers le bas → slice, chiquita ;
  - sur le côté → angle supplémentaire.
- **Direction** : là où regarde la caméra au moment du contact.
- **Clic droit maintenu** pendant le swing = **coup de toucher** (vitesse réduite), utile après la vitre.
- La vitesse et l'effet de la balle sortante viennent du swing (vitesse de la raquette, angle du tamis, mouvement de souris), combinés avec la vitesse de la balle entrante.

### Feedback à la frappe (« juice »)
- Son d'impact différent selon la qualité du contact.
- Micro-pause (hitstop) de 30–50 ms sur un contact propre **[à calibrer]**.
- Léger recul de caméra.
- Indicateur visuel discret pour un contact parfait.
- Sons de rebond distincts : sol, vitre, grillage.

### Lisibilité de la profondeur (risque principal en première personne)
- **Ombre de la balle au sol**, toujours affichée et nette. Indispensable.
- Traînée de balle (optionnelle).
- Petite marque d'impact éphémère sur les vitres (optionnelle).

---

## 8. Machine à balles et exercices

La machine se place côté adverse et lance des balles **déterministes** selon des paramètres :
- position de départ ;
- vitesse ;
- direction (azimut, élévation) ;
- spin (axe et intensité) ;
- cadence.

Chaque exercice est défini en JSON et peut ajouter une **variation aléatoire bornée** (PRNG à seed).

### Exercices du MVP
1. **Vitre de fond** : balle profonde qui rebondit au sol puis sur la vitre du fond. Salida de pared.
2. **Double vitre** : balle dans le coin, fond puis latérale.
3. **Lob** : balle haute par-dessus le joueur.
4. **Grillage** : balle qui finit dans le grillage latéral.
5. **Volée** : balle tendue à mi-hauteur.
6. **Mix aléatoire** : tirage parmi les précédents, coup droit et revers mélangés.

Contrôles de l'exercice :
- choix de l'exercice ;
- cadence ;
- difficulté (vitesse, variation) ;
- pause ;
- rejouer la dernière balle.

### Résultat de chaque balle
- **Valide** : renvoi conforme aux règles du §5.
- **Faute** : avec la raison (filet, vitre adverse directe, sortie, propre grillage…).
- **Ratée** : balle non touchée ou deuxième rebond.

Stats de session : taux de réussite par exercice, qualité moyenne de contact.

---

## 9. Assets

Dossier source sur le poste de Xavier : `C:\Users\xavie\Documents\Dev\assets\padel`

Contenu (pack « padel_corona ») :
- formats : `.FBX`, `.OBJ` + `.mtl`, `.3DS`, `.max`, `.DWG`/`.DXF` ;
- textures : dossier `uploads_files_4886662_textures/` (sol, grillage, raquette…), certaines très lourdes (jusqu'à 38 Mo par image).

Analyse de l'OBJ :
- **Unités en centimètres, Y vers le haut.**
- `Padel006` : le terrain complet, environ 20,5 × 10,6 × 5 m.
- `Padel000`–`Padel005` : 6 balles d'environ 6,9 cm.
- `Padel008`–`Padel010` : 3 raquettes d'environ 46 cm.
- `Padel007` : un objet avec du tissu, à identifier (sac ?), probablement inutile.
- Le `.mtl` ne référence aucune texture : elles sont à rebrancher à la main.

Pipeline de conversion :
1. Partir du FBX. Convertir en `.glb` via Blender en ligne de commande (script Python).
2. Mettre à l'échelle (cm → m) et séparer en `court.glb`, `racket.glb`, `ball.glb`.
3. Réduire les textures (2048 px maximum, compression JPEG ou KTX2).
4. Vérifier l'alignement avec les dimensions FIP du §5.

**Le modèle 3D sert au visuel uniquement.** Les collisions utilisent la géométrie simple de `sim/court.ts`, construite à partir des constantes FIP.

Tant que les `.glb` ne sont pas prêts, le rendu utilise des formes simples (plans, boîtes, sphère, raquette approximée).

---

## 10. Aides d'entraînement

Toutes activables dans un panneau. La progression consiste à les retirer une à une.

- Prédiction de trajectoire (ligne pointillée).
- Marqueur du point de rebond au sol.
- Tolérance du contact (taille effective du tamis).
- Ralenti global (0,5×, 0,75×).
- Replay du dernier point, avec caméra libre.

---

## 11. Stratégie de test

### Tests unitaires de la physique (Vitest)
- Balle lâchée de 2,54 m sur le sol → rebond entre 1,35 et 1,45 m.
- Conservation : aucun rebond ne doit faire gagner d'énergie.
- Sans spin ni traînée, trajectoire parabolique exacte.
- Effet Magnus : le lift fait plonger la balle, le slice la fait flotter.
- Rebond sur vitre : composante normale inversée et réduite selon `e`.
- Double vitre en coin : la balle ressort sans traverser ni rester bloquée.
- Déterminisme : même seed et mêmes entrées, état final identique bit à bit.

### Tests des règles
Un cas par règle du §5 : valide, filet, vitre adverse directe, propre grillage, deuxième rebond…

### Tests de la machine
Pour chaque exercice, sur 1 000 seeds, la balle produit bien le parcours attendu (ex. pour « vitre de fond » : sol puis vitre du fond, et elle reste jouable).

### Tests navigateur (Playwright)
- La page charge sans erreur de console.
- Capture d'écran de la scène pour contrôle visuel.
- Scénario automatisé : lancer un exercice, simuler un swing calé via `window.__sim`, vérifier le résultat.

**Ce qui ne se teste pas automatiquement** : le ressenti. Il se valide en jouant (Xavier), puis on ajuste les coefficients.

---

## 12. Étapes de développement

1. **Squelette** : Vite + TS + Three.js + Vitest + Playwright, scène vide, boucle à pas fixe.
2. **Terrain** : géométrie de collision à partir des constantes FIP, rendu en formes simples.
3. **Balle** : vol (gravité, traînée, Magnus) + rebonds + tests physiques.
4. **Machine** : lancement paramétré + exercice « vitre de fond ».
5. **Joueur** : déplacement première personne avec inertie, caméra.
6. **Raquette** : préparation, swing, contact, calcul du coup sortant.
7. **Règles et feedback** : validité du renvoi, HUD, sons, hitstop.
8. **Exercices** : les 6 exercices + mode aléatoire.
9. **Aides** : panneau d'aides d'entraînement.
10. **Assets** : conversion et intégration des `.glb`.
11. **Calibration** : sessions de jeu avec Xavier, ajustement des coefficients.

Chaque étape se termine par des tests verts et une capture d'écran.

---

## 13. Critères de réussite du MVP

- On peut lancer l'exercice « vitre de fond », se placer, attendre le rebond sur la vitre et renvoyer la balle de façon valide.
- Les rebonds sur vitre paraissent crédibles à un joueur de padel.
- Un renvoi réussi est **satisfaisant** (son, feedback, trajectoire).
- On sent qu'on progresse : avec la pratique, le taux de réussite monte, et on réussit les exercices sans les aides.
- Jouable à 60 fps sur un PC de bureau classique dans Chrome.

---

## 14. Décisions prises

- **Revers à une main.**
- **Smash, bandeja et víbora : après le MVP.** Le swing au-dessus de la tête demande un geste différent, à concevoir plus tard.
- **Clavier/souris uniquement pour le MVP.** Le support manette viendra plus tard (les commandes abstraites du §4 le permettent).
- **Mur latéral : variante 1 (avec marche) uniquement**, celle des pistes du circuit pro (Premier Padel, FIP). La variante 2 est hors MVP.

---

## Sources

- [FIP — Rules of Padel](https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf) : dimensions, specs de la balle, règles.
- [LTA Padel — How to play off the back glass](https://www.ltapadel.org.uk/play/padel-tips-and-techniques/how-to-play-off-the-back-glass-in-padel) : technique de vitre.
- [How to Use the Walls in Padel](https://thegodofsports.com/how-to-use-the-walls-in-padel/) : coups de vitre.
- [TopSpin 2K25 review](https://videogames.si.com/reviews/topspin-2k25-review) : timing et placement.
- [Mario Tennis Aces Controls](https://primagames.com/tips/mario-tennis-aces-controls) : charge et déplacement.
- [Table Tennis Wii review](https://hexus.net/gaming/reviews/wii/10192-table-tennis-wii/?page=3) : direction du geste.
- [Virtua Tennis — Wikipedia](https://en.wikipedia.org/wiki/Virtua_Tennis_(video_game)) : simplicité des contrôles.
