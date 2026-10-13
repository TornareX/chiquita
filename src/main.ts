import { createView } from './render/scene';
import { SIM_DT } from './sim/constants';
import { findExercise } from './sim/exercises';
import { FixedStepLoop } from './sim/loop';
import { World } from './sim/world';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene introuvable');

const world = new World();
const view = createView(canvas, world);
const loop = new FixedStepLoop(SIM_DT, () => world.step());

const params = new URLSearchParams(location.search);

// `?exercise=none` : aucun exercice ; `?seed=N` : choisit la suite de balles.
const exerciseId = params.get('exercise') ?? 'back-glass';
if (exerciseId !== 'none') {
  world.startExercise(findExercise(exerciseId), Number(params.get('seed') ?? 1));
}

const debug = import.meta.env.DEV || params.has('debug');
if (debug) window.__sim = { world };

let last = performance.now();
const frame = (now: number): void => {
  const alpha = loop.advance((now - last) / 1000);
  last = now;
  view.render(alpha);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
