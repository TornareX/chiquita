import { describe, expect, it } from 'vitest';
import { createBall } from '../../src/sim/ball';
import { SIM_DT } from '../../src/sim/constants';
import { findExercise } from '../../src/sim/exercises';
import { predictBall } from '../../src/sim/predict';
import { REALISTIC } from '../../src/sim/profile';
import { vec3, type Vec3 } from '../../src/sim/vec3';
import { World } from '../../src/sim/world';
import { simulate } from './helpers';

const launch = () => createBall(vec3(0.3, 1.1, 8), vec3(-1, 4.5, -16), vec3(60, 0, 0));

describe('prédiction de trajectoire', () => {
  it('ne modifie pas la balle', () => {
    const ball = launch();
    const before = JSON.stringify(ball);
    predictBall(ball, REALISTIC);
    expect(JSON.stringify(ball)).toBe(before);
  });

  it('annonce exactement le point de rebond réel', () => {
    const ball = launch();
    const { bounce } = predictBall(ball, REALISTIC);
    const actual = simulate(ball, 3).find((c) => c.surface === 'ground')!.pos;
    expect(bounce).toEqual(actual);
  });

  it('ses points sont sur la trajectoire réelle, rebonds sur les vitres compris', () => {
    const stride = 8;
    const ball = launch();
    const { points } = predictBall(ball, REALISTIC, 3, stride);
    const actual: Vec3[] = [];
    let step = 0;
    simulate(ball, 3, REALISTIC, () => {
      if (++step % stride === 0) actual.push(ball.pos);
    });
    expect(points.length).toBeGreaterThan(20);
    expect(points).toEqual(actual.slice(0, points.length));
  });

  it("s'arrête au deuxième rebond au sol", () => {
    const { points } = predictBall(launch(), REALISTIC, 10);
    const ball = launch();
    let grounds = 0;
    let secondBounceTime = 0;
    let time = 0;
    simulate(ball, 10, REALISTIC, (contacts) => {
      time += SIM_DT;
      for (const c of contacts) if (c.surface === 'ground' && ++grounds === 2) secondBounceTime = time;
    });
    expect(points.length).toBeLessThanOrEqual(Math.ceil(secondBounceTime / SIM_DT / 8));
    expect(points.length).toBeGreaterThan(10);
  });

  it('pas de rebond annoncé si la balle ne retombe pas dans le délai', () => {
    const ball = createBall(vec3(0, 1, 0), vec3(0, 12, 0));
    expect(predictBall(ball, REALISTIC, 0.5).bounce).toBeNull();
  });
});

describe('enregistrement du point', () => {
  it('enregistre la balle et le joueur à chaque pas, et repart de zéro à chaque balle', () => {
    const world = new World();
    const exercise = findExercise('back-glass');
    world.startExercise(exercise, 1);
    while (world.machine!.count < 1) world.step();
    for (let i = 0; i < 100; i++) world.step();
    expect(world.history).toHaveLength(101);
    expect(world.history.at(-1)).toEqual({ ball: world.ball!.pos, player: world.player.pos, yaw: world.player.yaw });

    while (world.machine!.count < 2) world.step();
    expect(world.history).toHaveLength(1);
    expect(world.previousHistory.length).toBeGreaterThan(1000);
  });

  it('le dernier point est la balle en cours une fois jugée, sinon la précédente', () => {
    const world = new World();
    world.startExercise(findExercise('back-glass'), 1);
    while (world.machine!.count < 1) world.step();
    // Première balle, pas encore jugée et pas de précédente : on montre ce qu'on a.
    expect(world.lastPoint).toBe(world.history);
    while (!world.rally.result) world.step();
    expect(world.lastPoint).toBe(world.history);
    // Deuxième balle en vol : le dernier point est encore la première.
    while (world.machine!.count < 2) world.step();
    expect(world.lastPoint).toBe(world.previousHistory);
  });
});
