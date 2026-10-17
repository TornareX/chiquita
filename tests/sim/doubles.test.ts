import { describe, expect, it } from 'vitest';
import { AI_LEVELS, Bot, type BotOptions } from '../../src/sim/bot';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, teamOf, type DuelShot, type PointResult } from '../../src/sim/duel';
import { Match } from '../../src/sim/score';
import { inServiceBox } from '../../src/sim/serve';

/** Stats d'un match en double joué par quatre IA, via les mêmes commandes qu'une manette. */
interface DoublesStats {
  results: PointResult[];
  shots: DuelShot[];
  /** Coups joués par chaque joueur. */
  hitsBy: number[];
  /** Pas où deux partenaires se chevauchaient (centres à moins de 0,6 m). */
  overlaps: number;
  /** Pas passés avec un joueur au filet et son partenaire au fond, balle en jeu. */
  split: number;
  rallyTicks: number;
  /** Serveurs de chaque point, dans l'ordre, et receveurs. */
  servers: number[];
  receivers: number[];
  /** Pas où un joueur d'une équipe était engagé alors que son partenaire l'était aussi. */
  bothEngaged: number;
  duel: Duel;
}

function playDoubles(seconds: number, seed: number, options: BotOptions = AI_LEVELS.normal, rules = true): DoublesStats {
  const duel = new Duel(rules ? { setsToWin: 1, gamesPerSet: 6, goldenPoint: false } : null, 'double');
  const bots = duel.players.map((_, i) => new Bot(i, seed + i, options));
  const stats: DoublesStats = {
    results: [],
    shots: [],
    hitsBy: [0, 0, 0, 0],
    overlaps: 0,
    split: 0,
    rallyTicks: 0,
    servers: [],
    receivers: [],
    bothEngaged: 0,
    duel,
  };
  let lastPhase = duel.phase;
  stats.servers.push(duel.server);
  stats.receivers.push(duel.receiver);
  while (duel.time < seconds && duel.phase !== 'over') {
    duel.step(bots.map((bot) => bot.commands(duel)));
    if (duel.result) stats.results.push(duel.result);
    if (duel.shot) {
      stats.shots.push(duel.shot);
      stats.hitsBy[duel.shot.player]!++;
    }
    if (duel.phase === 'serve' && lastPhase !== 'serve' && duel.serveNumber === 1) {
      stats.servers.push(duel.server);
      stats.receivers.push(duel.receiver);
    }
    lastPhase = duel.phase;
    if (duel.phase === 'rally') {
      stats.rallyTicks++;
      for (const team of [0, 1] as const) {
        const [a, b] = duel.teamPlayers(team).map((i) => duel.players[i]!);
        if (Math.hypot(a!.pos.x - b!.pos.x, a!.pos.z - b!.pos.z) < 0.6) stats.overlaps++;
        const da = Math.abs(a!.pos.z);
        const db = Math.abs(b!.pos.z);
        if ((da < 4 && db > 7) || (db < 4 && da > 7)) stats.split++;
        if (a!.engagement && b!.engagement) stats.bothEngaged++;
      }
    }
  }
  return stats;
}

describe('2 contre 2 (étape C)', () => {
  it('quatre joueurs, deux par camp, chacun sa moitié', () => {
    const duel = new Duel(null, 'double');
    expect(duel.players.length).toBe(4);
    expect(duel.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    expect(duel.players.map((p) => p.side)).toEqual([-1, 1, -1, 1]);
    expect(duel.players.map((p) => p.half)).toEqual(['right', 'right', 'left', 'left']);
  });

  it('au service, serveur et receveur en diagonale, partenaire du serveur au filet', () => {
    const duel = new Duel(null, 'double');
    expect(duel.server).toBe(0);
    // Service à droite : reçoit le joueur de droite adverse, en diagonale.
    expect(duel.receiver).toBe(1);
    const [server, receiver, serverMate, receiverMate] = duel.players;
    expect(Math.sign(server.pos.x)).toBe(-Math.sign(receiver.pos.x));
    expect(Math.abs(serverMate!.pos.z)).toBeLessThan(3.5);
    expect(Math.sign(serverMate!.pos.x)).toBe(-Math.sign(server.pos.x));
    expect(Math.abs(receiverMate!.pos.z)).toBeGreaterThan(6);
    expect(Math.sign(receiverMate!.pos.x)).toBe(-Math.sign(receiver.pos.x));
  });

  it('personne ne change de côté au service : servi de la gauche, le partenaire de gauche reste à gauche', () => {
    const duel = new Duel({ setsToWin: 1, gamesPerSet: 6, goldenPoint: false }, 'double');
    duel.match!.awardPoint(0);
    duel.playSituation(0, [], 'serve');
    expect(duel.serveSide).toBe('left');
    const [blue1, red1, blue2, red2] = duel.players;
    // Bleu 1 (joueur de droite) sert de sa gauche ; Bleu 2 (gauche) attend au filet devant lui, dans sa moitié.
    // Côté bleu (Z négatif), la gauche du joueur est vers +X.
    expect(blue1.pos.x).toBeGreaterThan(0);
    expect(blue2!.pos.x).toBeGreaterThan(0);
    expect(Math.abs(blue2!.pos.z)).toBeLessThan(3.5);
    // Reçoit le joueur de gauche adverse (Rouge 2) ; Rouge 1 reste dans sa moitié droite. Côté rouge, la droite est +X.
    expect(duel.receiver).toBe(3);
    expect(red2!.pos.x).toBeLessThan(0);
    expect(red1.pos.x).toBeGreaterThan(0);
  });

  it('seul le receveur peut renvoyer le service', () => {
    const duel = new Duel(null, 'double');
    duel.phase = 'rally';
    duel.lastHitter = 0;
    duel.hits = 1;
    expect(duel.isReceiving(1)).toBe(true);
    expect(duel.isReceiving(3)).toBe(false);
    duel.hits = 2;
    expect(duel.isReceiving(3)).toBe(true);
    expect(duel.isReceiving(2)).toBe(false);
  });

  it('rotation du service : un joueur de chaque équipe à tour de rôle (A1, B1, A2, B2)', () => {
    const match = new Match();
    const turns: number[] = [];
    for (let game = 0; game < 6; game++) {
      turns.push(match.serveTurn);
      for (let p = 0; p < 4; p++) match.awardPoint(game % 2 === 0 ? 0 : 1);
    }
    expect(turns).toEqual([0, 1, 2, 3, 4, 5]);
    // En jeu décisif : un tour au premier point, puis tous les deux points.
    const tb = new Match();
    for (let g = 0; g < 12; g++) for (let p = 0; p < 4; p++) tb.awardPoint(g % 2 === 0 ? 0 : 1);
    expect(tb.tiebreak).toBe(true);
    const tbTurns: number[] = [];
    for (let p = 0; p < 5; p++) {
      tbTurns.push(tb.serveTurn - 12);
      tb.awardPoint(p % 2 === 0 ? 0 : 1);
    }
    expect(tbTurns).toEqual([0, 1, 1, 2, 2]);
  });

  it('quatre IA jouent un set entier : service tournant, tout le monde joue, la paire bouge ensemble', () => {
    const s = playDoubles(3600, 11);
    const points = s.results.length;
    const shots = s.shots.filter((x) => !x.serve).length;
    const perPoint = s.results.reduce((sum, r) => sum + r.hits, 0) / points;
    const reasons: Record<string, number> = {};
    for (const r of s.results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    const games = s.duel.match!.sets.flat().reduce((a, b) => a + b, 0) + s.duel.match!.games[0] + s.duel.match!.games[1];
    console.log(
      `double normal : ${points} points, ${games} jeux, ${perPoint.toFixed(1)} coups/point, coups par joueur ${s.hitsBy.join('/')}, ` +
        `séparés filet/fond ${((100 * s.split) / s.rallyTicks).toFixed(1)} % du temps, chevauchements ${s.overlaps}, ` +
        `deux engagés ${s.bothEngaged}, fins ${JSON.stringify(reasons)}, vainqueur ${s.duel.match!.winner}`,
    );
    expect(s.duel.phase).toBe('over');
    expect(perPoint).toBeGreaterThan(4);
    // Chacun des quatre joue sa part.
    for (const n of s.hitsBy) expect(n / shots).toBeGreaterThan(0.12);
    expect(s.overlaps).toBe(0);
    // Jamais un devant et un derrière bien longtemps.
    expect(s.split / s.rallyTicks).toBeLessThan(0.15);
    // Les deux d'une équipe ne se précipitent pas sur la même balle.
    expect(s.bothEngaged / s.rallyTicks).toBeLessThan(0.02);
    // Service : A1, B1, A2, B2 par jeu ; le receveur est toujours dans l'équipe adverse.
    for (const [i, server] of s.servers.entries()) expect(teamOf(s.receivers[i]!)).not.toBe(teamOf(server));
    const byGame = s.servers.filter((server, i) => i === 0 || server !== s.servers[i - 1]);
    expect(byGame.slice(0, 4)).toEqual([0, 1, 2, 3]);
  }, 120_000);

  it('le service tombe dans le carré du receveur', () => {
    const duel = new Duel(null, 'double');
    const bots = duel.players.map((_, i) => new Bot(i, 5 + i, AI_LEVELS.normal));
    let checked = 0;
    while (duel.time < 300 && checked < 20) {
      const before = duel.hits;
      duel.step(bots.map((bot) => bot.commands(duel)));
      // Premier rebond d'un service : dans le carré, en diagonale, côté receveur.
      if (before === 1 && duel.hits === 1 && duel.bounces === 1 && duel.contacts.some((c) => c.surface === 'ground')) {
        const ground = duel.contacts.find((c) => c.surface === 'ground')!;
        expect(inServiceBox(ground.pos, duel.players[duel.receiver]!.side, duel.serveSide)).toBe(true);
        // Le carré visé est du côté du receveur.
        expect(Math.sign(ground.pos.x)).toBe(Math.sign(duel.players[duel.receiver]!.pos.x) || Math.sign(ground.pos.x));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  }, 60_000);

  it('est déterministe', () => {
    const summary = (): string => playDoubles(240, 3, AI_LEVELS.normal, false).results.map((r) => `${r.hits}:${r.reason}:${r.winner}`).join(',');
    expect(summary()).toBe(summary());
  }, 60_000);

  it('le simple ne change pas de format', () => {
    const duel = new Duel();
    expect(duel.players.length).toBe(2);
    duel.format = 'double';
    duel.restart();
    expect(duel.players.length).toBe(4);
    duel.format = 'simple';
    duel.restart();
    expect(duel.players.length).toBe(2);
    expect(SIM_DT).toBeGreaterThan(0);
  });
});
