import { AI_LEVELS, Bot } from '../sim/bot';
import { SIM_DT } from '../sim/constants';
import { Duel } from '../sim/duel';
import { quantizeCommands } from './codec';
import { hashHex } from './hash';

/**
 * Match de référence pour vérifier que tous les moteurs JavaScript calculent la même chose
 * (`tests/e2e/determinisme.spec.ts`) : un double entre quatre IA, graine fixe, commandes arrondies comme en ligne.
 * Rend l'empreinte de l'état à chaque seconde (pour dire quand deux moteurs divergent) et à la fin.
 */
export function playReferenceMatch(seconds = 30): { hashes: string[]; final: string; shots: number; points: number } {
  const duel = new Duel({ setsToWin: 1, gamesPerSet: 6, goldenPoint: false }, 'double');
  const bots = duel.players.map((_, i) => new Bot(i, 101 + i, AI_LEVELS.normal));
  const hashes: string[] = [];
  let shots = 0;
  let points = 0;
  const perSecond = Math.round(1 / SIM_DT);
  for (let t = 1; t <= seconds * perSecond; t++) {
    duel.step(bots.map((bot) => quantizeCommands(bot.commands(duel))));
    if (duel.shot) shots++;
    if (duel.result) points++;
    if (t % perSecond === 0) hashes.push(hashHex(duel));
  }
  return { hashes, final: hashHex(duel), shots, points };
}
