import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import type { Contact } from '../../src/sim/collisions';
import { HALF_LENGTH, SIM_DT } from '../../src/sim/constants';
import { EXERCISES, findExercise } from '../../src/sim/exercises';
import { Machine, MAX_INTERVAL, MIN_INTERVAL, sampleParams, toLaunch, type Exercise } from '../../src/sim/machine';
import { Prng } from '../../src/sim/prng';
import { World } from '../../src/sim/world';
import { simulate } from './helpers';

interface Trace {
  /** Contacts jusqu'au deuxième rebond au sol, sous la forme « surface:mur ». */
  path: string[];
  contacts: Contact[];
  /** Hauteur maximale avant le premier contact, et après le premier mur. */
  apexBefore: number;
  apexAfterWall: number;
  /** Hauteur de la balle quand elle passe à 3 m du filet, côté joueur, avant tout contact. */
  heightAtVolley: number | null;
}

function trace(exercise: Exercise, seed: number, difficulty: number): Trace {
  const launch = toLaunch(sampleParams(exercise, new Prng(seed), difficulty));
  const ball = createBall(launch.pos, launch.vel, launch.spin);
  const result: Trace = { path: [], contacts: [], apexBefore: 0, apexAfterWall: 0, heightAtVolley: null };
  let grounds = 0;
  let previousZ = ball.pos.z;
  simulate(ball, 6, undefined, (stepContacts) => {
    if (grounds >= 2) return;
    if (result.contacts.length === 0) {
      result.apexBefore = Math.max(result.apexBefore, ball.pos.y);
      if (previousZ > -3 && ball.pos.z <= -3) result.heightAtVolley = ball.pos.y;
    }
    previousZ = ball.pos.z;
    for (const c of stepContacts) {
      result.contacts.push(c);
      result.path.push(c.wall ? `${c.surface}:${c.wall}` : c.surface);
      if (c.surface === 'ground') grounds++;
    }
    if (result.contacts.some((c) => c.wall !== undefined)) {
      result.apexAfterWall = Math.max(result.apexAfterWall, ball.pos.y);
    }
  });
  return result;
}

const DIFFICULTIES = [0, 0.3, 0.6, 1];
const SEEDS = 1000;

/** Vérifie `check` sur 1 000 seeds à chaque difficulté ; `check` retourne un message d'erreur ou `null`. */
function expectPaths(id: string, check: (t: Trace) => string | null): Trace[] {
  const exercise = findExercise(id);
  const traces: Trace[] = [];
  const failures: string[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const t = trace(exercise, seed, difficulty);
      traces.push(t);
      const error = check(t);
      if (error) failures.push(`difficulté ${difficulty}, seed ${seed} : ${error} [${t.path.join(' → ')}]`);
    }
  }
  expect(failures.slice(0, 5)).toEqual([]);
  return traces;
}

const startsWith = (t: Trace, ...expected: (string | RegExp)[]): boolean =>
  expected.every((e, i) => (typeof e === 'string' ? t.path[i] === e : e.test(t.path[i] ?? '')));

describe('catalogue', () => {
  it('contient les six exercices du MVP, avec des identifiants uniques', () => {
    expect(EXERCISES.map((e) => e.id)).toEqual(['back-glass', 'double-glass', 'lob', 'mesh', 'volley', 'mix']);
    expect(new Set(EXERCISES.map((e) => e.name)).size).toBe(6);
  });

  it('le mix ne référence que des exercices existants', () => {
    for (const id of findExercise('mix').mix!) expect(() => findExercise(id)).not.toThrow();
  });
});

describe('parcours de la balle sur 1 000 seeds, à chaque difficulté', () => {
  it('vitre de fond : sol, puis vitre du fond, et la balle reste jouable', () => {
    expectPaths('back-glass', (t) => {
      if (!startsWith(t, 'ground', 'glass:backNear', 'ground')) return 'parcours inattendu';
      if (t.contacts[0]!.pos.z >= 0) return 'premier rebond hors du camp du joueur';
      if (t.contacts[2]!.pos.z < -HALF_LENGTH + 1.5) return 'la balle meurt contre la vitre';
      if (t.apexAfterWall < 0.7) return 'la balle ne remonte pas assez après la vitre';
      return null;
    });
  });

  it('double vitre : sol, vitre du fond, puis vitre latérale, des deux côtés', () => {
    const traces = expectPaths('double-glass', (t) => {
      if (!startsWith(t, 'ground', 'glass:backNear', /^glass:side/)) return 'parcours inattendu';
      if (t.contacts[0]!.pos.z >= 0) return 'premier rebond hors du camp du joueur';
      return null;
    });
    const sides = new Set(traces.map((t) => t.path[2]));
    expect(sides).toEqual(new Set(['glass:sidePosX', 'glass:sideNegX']));
  });

  it('lob : balle haute qui retombe au fond, puis vitre du fond', () => {
    expectPaths('lob', (t) => {
      if (!startsWith(t, 'ground', 'glass:backNear', 'ground')) return 'parcours inattendu';
      if (t.apexBefore < 4.5) return `trop bas pour un lob (${t.apexBefore.toFixed(1)} m)`;
      if (t.contacts[0]!.pos.z > -5) return 'retombe trop court';
      return null;
    });
  });

  it('grillage : sol, puis grillage latéral, des deux côtés', () => {
    const traces = expectPaths('mesh', (t) => {
      if (!startsWith(t, 'ground', /^mesh:side/)) return 'parcours inattendu';
      if (t.contacts[0]!.pos.z >= 0) return 'premier rebond hors du camp du joueur';
      return null;
    });
    expect(new Set(traces.map((t) => t.path[1]))).toEqual(new Set(['mesh:sidePosX', 'mesh:sideNegX']));
  });

  it('volée : balle tendue qui arrive à mi-hauteur près du filet, sans rebond', () => {
    expectPaths('volley', (t) => {
      const height = t.heightAtVolley;
      if (height === null) return 'la balle touche quelque chose avant le joueur';
      if (height < 0.8 || height > 1.8) return `hauteur de volée ${height.toFixed(2)} m`;
      if (t.contacts[0]!.pos.z > -4.5) return 'rebondit avant le joueur';
      return null;
    });
  });

  it('mix : tire parmi les autres exercices, coup droit et revers mélangés', () => {
    const machine = new Machine(findExercise('mix'), 7, 0);
    const lobs = new Set<boolean>();
    const sides = new Set<number>();
    for (let i = 0; i < 200; i++) {
      machine.update(machine.nextLaunchTime);
      lobs.add(machine.lastParams!.elevation > 40);
      sides.add(Math.sign(Math.round(machine.lastParams!.azimuth / 10)));
    }
    expect(lobs).toEqual(new Set([true, false]));
    expect(sides).toEqual(new Set([-1, 0, 1]));
  });
});

describe('réglages de l’exercice', () => {
  const exercise = findExercise('back-glass');

  it('la difficulté rend la balle plus rapide et plus tendue', () => {
    const easy = sampleParams(exercise, new Prng(1), 0);
    const hard = sampleParams(exercise, new Prng(1), 1);
    expect(hard.speed).toBeGreaterThan(easy.speed + 2);
    expect(hard.elevation).toBeLessThan(easy.elevation - 4);
  });

  it('la difficulté élargit la variation aléatoire', () => {
    const spread = (difficulty: number): number => {
      const rng = new Prng(11);
      const xs = Array.from({ length: 500 }, () => sampleParams(exercise, rng, difficulty).azimuth);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(1)).toBeGreaterThan(spread(0) * 2);
  });

  it('la cadence est réglable et bornée', () => {
    const world = new World();
    world.startExercise(exercise, 1);
    const machine = world.machine!;
    machine.setInterval(2.5);
    const launchTimes: number[] = [];
    let count = 0;
    while (world.time < 9.5) {
      const time = world.time;
      world.step();
      if (machine.count > count) {
        count = machine.count;
        launchTimes.push(time);
      }
    }
    expect(launchTimes.length).toBe(4);
    expect(launchTimes[2]! - launchTimes[1]!).toBeCloseTo(2.5, 9);
    machine.setInterval(0);
    expect(machine.interval).toBe(MIN_INTERVAL);
    machine.setInterval(99);
    expect(machine.interval).toBe(MAX_INTERVAL);
  });

  it('rejouer relance la dernière balle à l’identique et décale la suivante', () => {
    const world = new World();
    world.startExercise(exercise, 3);
    while (world.machine!.count < 1) world.step();
    const first = JSON.stringify(world.ball);
    for (let i = 0; i < 2 / SIM_DT; i++) world.step();
    expect(JSON.stringify(world.ball)).not.toBe(first);

    const replayTime = world.time;
    world.replayLastBall();
    expect(world.machine!.count).toBe(1);
    expect(world.machine!.nextLaunchTime).toBeCloseTo(replayTime + exercise.interval, 9);
    world.step();
    expect(JSON.stringify(world.ball)).toBe(first);
  });

  it('rejouer avant la première balle ne fait rien', () => {
    const world = new World();
    world.startExercise(exercise, 3);
    world.replayLastBall();
    expect(world.ball).toBeNull();
  });

  it('en pause, le temps simulé ne passe pas', () => {
    const world = new World();
    world.startExercise(exercise, 1);
    for (let i = 0; i < 2 / SIM_DT; i++) world.step();
    const snapshot = JSON.stringify({ tick: world.tick, ball: world.ball, player: world.player });
    world.paused = true;
    for (let i = 0; i < 3 / SIM_DT; i++) world.step();
    expect(JSON.stringify({ tick: world.tick, ball: world.ball, player: world.player })).toBe(snapshot);
    world.paused = false;
    world.step();
    expect(world.tick).toBe(JSON.parse(snapshot).tick + 1);
  });

  it('chaque exercice place le joueur à son point de départ', () => {
    const world = new World();
    world.startExercise(findExercise('volley'), 1);
    expect(world.player.pos).toEqual({ x: 0, y: 0, z: -3 });
    world.startExercise(findExercise('back-glass'), 1);
    expect(world.player.pos).toEqual({ x: 0, y: 0, z: -7 });
  });
});
