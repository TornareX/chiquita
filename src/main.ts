import { startDuel } from './modes/duel';
import { startTrainer } from './modes/trainer';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene introuvable');

// `?mode=trainer` : la machine à balles, gardée comme outil de réglage et de test.
if (new URLSearchParams(location.search).get('mode') === 'trainer') startTrainer(canvas);
else startDuel(canvas);
