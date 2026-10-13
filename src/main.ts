import { createSounds } from './audio/sounds';
import { createKeyboardMouse } from './input/keyboardMouse';
import { createView } from './render/scene';
import { SIM_DT } from './sim/constants';
import { findExercise } from './sim/exercises';
import { FixedStepLoop } from './sim/loop';
import { World } from './sim/world';
import { createHud } from './ui/hud';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene introuvable');

const world = new World();
const view = createView(canvas, world);
const input = createKeyboardMouse(canvas);
const hud = createHud();
const sounds = createSounds();
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, () => sounds.unlock(), { once: true });
}

/** Micro-pause sur un contact propre : fin de la pause, en temps réel (ms). */
let hitstopUntil = 0;

const loop = new FixedStepLoop(SIM_DT, () => {
  const commands = input.sample();
  const script = window.__sim?.commandScript;
  world.step(script ? { ...commands, ...script(world) } : commands);

  // Retours immédiats sur les événements du pas.
  for (const contact of world.contacts) sounds.contact(contact);
  if (world.shot) {
    const { shot } = world;
    sounds.shot(shot);
    hud.showShot(shot);
    view.kick(shot.quality);
    // 30 à 50 ms selon la qualité, rien sur un contact au bord du tamis. [à calibrer]
    if (shot.quality >= 0.5) hitstopUntil = performance.now() + 30 + 20 * shot.quality;
  }
  if (world.result) {
    sounds.result(world.result);
    hud.showResult(world.result);
  }
});

const params = new URLSearchParams(location.search);

// `?exercise=none` : aucun exercice ; `?seed=N` : choisit la suite de balles.
const exerciseId = params.get('exercise') ?? 'back-glass';
if (exerciseId !== 'none') {
  world.startExercise(findExercise(exerciseId), Number(params.get('seed') ?? 1));
}

const debug = import.meta.env.DEV || params.has('debug');
if (debug) window.__sim = { world };

let last = performance.now();
let alpha = 0;
const frame = (now: number): void => {
  const frameTime = (now - last) / 1000;
  last = now;
  // Pendant la micro-pause, la simulation est figée ; le temps réel écoulé n'est pas rattrapé.
  if (now >= hitstopUntil) alpha = loop.advance(frameTime);
  view.render(alpha, frameTime);
  hud.update(world, input.active);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
