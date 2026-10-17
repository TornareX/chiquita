import { startDuel } from './modes/duel';
import { startLabo } from './modes/labo';
import { startTutorial } from './modes/tutoriel';
import { startTrainer } from './modes/trainer';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene introuvable');

// `?mode=trainer` : la machine à balles, gardée comme outil de réglage et de test.
// `?mode=labo` : labo de sensations, une situation de match rejouée en boucle pour régler la physique.
// `?mode=tutoriel` : une leçon par coup (`&lecon=bandeja` pour en ouvrir une directement).
const mode = new URLSearchParams(location.search).get('mode');
if (mode === 'trainer') startTrainer(canvas);
else if (mode === 'labo') startLabo(canvas);
else if (mode === 'tutoriel') startTutorial(canvas);
else startDuel(canvas);
