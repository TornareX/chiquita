import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import type { Contact } from '../../src/sim/collisions';
import { HALF_LENGTH, SIM_DT } from '../../src/sim/constants';
import { EXERCISES, findExercise } from '../../src/sim/exercises';
import { FIRST_BALL_DELAY, sampleParams, toLaunch, type Exercise } from '../../src/sim/machine';
import { Prng } from '../../src/sim/prng';
import { cross, vec3 } from '../../src/sim/vec3';
import { World } from '../../src/sim/world';
import { simulate } from './helpers';

const BASE = { pos: vec3(0, 1, 8), speed: 10, azimuth: 0, elevation: 0, topspin: 0, sidespin: 0 };

describe('paramètres de lancement', () => {
  it('azimut 0 et élévation 0 : droit vers le camp du joueur', () => {
    const { vel } = toLaunch(BASE);
    expect(vel.x).toBeCloseTo(0, 12);
    expect(vel.y).toBeCloseTo(0, 12);
    expect(vel.z).toBeCloseTo(-10, 12);
  });

  it("l'azimut positif dévie vers +X, l'élévation vers le haut", () => {
    expect(toLaunch({ ...BASE, azimuth: 20 }).vel.x).toBeGreaterThan(0);
    expect(toLaunch({ ...BASE, elevation: 20 }).vel.y).toBeGreaterThan(0);
  });

  it('un topspin positif est un lift (force de Magnus vers le bas)', () => {
    for (const azimuth of [-30, 0, 30]) {
      const { vel, spin } = toLaunch({ ...BASE, azimuth, elevation: 10, topspin: 100 });
      expect(cross(spin, vel).y).toBeLessThan(0);
    }
  });
});

describe('variation aléatoire', () => {
  const exercise: Exercise = {
    id: 'test',
    name: 'Test',
    interval: 2,
    launch: BASE,
    variation: { x: 0.5, speed: 1, azimuth: 5, elevation: 2, topspin: 20, sidespin: 10 },
  };

  it('reste dans les bornes', () => {
    const rng = new Prng(3);
    for (let i = 0; i < 2000; i++) {
      const p = sampleParams(exercise, rng);
      expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.speed - 10)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.azimuth)).toBeLessThanOrEqual(5);
      expect(Math.abs(p.elevation)).toBeLessThanOrEqual(2);
      expect(Math.abs(p.topspin)).toBeLessThanOrEqual(20);
      expect(Math.abs(p.sidespin)).toBeLessThanOrEqual(10);
    }
  });

  it('même seed : mêmes balles ; seed différente : balles différentes', () => {
    const sequence = (seed: number): string => {
      const rng = new Prng(seed);
      return JSON.stringify(Array.from({ length: 10 }, () => sampleParams(exercise, rng)));
    };
    expect(sequence(5)).toBe(sequence(5));
    expect(sequence(5)).not.toBe(sequence(6));
  });
});

describe('machine dans le monde', () => {
  it('lance la première balle après le délai initial, puis à cadence fixe', () => {
    const exercise = findExercise('back-glass');
    const world = new World();
    world.startExercise(exercise, 1);
    const launchTimes: number[] = [];
    let count = 0;
    while (world.time < FIRST_BALL_DELAY + 2.5 * exercise.interval) {
      const time = world.time;
      world.step();
      if (world.machine!.count > count) {
        count = world.machine!.count;
        launchTimes.push(time);
      }
    }
    expect(launchTimes).toHaveLength(3);
    expect(launchTimes[0]).toBeCloseTo(FIRST_BALL_DELAY, 2);
    expect(launchTimes[1]! - launchTimes[0]!).toBeCloseTo(exercise.interval, 9);
    expect(launchTimes[2]! - launchTimes[1]!).toBeCloseTo(exercise.interval, 9);
  });

  it('est déterministe pour une seed donnée', () => {
    const run = (): string => {
      const world = new World();
      world.startExercise(findExercise('back-glass'), 99);
      for (let i = 0; i < 12 / SIM_DT; i++) world.step();
      return JSON.stringify(world.ball);
    };
    expect(run()).toBe(run());
  });
});

/** Contacts d'une balle de l'exercice jusqu'à son deuxième rebond au sol, et hauteur max après le mur. */
function trace(exercise: Exercise, seed: number): { contacts: Contact[]; apexAfterWall: number } {
  const launch = toLaunch(sampleParams(exercise, new Prng(seed)));
  const ball = createBall(launch.pos, launch.vel, launch.spin);
  const contacts: Contact[] = [];
  let grounds = 0;
  let apexAfterWall = 0;
  simulate(ball, 5, undefined, (stepContacts) => {
    if (grounds >= 2) return;
    for (const c of stepContacts) {
      contacts.push(c);
      if (c.surface === 'ground') grounds++;
    }
    if (contacts.some((c) => c.wall !== undefined)) apexAfterWall = Math.max(apexAfterWall, ball.pos.y);
  });
  return { contacts, apexAfterWall };
}

describe('exercices : parcours de la balle sur 1 000 seeds', () => {
  it('tous les exercices ont un identifiant unique', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });

  it('vitre de fond : sol, puis vitre du fond, et la balle reste jouable', () => {
    const exercise = findExercise('back-glass');
    for (let seed = 0; seed < 1000; seed++) {
      const { contacts, apexAfterWall } = trace(exercise, seed);
      const path = contacts.map((c) => (c.wall ? `${c.surface}:${c.wall}` : c.surface));
      expect({ seed, path }).toEqual({ seed, path: ['ground', 'glass:backNear', 'ground'] });
      // Premier rebond dans le camp du joueur.
      expect(contacts[0]!.pos.z).toBeLessThan(0);
      // Jouable : la balle ressort de la vitre et remonte assez haut pour être frappée.
      expect(contacts[2]!.pos.z).toBeGreaterThan(-HALF_LENGTH + 1.5);
      expect(apexAfterWall).toBeGreaterThan(0.7);
    }
  });
});
