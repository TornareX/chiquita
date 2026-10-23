import '../ui/hud.css';
import { createSounds } from '../audio/sounds';
import { applySwing, connectedGamepads, IDLE_PAD, mergePads, readGamepad, swingEnabled, toCommands, type PadState } from '../input/gamepad';
import { highFloorFromUrl, SwingStick } from '../input/swingStick';
import { createKeyboardPads } from '../input/keyboardArcade';
import { resolvePadFamily } from '../input/padStyle';
import { createDuelView } from '../render/duelScene';
import { AI_LEVELS, Bot, type AiLevel } from '../sim/bot';
import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import { Duel } from '../sim/duel';
import { applyFeel } from '../sim/feel';
import { FixedStepLoop } from '../sim/loop';
import type { Situation } from '../sim/situations';
import { loadKeyboardLayout, type InputSource } from '../ui/buttonIcons';
import { createDuelHud } from '../ui/duelHud';
import { createInputDisplay } from '../ui/inputDisplay';
import { isHuman, loadPreferences, loadSettings, saveSettings } from '../ui/settingsStore';
import { loadFeel, saveFeel } from '../ui/feelStorage';
import { createLaboPanel } from '../ui/laboPanel';
import { createPadTest } from '../ui/padTest';
import { createPauseMenu } from '../ui/pauseMenu';
import { createSwingJournal, type SwingJournal } from './swingJournal';

/** Bouton Start (Menu) : ouvre ou ferme la pause. */
const START_BUTTON = 9;
/** Pause entre la fin d'un point et la reprise de la situation (s). */
const REPLAY_DELAY = 1;
/** Décompte avant que la situation parte : les joueurs sont en place, le jeu attend (s). */
const COUNTDOWN = 2;
/**
 * Atelier (`Situation.workshop`) : pas de décompte, et la balle suivante part vite. Après sa frappe, le temps de voir où
 * va la balle ; après un coup dans le vide ou la fin du point, presque tout de suite (s).
 */
const WORKSHOP_AFTER_HIT = 1.2;
const WORKSHOP_AFTER_MISS = 0.4;

/** Grand chiffre du décompte, au centre de l'écran. */
function createCountdown(): HTMLDivElement {
  const div = document.createElement('div');
  div.id = 'countdown';
  // Apparence dans `ui/hud.css`.
  div.style.display = 'none';
  document.body.append(div);
  return div;
}

/**
 * Labo de sensations (`?mode=labo`) : une situation de match rejouée en boucle, identique, pendant
 * qu'on règle la physique (gravité, rebonds, vitres, vitesse des coups, course). Bleu est l'humain
 * (manette 1 ou clavier), Rouge l'IA. Les réglages trouvés s'appliquent aussi aux matchs sur demande.
 */
export function startLabo(canvas: HTMLCanvasElement): void {
  const duel = new Duel(null);
  duel.highFloor = highFloorFromUrl();
  const stored = loadFeel();
  applyFeel(duel.profile, stored.feel);
  const settings = loadSettings(new URLSearchParams());
  duel.profile.rally.pressure.scale = settings.pressure;
  // Bleu, c'est soi : ses préférences de joueur.
  const prefs = loadPreferences();
  duel.players[0].assist = prefs.assist;
  duel.players[0].prepMove = settings.prepMove;
  duel.players[0].hand = prefs.hand;

  const view = createDuelView(canvas, duel);
  const hud = createDuelHud();
  const keyboard = createKeyboardPads(canvas);
  const sounds = createSounds();
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  window.addEventListener('gamepadconnected', () => sounds.unlock());

  const rouge = settings.players[1];
  let level: AiLevel = isHuman(rouge) ? 'normal' : rouge;
  let situation: Situation | null = null;
  let bot = new Bot(1, 2, AI_LEVELS[level]);
  let won = 0;
  let played = 0;
  const names: Record<AiLevel, string> = { facile: 'IA facile', normal: 'IA normale', fort: 'IA forte' };
  const sources: [string, string] = ['Clavier', names[level]];

  /** Fin du décompte (horloge des images, ms) : jusque-là, la situation est en place mais le jeu attend. */
  let countdownUntil = 0;
  const countdown = createCountdown();

  /** Remet la situation au départ, avec une IA neuve : même situation, même ouverture, après le décompte. */
  const replay = (): void => {
    if (!situation) return;
    bot = new Bot(1, 2, AI_LEVELS[level]);
    situation.start(duel);
    countdownUntil = situation.workshop ? 0 : performance.now() + COUNTDOWN * 1000;
  };
  /** Atelier : pas où la balle est ressortie de sa vitre sans qu'il l'ait jouée. */
  let goneSince: number | null = null;
  /** Journal des frappes et bouton Y « raté » : ouverts avec le premier atelier. */
  let journal: SwingJournal | null = null;
  const panel = createLaboPanel(stored, level, {
    chooseSituation(next) {
      situation = next;
      if (next.workshop) journal ??= createSwingJournal(true);
      won = played = 0;
      replay();
    },
    replay,
    setLevel(next) {
      level = next;
      sources[1] = names[level];
      replay();
    },
    feelChanged() {
      applyFeel(duel.profile, stored.feel);
      saveFeel(stored);
    },
  });
  const padTest = createPadTest(
    () => settings.padStyle,
    (style) => {
      settings.padStyle = style;
      saveSettings(settings);
    },
  );
  // Pause (Échap, Start, ou le bouton en haut à droite), la même qu'en match : « Recommencer » rejoue la situation.
  const pause = createPauseMenu(settings, {
    online: false,
    onChange: (s, restart) => {
      duel.players[0].prepMove = s.prepMove;
      if (restart) replay();
    },
    onTestPad: () => padTest.open(),
    onQuit: () => (location.search = ''),
    blocked: () => padTest.isOpen,
  });
  const paused = (): boolean => pause.isOpen || padTest.isOpen || (journal?.isOpen ?? false);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR' && !event.repeat && !paused()) replay();
  });

  /** Frappe au geste du stick droit, une par manette. */
  const swings = swingEnabled() ? ([new SwingStick(), new SwingStick()] as const) : null;
  const inputs = createInputDisplay(swings);
  let keyboardLayout: ReadonlyMap<string, string> | null = null;
  void loadKeyboardLayout().then((layout) => (keyboardLayout = layout));
  const states: [PadState | null, null] = [null, null];
  const buttons: [InputSource, null] = [{ kind: 'keyboard', player: 0 }, null];

  const sample = (): [ArcadeCommands, ArcadeCommands] => {
    const pad = connectedGamepads()[0];
    sources[0] = pad ? 'Manette 1' : 'Clavier';
    // Contre-vitre proposée : le geste du stick droit s'inverse (vers l'avant pour préparer).
    if (swings) swings[0].wallReady = duel.counterWallReady(0);
    // Manette, clavier et souris : un seul stick droit, le plus poussé, et un seul geste reconnu.
    const state = applySwing(mergePads(pad ? readGamepad(pad) : IDLE_PAD, keyboard.read(0, SIM_DT)), swings?.[0], SIM_DT);
    states[0] = state;
    // Atelier : Y signale un coup raté ; L1 / R1 (contre-vitre) est noté.
    if (pad) journal?.flag(duel, 0, state.face === 'lob');
    if (pad) journal?.wallButton(duel, 0, state.wallButton ?? false);
    buttons[0] = pad ? { kind: 'pad', family: resolvePadFamily(settings.padStyle, pad) } : { kind: 'keyboard', player: 0, layout: keyboardLayout };
    return [toCommands(state, true), bot.commands(duel)];
  };

  let hitstopUntil = 0;
  const loop = new FixedStepLoop(SIM_DT, () => {
    duel.step(sample());
    view.afterStep();
    inputs.step(duel, states);
    journal?.step(duel, [swings?.[0] ?? null, null]);
    if (settings.sound) {
      for (const contact of duel.contacts) sounds.contact(contact);
      if (duel.shot) sounds.shot({ ...duel.shot, quality: duel.shot.perfect ? 1 : 0.7 });
    }
    if (duel.shot?.perfect) {
      hitstopUntil = performance.now() + 40;
      view.shake(0.5);
    }
    if (duel.result) {
      played++;
      if (duel.result.winner === 0) won++;
    }
    // Point terminé : la même situation repart. Atelier : la balle suivante, dès que celle-ci est jouée.
    const me = duel.players[0];
    const since = (tick: number): number => (duel.tick - tick) * SIM_DT;
    if (situation?.workshop) {
      const hit = me.lastHitTick > duel.phaseTick && since(me.lastHitTick) >= WORKSHOP_AFTER_HIT;
      const missed = me.lastWhiffTick > duel.phaseTick && since(me.lastWhiffTick) >= WORKSHOP_AFTER_MISS;
      const over = duel.phase === 'dead' && since(duel.phaseTick) >= WORKSHOP_AFTER_MISS;
      // Ressortie de sa vitre du fond sans qu'il l'ait jouée : plus de contre-vitre possible, la suivante.
      const ball = duel.ball;
      const gone = ball !== null && me.lastHitTick <= duel.phaseTick && duel.touchedGlass && ball.vel.z * me.side < 0 && ball.pos.z * me.side > 0;
      if (gone) goneSince ??= duel.tick;
      else goneSince = null;
      const passed = goneSince !== null && since(goneSince) >= WORKSHOP_AFTER_MISS;
      if (hit || missed || over || passed) {
        goneSince = null;
        replay();
      }
    } else if (duel.phase === 'dead' && since(duel.phaseTick) >= REPLAY_DELAY) replay();
  });

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__duel = { duel, Bot };

  let last = performance.now();
  let alpha = 0;
  let startHeld = false;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    // Start sur n'importe quelle manette : ouvre ou ferme la pause.
    const start = connectedGamepads().some((pad) => pad.buttons[START_BUTTON]?.pressed ?? false);
    if (start && !startHeld && !padTest.isOpen) pause.toggle();
    startHeld = start;
    // En pause, le décompte attend aussi.
    if (paused()) countdownUntil += frameTime * 1000;
    const waiting = now < countdownUntil;
    countdown.style.display = waiting ? '' : 'none';
    if (waiting) countdown.textContent = String(Math.ceil((countdownUntil - now) / 1000));
    if (now >= hitstopUntil && !waiting && !paused()) alpha = loop.advance(frameTime);
    view.render(alpha, frameTime, now < hitstopUntil || paused());
    hud.update(duel, sources, buttons, true);
    panel.update(won, played, buttons[0]);
    inputs.render(duel, states, buttons, paused() || settings.inputDisplay === 'off' ? 'off' : 'full');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
