import { describe, expect, it } from 'vitest';
import { SwingStick } from '../../src/input/swingStick';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot } from '../../src/sim/duel';
import { SITUATIONS } from '../../src/sim/situations';
import { vec3 } from '../../src/sim/vec3';
import { plansHighShot } from '../../src/render/pose';

/**
 * Geste lâché lancé en avance (journal des frappes, 22/10) : au fond, Xavier prépare une chiquita (stick droit tiré vers
 * soi ~0,9 s), puis le lâche ~0,7 s avant que la balle ressorte de sa vitre. La raquette partait aussitôt : coup dans le
 * vide (« hors de portée »). Joué avec les commandes d'un humain : `SwingStick` → commandes → `Duel.step`.
 */
function letGoEarly(lead: number, prep = 0.6): { duel: Duel; shot: DuelShot | null; end: string | undefined; distance: number } {
  const duel = new Duel(null);
  const me = duel.players[0];
  me.assist = 'off';
  me.prepMove = 'bloque';
  // Rouge frappe fort et bas au fond de Bleu : la balle rebondit, va dans la vitre et en ressort lentement.
  SITUATIONS.find((s) => s.id === 'balle-qui-meurt')!.start(duel);
  me.pos = me.prevPos = vec3(0, 0, -8);
  const start = duel.time;
  const swing = new SwingStick();
  let armTick: number | null = null;
  let letGo = false;
  let end: string | undefined;
  let distance = 0;
  let shot: DuelShot | null = null;
  for (let i = 0; i < 4 / SIM_DT && !duel.result && !shot && me.lastWhiffTick === -Infinity; i++) {
    const plan = me.engagement?.plan;
    // Il lâche le stick `lead` s avant le point prévu (après la vitre), une fois préparé `prep` s.
    if (!letGo && plan && armTick !== null && (duel.tick - armTick) * SIM_DT >= prep && (plan.tick - duel.tick) * SIM_DT <= lead) {
      letGo = true;
      distance = Math.abs(me.pos.z);
    }
    const arming = !letGo && duel.time - start >= 0.1;
    const out = swing.update(0, arming ? -1 : 0, SIM_DT);
    if (arming) armTick ??= duel.tick;
    end ??= out.swing?.end;
    duel.step([{ stick: { forward: 0, right: 0 }, shot: out.shot, ...(out.swing ? { swing: out.swing } : {}) }]);
    if (duel.shot?.player === 0) shot = duel.shot;
  }
  return { duel, shot, end, distance };
}

describe('geste lâché en avance', () => {
  it('chiquita au fond lâchée 0,7 s avant la balle : la raquette l’attend, pas de coup dans le vide', () => {
    const { duel, shot, end, distance } = letGoEarly(0.7);
    expect(end).toBe('letGo');
    expect(distance).toBeGreaterThan(8);
    expect(duel.players[0].lastWhiffReason).toBeNull();
    expect(shot).not.toBeNull();
    // Après le rebond et la vitre, au point prévu : une chiquita.
    expect(shot!.volley).toBe(false);
    expect(shot!.style).toBe('chiquita');
    expect(Math.abs(shot!.contact.z)).toBeGreaterThan(8);
  });

  it('lâché entre 0,5 et 0,75 s avant : toujours une chiquita après la vitre', () => {
    for (const lead of [0.5, 0.55, 0.6, 0.65, 0.75]) {
      const { duel, shot } = letGoEarly(lead);
      expect(duel.players[0].lastWhiffReason, `lâché ${lead} s avant`).toBeNull();
      expect(shot?.style, `lâché ${lead} s avant`).toBe('chiquita');
      expect(shot?.volley, `lâché ${lead} s avant`).toBe(false);
    }
  });
});

describe('préparation tenue au-delà du point prévu', () => {
  it('balle haute laissée redescendre : la préparation affichée n’est plus un coup haut (bajada)', () => {
    // Échange de fond : la balle rebondit et monte haut devant la vitre (point prévu haut : préparation de bajada). Bleu
    // garde le stick tiré vers soi et la laisse redescendre.
    const duel = new Duel(null);
    const me = duel.players[0];
    me.assist = 'off';
    me.prepMove = 'bloque';
    SITUATIONS.find((s) => s.id === 'echange-fond')!.start(duel);
    me.pos = me.prevPos = vec3(1.5, 0, -8);
    const swing = new SwingStick();
    const start = duel.time;
    let highTick: number | null = null;
    let checked = 0;
    for (let i = 0; i < 4 / SIM_DT && !duel.result; i++) {
      const out = swing.update(0, duel.time - start > 0.1 ? -1 : 0, SIM_DT);
      duel.step([{ stick: { forward: 0, right: 0 }, shot: out.shot, ...(out.swing ? { swing: out.swing } : {}) }]);
      const engagement = me.engagement;
      if (!engagement) continue;
      const plan = engagement.plan;
      if (plan && plansHighShot(duel, me, engagement)) highTick ??= plan.tick;
      // Le point haut passé de plus de `overheadLateWindow`, la balle redescendue sous les épaules : la préparation suit
      // la balle qui vient.
      const passed = highTick !== null && (duel.tick - highTick) * SIM_DT > duel.profile.rally.overheadLateWindow + SIM_DT;
      if (passed && duel.ball!.pos.y < 1.2) {
        expect(plan === null || plansHighShot(duel, me, engagement), `t = ${(duel.time - start).toFixed(2)} s`).toBe(false);
        checked++;
      }
    }
    expect(highTick).not.toBeNull();
    expect(checked).toBeGreaterThan(0);
  });
});
