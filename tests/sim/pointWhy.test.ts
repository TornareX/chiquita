import { describe, expect, it } from 'vitest';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, teamOf } from '../../src/sim/duel';
import { SHORT_RULES } from '../../src/sim/score';
import { dominantCause, TIPS } from '../../src/ui/matchReport';

/** Match d'IA joué jusqu'au bout, en notant chaque fin de point. */
function playMatch(seed: number) {
  const duel = new Duel(SHORT_RULES);
  const bots = duel.players.map((_, i) => new Bot(i, seed + i, AI_LEVELS.normal));
  const results = [];
  while (duel.phase !== 'over' && duel.tick < 1800 / SIM_DT) {
    duel.step(bots.map((b) => b.commands(duel)));
    if (duel.result) results.push(duel.result);
  }
  return { duel, results };
}

describe('point expliqué et bilan du match', () => {
  const { duel, results } = playMatch(21);

  it('chaque point a son coup décisif : gagnant de l’équipe qui marque, faute de celle qui perd', () => {
    expect(duel.phase).toBe('over');
    for (const r of results) {
      if (r.how === 'doubleFaute') continue;
      expect(r.by).not.toBeNull();
      expect(r.shot?.player).toBe(r.by);
      if (r.how === 'gagnant') expect(teamOf(r.by!)).toBe(r.winner);
      else expect(teamOf(r.by!)).not.toBe(r.winner);
      if (r.how === 'provoquee') expect(r.shot!.pressure).toBeGreaterThanOrEqual(0.6);
      if (r.whiff) expect(teamOf(r.whiff.player)).not.toBe(r.winner);
    }
    expect(new Set(results.map((r) => r.how)).size).toBeGreaterThanOrEqual(2);
  });

  it('le bilan compte les frappes, les coups gagnants et les fautes de chacun', () => {
    const shots = duel.stats.reduce((sum, s) => sum + s.shots, 0);
    expect(shots).toBeGreaterThan(results.length);
    for (const s of duel.stats) {
      expect(Object.values(s.quality).reduce((a, b) => a + b, 0)).toBe(s.shots);
      expect(s.perfects).toBe(s.quality.parfait);
    }
    const winners = duel.stats.reduce((sum, s) => sum + s.winners, 0);
    const lost = duel.stats.reduce((sum, s) => sum + s.errors + s.forced, 0);
    expect(winners + lost).toBe(results.length);
  });

  it('la faute la plus fréquente donne le conseil, et une nouvelle partie remet le bilan à zéro', () => {
    for (const s of duel.stats) {
      const cause = dominantCause(s);
      if (cause) expect(TIPS[cause].length).toBeGreaterThan(20);
    }
    duel.restart();
    expect(duel.stats.every((s) => s.shots === 0 && s.winners === 0 && s.errors === 0)).toBe(true);
  });
});
