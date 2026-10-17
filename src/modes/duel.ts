import { crowdReaction } from '../audio/recipes';
import { createSounds } from '../audio/sounds';
import { connectedGamepads, IDLE_PAD, mergePads, readGamepad, toCommands, type PadState } from '../input/gamepad';
import { createKeyboardPads } from '../input/keyboardArcade';
import { createDuelView } from '../render/duelScene';
import { AI_LEVELS, Bot } from '../sim/bot';
import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import { ASSIST_LEVELS, Duel } from '../sim/duel';
import { FixedStepLoop } from '../sim/loop';
import type { MatchRules } from '../sim/score';
import { createDuelHud } from '../ui/duelHud';
import { createSettingsMenu, loadSettings, type DuelSettings } from '../ui/duelSettings';

const AI_NAMES = { facile: 'IA facile', normal: 'IA normale', fort: 'IA forte' } as const;

/** Bouton Start (Menu) de la disposition standard : ouvre et ferme les réglages. */
const START_BUTTON = 9;

/** Les sons ne jouent que si `audible()` ; le déblocage du son par le navigateur passe toujours. */
function muteable<T extends object>(sounds: T, audible: () => boolean): T {
  return new Proxy(sounds, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (key === 'unlock' || typeof value !== 'function') return value;
      return (...args: unknown[]) => (audible() ? (value as (...a: unknown[]) => unknown).apply(target, args) : undefined);
    },
  });
}

/**
 * Mode principal (GAME_DESIGN.md §12) : match en 1 contre 1, à deux manettes, au clavier ou contre
 * l'IA. Tout se règle dans le menu (Échap ou Start) : qui joue chaque côté, assistance, pression,
 * son, règles du match. Les réglages sont mémorisés dans le navigateur. Raccourcis d'URL, pour les tests :
 * - `?ai=facile|normal|fort` : l'IA joue Rouge (ou les joueurs donnés par `?bot=1|2|both`) ;
 * - `?sets=2`, `?games=4`, `?gold=1` (punto de oro), `?free=1` (échange libre sans score) ;
 * - `?pression=0` (sans), `0.5`, `1.5` ; `?far=own` ; `?assist=full|partial|off|magnet` ou `?assist=full,off`.
 */
export function startDuel(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const settings = loadSettings(params);
  const rulesOf = (s: DuelSettings): MatchRules | null =>
    s.match.free ? null : { setsToWin: s.match.setsToWin, gamesPerSet: s.match.gamesPerSet, goldenPoint: s.match.goldenPoint };
  const duel = new Duel(rulesOf(settings));
  const view = createDuelView(canvas, duel);
  const hud = createDuelHud();
  const keyboard = createKeyboardPads();
  const sounds = muteable(createSounds(), () => settings.sound);
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  // Une manette ne s'annonce qu'à son premier bouton : le son se débloque aussi à ce moment.
  window.addEventListener('gamepadconnected', () => sounds.unlock());

  let bots: [Bot | null, Bot | null] = [null, null];
  const sources: [string, string] = ['Clavier', 'Clavier'];
  /** Applique les réglages à la partie en cours ; `restart` relance une partie avec les nouvelles règles. */
  const apply = (s: DuelSettings, restart: boolean): void => {
    bots = s.players.map((c, i) => (c === 'humain' ? null : new Bot(i as 0 | 1, i + 1, AI_LEVELS[c]))) as [Bot | null, Bot | null];
    duel.players.forEach((player, i) => (player.assist = s.assists[i]!));
    duel.profile.rally.pressure.scale = s.pressure;
    if (restart) {
      duel.rules = rulesOf(s);
      duel.restart();
    }
  };
  apply(settings, false);
  const menu = createSettingsMenu(settings, apply);

  /** Bouton d'assistance maintenu au pas précédent : un appui fait passer au niveau suivant. */
  const assistHeld = [false, false];

  /** Commandes des deux joueurs : manette n° i pour le joueur i, clavier en complément. */
  const sample = (): [ArcadeCommands, ArcadeCommands] => {
    const pads = connectedGamepads();
    const read = (index: 0 | 1): ArcadeCommands => {
      const bot = bots[index];
      const controller = settings.players[index];
      if (bot && controller !== 'humain') {
        sources[index] = AI_NAMES[controller];
        return bot.commands(duel);
      }
      const pad = pads[index];
      sources[index] = pad ? `Manette ${index + 1}` : 'Clavier';
      const state: PadState = mergePads(pad ? readGamepad(pad) : IDLE_PAD, keyboard.read(index));
      if (state.assistButton && !assistHeld[index]) {
        const player = duel.players[index];
        player.assist = ASSIST_LEVELS[(ASSIST_LEVELS.indexOf(player.assist) + 1) % ASSIST_LEVELS.length]!;
        settings.assists[index] = player.assist;
      }
      assistHeld[index] = state.assistButton;
      return toCommands(state, index === 0, settings.farOwnView);
    };
    return [read(0), read(1)];
  };

  /** Micro-pause sur une frappe parfaite : fin de la pause, en temps réel (ms). */
  let hitstopUntil = 0;
  const loop = new FixedStepLoop(SIM_DT, () => {
    duel.step(sample());
    for (const contact of duel.contacts) {
      sounds.contact(contact);
      // Balle qui passe le mur après son rebond : le public retient son souffle (por tres en vue).
      if (contact.surface === 'out' && duel.exit) sounds.crowd({ kind: 'ooh', intensity: 0.8 });
    }
    if (duel.result) {
      const winnerShot = duel.players[duel.result.winner].lastHit;
      const reaction = crowdReaction(duel.result, winnerShot);
      if (reaction) sounds.crowd(reaction);
    }
    if (duel.shot) {
      const { shot } = duel;
      // Le contact sonne plein quand le relâcher est bien placé, creux quand il est très en avance ou en retard.
      const quality = shot.perfect ? 1 : Math.max(0.25, 0.85 - (Math.abs(shot.timing) / 0.12) * 0.6);
      sounds.shot({ ...shot, quality });
      if (shot.perfect) {
        hitstopUntil = performance.now() + 40; // [à calibrer VT4]
        view.shake(0.5);
      }
      // Le remate secoue la caméra, même sans frappe parfaite (GAME_DESIGN.md §6). [à calibrer]
      if (shot.overhead === 'remate') view.shake(shot.perfect ? 1 : 0.6);
    }
  });

  const debug = import.meta.env.DEV || params.has('debug');
  if (debug) window.__duel = { duel, Bot };

  let last = performance.now();
  let alpha = 0;
  let startHeld = false;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    // Start sur n'importe quelle manette : ouvre ou ferme les réglages.
    const start = connectedGamepads().some((pad) => pad.buttons[START_BUTTON]?.pressed ?? false);
    if (start && !startHeld) menu.toggle();
    startHeld = start;
    // Menu ouvert : partie en pause. Micro-pause : simulation figée, le temps réel écoulé n'est pas rattrapé.
    if (!menu.isOpen && now >= hitstopUntil) alpha = loop.advance(frameTime);
    view.render(alpha, frameTime);
    hud.update(duel, sources);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
