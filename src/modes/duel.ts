import { createSounds } from '../audio/sounds';
import { connectedGamepads, IDLE_PAD, mergePads, readGamepad, toCommands, type PadState } from '../input/gamepad';
import { createKeyboardPads } from '../input/keyboardArcade';
import { createDuelView } from '../render/duelScene';
import { AI_LEVEL_NAMES, AI_LEVELS, Bot, DEFAULT_BOT, type AiLevel } from '../sim/bot';
import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import { ASSIST_LEVELS, Duel, type AssistLevel } from '../sim/duel';
import { FixedStepLoop } from '../sim/loop';
import { DEFAULT_RULES, type MatchRules } from '../sim/score';
import { createDuelHud } from '../ui/duelHud';

/**
 * Mode principal (GAME_DESIGN.md §12, étape B) : match en 1 contre 1, à deux manettes, au clavier
 * ou contre l'IA. Paramètres :
 * - `?ai=facile|normal|fort` : l'IA joue Rouge (ou les joueurs donnés par `?bot=`) ;
 * - `?bot=1`, `?bot=2` ou `?bot=both` : joueur automatique à la place d'un humain ;
 * - `?sets=2` (deux sets gagnants, sinon un), `?games=4` (jeux par set), `?gold=1` (punto de oro) ;
 * - `?free=1` : échange libre sans score (étape A) ;
 * - `?far=own` (directions du joueur d'en face vues de son côté),
 *   `?assist=full|partial|off` ou `?assist=full,off` (assistance de chaque joueur, sinon complète).
 */
export function startDuel(canvas: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const positive = (name: string, fallback: number): number => {
    const value = Number(params.get(name));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  const rules: MatchRules | null = params.has('free')
    ? null
    : {
        setsToWin: positive('sets', DEFAULT_RULES.setsToWin),
        gamesPerSet: positive('games', DEFAULT_RULES.gamesPerSet),
        goldenPoint: params.get('gold') === '1',
      };
  const duel = new Duel(rules);
  const view = createDuelView(canvas, duel);
  const hud = createDuelHud();
  const keyboard = createKeyboardPads();
  const sounds = createSounds();
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => sounds.unlock(), { once: true });
  }
  // Une manette ne s'annonce qu'à son premier bouton : le son se débloque aussi à ce moment.
  window.addEventListener('gamepadconnected', () => sounds.unlock());

  const farOwnView = params.get('far') === 'own';
  const aiParam = params.get('ai');
  const ai = AI_LEVEL_NAMES.includes(aiParam as AiLevel) ? (aiParam as AiLevel) : null;
  const botOptions = ai ? AI_LEVELS[ai] : DEFAULT_BOT;
  // `?ai=` seul : l'IA prend Rouge.
  const botParam = params.get('bot') ?? (ai ? '2' : null);
  const bots = [
    botParam === '1' || botParam === 'both' ? new Bot(0, 1, botOptions) : null,
    botParam === '2' || botParam === 'both' ? new Bot(1, 2, botOptions) : null,
  ] as const;
  const sources: [string, string] = ['Clavier', 'Clavier'];

  const assists = (params.get('assist') ?? '').split(',');
  duel.players.forEach((player, i) => {
    const level = assists[i] ?? assists[0];
    if (ASSIST_LEVELS.includes(level as AssistLevel)) player.assist = level as AssistLevel;
  });
  /** Bouton d'assistance maintenu au pas précédent : un appui fait passer au niveau suivant. */
  const assistHeld = [false, false];

  /** Commandes des deux joueurs : manette n° i pour le joueur i, clavier en complément. */
  const sample = (): [ArcadeCommands, ArcadeCommands] => {
    const pads = connectedGamepads();
    const read = (index: 0 | 1): ArcadeCommands => {
      const bot = bots[index];
      if (bot) {
        sources[index] = ai ? `IA ${ai}` : 'joueur automatique';
        return bot.commands(duel);
      }
      const pad = pads[index];
      sources[index] = pad ? `Manette ${index + 1}` : 'Clavier';
      const state: PadState = mergePads(pad ? readGamepad(pad) : IDLE_PAD, keyboard.read(index));
      if (state.assistButton && !assistHeld[index]) {
        const player = duel.players[index];
        player.assist = ASSIST_LEVELS[(ASSIST_LEVELS.indexOf(player.assist) + 1) % ASSIST_LEVELS.length]!;
      }
      assistHeld[index] = state.assistButton;
      return toCommands(state, index === 0, farOwnView);
    };
    return [read(0), read(1)];
  };

  /** Micro-pause sur une frappe parfaite : fin de la pause, en temps réel (ms). */
  let hitstopUntil = 0;
  const loop = new FixedStepLoop(SIM_DT, () => {
    duel.step(sample());
    for (const contact of duel.contacts) sounds.contact(contact);
    if (duel.shot) {
      const { shot } = duel;
      sounds.shot({
        quality: shot.perfect ? 1 : 0.7,
        perfect: shot.perfect,
        speed: shot.speed,
        timing: 0,
        side: 1,
        soft: false,
        contact: shot.contact,
      });
      if (shot.perfect) {
        hitstopUntil = performance.now() + 40; // [à calibrer VT4]
        view.shake(0.5);
      }
    }
  });

  const debug = import.meta.env.DEV || params.has('debug');
  if (debug) window.__duel = { duel, Bot };

  let last = performance.now();
  let alpha = 0;
  const frame = (now: number): void => {
    const frameTime = (now - last) / 1000;
    last = now;
    // Pendant la micro-pause, la simulation est figée ; le temps réel écoulé n'est pas rattrapé.
    if (now >= hitstopUntil) alpha = loop.advance(frameTime);
    view.render(alpha, frameTime);
    hud.update(duel, sources);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
