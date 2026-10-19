import { describe, expect, it } from 'vitest';
import { NEUTRAL_ARCADE, type ArcadeCommands } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type PrepMove } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { aimTarget, forwardFor, rightFor, solveShot } from '../../src/sim/shots';
import { vec3 } from '../../src/sim/vec3';
import { AI_LEVELS, Bot } from '../../src/sim/bot';

/**
 * Stick gauche pendant la préparation (retour de Xavier : on se place, on prépare, et viser au stick fait bouger le
 * joueur). Bleu au fond reçoit une balle facile de Rouge ; il prépare (bouton maintenu) avec le stick poussé sur le
 * côté pour viser, puis relâche au bon moment.
 */
function play(mode: PrepMove, stick: ArcadeCommands['stick'], startX = 0) {
  const duel = new Duel(null);
  duel.players[0].prepMove = mode;
  duel.playSituation(1, [vec3(startX, 0, -8.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.9, 8.5), target: vec3(0.9, 0.03, -6.8) });
  const held: ArcadeCommands = { ...NEUTRAL_ARCADE, stick, shot: 'normal' };
  // Prépare tout de suite, pour avoir le plan, puis relâche au moment prévu.
  duel.step([held, NEUTRAL_ARCADE]);
  duel.step([held, NEUTRAL_ARCADE]);
  const plan = duel.players[0].engagement!.plan!;
  const start = { ...duel.players[0].pos };
  let drift = 0;
  for (let i = 0; i < 4 / SIM_DT && duel.phase === 'rally'; i++) {
    const release = duel.tick >= plan.tick - 1;
    duel.step([release ? { ...NEUTRAL_ARCADE, stick } : held, NEUTRAL_ARCADE]);
    if (!release) drift = Math.max(drift, Math.hypot(duel.players[0].pos.x - plan.stand.x, duel.players[0].pos.z - plan.stand.z));
    if (duel.shot?.player === 0) return { shot: duel.shot, drift, start, stand: plan.stand };
  }
  return { shot: null, drift, start, stand: plan.stand };
}

describe('stick gauche pendant la préparation', () => {
  const aim = { forward: 0, right: 1 };

  it('préparé avant que le point d’impact soit connu : libre, le stick fait courir ; ralenti, quelques pas ; bloqué, rien', () => {
    // Le cas qui frustrait : Bleu prépare pendant que Rouge renvoie, stick sur le côté pour viser.
    const moved = (mode: PrepMove): number => {
      const duel = new Duel(null);
      duel.players[0].prepMove = mode;
      duel.playSituation(0, [vec3(0, 0, -8), vec3(0, 0, 8)], { kind: 'normal', contact: vec3(0, 1, -8), target: vec3(0, 0.03, 7) });
      const bot = new Bot(1, 5, AI_LEVELS.normal);
      const held: ArcadeCommands = { ...NEUTRAL_ARCADE, stick: aim, shot: 'normal' };
      let distance = 0;
      for (let i = 0; i < 3 / SIM_DT && duel.phase === 'rally'; i++) {
        const before = { ...duel.players[0].pos };
        duel.step([i < 0.5 / SIM_DT ? NEUTRAL_ARCADE : held, bot.commands(duel)]);
        const me = duel.players[0];
        if (me.engagement && !me.engagement.plan) distance += Math.hypot(me.pos.x - before.x, me.pos.z - before.z);
      }
      return distance;
    };
    expect(moved('libre')).toBeGreaterThan(2);
    expect(moved('ralenti')).toBeLessThan(1.2);
    expect(moved('bloque')).toBeLessThan(0.05);
  });

  it('ralenti et bloqué : la frappe part, et le stick vise toujours (balle vers la droite de Bleu)', () => {
    for (const mode of ['ralenti', 'bloque'] as const) {
      const right = play(mode, { forward: 0, right: 1 }).shot!;
      const left = play(mode, { forward: 0, right: -1 }).shot!;
      expect(right, mode).toBeTruthy();
      expect(left, mode).toBeTruthy();
      expect(Math.abs(right.target.x - left.target.x), mode).toBeGreaterThan(2);
    }
  });

  it('bloqué : la course assistée mène seule au point d’impact, même parti de loin', () => {
    expect(play('bloque', { forward: 0, right: 0 }, -3.5).shot).toBeTruthy();
    expect(play('bloque', { forward: 0, right: 1 }, 3.5).shot).toBeTruthy();
  });

  it('placement manuel : bloqué immobilise, au dernier moment laisse se placer, ralenti laisse de petits pas, libre court', () => {
    const moved = (mode: PrepMove): number => {
      const duel = new Duel(null);
      duel.players[0].assist = 'off';
      duel.players[0].prepMove = mode;
      duel.playSituation(1, [vec3(0, 0, -8.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.9, 8.5), target: vec3(0.9, 0.03, -6.8) });
      const start = { ...duel.players[0].pos };
      const held: ArcadeCommands = { ...NEUTRAL_ARCADE, stick: { forward: 0, right: 1 }, shot: 'normal' };
      for (let i = 0; i < 0.5 / SIM_DT; i++) duel.step([held, NEUTRAL_ARCADE]);
      const end = duel.players[0].pos;
      return Math.hypot(end.x - start.x, end.z - start.z);
    };
    // Bloqué : seulement le pas d'ajustement vers le point d'impact, s'il est tout près.
    expect(moved('bloque')).toBeLessThan(ARCADE.rally.adjustStep + 0.05);
    // L'impact est encore loin : bloqué au dernier moment se place comme libre.
    expect(moved('tard')).toBeGreaterThan(2);
    expect(moved('ralenti')).toBeGreaterThan(0.3);
    expect(moved('ralenti')).toBeLessThan(1);
    expect(moved('libre')).toBeGreaterThan(2);

    // Dans les `prepLock` dernières secondes avant l'impact prévu, il ne bouge plus : le stick vise.
    const duel = new Duel(null);
    duel.players[0].assist = 'off';
    duel.players[0].prepMove = 'tard';
    duel.playSituation(1, [vec3(0, 0, -8.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.9, 8.5), target: vec3(0.9, 0.03, -6.8) });
    const remaining = (): number => {
      const plan = duel.players[0].engagement?.plan;
      return plan ? (plan.tick - duel.tick) * SIM_DT : Infinity;
    };
    const lock = duel.profile.rally.prepLock;
    while (remaining() > lock - 0.02) duel.step([{ ...NEUTRAL_ARCADE, shot: 'normal' }, NEUTRAL_ARCADE]);
    const lockedAt = { ...duel.players[0].pos };
    while (remaining() > 0) duel.step([{ ...NEUTRAL_ARCADE, stick: { forward: 0, right: 1 }, shot: 'normal' }, NEUTRAL_ARCADE]);
    expect(Math.hypot(duel.players[0].pos.x - lockedAt.x, duel.players[0].pos.z - lockedAt.z)).toBeLessThan(0.01);
  });

  it('placement manuel, bloqué au dernier moment : préparé tôt au filet, on fait encore le pas vers une chiquita sur le côté', () => {
    const duel = new Duel(null);
    duel.players[0].assist = 'off';
    duel.players[0].prepMove = 'tard';
    const from = vec3(0.3, 0.6, 8.3);
    duel.playSituation(1, [vec3(0.4, 0, -3.2), vec3(0.3, 0, 8.5)], { kind: 'normal', contact: from, target: vec3(0, 0.03, -5) });
    const chiquita = solveShot('chiquita', from, aimTarget('chiquita', 1, { forward: 0, right: -1 }, false, duel.profile), false, duel.profile);
    duel.ball!.vel = chiquita.vel;
    duel.ball!.spin = chiquita.spin;
    const me = duel.players[0];
    let released = false;
    let hit = false;
    for (let i = 0; i < 3 / SIM_DT && duel.phase === 'rally' && !hit; i++) {
      // Prépare dès 0,2 s, et va vers le point prévu (le plus proche de lui), puis relâche au moment prévu.
      const plan = me.engagement?.plan;
      const axis = (delta: number): number => (Math.abs(delta) < 0.08 ? 0 : Math.max(-1, Math.min(1, delta * 3)));
      const right = plan ? axis((plan.stand.x - me.pos.x) * rightFor(me.side).x) : 0;
      const forward = plan ? axis((plan.stand.z - me.pos.z) * forwardFor(me.side).z) : 0;
      if (plan && plan.tick - duel.tick <= 2) released = true;
      const press = i * SIM_DT >= 0.2 && !released;
      duel.step([{ ...NEUTRAL_ARCADE, stick: { forward, right }, shot: press ? 'slice' : null }, NEUTRAL_ARCADE]);
      hit = duel.shot?.player === 0;
    }
    expect(hit).toBe(true);
  });

  it('placement manuel, bloqué : préparé dès la frappe adverse au filet, le pas d’ajustement va chercher la chiquita', () => {
    // Le cas qui frustrait (19/10) : tiré vers soi dès que Rouge frappe, le joueur restait figé à côté de la balle.
    for (const right of [-1, 1]) {
      const duel = new Duel(null);
      duel.players[0].assist = 'off';
      duel.players[0].prepMove = 'bloque';
      const from = vec3(0.3, 0.6, 8.3);
      duel.playSituation(1, [vec3(0.4, 0, -3.2), vec3(0.3, 0, 8.5)], { kind: 'normal', contact: from, target: vec3(0, 0.03, -5) });
      const chiquita = solveShot('chiquita', from, aimTarget('chiquita', 1, { forward: -0.6, right: right * 0.4 }, false, duel.profile), false, duel.profile);
      duel.ball!.vel = chiquita.vel;
      duel.ball!.spin = chiquita.spin;
      const me = duel.players[0];
      const aim = { forward: 0, right: 0.5 };
      let released = false;
      let hit = false;
      for (let i = 0; i < 3 / SIM_DT && duel.phase === 'rally' && !hit; i++) {
        const plan = me.engagement?.plan;
        if (plan && plan.tick - duel.tick <= 2) released = true;
        duel.step([{ ...NEUTRAL_ARCADE, stick: aim, shot: released ? null : 'slice' }, NEUTRAL_ARCADE]);
        hit = duel.shot?.player === 0;
      }
      expect(hit, `chiquita ${right}`).toBe(true);
    }
  });

  it('les IA ne sont pas concernées : le défaut reste libre', () => {
    expect(new Duel(null).players.every((p) => p.prepMove === 'libre')).toBe(true);
  });
});
