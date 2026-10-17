import { describe, expect, it } from 'vitest';
import { createBall, integrateFlight } from '../../src/sim/ball';
import { SIM_DT } from '../../src/sim/constants';
import { ARCADE } from '../../src/sim/profile';
import { ballColor, ballPressure, shotError, type Incoming } from '../../src/sim/pressure';
import { solveShot } from '../../src/sim/shots';
import { vec3 } from '../../src/sim/vec3';

/** Balle confortable : du temps, à hauteur de hanche, lente (après la vitre). */
const easy: Incoming = { prep: 1.6, height: 1, speed: 5, running: 0, doubleGlass: false, kind: 'normal' };
/** Volée rapide dans les pieds, sans temps de préparation. */
const hard: Incoming = { prep: 0.55, height: 0.3, speed: 16, running: 0, doubleGlass: false, kind: 'normal' };

describe('balle verte, jaune, rouge', () => {
  it('confortable : verte ; rapide, basse et sans préparation : rouge', () => {
    expect(ballColor(ballPressure(easy, ARCADE))).toBe('verte');
    expect(ballColor(ballPressure(hard, ARCADE))).toBe('rouge');
    expect(ballColor(ballPressure({ ...easy, prep: 0.8, speed: 12 }, ARCADE))).toBe('jaune');
  });

  it('chaque facteur ajoute de la pression : temps, hauteur, vitesse, coin', () => {
    const p = (ball: Partial<Incoming>): number => ballPressure({ ...easy, ...ball }, ARCADE);
    const base = p({});
    expect(p({ prep: 0.7 })).toBeGreaterThan(base);
    expect(p({ height: 0.4 })).toBeGreaterThan(base);
    expect(p({ speed: 15 })).toBeGreaterThan(base);
    expect(p({ doubleGlass: true })).toBeGreaterThan(base);
  });

  it('le coupé remet mieux une balle basse ; au-dessus de la tête, la hauteur ne gêne pas', () => {
    const low = { ...easy, height: 0.35 };
    expect(ballPressure({ ...low, kind: 'slice' }, ARCADE)).toBeLessThan(ballPressure(low, ARCADE));
    expect(ballPressure({ ...low, kind: 'overhead' }, ARCADE)).toBe(ballPressure({ ...easy, kind: 'overhead' }, ARCADE));
  });
});

describe('erreur du coup', () => {
  const p = ARCADE.rally;
  const easyP = ballPressure(easy, ARCADE);
  const hardP = ballPressure(hard, ARCADE);

  it('balle verte frappée parfaitement : aucune erreur', () => {
    expect(shotError(easyP, 0, 0, true, ARCADE)).toBe(0);
  });

  it('le timing et le placement comptent, et coûtent plus cher sous pression', () => {
    const early = -(p.perfectBefore + 0.1);
    const late = p.lateWindow;
    // Trop tôt (placé trop devant), trop tard (trop derrière), ou balle loin du point idéal.
    for (const [timing, miss] of [[early, 0], [late, 0], [0, p.reach]] as const) {
      const calm = shotError(easyP, timing, miss, false, ARCADE);
      expect(calm).toBeGreaterThan(0);
      expect(shotError(hardP, timing, miss, false, ARCADE)).toBeGreaterThan(calm);
    }
  });

  it('une balle rouge reste dure même bien frappée, mais la frappe parfaite aide', () => {
    const perfect = shotError(hardP, 0, 0, true, ARCADE);
    expect(perfect).toBeGreaterThan(0);
    expect(shotError(hardP, 0, 0, false, ARCADE)).toBeGreaterThan(perfect);
  });

  it('sans pression (`?pression=0`), plus aucune erreur', () => {
    const off = structuredClone(ARCADE);
    off.rally.pressure.scale = 0;
    expect(shotError(hardP, p.lateWindow, p.reach, false, off)).toBe(0);
  });

  it('une erreur fait passer la balle plus haut au-dessus du filet : elle devient attaquable', () => {
    const peak = (extra: number): number => {
      const contact = vec3(0, 0.8, 8);
      const shot = solveShot('normal', contact, vec3(0, 0.03, -7), false, ARCADE, 1, extra);
      const ball = createBall(contact, shot.vel, shot.spin);
      let top = 0;
      for (let t = 0; t < shot.flightTime; t += SIM_DT) {
        integrateFlight(ball, SIM_DT, ARCADE);
        top = Math.max(top, ball.pos.y);
      }
      return top;
    };
    // Plus haut, sans devenir un lob : la défense reste à plat.
    expect(peak(p.pressure.clearance)).toBeGreaterThan(peak(0) + 0.15);
    expect(peak(p.pressure.clearance)).toBeLessThan(peak(0) + 0.8);
  });
});
