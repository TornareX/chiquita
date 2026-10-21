import { createSounds } from '../audio/sounds';
import { createKeyboardMouse } from '../input/keyboardMouse';
import { createView } from '../render/scene';
import { SIM_DT } from '../sim/constants';
import { EXERCISES, findExercise } from '../sim/exercises';
import { FixedStepLoop } from '../sim/loop';
import { DEFAULT_DIFFICULTY } from '../sim/machine';
import { World } from '../sim/world';
import { createAids } from '../ui/aids';
import { createHud } from '../ui/hud';
import { createPadTest } from '../ui/padTest';
import { createPanel } from '../ui/panel';
import { createPauseMenu } from '../ui/pauseMenu';
import { loadSettings, saveSettings } from '../ui/settingsStore';

/**
 * Mode « Padel Trainer » : première personne face à la machine à balles.
 * Ce n'est plus le jeu principal mais un outil de réglage et de test (GAME_DESIGN.md §3).
 */
export function startTrainer(canvas: HTMLCanvasElement): void {
  const world = new World();
  const aids = createAids();
  const view = createView(canvas, world, aids);
  const input = createKeyboardMouse(canvas);
  const hud = createHud();
  const sounds = createSounds();
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  const settings = loadSettings(new URLSearchParams());

  /** Micro-pause sur un contact propre : fin de la pause, en temps réel (ms). */
  let hitstopUntil = 0;

  const loop = new FixedStepLoop(SIM_DT, () => {
    const commands = input.sample();
    const script = window.__sim?.commandScript;
    world.step(script ? { ...commands, ...script(world) } : commands);

    // Retours immédiats sur les événements du pas.
    if (settings.sound) for (const contact of world.contacts) sounds.contact(contact);
    if (world.shot) {
      const { shot } = world;
      if (settings.sound) sounds.shot(shot);
      hud.showShot(shot);
      view.kick(shot.quality);
      // 30 à 50 ms selon la qualité, rien sur un contact au bord du tamis. [à calibrer]
      if (shot.quality >= 0.5) hitstopUntil = performance.now() + 30 + 20 * shot.quality;
    }
    if (world.swingMiss) hud.showMiss(world.swingMiss);
    if (world.result) {
      if (settings.sound) sounds.result(world.result);
      hud.showResult(world.result);
    }
  });

  const params = new URLSearchParams(location.search);

  // La difficulté choisie est conservée d'un exercice à l'autre.
  let difficulty = DEFAULT_DIFFICULTY;
  let exercise: string | null = null;
  const actions = {
    /** `?seed=N` fixe la suite de balles ; sinon elle change à chaque démarrage. */
    startExercise(id: string): void {
      exercise = id;
      const seed = params.has('seed') ? Number(params.get('seed')) : Date.now() % 1_000_000;
      world.startExercise(findExercise(id), seed);
      world.machine?.setDifficulty(difficulty);
    },
    setDifficulty(value: number): void {
      difficulty = value;
      world.machine?.setDifficulty(value);
    },
    togglePause(): void {
      // Pendant la revue d'un point, la pause est imposée.
      if (view.replaying) return;
      world.paused = !world.paused;
    },
    replay(): void {
      world.replayLastBall();
    },
    /** Revue du dernier point en caméra libre : le jeu est en pause pendant ce temps. */
    toggleReview(): void {
      if (view.replaying) {
        view.setReplay(null);
        world.paused = false;
      } else if (world.lastPoint.length > 0) {
        view.setReplay([...world.lastPoint]);
        world.paused = true;
      }
    },
  };
  const panel = createPanel(actions, aids);

  const padTest = createPadTest(
    () => settings.padStyle,
    (style) => {
      settings.padStyle = style;
      saveSettings(settings);
    },
  );
  // Pause (Échap, ou le bouton en haut à droite), la même qu'en match : « Recommencer » relance l'exercice.
  const pause = createPauseMenu(settings, {
    online: false,
    onChange: (_, restart) => {
      if (restart && exercise) actions.startExercise(exercise);
    },
    onTestPad: () => padTest.open(),
    onQuit: () => (location.search = ''),
    blocked: () => padTest.isOpen,
  });
  const paused = (): boolean => pause.isOpen || padTest.isOpen;
  // Souris capturée, le navigateur garde Échap pour la libérer : la libérer ouvre donc la pause.
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === null && !paused()) pause.toggle();
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat || paused()) return;
    const digit = /^Digit([1-9])$/.exec(event.code);
    const exercise = digit ? EXERCISES[Number(digit[1]) - 1] : undefined;
    if (exercise) actions.startExercise(exercise.id);
    else if (event.code === 'KeyP') actions.togglePause();
    else if (event.code === 'KeyR') actions.replay();
    else if (event.code === 'KeyV') actions.toggleReview();
  });

  // `?exercise=none` : aucun exercice au démarrage.
  const exerciseId = params.get('exercise') ?? 'back-glass';
  if (exerciseId !== 'none') actions.startExercise(exerciseId);

  const debug = import.meta.env.DEV || params.has('debug');
  if (debug) window.__sim = { world, aids };

  let last = performance.now();
  let alpha = 0;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    // Pendant la micro-pause, la simulation est figée ; le temps réel écoulé n'est pas rattrapé.
    world.profile.racket.tolerance = aids.tolerance;
    if (paused()) {
      // En pause, rien ne bouge.
    } else if (view.replaying) view.moveReplayCamera(input.sample(), frameTime);
    else if (now >= hitstopUntil) alpha = loop.advance(frameTime * aids.timeScale);
    view.render(alpha, frameTime);
    hud.update(world, input.active, view.replaying);
    panel.update(world, input.active, view.replaying);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
