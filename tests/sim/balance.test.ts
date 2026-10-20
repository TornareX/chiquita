import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { overheadTarget } from '../../src/sim/shots';
import { vec3 } from '../../src/sim/vec3';

/**
 * Équilibrage « facile à jouer, dur à maîtriser » : bloquer un smash au filet ne passe qu'avec un bon timing, une
 * volée douce reste facile ; bandeja et víbora se dosent au stick (centre, court, long).
 */

/** Le joueur 1 frappe une balle à `speed` m/s sur le joueur 0 au filet, qui la bloque relâchée `offset` s après l'impact prévu. */
function block(speed: number, offset: number) {
  const duel = new Duel();
  duel.phase = 'rally';
  duel.lastHitter = 1;
  duel.hits = 4;
  duel.players[1].lastHitTick = duel.tick;
  const at = vec3(0.2, 0, -2.2);
  duel.players[0].pos = duel.players[0].prevPos = at;
  duel.players[0].assist = 'full';
  duel.players[1].pos = duel.players[1].prevPos = vec3(0, 0, 4.5);
  const from = vec3(0.5, 2.4, 4);
  const goal = vec3(at.x + 0.5, 1.1, at.z + 0.3);
  const T = Math.hypot(goal.x - from.x, goal.y - from.y, goal.z - from.z) / speed;
  duel.ball = createBall(from, vec3((goal.x - from.x) / T, (goal.y - from.y) / T + (ARCADE.gravity * T) / 2, (goal.z - from.z) / T));
  duel.players[1].lastHit = { speed, kind: 'normal' } as DuelShot;
  let released = false;
  let shot: DuelShot | null = null;
  for (let i = 0; i < 6 / SIM_DT && duel.phase === 'rally'; i++) {
    const plan = duel.players[0].engagement?.plan;
    if (!released && plan && duel.tick >= plan.tick + Math.round(offset / SIM_DT)) released = true;
    duel.step([{ stick: { forward: 0, right: 0 }, shot: released ? null : 'normal' }, NEUTRAL_ARCADE]);
    if (duel.shot?.player === 0) shot = duel.shot;
  }
  // Point gagné par le joueur 0 (personne en face ne joue) : son blocage est passé.
  return { shot: shot!, inPlay: duel.lastResult?.winner === 0, reason: duel.lastResult?.reason };
}

describe('bloquer au filet', () => {
  it('un smash bloqué au bon moment passe', () => {
    const { shot, inPlay } = block(30, 0);
    expect(shot.perfect).toBe(true);
    expect(inPlay).toBe(true);
  });

  it('un smash bloqué raquette tendue d’avance part dans la vitre, en retard dans le filet', () => {
    const early = block(30, -0.08);
    expect(early.shot.miscue ?? 0).toBeGreaterThan(0.4);
    expect(early.inPlay).toBe(false);
    expect(early.reason).toBe('opponent-wall');
    const late = block(30, 0.04);
    expect(late.inPlay).toBe(false);
    expect(['net', 'own-ground']).toContain(late.reason);
  });

  it('juste à côté de la fenêtre parfaite, le blocage passe encore, mais faible', () => {
    const { shot, inPlay } = block(30, 0.02);
    expect(shot.perfect).toBe(false);
    expect(inPlay).toBe(true);
  });

  it('une volée douce reste facile : même relâchée en avance ou en retard, elle passe', () => {
    for (const offset of [-0.08, 0.04]) {
      const { shot, inPlay } = block(10, offset);
      expect(shot.miscue ?? 0).toBe(0);
      expect(inPlay).toBe(true);
    }
  });

  it('sur 21 relâchers de -0,1 à +0,1 s, un smash est bien plus souvent raté qu’une volée douce', () => {
    const faults = (speed: number) => {
      let n = 0;
      for (let i = -10; i <= 10; i++) if (!block(speed, i / 100).inPlay) n++;
      return n;
    };
    // Avant l'équilibrage (19/10/2026) : 0 faute sur 21 au smash.
    expect(faults(30)).toBeGreaterThan(8);
    expect(faults(10)).toBeLessThan(3);
  });
});

describe('bandeja et víbora au stick', () => {
  const side = -1;
  it('bandeja : sans direction le long de la ligne, stick vers l’avant ou l’arrière au centre, courte ou longue', () => {
    const line = overheadTarget('bandeja', side, { forward: 0, right: 0 }, false, ARCADE, 1.5);
    const deep = overheadTarget('bandeja', side, { forward: 0.6, right: 0 }, false, ARCADE, 1.5);
    const short = overheadTarget('bandeja', side, { forward: -1, right: 0 }, false, ARCADE, 1.5);
    expect(Math.abs(line.x)).toBeGreaterThan(2.5);
    expect(Math.abs(deep.x)).toBeLessThan(0.7);
    expect(Math.abs(short.x)).toBeLessThan(0.7);
    expect(deep.z).toBeGreaterThan(line.z);
    expect(short.z).toBeLessThan(6);
  });

  it('víbora : la profondeur suit le stick, et elle peut aller au centre', () => {
    const short = overheadTarget('vibora', side, { forward: -1, right: 1 }, false, ARCADE);
    const normal = overheadTarget('vibora', side, { forward: 0, right: 1 }, false, ARCADE);
    const long = overheadTarget('vibora', side, { forward: 1, right: 1 }, false, ARCADE);
    expect(short.z).toBeLessThan(normal.z - 1.5);
    expect(long.z).toBeGreaterThan(normal.z + 1.5);
    expect(Math.abs(normal.x)).toBeGreaterThan(4);
    const centre = overheadTarget('vibora', side, { forward: 0.6, right: 0 }, false, ARCADE, -1);
    expect(Math.abs(centre.x)).toBeLessThan(2);
    // Sans direction, du côté du contact, le long de la ligne.
    expect(Math.sign(overheadTarget('vibora', side, { forward: 0, right: 0 }, false, ARCADE, -1).x)).toBe(-1);
  });
});
