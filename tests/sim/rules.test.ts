import { describe, expect, it } from 'vitest';
import type { Contact, ContactSurface } from '../../src/sim/collisions';
import { NEUTRAL_COMMANDS } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import type { WallId } from '../../src/sim/court';
import { findExercise } from '../../src/sim/exercises';
import {
  abandon,
  averageQuality,
  createRally,
  judgeStep,
  successRate,
  type BallResult,
} from '../../src/sim/rules';
import { vec3 } from '../../src/sim/vec3';
import { World } from '../../src/sim/world';

/** Contact synthétique : `z` négatif = camp du joueur. */
function contact(surface: ContactSurface, z: number, wall?: WallId): Contact {
  return { surface, wall, pos: vec3(0, 1, z), speed: 5 };
}

const HIT = 'hit' as const;
type Step = Contact | typeof HIT;

/** Déroule une suite d'événements, un par pas. Retourne le verdict (ou `null`). */
function judge(...events: Step[]): BallResult | null {
  const rally = createRally();
  let result: BallResult | null = null;
  for (const event of events) {
    const verdict = event === HIT ? judgeStep(rally, [], true) : judgeStep(rally, [event], false);
    result ??= verdict;
  }
  return result;
}

const OWN_GROUND = contact('ground', -6);
const OPPONENT_GROUND = contact('ground', 6);
const OWN_GLASS = contact('glass', -9.97, 'backNear');

describe('balle de la machine', () => {
  it('frappée après un rebond : en jeu', () => {
    expect(judge(OWN_GROUND, HIT)).toBeNull();
  });

  it('frappée de volée : en jeu', () => {
    expect(judge(HIT)).toBeNull();
  });

  it('frappée après le rebond puis la vitre : en jeu', () => {
    expect(judge(OWN_GROUND, OWN_GLASS, HIT)).toBeNull();
  });

  it('frappée après la vitre puis le rebond : en jeu', () => {
    expect(judge(OWN_GLASS, OWN_GROUND, HIT)).toBeNull();
  });

  it('deuxième rebond au sol avant la frappe : ratée', () => {
    expect(judge(OWN_GROUND, OWN_GLASS, OWN_GROUND)).toEqual({ kind: 'missed', reason: 'second-bounce' });
  });

  it('une frappe après le deuxième rebond ne change pas le verdict', () => {
    const rally = createRally();
    judgeStep(rally, [OWN_GROUND], false);
    judgeStep(rally, [OWN_GROUND], false);
    expect(judgeStep(rally, [], true)).toBeNull();
    expect(judgeStep(rally, [OPPONENT_GROUND], false)).toBeNull();
    expect(rally.result).toEqual({ kind: 'missed', reason: 'second-bounce' });
  });

  it('jamais frappée puis remplacée : ratée', () => {
    const rally = createRally();
    judgeStep(rally, [OWN_GROUND], false);
    expect(abandon(rally)).toEqual({ kind: 'missed', reason: 'not-touched' });
    expect(abandon(rally)).toBeNull();
  });
});

describe('renvoi du joueur', () => {
  it('rebond au sol dans le camp adverse : valide', () => {
    expect(judge(OWN_GROUND, HIT, OPPONENT_GROUND)).toEqual({ kind: 'valid' });
  });

  it('contrapared (propre vitre) puis camp adverse : valide', () => {
    expect(judge(OWN_GROUND, HIT, OWN_GLASS, OPPONENT_GROUND)).toEqual({ kind: 'valid' });
    expect(judge(HIT, contact('glass', -3, 'sidePosX'), OPPONENT_GROUND)).toEqual({ kind: 'valid' });
  });

  it('bande du filet puis camp adverse : valide', () => {
    expect(judge(HIT, contact('tape', 0), OPPONENT_GROUND)).toEqual({ kind: 'valid' });
  });

  it('filet puis retombée dans son camp : faute de filet', () => {
    expect(judge(HIT, contact('net', -0.03), OWN_GROUND)).toEqual({ kind: 'fault', reason: 'net' });
  });

  it('bande du filet puis mur adverse : faute', () => {
    expect(judge(HIT, contact('tape', 0), contact('glass', 9.97, 'backFar'))).toEqual({
      kind: 'fault',
      reason: 'opponent-wall',
    });
  });

  it('retombée dans son camp sans toucher le filet : faute', () => {
    expect(judge(HIT, OWN_GROUND)).toEqual({ kind: 'fault', reason: 'own-ground' });
  });

  it('vitre adverse directe : faute', () => {
    expect(judge(HIT, contact('glass', 9.97, 'backFar'))).toEqual({ kind: 'fault', reason: 'opponent-wall' });
    expect(judge(HIT, contact('glass', 9, 'sideNegX'))).toEqual({ kind: 'fault', reason: 'opponent-wall' });
  });

  it('grillage adverse direct : faute', () => {
    expect(judge(HIT, contact('mesh', 4, 'sidePosX'))).toEqual({ kind: 'fault', reason: 'opponent-wall' });
  });

  it('propre grillage : faute', () => {
    expect(judge(HIT, contact('mesh', -4, 'sidePosX'))).toEqual({ kind: 'fault', reason: 'own-mesh' });
  });

  it('sortie du terrain : faute', () => {
    expect(judge(HIT, contact('out', 9.97, 'backFar'))).toEqual({ kind: 'fault', reason: 'out' });
  });

  it('double frappe : faute', () => {
    expect(judge(OWN_GROUND, HIT, HIT)).toEqual({ kind: 'fault', reason: 'double-hit' });
  });

  it('après un rebond valide, les murs adverses ne comptent plus', () => {
    const rally = createRally();
    judgeStep(rally, [], true);
    expect(judgeStep(rally, [OPPONENT_GROUND], false)).toEqual({ kind: 'valid' });
    expect(judgeStep(rally, [contact('glass', 9.97, 'backFar')], false)).toBeNull();
    expect(rally.result).toEqual({ kind: 'valid' });
  });

  it('frappée mais remplacée avant de rebondir : faute', () => {
    const rally = createRally();
    judgeStep(rally, [], true);
    expect(abandon(rally)).toEqual({ kind: 'fault', reason: 'own-ground' });
  });
});

describe('verdicts et statistiques dans le monde', () => {
  it('un renvoi calé est compté valide, avec sa qualité de contact', () => {
    const world = new World();
    world.launchBall(vec3(-0.5, 1.1, 6), vec3(0, 2.3, -12.8));
    const results: BallResult[] = [];
    for (let i = 0; i < 4 / SIM_DT; i++) {
      const time = i * SIM_DT;
      world.step({ ...NEUTRAL_COMMANDS, prepare: time >= 0.93 && time < 1.18 });
      if (world.result) results.push(world.result);
    }
    expect(results).toEqual([{ kind: 'valid' }]);
    expect(world.lastResult).toEqual({ kind: 'valid' });
    expect(world.stats).toMatchObject({ balls: 1, valid: 1, faults: 0, missed: 0, hits: 1 });
    expect(successRate(world.stats)).toBe(1);
    expect(averageQuality(world.stats)).toBeGreaterThan(0.8);
  });

  it('sans frappe, chaque balle de la machine est comptée ratée, une seule fois', () => {
    const world = new World();
    const exercise = findExercise('back-glass');
    world.startExercise(exercise, 1);
    const results: BallResult[] = [];
    for (let i = 0; i < (1.5 + 3 * exercise.interval) / SIM_DT; i++) {
      world.step();
      if (world.result) results.push(world.result);
    }
    expect(results).toEqual([
      { kind: 'missed', reason: 'second-bounce' },
      { kind: 'missed', reason: 'second-bounce' },
      { kind: 'missed', reason: 'second-bounce' },
    ]);
    expect(world.stats).toMatchObject({ balls: 3, valid: 0, missed: 3, hits: 0 });
    expect(successRate(world.stats)).toBe(0);
    expect(averageQuality(world.stats)).toBeNull();
  });

  it('démarrer un exercice remet les statistiques à zéro', () => {
    const world = new World();
    world.startExercise(findExercise('back-glass'), 1);
    for (let i = 0; i < 8 / SIM_DT; i++) world.step();
    expect(world.stats.balls).toBeGreaterThan(0);
    world.startExercise(findExercise('back-glass'), 2);
    expect(world.stats.balls).toBe(0);
    expect(world.lastResult).toBeNull();
  });
});
