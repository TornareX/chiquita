import { createAnnouncer } from '../audio/announcer';
import { shotPower, SqueakDetector, stepCrowdReactions, VOICES } from '../audio/recipes';
import { CrowdMood } from '../render/arena';
import { createSounds } from '../audio/sounds';
import { connectedGamepads, IDLE_PAD, mergePads, readGamepad, swingEnabled, toCommands, type PadState } from '../input/gamepad';
import { highFloorFromUrl, SwingStick } from '../input/swingStick';
import { createKeyboardPads } from '../input/keyboardArcade';
import { resolvePadFamily } from '../input/padStyle';
import { createDuelView } from '../render/duelScene';
import { AI_LEVELS, Bot } from '../sim/bot';
import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import { ASSIST_LEVELS, Duel } from '../sim/duel';
import { FixedStepLoop } from '../sim/loop';
import type { MatchRules } from '../sim/score';
import { loadKeyboardLayout, type InputSource } from '../ui/buttonIcons';
import { createDuelHud } from '../ui/duelHud';
import { createInputDisplay } from '../ui/inputDisplay';
import { createPadTest } from '../ui/padTest';
import { createSettingsMenu, loadSettings, saveSettings, type DuelSettings } from '../ui/duelSettings';
import { loadFeel } from '../ui/feelStorage';
import { applyFeel } from '../sim/feel';

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
 * Mode principal (GAME_DESIGN.md §12) : match en 1 contre 1 ou en 2 contre 2, une manette par joueur, au
 * clavier ou contre l'IA. Tout se règle dans le menu (Échap ou Start) : simple ou double, qui joue chaque place,
 * assistance, pression, son, règles du match. Les réglages sont mémorisés dans le navigateur. Raccourcis d'URL,
 * pour les tests :
 * - `?double=1` : 2 contre 2 (manettes 1 à 4 pour Bleu 1, Rouge 1, Bleu 2, Rouge 2) ;
 * - `?ai=facile|normal|fort` : l'IA joue Rouge (ou les joueurs donnés par `?bot=1|2|both|none`, ou `?bot=2,3,4`) ;
 * - `?sets=2`, `?games=4`, `?gold=1` (punto de oro), `?free=1` (échange libre sans score) ;
 * - `?pression=0` (sans), `0.5`, `1.5` ; `?far=own` ; `?assist=full|partial|off|magnet` ou `?assist=full,off`.
 */
export function startDuel(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const settings = loadSettings(params);
  const rulesOf = (s: DuelSettings): MatchRules | null =>
    s.match.free ? null : { setsToWin: s.match.setsToWin, gamesPerSet: s.match.gamesPerSet, goldenPoint: s.match.goldenPoint };
  const duel = new Duel(rulesOf(settings), settings.match.doubles ? 'double' : 'simple');
  duel.highFloor = highFloorFromUrl();
  // Sensations réglées dans le labo, si on a choisi de les garder en match.
  const feel = loadFeel();
  if (feel.inMatch) applyFeel(duel.profile, feel.feel);
  const view = createDuelView(canvas, duel);
  const hud = createDuelHud();
  const keyboard = createKeyboardPads();
  const audio = createSounds();
  const sounds = muteable(audio, () => settings.sound);
  const announcer = createAnnouncer();
  /** Ambiance de la salle : la même humeur que la foule dessinée, pour le fond sonore. */
  const mood = new CrowdMood();
  const squeaks = new SqueakDetector();
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  // Une manette ne s'annonce qu'à son premier bouton : le son se débloque aussi à ce moment.
  window.addEventListener('gamepadconnected', () => sounds.unlock());

  let bots: (Bot | null)[] = [];
  const sources: string[] = ['Clavier', 'Clavier', 'Clavier', 'Clavier'];
  /** Applique les réglages à la partie en cours ; `restart` relance une partie avec les nouvelles règles (et le format). */
  const apply = (s: DuelSettings, restart: boolean): void => {
    if (restart) {
      duel.rules = rulesOf(s);
      duel.format = s.match.doubles ? 'double' : 'simple';
      duel.restart();
    }
    // En double, une IA dont le partenaire est humain se cale sur lui (les deux au filet ou les deux au fond).
    bots = duel.players.map((_, i) => {
      const c = s.players[i]!;
      if (c === 'humain') return null;
      const partner = duel.partnerOf(i);
      const followPartner = partner !== null && s.players[partner] === 'humain';
      return new Bot(i, i + 1, { ...AI_LEVELS[c], followPartner });
    });
    duel.players.forEach((player, i) => {
      player.assist = s.assists[i]!;
      // Les IA gardent le stick libre : le réglage ne change que le ressenti des humains.
      player.prepMove = s.players[i] === 'humain' ? s.prepMove : 'libre';
    });
    duel.profile.rally.pressure.scale = s.pressure;
  };
  apply(settings, false);
  const padTest = createPadTest(
    () => settings.padStyle,
    (style) => {
      settings.padStyle = style;
      saveSettings(settings);
    },
  );
  const menu = createSettingsMenu(settings, apply, () => padTest.open());
  /** Frappe au geste du stick droit, une par manette. */
  const swings = swingEnabled() ? [new SwingStick(), new SwingStick(), new SwingStick(), new SwingStick()] : null;
  const inputs = createInputDisplay(swings);
  let keyboardLayout: ReadonlyMap<string, string> | null = null;
  void loadKeyboardLayout().then((layout) => (keyboardLayout = layout));
  /** État lu au dernier pas pour chaque humain, et ce qu'il tient en main (`null` : IA). */
  const states: (PadState | null)[] = [null, null, null, null];
  const buttons: (InputSource | null)[] = [null, null, null, null];

  /** Bouton d'assistance maintenu au pas précédent : un appui fait passer au niveau suivant. */
  const assistHeld = [false, false, false, false];

  /**
   * Commandes de chaque joueur : manette n° i pour le joueur i ; le clavier en complément pour les deux
   * premiers (Bleu et Rouge, ou Bleu 1 et Rouge 1 en double).
   */
  const sample = (): ArcadeCommands[] => {
    const pads = connectedGamepads();
    const read = (index: number): ArcadeCommands => {
      const bot = bots[index];
      const controller = settings.players[index]!;
      if (bot && controller !== 'humain') {
        sources[index] = AI_NAMES[controller];
        states[index] = buttons[index] = null;
        return bot.commands(duel);
      }
      const pad = pads[index];
      sources[index] = pad ? `Manette ${index + 1}` : 'Clavier';
      const typed = index < 2 ? keyboard.read(index as 0 | 1) : IDLE_PAD;
      const state: PadState = mergePads(pad ? readGamepad(pad, swings?.[index], SIM_DT) : IDLE_PAD, typed);
      states[index] = state;
      buttons[index] = pad
        ? { kind: 'pad', family: resolvePadFamily(settings.padStyle, pad) }
        : { kind: 'keyboard', player: (index % 2) as 0 | 1, layout: keyboardLayout };
      if (state.assistButton && !assistHeld[index]) {
        const player = duel.players[index]!;
        player.assist = ASSIST_LEVELS[(ASSIST_LEVELS.indexOf(player.assist) + 1) % ASSIST_LEVELS.length]!;
        settings.assists[index] = player.assist;
      }
      assistHeld[index] = state.assistButton;
      return toCommands(state, duel.players[index]!.side < 0, settings.farOwnView);
    };
    return duel.players.map((_, i) => read(i));
  };

  /** Micro-pause sur une frappe parfaite : fin de la pause, en temps réel (ms). */
  let hitstopUntil = 0;
  const loop = new FixedStepLoop(SIM_DT, () => {
    duel.step(sample());
    view.afterStep();
    inputs.step(duel, states);
    for (const contact of duel.contacts) sounds.contact(contact);
    duel.players.forEach((player, i) => {
      const squeak = squeaks.update(i, player.vel, SIM_DT);
      if (squeak > 0) sounds.squeak(player.pos, squeak);
    });
    for (const reaction of stepCrowdReactions(duel)) {
      sounds.crowd(reaction);
      mood.react(reaction);
      // Grand point : le gagnant crie « ¡Vamos! » (celui des deux partenaires qui a frappé le dernier).
      if (duel.result && reaction.kind !== 'ooh' && reaction.intensity >= 0.6 && settings.sound) {
        const winners = duel.teamPlayers(duel.result.winner);
        const shouter = winners.reduce((a, b) => (duel.players[b]!.lastHitTick > duel.players[a]!.lastHitTick ? b : a));
        setTimeout(() => announcer.shout('¡Vamos!', VOICES[shouter % VOICES.length]!), 150);
      }
    }
    if (duel.shot) {
      const { shot } = duel;
      // Le contact sonne plein quand le relâcher est bien placé, creux quand il est très en avance ou en retard.
      const quality = shot.perfect ? 1 : Math.max(0.25, 0.85 - (Math.abs(shot.timing) / 0.12) * 0.6);
      sounds.shot({ ...shot, quality });
      sounds.grunt(shot.contact, shotPower(shot), VOICES[shot.player % VOICES.length]!);
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
    if (start && !startHeld && !padTest.isOpen) menu.toggle();
    startHeld = start;
    // Menu ouvert : partie en pause. Micro-pause : simulation figée, le temps réel écoulé n'est pas rattrapé.
    if (!menu.isOpen && !padTest.isOpen && now >= hitstopUntil) alpha = loop.advance(frameTime);
    view.render(alpha, frameTime, now < hitstopUntil);
    mood.update(frameTime);
    // Hors du proxy muet : couper le son doit aussi couper le fond sonore.
    audio.ambience(settings.sound && !menu.isOpen ? mood.stir : -1);
    hud.update(duel, sources, buttons);
    inputs.render(duel, states, buttons, settings.inputDisplay && !menu.isOpen && !padTest.isOpen);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
