# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Des amis qui jouent ensemble sur un canapé, à la manette, devant une télé (2 à 3 m de l'écran), en 2 contre 2 ou
en 1 contre 1, humains et IA mélangés. Deux publics comptent autant l'un que l'autre :
- des joueurs de padel qui veulent retrouver leur sport en jeu ;
- des joueurs de jeux de sport arcade (Rocket League, Virtua Tennis) qui découvrent le padel par le jeu.

Ils veulent lancer une partie en quelques secondes, se chambrer pendant l'échange et rejouer. Un second usage :
jouer en ligne entre amis, en salle privée à code.

## Product Purpose

Padel Smash est un jeu de padel arcade en 2 contre 2. Les déplacements et la frappe ont le feeling de Virtua
Tennis 4 : on prend la manette, on court, on frappe, ça marche tout de suite. Les règles et les coups sont ceux du
padel. Réussir, c'est qu'un débutant renvoie la balle dès sa première partie et qu'un joueur régulier continue de
découvrir des techniques des semaines plus tard.

## Positioning

Les vitres et le grillage du court donnent la profondeur, comme les murs de Rocket League : plus on joue, plus on
découvre de façons de s'en servir (sortie de vitre, « por tres », contre-vitre). La physique est cohérente et sans
hasard, donc chaque technique s'apprend. Aucun autre jeu de sport ne repose sur un terrain fermé de ce type.

## Operating Context

- Jeu dans le navigateur, sur un PC branché à la télé ; diffusion par lien web ou itch.io. Pas de boutique prévue.
- Manette d'abord (frappe au stick droit, déplacement au stick gauche) ; clavier possible, 1 ou 2 joueurs par
  clavier ; souris pour les menus seulement.
- Jusqu'à 4 manettes sur un écran ; la caméra est derrière l'équipe, façon retransmission télé.
- Une partie : accueil → « Jouer » (format, places, règles) → match → pause (Échap ou Start) → accueil.
- En ligne : salon, salle à code, places, match calculé par le serveur ; la partie continue pendant la pause.
- Entraînement : tutoriel par leçons et situations de match (le labo).

## Capabilities and Constraints

- Three.js, TypeScript, Vite ; interface en HTML/CSS par-dessus la scène 3D. Simulation à pas fixe (240 Hz),
  déterministe (base du rollback en ligne).
- Les menus sont décrits comme des données et affichés par un composant commun (`src/ui/menu.ts`), avec une
  navigation manette, clavier et souris ; leur apparence est dans `src/ui/menu.css` et ne doit pas toucher au
  comportement.
- Le HUD ne doit jamais coûter d'images par seconde pendant l'échange, ni masquer la balle, les joueurs ou les vitres.
- Textes lisibles depuis le canapé, sur une télé 1080p comme sur un portable en 720p.
- Le jeu ne charge rien depuis des services tiers pendant une partie (polices et images embarquées).
- Termes du jeu : simple, double, place, punto de oro, por tres, sortie de vitre, bandeja, víbora, chiquita, smash,
  échange libre, pression. Équipes : Bleu et Rouge.
- Pas encore décidé : un fond animé (match d'IA) derrière l'accueil, un vrai logo, les sons d'interface.

## Brand Commitments

- Nom : **Padel Smash**. Tournoi fictif du décor : **Copa Canapé**.
- Interface entièrement en français, sans traduction prévue. Ton court et direct, tutoiement.
- Références données par Xavier : Premier Padel pour le niveau visuel, Rocket League pour le niveau compétitif ;
  l'identité doit rester propre au jeu, sans copier ni l'un ni l'autre.
- Direction artistique retenue le 21/10/2026 : piste « Grillage » (voir `research/DESIGN_PLAN.md` et la planche
  https://claude.ai/artifact/AVB8b8JhokD7j8afyviDQ9).
- Personnages complets, animés, en style cartoon.

## Evidence on Hand

- Captures de l'état actuel de chaque écran : `screenshots/design/avant/` (`npm run captures`).
- Captures de gameplay et du décor de l'arène : `screenshots/`.
- Aucun joueur extérieur, aucun avis ni aucune donnée d'audience : n'en inventer aucun.

## Product Principles

1. **Prise en main immédiate.** Tout écran se comprend sans lire ; en match, une annonce tient en trois mots.
2. **La profondeur vient du terrain**, pas de jauges ni de super-coups : l'interface montre ce qui s'est passé,
   elle ne donne pas de pouvoirs.
3. **Le spectacle vient du talent** : les grands moments (por tres, sortie de vitre) méritent d'être célébrés à
   l'écran.
4. **Jouer ensemble** : chaque joueur voit sa place, son équipe et son tour sans chercher.
5. **Le court d'abord** : l'interface laisse toujours voir le jeu.

## Accessibility & Inclusion

- Bleu et Rouge doivent se distinguer aussi par la clarté (daltonisme), pas seulement par la teinte.
- Focus manette toujours visible ; tout se fait sans souris.
- Contraste du texte suffisant sur une télé, y compris par-dessus la scène 3D.
