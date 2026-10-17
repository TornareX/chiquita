import { describe, expect, it } from 'vitest';
import { bodyYawTarget, computePose, FOLLOW_TIME, prepAmount, RECOVER_TIME, swingSide, type PoseInput, type V3 } from '../../src/render/pose';

const still: PoseInput = { inPlay: true, prep: null, strike: null, speed: 0, heading: 0, bodyYaw: 0, stride: 0, time: 0 };
const length = (v: V3): number => Math.hypot(v[0], v[1], v[2]);

describe('poses du personnage', () => {
  it('donne des directions unitaires et aucune valeur NaN, dans tous les états', () => {
    const families = ['fore', 'back', 'overhead', 'serve'] as const;
    for (const family of families) {
      for (const seconds of [0, 0.1, 0.3, 0.6, 2]) {
        for (const strike of [null, { family, seconds }]) {
          const pose = computePose({ ...still, prep: { family, seconds }, strike, speed: 4, heading: 1, stride: seconds * 9 });
          for (const v of [pose.armR, pose.armL, pose.racket, pose.face]) expect(length(v)).toBeCloseTo(1, 6);
          expect(Object.values(pose).flat().some((x) => typeof x === 'number' && Number.isNaN(x))).toBe(false);
        }
      }
    }
  });

  it('arme la raquette avec le temps de préparation, pleinement à 0,6 s, sans aller au-delà', () => {
    expect(prepAmount(0)).toBe(0);
    expect(prepAmount(0.12)).toBeGreaterThan(0.3);
    expect(prepAmount(0.6)).toBeCloseTo(1, 6);
    expect(prepAmount(3)).toBeCloseTo(1, 6);
    const twist = (seconds: number): number => computePose({ ...still, prep: { family: 'fore', seconds } }).twist;
    // Coup droit : l'épaule droite recule de plus en plus (torsion négative).
    expect(twist(0.1)).toBeLessThan(0);
    expect(twist(0.3)).toBeLessThan(twist(0.1));
    expect(twist(0.6)).toBeCloseTo(twist(2), 6);
  });

  it("montre l'image d'impact au pas du contact, puis la fin du geste, puis revient en attente", () => {
    const at = (seconds: number) => computePose({ ...still, strike: { family: 'fore', seconds } });
    const impact = at(0);
    const prepared = computePose({ ...still, prep: { family: 'fore', seconds: 1 } });
    // À l'impact, la raquette est devant le joueur et le buste presque de face ; armée, elle était derrière.
    expect(impact.racket[2]).toBeGreaterThan(0.4);
    expect(prepared.racket[2]).toBeLessThan(0);
    expect(Math.abs(impact.twist)).toBeLessThan(0.3);
    // Fin du geste : le buste a tourné de l'autre côté.
    expect(at(FOLLOW_TIME).twist).toBeGreaterThan(0.5);
    // Ensuite, retour à la pose d'attente.
    expect(at(FOLLOW_TIME + RECOVER_TIME + 0.01)).toEqual(computePose(still));
  });

  it('arme le coup au-dessus de la tête bras levé, et le revers de l’autre côté du coup droit', () => {
    const overhead = computePose({ ...still, prep: { family: 'overhead', seconds: 1 } });
    expect(overhead.armR[1]).toBeGreaterThan(0.5);
    const fore = computePose({ ...still, prep: { family: 'fore', seconds: 1 } });
    const back = computePose({ ...still, prep: { family: 'back', seconds: 1 } });
    expect(Math.sign(fore.twist)).toBe(-Math.sign(back.twist));
  });

  it('choisit le coup droit quand la balle est à droite (-X), avec une hystérésis près de l’axe', () => {
    expect(swingSide(-0.5, 'back')).toBe('fore');
    expect(swingSide(0.5, 'fore')).toBe('back');
    expect(swingSide(0.1, 'fore')).toBe('fore');
    expect(swingSide(0.1, 'back')).toBe('back');
  });

  it('court en alternant les jambes, et reste immobile à l’arrêt', () => {
    const run = computePose({ ...still, speed: 5, heading: 0, stride: Math.PI / 2 });
    expect(run.legR.swing).toBeCloseTo(-run.legL.swing, 6);
    expect(Math.abs(run.legR.swing)).toBeGreaterThan(0.4);
    const stand = computePose(still);
    expect(stand.legR.swing).toBeCloseTo(0, 9);
    expect(stand.legL.spread).toBeCloseTo(0, 9);
    // Pas chassé : en se déplaçant sur le côté, les jambes s'écartent au lieu de se balancer.
    const shuffle = computePose({ ...still, speed: 1.5, heading: Math.PI / 2, stride: Math.PI / 2 });
    expect(Math.abs(shuffle.legR.spread)).toBeGreaterThan(Math.abs(shuffle.legR.swing));
  });

  it('se tourne dans le sens de la course quand il court vite, face au filet sinon', () => {
    expect(bodyYawTarget(1, Math.PI / 2, false)).toBe(0);
    expect(bodyYawTarget(6, Math.PI / 2, false)).toBeGreaterThan(1);
    expect(bodyYawTarget(6, Math.PI / 2, true)).toBe(0);
    // En reculant, il ne tourne pas le dos au filet.
    expect(Math.abs(bodyYawTarget(6, Math.PI, false))).toBeLessThan(0.1);
  });
});
