import { createSounds } from '../audio/sounds';
import { connectedGamepads, IDLE_PAD, mergePads, readGamepad, swingEnabled, toCommands, type PadState } from '../input/gamepad';
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
import { loadSettings } from '../ui/duelSettings';
import { loadFeel, saveFeel } from '../ui/feelStorage';
import { createLaboPanel } from '../ui/laboPanel';

/** Pause entre la fin d'un point et la reprise de la situation (s). */
const REPLAY_DELAY = 1;

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
  duel.players[0].assist = settings.assists[0];

  const view = createDuelView(canvas, duel);
  const hud = createDuelHud();
  const keyboard = createKeyboardPads();
  const sounds = createSounds();
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  window.addEventListener('gamepadconnected', () => sounds.unlock());

  let level: AiLevel = settings.players[1] === 'humain' ? 'normal' : settings.players[1];
  let situation: Situation | null = null;
  let bot = new Bot(1, 2, AI_LEVELS[level]);
  let won = 0;
  let played = 0;
  const names: Record<AiLevel, string> = { facile: 'IA facile', normal: 'IA normale', fort: 'IA forte' };
  const sources: [string, string] = ['Clavier', names[level]];

  /** Remet la situation au départ, avec une IA neuve : même situation, même ouverture. */
  const replay = (): void => {
    if (!situation) return;
    bot = new Bot(1, 2, AI_LEVELS[level]);
    situation.start(duel);
  };
  const panel = createLaboPanel(stored, level, {
    chooseSituation(next) {
      situation = next;
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
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR' && !event.repeat) replay();
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
    const state = mergePads(pad ? readGamepad(pad, swings?.[0], SIM_DT) : IDLE_PAD, keyboard.read(0));
    states[0] = state;
    buttons[0] = pad ? { kind: 'pad', family: resolvePadFamily(settings.padStyle, pad) } : { kind: 'keyboard', player: 0, layout: keyboardLayout };
    return [toCommands(state, true), bot.commands(duel)];
  };

  let hitstopUntil = 0;
  const loop = new FixedStepLoop(SIM_DT, () => {
    duel.step(sample());
    view.afterStep();
    inputs.step(duel, states);
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
    // Point terminé : la même situation repart.
    if (duel.phase === 'dead' && (duel.tick - duel.phaseTick) * SIM_DT >= REPLAY_DELAY) replay();
  });

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__duel = { duel, Bot };

  let last = performance.now();
  let alpha = 0;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    if (now >= hitstopUntil) alpha = loop.advance(frameTime);
    view.render(alpha, frameTime, now < hitstopUntil);
    hud.update(duel, sources, buttons);
    panel.update(won, played, buttons[0]);
    inputs.render(duel, states, buttons, settings.inputDisplay);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
