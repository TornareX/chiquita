import { describe, expect, it } from 'vitest';
import { AI_LEVELS, Bot, type BotOptions } from '../../src/sim/bot';
import { createBall } from '../../src/sim/ball';
import { HALF_LENGTH } from '../../src/sim/constants';
import { planIntercept } from '../../src/sim/assist';
import { predictBall } from '../../src/sim/predict';
import { Duel, HOME_DEPTH, type PointReason } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { DEFAULT_RULES } from '../../src/sim/score';
import { aimTarget, solveShot } from '../../src/sim/shots';
import { vec3 } from '../../src/sim/vec3';

/**
 * Jeu par les vitres (GAME_DESIGN.md §5) : la défense se joue après la vitre du fond, et les points
 * se gagnent au filet. Mesuré avec deux joueurs automatiques qui ne passent que par les commandes.
 */
function play(seconds: number, seed: number, a: BotOptions, b: BotOptions) {
  const duel = new Duel(DEFAULT_RULES);
  const bots = [new Bot(0, seed, a), new Bot(1, seed + 1, b)] as const;
  let glass = false;
  let whiffed = false;
  const stats = { points: 0, hits: 0, winners: 0, backShots: 0, afterGlass: 0, volleys: 0, wins: [0, 0] };
  const winnerReasons: PointReason[] = ['second-bounce', 'not-returned'];
  while (duel.time < seconds) {
    if (duel.phase === 'over') duel.restart();
    duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
    for (const c of duel.contacts) if (c.surface === 'glass') glass = true;
    for (const p of duel.players) if (p.lastWhiffTick === duel.tick - 1) whiffed = true;
    const shot = duel.shot;
    if (shot) {
      if (!shot.serve && Math.abs(shot.contact.z) > 7) {
        stats.backShots++;
        if (glass) stats.afterGlass++;
      }
      if (shot.volley) stats.volleys++;
      glass = false;
    }
    const result = duel.result;
    if (result) {
      stats.points++;
      stats.hits += result.hits;
      stats.wins[result.winner]!++;
      // Coup gagnant : l'adversaire n'a pas pu la renvoyer, sans avoir raté sa frappe.
      if (winnerReasons.includes(result.reason) && !whiffed) stats.winners++;
      whiffed = false;
    }
  }
  return stats;
}

describe('jeu par les vitres', () => {
  it('une balle profonde se laisse passer et se joue après la vitre', () => {
    const p = structuredClone(ARCADE);
    const contact = vec3(0.5, 1, -9);
    const target = aimTarget('normal', -1, { forward: 0, right: 0 }, false, p);
    const shot = solveShot('normal', contact, target, false, p);
    const ball = createBall(contact, shot.vel, shot.spin);
    const plan = planIntercept(ball, vec3(0, 0, HOME_DEPTH), 1, 0, p)!;
    expect(plan.reachable).toBe(true);
    expect(plan.volley).toBe(false);
    // Après la vitre, une fois la balle décollée de la vitre.
    const { glassStep } = predictBall(ball, p, 5, 1);
    expect(glassStep).not.toBeNull();
    expect(plan.tick).toBeGreaterThan(glassStep!);
    expect(HALF_LENGTH - plan.contact.z).toBeGreaterThanOrEqual(p.rally.glassGap);
  });

  it('IA normale : la défense passe par la vitre, les points se gagnent et se perdent comme au padel', () => {
    const s = play(900, 3, AI_LEVELS.normal, AI_LEVELS.normal);
    const perPoint = s.hits / s.points;
    console.log(
      `points ${s.points}, ${perPoint.toFixed(1)} coups/point, gagnants ${s.winners}, ` +
        `après vitre ${s.afterGlass}/${s.backShots} coups du fond, volées ${s.volleys}`,
    );
    // Pros : 8 à 11 coups par point, environ 1/3 de coups gagnants, 2/3 de fautes.
    expect(perPoint).toBeGreaterThan(5);
    expect(perPoint).toBeLessThan(14);
    expect(s.winners / s.points).toBeGreaterThan(0.15);
    expect(s.winners / s.points).toBeLessThan(0.6);
    expect(s.afterGlass / s.backShots).toBeGreaterThan(0.7);
    expect(s.volleys).toBeGreaterThan(s.points);
  }, 30000);

  it('le fort conclut au filet contre le facile', () => {
    const s = play(600, 7, AI_LEVELS.facile, AI_LEVELS.fort);
    expect(s.wins[1]).toBeGreaterThan(s.wins[0]! * 3);
    expect(s.winners).toBeGreaterThan(5);
  }, 30000);
});
