import { describe, expect, it } from 'vitest';
import { Bot, DEFAULT_BOT, type BotOptions } from '../../src/sim/bot';
import { Duel, type PointResult } from '../../src/sim/duel';

/**
 * Fait jouer deux joueurs automatiques pendant `seconds` secondes simulées, via les mêmes commandes
 * qu'une manette. Retourne les échanges terminés, plus celui en cours à la fin.
 */
function play(seconds: number, seed: number, options: BotOptions = DEFAULT_BOT): { results: PointResult[]; ongoing: number } {
  const duel = new Duel();
  const bots = [new Bot(0, seed, options), new Bot(1, seed + 1, options)] as const;
  const results: PointResult[] = [];
  while (duel.time < seconds) {
    duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
    if (duel.result) results.push(duel.result);
  }
  return { results, ongoing: duel.phase === 'rally' ? duel.hits : 0 };
}

describe('échange arcade 1 contre 1', () => {
  it('deux joueurs automatiques tiennent des échanges d’au moins 10 coups', () => {
    for (const seed of [7, 21, 99]) {
      const { results, ongoing } = play(600, seed);
      const lengths = [...results.map((r) => r.hits), ongoing].filter((n) => n > 0);
      const reasons = results.map((r) => r.reason);
      console.log(`seed ${seed} · longueurs : ${lengths.join(', ')} · fins : ${reasons.join(', ')}`);
      // La moitié des coups joués au moins le sont dans des échanges de 10 coups ou plus.
      const total = lengths.reduce((a, b) => a + b, 0);
      const inLong = lengths.filter((n) => n >= 10).reduce((a, b) => a + b, 0);
      expect(Math.max(...lengths)).toBeGreaterThanOrEqual(10);
      expect(inLong / total).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('est déterministe : mêmes commandes, même échange', () => {
    const summary = (): string[] => play(120, 3).results.map((r) => `${r.hits}:${r.reason}:${r.winner}`);
    const a = summary();
    const b = summary();
    expect(a).toEqual(b);
  });
});
