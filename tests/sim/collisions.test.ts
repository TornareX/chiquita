import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import { bounce } from '../../src/sim/collisions';
import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH } from '../../src/sim/constants';
import { REALISTIC, type SurfaceParams } from '../../src/sim/profile';
import { Prng } from '../../src/sim/prng';
import { dot, length, normalize, vec3, type Vec3 } from '../../src/sim/vec3';
import { kineticEnergy, simulate, totalEnergy, VACUUM } from './helpers';

const P = REALISTIC;
const EPS = 1e-9;

function randomVec(rng: Prng, magnitude: number): Vec3 {
  return vec3(rng.range(-1, 1) * magnitude, rng.range(-1, 1) * magnitude, rng.range(-1, 1) * magnitude);
}

describe('réponse au rebond', () => {
  it('vitre : la composante normale est inversée et réduite selon e', () => {
    const normal = vec3(0, 0, 1);
    const result = bounce(vec3(2, 1, -10), vec3(0, 0, 0), normal, P.glass, P.inertiaFactor);
    expect(result.vel.z).toBeCloseTo(10 * P.glass.restitution, 12);
  });

  it('sans friction, la vitesse tangentielle et le spin sont conservés', () => {
    const surface: SurfaceParams = { restitution: 0.65, friction: 0 };
    const spin = vec3(30, -20, 10);
    const result = bounce(vec3(2, 1, -10), spin, vec3(0, 0, 1), surface, P.inertiaFactor);
    expect(result.vel.x).toBe(2);
    expect(result.vel.y).toBe(1);
    expect(result.spin).toEqual(spin);
  });

  it('au sol, une balle liftée repart plus vite vers l’avant qu’une balle slicée', () => {
    const vel = vec3(0, -5, 10);
    const lifted = bounce(vel, vec3(250, 0, 0), vec3(0, 1, 0), P.ground, P.inertiaFactor);
    const sliced = bounce(vel, vec3(-250, 0, 0), vec3(0, 1, 0), P.ground, P.inertiaFactor);
    expect(lifted.vel.z).toBeGreaterThan(sliced.vel.z + 1);
  });

  it("aucun rebond ne fait gagner d'énergie", () => {
    const rng = new Prng(1234);
    const surfaces: SurfaceParams[] = [P.ground, P.glass, P.mesh, P.net, { restitution: 1, friction: 2 }];
    for (let i = 0; i < 5000; i++) {
      const normal = normalize(randomVec(rng, 1));
      let vel = randomVec(rng, 40);
      if (dot(vel, normal) > 0) vel = vec3(-vel.x, -vel.y, -vel.z);
      const spin = randomVec(rng, 400);
      const surface = surfaces[i % surfaces.length]!;
      const result = bounce(vel, spin, normal, surface, P.inertiaFactor);
      const before = kineticEnergy({ vel, spin }, P);
      expect(kineticEnergy(result, P)).toBeLessThanOrEqual(before * (1 + 1e-12));
      expect(dot(result.vel, normal)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('murs', () => {
  it('vitre du fond : la balle repart avec e fois sa vitesse normale', () => {
    const ball = createBall(vec3(0, 1.5, -8), vec3(0, 2, -15));
    let after = NaN;
    let impact = NaN;
    simulate(ball, 0.5, P, (contacts) => {
      const hit = contacts.find((c) => c.surface === 'glass');
      if (hit && Number.isNaN(after)) {
        expect(hit.wall).toBe('backNear');
        impact = hit.speed;
        after = ball.vel.z;
      }
    });
    expect(after).toBeGreaterThan(0);
    expect(after / impact).toBeCloseTo(P.glass.restitution, 2);
  });

  it('mur latéral : vitre sur les 4 m du fond, grillage au-delà', () => {
    const surfaceHit = (z: number): string | undefined => {
      const ball = createBall(vec3(4, 2.5, z), vec3(12, 1, 0));
      return simulate(ball, 0.3)[0]?.surface;
    };
    expect(surfaceHit(-9)).toBe('glass');
    expect(surfaceHit(-7)).toBe('glass');
    expect(surfaceHit(-3)).toBe('mesh');
  });

  it('une balle qui passe au-dessus du mur sort du terrain', () => {
    const ball = createBall(vec3(0, 3, -6), vec3(0, 9, -12));
    const contacts = simulate(ball, 1.5);
    expect(contacts[0]).toMatchObject({ surface: 'out', wall: 'backNear' });
    expect(ball.out).toBe(true);
    expect(ball.pos.z).toBeLessThan(-HALF_LENGTH);
  });

  it('grillage : rebond amorti, irrégulier mais reproductible', () => {
    const hit = (z: number): Vec3 => {
      const ball = createBall(vec3(4.5, 1, z), vec3(12, 0, 0));
      let vel: Vec3 | null = null;
      simulate(ball, 0.2, VACUUM, (contacts) => {
        if (!vel && contacts.some((c) => c.surface === 'mesh')) vel = ball.vel;
      });
      return vel!;
    };
    const a = hit(-2);
    expect(hit(-2)).toEqual(a);
    expect(length(a)).toBeLessThan(12 * 0.6);
    // Un impact 10 cm plus loin part dans une autre direction.
    const b = hit(-2.1);
    expect(Math.abs(a.y - b.y) + Math.abs(a.z - b.z)).toBeGreaterThan(1e-3);
  });

  it('vitre : rebond régulier, identique quel que soit le point touché', () => {
    const hit = (x: number): Vec3 => {
      const ball = createBall(vec3(x, 1, -9.5), vec3(0, 0, -12));
      let vel: Vec3 | null = null;
      simulate(ball, 0.2, VACUUM, (contacts) => {
        if (!vel && contacts.some((c) => c.surface === 'glass')) vel = ball.vel;
      });
      return vel!;
    };
    const a = hit(1);
    const b = hit(1.1);
    expect(a.y).toBeCloseTo(b.y, 12);
    expect(a.z).toBeCloseTo(b.z, 12);
  });
});

describe('coin (double vitre)', () => {
  it('la balle touche les deux vitres et ressort vers le terrain', () => {
    const ball = createBall(vec3(-2, 1.2, -6), vec3(-9, 1, -14));
    const walls: string[] = [];
    let velAfterSecond: Vec3 | null = null;
    simulate(ball, 1, P, (contacts) => {
      for (const c of contacts) {
        if (c.surface !== 'glass') continue;
        walls.push(c.wall!);
        if (walls.length === 2) velAfterSecond = ball.vel;
      }
    });
    expect(walls.slice(0, 2).sort()).toEqual(['backNear', 'sideNegX']);
    expect(velAfterSecond!.x).toBeGreaterThan(0);
    expect(velAfterSecond!.z).toBeGreaterThan(0);
  });

  it('ne traverse jamais les murs et ne reste jamais bloquée', () => {
    const rng = new Prng(42);
    for (let i = 0; i < 300; i++) {
      const start = vec3(rng.range(-4, 4), rng.range(0.3, 2.5), rng.range(-8, -1));
      const corner = vec3(rng.next() < 0.5 ? -HALF_WIDTH : HALF_WIDTH, rng.range(0, 2.5), -HALF_LENGTH);
      const dir = normalize(vec3(corner.x - start.x, corner.y - start.y, corner.z - start.z));
      const speed = rng.range(5, 35);
      const ball = createBall(start, vec3(dir.x * speed, dir.y * speed, dir.z * speed), randomVec(rng, 300));

      // Vérifications sans `expect` dans la boucle : il y en aurait des millions.
      let finite = true;
      let aboveGround = true;
      let inside = true;
      simulate(ball, 12, P, () => {
        finite &&= Number.isFinite(ball.pos.x + ball.pos.y + ball.pos.z);
        aboveGround &&= ball.pos.y >= BALL_RADIUS - EPS;
        inside &&=
          ball.out ||
          (Math.abs(ball.pos.x) <= HALF_WIDTH - BALL_RADIUS + EPS &&
            Math.abs(ball.pos.z) <= HALF_LENGTH - BALL_RADIUS + EPS);
      });
      expect({ i, finite, aboveGround, inside }).toEqual({ i, finite: true, aboveGround: true, inside: true });
      // Au bout de 12 s, la balle est au repos au sol (ou sortie), pas coincée en l'air.
      if (!ball.out) expect(ball.pos.y).toBeLessThan(BALL_RADIUS + 0.05);
    }
  });
});

describe('filet', () => {
  it('une balle trop basse est arrêtée par le filet', () => {
    const ball = createBall(vec3(0, 0.5, -3), vec3(0, 0, 10));
    const contacts = simulate(ball, 2);
    expect(contacts[0]!.surface).toBe('net');
    expect(ball.pos.z).toBeLessThan(0);
  });

  it('une balle assez haute passe sans contact', () => {
    const ball = createBall(vec3(0, 1.5, -3), vec3(0, 0, 10));
    const contacts = simulate(ball, 0.6);
    expect(contacts.filter((c) => c.surface === 'net' || c.surface === 'tape')).toEqual([]);
    expect(ball.pos.z).toBeGreaterThan(0);
  });

  it('une balle qui accroche la bande passe en étant freinée', () => {
    const ball = createBall(vec3(0, 0.9, -0.2), vec3(0, 0, 10));
    const contacts = simulate(ball, 0.3);
    expect(contacts.filter((c) => c.surface === 'tape')).toHaveLength(1);
    expect(ball.pos.z).toBeGreaterThan(0);
    expect(ball.vel.z).toBeLessThan(9);
  });
});

describe('simulation complète', () => {
  it("l'énergie totale ne fait que décroître", () => {
    const rng = new Prng(7);
    for (let i = 0; i < 40; i++) {
      const ball = createBall(
        vec3(rng.range(-4, 4), rng.range(0.5, 3), rng.range(-9, 9)),
        randomVec(rng, 25),
        randomVec(rng, 300),
      );
      let energy = totalEnergy(ball, P);
      simulate(ball, 6, P, () => {
        const now = totalEnergy(ball, P);
        expect(now).toBeLessThanOrEqual(energy + 1e-5);
        energy = now;
      });
    }
  });

  it('est déterministe : mêmes entrées, état final identique bit à bit', () => {
    const run = (): string => {
      const ball = createBall(vec3(-2, 1.2, -6), vec3(-9, 3, -17), vec3(120, -80, 40));
      const contacts = simulate(ball, 10);
      return JSON.stringify({ ball, contacts });
    };
    expect(run()).toBe(run());
  });
});
