import { describe, expect, it } from 'vitest';
import { bodyYawTarget, computePose, FOLLOW_TIME, lowFamily, overheadFamily, plansHighShot, prepAmount, RECOVER_TIME, swingSide, type PoseInput, type V3 } from '../../src/render/pose';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { Duel, type HighFloor } from '../../src/sim/duel';
import { vec3 } from '../../src/sim/vec3';

const still: PoseInput = { inPlay: true, prep: null, strike: null, speed: 0, heading: 0, bodyYaw: 0, stride: 0, time: 0 };
const length = (v: V3): number => Math.hypot(v[0], v[1], v[2]);

describe('poses du personnage', () => {
  it('donne des directions unitaires et aucune valeur NaN, dans tous les états', () => {
    const families = ['fore', 'back', 'voleeFore', 'voleeBack', 'bandeja', 'overhead', 'serve'] as const;
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

describe('préparation au stick : geste au sol ou au-dessus de la tête, comme la simulation le jugera', () => {
  /** Bleu prépare au stick (la commande est toujours celle d'un coup haut) ; le geste dessiné est-il un coup haut ? */
  function prepared(setup: (duel: Duel) => void, floor: HighFloor = 'epaules'): boolean {
    const duel = new Duel(null);
    duel.highFloor = floor;
    setup(duel);
    for (let i = 0; i < 3; i++) duel.step([{ stick: { forward: 0, right: 0 }, shot: 'overhead', swing: { prepared: true } }, NEUTRAL_ARCADE]);
    const me = duel.players[0];
    expect(me.engagement?.plan).toBeTruthy();
    return plansHighShot(duel, me, me.engagement!);
  }
  const defence = (duel: Duel): void =>
    duel.playSituation(1, [vec3(0, 0, -9), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.9, 8.5), target: vec3(1.4, 0.03, -7) });
  const lob = (duel: Duel): void =>
    duel.playSituation(1, [vec3(0.3, 0, -3.5), vec3(0, 0, 8.6)], { kind: 'lob', contact: vec3(0.3, 0.9, 8.6), target: vec3(0.6, 0.03, -6.2) });
  const floaty = (duel: Duel): void =>
    duel.playSituation(1, [vec3(0, 0, -2.5), vec3(0, 0, 8.5)], { kind: 'slice', contact: vec3(0, 1, 8.5), target: vec3(0.8, 0.03, -5), error: 0.5 });

  it('en défense derrière la ligne, sur une balle qui n’est pas un lob : coup droit ou revers, pas un smash', () => {
    expect(prepared(defence)).toBe(false);
  });

  it('au filet sur un lob : préparation au-dessus de la tête', () => {
    expect(prepared(lob)).toBe(true);
  });

  it('seuil « lob » : la balle flottante haute se prépare comme une volée', () => {
    expect(prepared(floaty, 'epaules')).toBe(true);
    expect(prepared(floaty, 'lob')).toBe(false);
  });
});

describe('volées (images de Xavier)', () => {
  const phases = (family: 'voleeFore' | 'voleeBack') => [
    computePose({ ...still, prep: { family, seconds: 0.15 } }),
    computePose({ ...still, prep: { family, seconds: 1 } }),
    computePose({ ...still, strike: { family, seconds: 0 } }),
    computePose({ ...still, strike: { family, seconds: FOLLOW_TIME / 2 } }),
    computePose({ ...still, strike: { family, seconds: FOLLOW_TIME } }),
  ];

  it('la tête de raquette reste au-dessus du poignet, de la préparation à la fin du geste', () => {
    for (const family of ['voleeFore', 'voleeBack'] as const) {
      for (const pose of phases(family)) expect(pose.racket[1], family).toBeGreaterThan(0.3);
    }
  });

  it('préparation courte : moins de rotation qu’un coup de fond', () => {
    const volley = computePose({ ...still, prep: { family: 'voleeFore', seconds: 1 } });
    const ground = computePose({ ...still, prep: { family: 'fore', seconds: 1 } });
    expect(Math.abs(volley.twist)).toBeLessThan(Math.abs(ground.twist));
  });

  it('à l’impact, pas en avant avec la jambe opposée au coup', () => {
    // Coup droit (droitier) : la jambe gauche avance ; revers : la droite. Balancier négatif = vers l'avant.
    const fore = computePose({ ...still, strike: { family: 'voleeFore', seconds: 0 } });
    expect(fore.legL.swing).toBeLessThan(-0.3);
    expect(fore.legL.swing).toBeLessThan(fore.legR.swing);
    const back = computePose({ ...still, strike: { family: 'voleeBack', seconds: 0 } });
    expect(back.legR.swing).toBeLessThan(-0.3);
    expect(back.legR.swing).toBeLessThan(back.legL.swing);
    // Pas de pas en préparation ni au fond de court.
    expect(computePose({ ...still, prep: { family: 'voleeFore', seconds: 1 } }).legL.swing).toBeCloseTo(0, 9);
    expect(computePose({ ...still, strike: { family: 'fore', seconds: 0 } }).legL.swing).toBeCloseTo(0, 9);
  });

  it('balle prise avant le rebond : geste de volée, du côté de la balle', () => {
    expect(lowFamily('fore', true)).toBe('voleeFore');
    expect(lowFamily('back', true)).toBe('voleeBack');
    expect(lowFamily('fore', false)).toBe('fore');
    const duel = new Duel(null);
    duel.playSituation(1, [vec3(0, 0, -2.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 1, 8.5), target: vec3(0.8, 0.03, -8) });
    for (let i = 0; i < 3; i++) duel.step([{ stick: { forward: 0, right: 0 }, shot: 'overhead', swing: { prepared: true } }, NEUTRAL_ARCADE]);
    const me = duel.players[0];
    expect(me.engagement!.plan!.volley).toBe(true);
    expect(plansHighShot(duel, me, me.engagement!)).toBe(false);
  });
});

describe('bandeja et víbora (images de Xavier)', () => {
  it('même geste pour la bandeja et la víbora ; le smash, la bajada et la feinte ont le leur', () => {
    expect(overheadFamily('bandeja')).toBe('bandeja');
    expect(overheadFamily('vibora')).toBe('bandeja');
    expect(overheadFamily('remate')).toBe('overhead');
    expect(overheadFamily('bajada')).toBe('overhead');
    expect(overheadFamily('feinte')).toBe('overhead');
  });

  it('armé : de profil, bras droit levé, raquette derrière la tête, bras gauche tendu vers la balle', () => {
    const prep = computePose({ ...still, prep: { family: 'bandeja', seconds: 1 } });
    expect(prep.twist).toBeLessThan(-0.8);
    expect(prep.armR[1]).toBeGreaterThan(0.5);
    expect(prep.racket[1]).toBeGreaterThan(0.7);
    expect(prep.racket[2]).toBeLessThan(-0.2);
    expect(prep.armL[1]).toBeGreaterThan(0.8);
  });

  it('impact sur le côté, devant, puis fin du geste à gauche, à hauteur de hanche, jambe droite devant', () => {
    const impact = computePose({ ...still, strike: { family: 'bandeja', seconds: 0 } });
    expect(impact.racket[0]).toBeLessThan(-0.5);
    expect(impact.racket[2]).toBeGreaterThan(0.4);
    const follow = computePose({ ...still, strike: { family: 'bandeja', seconds: FOLLOW_TIME } });
    expect(follow.twist).toBeGreaterThan(0.8);
    expect(follow.armR[0]).toBeGreaterThan(0.5);
    expect(follow.armR[1]).toBeLessThan(0);
    expect(follow.legR.swing).toBeLessThan(follow.legL.swing);
  });
});
