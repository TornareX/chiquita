// Variables communes de l'interface, avant toute autre feuille de style.
import './ui/theme.css';
import { fullscreenOnTouch } from './input/virtualStick';
import { startAnimations } from './modes/animations';
import { startDuel } from './modes/duel';
import { startHome } from './modes/home';
import { startLabo } from './modes/labo';
import { startOnline } from './modes/online';
import { startTutorial } from './modes/tutoriel';
import { startTrainer } from './modes/trainer';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene introuvable');
fullscreenOnTouch();

// `?mode=trainer` : la machine à balles, gardée comme outil de réglage et de test.
// `?mode=labo` : labo de sensations, une situation de match rejouée en boucle pour régler la physique.
// `?mode=tutoriel` : une leçon par coup (`&lecon=bandeja` pour en ouvrir une directement).
// `?mode=animations` : visionneur des animations du personnage, coup par coup, sans jouer.
// `?enligne` (ou `?mode=enligne`) : jeu en ligne, salon puis match contre le serveur (`npm run serveur`).
// `/` sans paramètre de jeu (ou `?mode=accueil`) : l'accueil ; toute autre adresse lance directement le match local
// qu'elle décrit (raccourcis de test, adresse fabriquée par l'écran « Jouer »).
const params = new URLSearchParams(location.search);
const mode = params.get('mode');
/** Paramètres qui ne décrivent pas une partie : avec eux seuls, on reste à l'accueil. */
const HOME_PARAMS = ['debug', 'perf', 'serveur'];
const home = mode === 'accueil' || (mode === null && [...params.keys()].every((key) => HOME_PARAMS.includes(key)));
if (home) startHome(canvas);
else if (mode === 'trainer') startTrainer(canvas);
else if (mode === 'labo') startLabo(canvas);
else if (mode === 'tutoriel') startTutorial(canvas);
else if (mode === 'animations') startAnimations(canvas);
else if (mode === 'enligne' || params.has('enligne')) startOnline(canvas);
else startDuel(canvas);
