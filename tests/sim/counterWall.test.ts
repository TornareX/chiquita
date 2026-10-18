import { describe, expect, it } from 'vitest';
import { SwingStick } from '../../src/input/swingStick';
import { createBall } from '../../src/sim/ball';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { stepBall, type Contact } from '../../src/sim/collisions';
import type { ArcadeCommands } from '../../src/sim/commands';
import { BACK_GLASS_HEIGHT, NET_HEIGHT_POSTS, SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot, type PointResult } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { DEFAULT_RULES } from '../../src/sim/score';
import { SITUATIONS } from '../../src/sim/situations';
import { solveCounterWall } from '../../src/sim/shots';
import { vec3, type Vec3 } from '../../src/sim/vec3';

/**
 * Contre-vitre (`CHANTIERS_PLAN.md`, étape 4) : la balle qui a passé le joueur se renvoie contre sa propre vitre du
 * fond, coup normal stick tiré vers elle.
 */
describe('contre-vitre : trajectoire', () => {
  const cases: [Vec3, Vec3][] = [
    [vec3(0.3, 1, -9), vec3(1, 0.03, 4.5)],
    [vec3(-1.5, 0.6, -9.5), vec3(-2, 0.03, 6)],
    [vec3(2, 1.8, -8), vec3(0, 0.03, 4.5)],
    [vec3(0, 1.2, -6.6), vec3(1.5, 0.03, 4.5)],
  ];
  for (const [contact, target] of cases) {
    it(`de z=${contact.z} vers z=${target.z} : vitre sous le grillage, filet passé haut, chute sur la cible`, () => {
      const p = structuredClone(ARCADE);
      const solved = solveCounterWall(contact, target, -1, p);
      const ball = createBall(contact, solved.vel, solved.spin);
      const contacts: Contact[] = [];
      let atNet: number | null = null;
      for (let i = 0; i < 6 / SIM_DT && !contacts.some((c) => c.surface === 'ground'); i++) {
        const before = ball.pos;
        stepBall(ball, SIM_DT, p, contacts);
        if (atNet === null && before.z < 0 && ball.pos.z >= 0) atNet = ball.pos.y;
      }
      const [glass, ground] = contacts;
      expect(glass?.surface).toBe('glass');
      expect(glass!.pos.z).toBeLessThan(-9.9);
      expect(glass!.pos.y).toBeLessThan(BACK_GLASS_HEIGHT - 0.2);
      expect(atNet).toBeGreaterThan(NET_HEIGHT_POSTS + p.rally.counterWall.clearance);
      expect(ground?.surface).toBe('ground');
      expect(Math.hypot(ground!.pos.x - target.x, ground!.pos.z - target.z)).toBeLessThan(0.3);
    });
  }
});

interface Script {
  /** Stick tiré vers la vitre pendant la préparation (sinon au repos), et au relâcher. */
  backWhilePreparing: boolean;
  backAtRelease: boolean;
  /** Relâcher quand le timing de la contre-vitre atteint cette valeur (s). */
  releaseAt: number;
  right?: number;
  /** Situation du labo, et profondeur où Bleu attend la balle. */
  situation?: string;
  standZ?: number;
}

/**
 * Situation « lob qui passe » du labo, Bleu joué au stick et au bouton comme une manette : il recule vers
 * (0,6 ; -8,7), arme le coup normal après le rebond et relâche au moment choisi.
 */
function playLobPast(script: Script): { duel: Duel; shot: DuelShot | null; result: PointResult | null; crossed: boolean; contacts: Contact[] } {
  const duel = new Duel(null);
  // Réglages de Xavier : placement manuel, préparation bloquée.
  duel.players[0].assist = 'off';
  duel.players[0].prepMove = 'bloque';
  SITUATIONS.find((s) => s.id === (script.situation ?? 'lob-qui-passe'))!.start(duel);
  const standZ = script.standZ ?? -8.7;
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  let shot: DuelShot | null = null;
  let released = false;
  let crossed = false;
  const contacts: Contact[] = [];
  for (let i = 0; i < 8 / SIM_DT && !duel.result; i++) {
    const me = duel.players[0];
    let cmd: ArcadeCommands;
    const back = { forward: -1, right: script.right ?? 0 };
    if (shot) cmd = { stick: { forward: 0, right: 0 }, shot: null };
    else if (duel.bounces === 0) {
      // Il se place, et arme quand la balle redescend dans son camp.
      const arm = duel.ball !== null && duel.ball.pos.z < -6;
      cmd = { stick: { forward: clamp((standZ - me.pos.z) * 2), right: clamp(-(0.6 - me.pos.x) * 2) }, shot: arm ? 'normal' : null };
    }
    else {
      const chance = duel.counterWall(0);
      if (!released && chance && chance.timing >= script.releaseAt) released = true;
      cmd = released
        ? { stick: script.backAtRelease ? back : { forward: 0, right: 0 }, shot: null }
        : { stick: script.backWhilePreparing ? back : { forward: 0, right: 0 }, shot: 'normal' };
    }
    duel.step([cmd]);
    if (duel.shot && duel.shot.player === 0) shot = duel.shot;
    if (shot) {
      contacts.push(...duel.contacts);
      if (duel.ball && duel.ball.pos.z > 0) crossed = true;
    }
  }
  return { duel, shot, result: duel.lastResult, crossed, contacts };
}

describe('contre-vitre : en jeu', () => {
  it('la balle qui a passé Bleu et file vers sa vitre lui offre la contre-vitre', () => {
    const duel = new Duel(null);
    SITUATIONS.find((s) => s.id === 'lob-qui-passe')!.start(duel);
    let offered = false;
    let playable = false;
    for (let i = 0; i < 4 / SIM_DT && !duel.result; i++) {
      duel.step([{ stick: { forward: duel.bounces === 0 ? clamp1((-8.7 - duel.players[0].pos.z) * 2) : 0, right: 0 }, shot: null }]);
      const chance = duel.counterWall(0);
      if (chance) {
        offered = true;
        expect(duel.bounces).toBe(1);
        expect(chance.glass.z).toBe(-10);
        if (chance.playable) playable = true;
      }
    }
    expect(offered).toBe(true);
    expect(playable).toBe(true);
  });

  it('coup normal, stick tiré vers la vitre au bon moment : contre-vitre parfaite, elle repasse le filet', () => {
    const { shot, crossed, contacts, result } = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02 });
    expect(shot?.counterWall).toBe(true);
    expect(shot?.perfect).toBe(true);
    expect(contacts[0]?.surface).toBe('glass');
    expect(crossed).toBe(true);
    // Lente et haute : l'adversaire au filet a le temps de la reprendre.
    expect(shot!.speed).toBeLessThan(25);
    expect(['own-ground', 'net', 'own-mesh']).not.toContain(result?.reason);
  });

  it('stick tiré vers la vitre dès la préparation : Bleu s’arrête au lieu de courir après la balle, et la joue', () => {
    const { shot, crossed } = playLobPast({ backWhilePreparing: true, backAtRelease: true, releaseAt: -0.02 });
    expect(shot?.counterWall).toBe(true);
    expect(crossed).toBe(true);
  });

  it('stick à droite au relâcher : elle part à droite de Bleu, chez l’adversaire', () => {
    const left = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02, right: -1 });
    const right = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02, right: 1 });
    // Bleu (camp z négatif) regarde vers les z positifs : sa droite est vers les x négatifs.
    expect(right.shot!.target.x).toBeLessThan(-1);
    expect(left.shot!.target.x).toBeGreaterThan(1);
  });

  it('sans stick vers la vitre : pas de contre-vitre', () => {
    const { shot } = playLobPast({ backWhilePreparing: false, backAtRelease: false, releaseAt: -0.02 });
    expect(shot?.counterWall).not.toBe(true);
  });

  it('relâchée en retard : mal frappée, elle manque de vitesse et la faute est possible', () => {
    const good = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02 });
    const late = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: 0.13 });
    expect(late.shot?.counterWall).toBe(true);
    expect(late.shot!.perfect).toBe(false);
    expect(late.shot!.error).toBeGreaterThan(good.shot!.error);
    expect(late.shot!.speed).toBeLessThan(good.shot!.speed);
  });

  it('balle basse et rapide qui meurt dans la vitre : la contre-vitre la sauve, moins sûre que sur le lob', () => {
    const lob = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02 });
    const low = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02, situation: 'balle-qui-meurt', standZ: -8.6 });
    expect(low.shot?.counterWall).toBe(true);
    expect(low.crossed).toBe(true);
    // Balle dure (basse, rapide, peu de temps) : plus d'erreur.
    expect(low.shot!.error).toBeGreaterThan(lob.shot!.error);
  });

  // Le geste de Xavier (18/10) : il court jusqu'à sa vitre, stick gauche tiré vers elle, devant la balle qui arrive ;
  // puis un coup de stick droit vers soi, lâché aussitôt. Placement manuel, préparation bloquée (ses réglages).
  for (const id of ['lob-qui-passe', 'balle-qui-meurt']) {
    it(`${id} : il court jusqu'à sa vitre et donne un coup de stick : la contre-vitre part et repasse le filet`, () => {
      // Sans le geste de contre-vitre, la raquette n'attend la balle que si elle est déjà proche : frappe à son arrivée.
      for (const flick of id === 'lob-qui-passe' ? [0.35, 0.45] : [0, 0.1]) {
        const duel = new Duel(null);
        duel.players[0].assist = 'off';
        duel.players[0].prepMove = 'bloque';
        SITUATIONS.find((s) => s.id === id)!.start(duel);
        let bounceTick: number | null = null;
        let shot: DuelShot | null = null;
        let crossed = false;
        for (let i = 0; i < 6 / SIM_DT && !duel.result; i++) {
          if (bounceTick === null && duel.bounces === 1) bounceTick = duel.tick;
          const rel = bounceTick === null ? null : duel.tick - bounceTick - Math.round(flick / SIM_DT);
          let cmd: ArcadeCommands = { stick: { forward: shot ? 0 : -1, right: 0 }, shot: null };
          // Stick droit tiré vers soi 8 pas, puis lâché.
          if (!shot && rel !== null && rel >= 0 && rel < 8) cmd = { ...cmd, shot: 'overhead', swing: { prepared: true } };
          else if (!shot && rel !== null && rel >= 8 && rel < 12) cmd = { ...cmd, swing: { prepared: true, end: 'letGo' } };
          duel.step([cmd]);
          if (duel.shot?.player === 0) shot = duel.shot;
          if (shot && duel.ball && duel.ball.pos.z > 0) crossed = true;
        }
        expect(shot?.counterWall, `coup de stick ${flick} s après le rebond`).toBe(true);
        expect(crossed, `coup de stick ${flick} s après le rebond`).toBe(true);
      }
    });
  }

  // Le geste proposé par Xavier (18/10) : tourné vers sa vitre, stick droit poussé vers l'avant pour préparer, ramené
  // vers sa vitre pour frapper. Il court vers sa vitre au stick gauche (placement manuel, préparation bloquée).
  for (const id of ['lob-qui-passe', 'balle-qui-meurt']) {
    it(`${id} : en courant vers sa vitre, stick droit en avant puis vers soi : contre-vitre`, () => {
      // Lob tendu : la balle met ~0,6 s du rebond à la vitre. Balle basse et rapide : 0,2 s après le rebond, elle y est.
      for (const strike of id === 'lob-qui-passe' ? [0, 0.3, 0.6] : [0, 0.1]) {
        const duel = new Duel(null);
        duel.players[0].assist = 'off';
        duel.players[0].prepMove = 'bloque';
        SITUATIONS.find((s) => s.id === id)!.start(duel);
        const swing = new SwingStick();
        let bounceTick: number | null = null;
        let shot: DuelShot | null = null;
        let crossed = false;
        let offered = false;
        for (let i = 0; i < 6 / SIM_DT && !duel.result; i++) {
          if (bounceTick === null && duel.bounces === 1) bounceTick = duel.tick;
          swing.wallReady = duel.counterWallReady(0);
          offered ||= swing.wallReady;
          // Stick droit en avant dès que la contre-vitre est proposée, ramené vers soi `strike` s après le rebond.
          const down = bounceTick !== null && duel.tick - bounceTick >= Math.round(strike / SIM_DT);
          const up = shot ? 0 : down ? -1 : offered ? 1 : 0;
          const out = swing.update(0, up, SIM_DT);
          const cmd: ArcadeCommands = { stick: { forward: shot ? 0 : -1, right: 0 }, shot: out.shot, ...(out.swing ? { swing: out.swing } : {}) };
          duel.step([cmd]);
          if (duel.shot?.player === 0) shot = duel.shot;
          if (shot && duel.ball && duel.ball.pos.z > 0) crossed = true;
        }
        expect(offered).toBe(true);
        expect(shot?.counterWall, `frappe ${strike} s après le rebond`).toBe(true);
        expect(crossed, `frappe ${strike} s après le rebond`).toBe(true);
        // Ni smash ni volée en préparant : rien n'est parti avant le rebond.
        expect(shot!.volley).toBe(false);
      }
    });
  }

  it('coup de stick très en avance : la raquette attend la balle, mais la contre-vitre est moins bonne', () => {
    // Bleu près de sa vitre : la balle met ~0,25 s à arriver du rebond à sa hauteur.
    const early = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.25, standZ: -9.3 });
    const good = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02, standZ: -9.3 });
    expect(early.shot?.counterWall).toBe(true);
    expect(early.shot!.timing).toBeLessThan(-0.2);
    expect(early.shot!.error).toBeGreaterThan(good.shot!.error);
  });

  it('sa propre vitre ne compte pas comme une vitre jouée par l’adversaire', () => {
    const { duel, shot } = playLobPast({ backWhilePreparing: false, backAtRelease: true, releaseAt: -0.02 });
    expect(shot?.counterWall).toBe(true);
    expect(duel.lastResult?.reason).not.toBe('opponent-wall');
  });
});

describe('contre-vitre : IA contre IA', () => {
  it('l’IA forte la joue de temps en temps quand la balle l’a passée, et la plupart repassent le filet', () => {
    const duel = new Duel(DEFAULT_RULES);
    const bots = [new Bot(0, 5, AI_LEVELS.fort), new Bot(1, 6, AI_LEVELS.fort)];
    let points = 0;
    let played = 0;
    let crossed = 0;
    let pending: number | null = null;
    while (duel.time < 900) {
      if (duel.phase === 'over') duel.restart();
      duel.step(bots.map((b) => b.commands(duel)));
      if (duel.shot?.counterWall) {
        played++;
        pending = duel.shot.player;
      }
      if (pending !== null && duel.ball && duel.ball.pos.z * duel.players[pending]!.side < 0) {
        crossed++;
        pending = null;
      }
      if (duel.result) {
        points++;
        pending = null;
      }
    }
    console.log(`${points} points, ${played} contre-vitres, ${crossed} repassent le filet`);
    // De temps en temps : quelques-unes par partie, pas à chaque balle profonde.
    expect(played).toBeGreaterThan(2);
    expect(played).toBeLessThan(points / 3);
    expect(crossed / played).toBeGreaterThan(0.6);
  }, 60000);
});

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
