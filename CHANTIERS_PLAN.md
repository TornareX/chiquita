# Chantiers gameplay : places, main forte, rotation, contre-vitre — plan

> Statut (18/10/2026) : plan validé avec Xavier ; étapes 1 et 2 faites (voir `STATUS.md`) ; l'étape 2 n'est pas encore jouée à la manette.
> L'étape 3 a été essayée puis abandonnée par Xavier (18/10) : code retiré. Étape 4 faite (18/10, voir `STATUS.md`),
> vérifiée au joueur automatique, pas encore jouée à la manette. Ordre : 1 → 2 → 3, l'étape 4 est
> indépendante. Chaque étape est vérifiée au joueur automatique avant d'être annoncée jouable.

## Constats de départ (code au commit a2c4af5)

- La manette n° N est liée au joueur n° N (`src/modes/duel.ts`, `pads[index]`), et le clavier ne sert que
  les joueurs 0 et 1. En double, le joueur 0 est toujours à droite : avec une seule manette, on ne peut
  pas jouer à gauche.
- La simulation est ambidextre : la balle se frappe des deux côtés du joueur (`contactTiming` essaie les
  deux signes), et l'aide au placement prend le côté le plus proche (`assist.ts`). Coup droit et revers
  n'existent qu'à l'affichage (`swingSide` dans `pose.ts`) ; la raquette est toujours en main droite.
- Le jeu suppose un droitier par endroits : la balle au centre revient au joueur de gauche « parce que
  son coup droit est au centre » (`Duel`, attribution entre partenaires) ; au service, balle tenue côté
  droit ; le smash se frappe des deux côtés.
- Le joueur n'a pas d'orientation dans la simulation : il fait toujours face au filet. Le rendu ne
  tourne le corps que pendant la course.
- La règle permet déjà de jouer contre sa propre vitre (`Duel`, « sa propre vitre est permise ») ; il
  manque le coup et sa commande.

---

## Étape 1 : écran de composition des équipes

Un écran visuel (dans les réglages, et au lancement d'un match) : le terrain vu de dessus, avec une
carte par place :

| | Gauche (revés) | Droite (drive) |
|---|---|---|
| Équipe bleue | carte | carte |
| Équipe rouge | carte | carte |

En simple, une seule carte par équipe. Chaque carte choisit :
- **qui contrôle** : Manette 1 à 4 (celles qui sont branchées, avec leur nom), Clavier bleu, Clavier
  rouge, IA facile / normale / forte ;
- l'assistance de course (déplacée ici depuis sa section actuelle) ;
- **la main** : droitier ou gaucher, ajoutée à l'étape 2 (pas de réglage sans effet en attendant).

Une manette ou un clavier ne contrôle qu'une place : le choisir ailleurs libère l'ancienne place (qui
passe en IA normale). Appuyer sur un bouton d'une manette met en avant sa carte, pour savoir laquelle
est laquelle. Navigation à la manette dans l'écran : souhaitable, pas indispensable au premier jet.

À changer :
- `DuelSettings.players` : par place, `manette1`…`manette4`, `clavier1`, `clavier2` ou un niveau d'IA.
  Les anciens réglages enregistrés sont convertis (« humain » → manette N pour la place N, comme avant).
- `src/modes/duel.ts` : lire la manette ou le clavier choisis pour la place, plus l'index du joueur.
- Caméra : inchangée (derrière l'équipe bleue ; `farOwnView` pour un humain en rouge).

Vérifications : humain seul à gauche en double avec IA partenaire (réception du service côté gauche,
« ¡Mía! / ¡Tuya! », placement de l'IA) ; deux manettes dans la même équipe ; une par équipe ; tests de
conversion des réglages.

## Étape 2 : main forte (niveau 2 : la main change le jeu)

Attribut `hand: 'right' | 'left'` par joueur (`DuelPlayer`), réglé dans l'écran de l'étape 1.

1. **Affichage** : personnage en miroir pour un gaucher (raquette dans la main gauche, gestes inversés).
2. **Règles qui supposaient un droitier** : la balle au centre revient au joueur dont le coup droit est
   au centre (deux droitiers : le joueur de gauche ; un gaucher à droite : les deux coups droits sont au
   centre, on départage au temps) ; balle tenue côté main forte au service.
3. **Coup droit et revers deviennent distincts dans la simulation** : le côté de frappe est connu à
   l'impact. Le revers est un peu moins puissant et un peu moins précis [à calibrer en jouant].
4. **Coups au-dessus de la tête du côté de la main forte** : bandeja, víbora et remate se frappent côté
   main forte. Un lob côté revers oblige à se décaler ; sinon on joue un revers par-dessus la tête,
   plus faible (lent, court, sans remate possible).
5. **IA** : vise plus souvent le revers adverse, lobe du côté du revers ; l'aide au placement et l'IA
   préfèrent le coup droit quand elles ont le temps.

Vérifications : tests de la simulation (côté de frappe, smash côté main forte, attribution au centre
avec un gaucher) ; IA contre IA avec deux droitiers puis avec un gaucher, avant/après (coups par point,
gagnants, remates) ; le joueur automatique.

## Étape 3 : tourner autour de la balle (double vitre)

> Abandonnée (18/10/2026). Essai non commité : pas de pivot automatique de 1,25 m en préparation, corps tourné vers la
> balle derrière soi. À la manette, Xavier n'a pas vu le personnage tourner et juge que ça ne marchera pas. Constats de
> l'essai, si on y revient : le pivot demandait de préparer au moins ~0,6 s avant l'impact alors que la balle touche la
> 2ᵉ vitre ~0,8 s avant ; après le pas, la balle arrive à côté du joueur, donc le corps reste face au filet sans une
> rotation dédiée.

Dépend de l'étape 2 : c'est parce que le coup droit vaut mieux qu'on tourne autour de la balle.

- **Pendant la préparation, sur une balle qui sort d'un coin (double vitre)**, si l'impact prévu tombe
  côté revers et que le temps le permet, le joueur pivote automatiquement autour de la balle dans le sens
  logique (celui qui la ramène côté coup droit). Ça marche aussi en préparation « bloquée » : c'est un
  pas de pivot automatique, limité en distance (~1 m [à calibrer]), pas un déplacement au stick.
- Pas le temps : il reste en revers, sans pivot.
- Affichage : le corps pivote vers le point d'impact (aujourd'hui, toujours face au filet en frappe).
- L'IA fait pareil.

Vérifications : situation de labo « double vitre côté revers », droitier et gaucher ; le pivot ne se
déclenche pas quand il n'y a pas le temps.

## Étape 4 : contre-vitre (contrapared)

Coup de sauvetage : la balle a dépassé le joueur et file vers sa vitre du fond, on ne peut plus se
placer derrière elle. On la frappe contre sa propre vitre pour qu'elle repasse le filet.

- **Situation** : détectée automatiquement (balle entre le joueur et sa vitre du fond, qui s'éloigne,
  impossible de la jouer normalement). Un repère sur la vitre (comme l'anneau de timing) montre que le
  coup est disponible ; le personnage se tourne vers sa vitre.
- **Commande** : coup normal, stick tiré vers sa vitre au relâcher (on tape là où on pousse). Sans stick
  en arrière : coup dans le vide, comme aujourd'hui. Validé par Xavier (à rejuger à la manette).
- **Le coup** : calculé pour rebondir sur la vitre et repasser le filet sans toucher son sol ; lent,
  haut et souvent court, donc attaquable. Faute possible si le timing est mauvais.
- **IA** : le joue de temps en temps quand elle est passée.

Vérifications : tests de la simulation (trajectoire valide, faute si la balle touche son sol avant le
filet) ; situation de labo « lob qui passe » ; IA contre IA (combien de contre-vitres par partie, combien
repassent).
