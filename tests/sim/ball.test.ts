import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import { BALL_RADIUS, SIM_DT } from '../../src/sim/constants';
import { REALISTIC } from '../../src/sim/profile';
import { vec3 } from '../../src/sim/vec3';
import { World } from '../../src/sim/world';
import { simulate, VACUUM } from './helpers';

describe('vol de la balle', () => {
  it('sans spin ni traînée, suit exactement la parabole', () => {
    const p0 = vec3(0.5, 1, -5);
    const v0 = vec3(1, 6, 8);
    const ball = createBall(p0, v0);
    const steps = 100;
    simulate(ball, steps * SIM_DT, VACUUM);
    const t = steps * SIM_DT;
    expect(ball.pos.x).toBeCloseTo(p0.x + v0.x * t, 10);
    expect(ball.pos.y).toBeCloseTo(p0.y + v0.y * t - 0.5 * VACUUM.gravity * t * t, 10);
    expect(ball.pos.z).toBeCloseTo(p0.z + v0.z * t, 10);
    expect(ball.vel.y).toBeCloseTo(v0.y - VACUUM.gravity * t, 10);
  });

  it('la traînée raccourcit la trajectoire', () => {
    const landing = (profile = REALISTIC): number => {
      const ball = createBall(vec3(0, 1, -8), vec3(0, 4, 14));
      let z = NaN;
      simulate(ball, 3, profile, (contacts) => {
        if (Number.isNaN(z) && contacts.some((c) => c.surface === 'ground')) z = ball.pos.z;
      });
      return z;
    };
    expect(landing(REALISTIC)).toBeLessThan(landing(VACUUM) - 0.5);
  });

  describe('effet Magnus', () => {
    // Balle frappée vers +Z ; retourne le point du premier rebond au sol.
    const landing = (spin: ReturnType<typeof vec3>) => {
      const ball = createBall(vec3(0, 1, -8), vec3(0, 3, 15), spin);
      let point = vec3(NaN, NaN, NaN);
      simulate(ball, 3, REALISTIC, (contacts) => {
        const ground = contacts.find((c) => c.surface === 'ground');
        if (ground && Number.isNaN(point.z)) point = ground.pos;
      });
      return point;
    };
    const flat = landing(vec3(0, 0, 0));

    it('le lift fait plonger la balle', () => {
      expect(landing(vec3(200, 0, 0)).z).toBeLessThan(flat.z - 0.3);
    });

    it('le slice la fait flotter', () => {
      expect(landing(vec3(-200, 0, 0)).z).toBeGreaterThan(flat.z + 0.3);
    });

    it("l'effet latéral courbe la trajectoire", () => {
      expect(Math.abs(flat.x)).toBeLessThan(1e-9);
      expect(landing(vec3(0, 200, 0)).x).toBeGreaterThan(0.2);
      expect(landing(vec3(0, -200, 0)).x).toBeLessThan(-0.2);
    });
  });
});

describe('rebond au sol', () => {
  it('test FIP : lâchée de 2,54 m, la balle remonte entre 1,35 et 1,45 m', () => {
    const ball = createBall(vec3(0, 2.54 + BALL_RADIUS, -5), vec3(0, 0, 0));
    let bounced = false;
    let apex = 0;
    simulate(ball, 2, REALISTIC, (contacts) => {
      if (contacts.some((c) => c.surface === 'ground')) {
        if (bounced) return;
        bounced = true;
      }
      if (bounced) apex = Math.max(apex, ball.pos.y - BALL_RADIUS);
    });
    expect(apex).toBeGreaterThan(1.35);
    expect(apex).toBeLessThan(1.45);
  });

  it("la balle finit par s'immobiliser au sol", () => {
    const ball = createBall(vec3(0, 2, -5), vec3(1.5, 0, 2), vec3(40, 0, 0));
    simulate(ball, 30);
    expect(ball.pos.y).toBe(BALL_RADIUS);
    expect(ball.vel).toEqual(vec3(0, 0, 0));
  });
});

describe('World', () => {
  it('fait avancer la balle lancée et expose les contacts du dernier pas', () => {
    const world = new World();
    world.launchBall(vec3(0, BALL_RADIUS + 0.001, -5), vec3(0, -1, 3));
    world.step();
    expect(world.contacts.map((c) => c.surface)).toEqual(['ground']);
    expect(world.prevBallPos).toEqual(vec3(0, BALL_RADIUS + 0.001, -5));
    expect(world.ball!.pos.z).toBeGreaterThan(-5);
    world.step();
    expect(world.contacts).toEqual([]);
  });
});
