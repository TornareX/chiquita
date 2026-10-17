import { describe, expect, it } from 'vitest';
import { createBall, type Ball } from '../../src/sim/ball';
import { stepBall, type Contact } from '../../src/sim/collisions';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, preparation, shotStyle, type DuelShot } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { aimTarget, solveShot } from '../../src/sim/shots';
import { vec3, type Vec3 } from '../../src/sim/vec3';

/** Hauteur maximale du premier rebond, et profondeur du second (distance au filet). */
function bounces(ball: Ball): { peak: number; second: number | null } {
  const contacts: Contact[] = [];
  let grounds = 0;
  let peak = 0;
  for (let i = 0; i < 4 / SIM_DT; i++) {
    contacts.length = 0;
    stepBall(ball, SIM_DT, ARCADE, contacts);
    for (const c of contacts) {
      if (c.surface !== 'ground') continue;
      if (++grounds === 2) return { peak, second: Math.abs(c.pos.z) };
    }
    if (grounds === 1) peak = Math.max(peak, ball.pos.y);
  }
  return { peak, second: null };
}

/** Le joueur 1 frappe depuis `from` (coup `kind`, stick `aim`) ; le joueur 0 attend en `at`. */
function incoming(kind: 'normal' | 'lob' | 'slice', from: Vec3, aim: ArcadeCommands['stick'], at: Vec3, soft = false): Duel {
  const duel = new Duel();
  duel.phase = 'rally';
  duel.lastHitter = 1;
  duel.hits = 4;
  duel.players[1].lastHitTick = duel.tick;
  duel.players[0].pos = duel.players[0].prevPos = at;
  duel.players[0].assist = 'full';
  // Balle flottante : lente et haute au-dessus du filet (une défense ratée).
  const p = structuredClone(ARCADE);
  if (soft) p.rally[kind] = { ...p.rally[kind], speed: 6, clearance: 1 };
  const shot = solveShot(kind, from, aimTarget(kind, 1, aim, false, p), false, p);
  duel.ball = createBall(from, shot.vel, shot.spin);
  return duel;
}

/** Le joueur 0 appuie sur `kind` au pas `pressAt`, relâche au moment d'impact prévu (+ `offset` s). */
function answer(duel: Duel, kind: ShotKind, stick: ArcadeCommands['stick'], pressAt = 0, offset = 0): DuelShot | null {
  let released = false;
  for (let i = 0; i < 6 / SIM_DT && duel.phase === 'rally'; i++) {
    const plan = duel.players[0].engagement?.plan;
    if (!released && plan && duel.tick >= plan.tick + Math.round(offset / SIM_DT)) released = true;
    const holding = i >= pressAt && !released;
    duel.step([{ stick, shot: holding ? kind : null }, NEUTRAL_ARCADE]);
    if (duel.shot?.player === 0) return duel.shot;
  }
  return null;
}

describe('balle coupée', () => {
  it('rebondit plus bas qu’une balle liftée, d’autant plus qu’elle est coupée', () => {
    const contact = vec3(0.5, 1.4, -2.5);
    const target = vec3(1, 0.03, 5);
    const peak = (spin: number): number => {
      const p = structuredClone(ARCADE);
      p.rally.slice = { ...p.rally.slice, spin, clearance: 0.1 };
      const shot = solveShot('slice', contact, target, false, p);
      return bounces(createBall(contact, shot.vel, shot.spin)).peak;
    };
    expect(peak(-0.3)).toBeLessThan(peak(0.1));
    expect(peak(-0.95)).toBeLessThan(peak(-0.3) * 0.6);
  });
});

describe('toucher : volée coupée, chiquita, blocage', () => {
  it('se choisit par la situation et le stick', () => {
    const neutral = { forward: 0, right: 0 };
    const back = { forward: -1, right: 0 };
    expect(shotStyle('slice', true, false, 1.2, 0.1, neutral, 1, ARCADE)).toBe('cut');
    // Balle pas flottante (sous pression, ou basse) : X de volée reste un blocage ou un coupé normal.
    expect(shotStyle('slice', true, false, 1.2, 0.5, neutral, 1, ARCADE)).toBeNull();
    expect(shotStyle('slice', true, false, 0.6, 0.1, neutral, 1, ARCADE)).toBeNull();
    expect(shotStyle('slice', false, false, 0.9, 0.5, back, 1, ARCADE)).toBe('chiquita');
    expect(shotStyle('normal', false, false, 0.9, 0.5, back, 1, ARCADE)).toBeNull();
    expect(shotStyle('normal', true, false, 1.2, 0.5, neutral, 0.1, ARCADE)).toBe('block');
    expect(shotStyle('lob', false, false, 0.9, 0.5, neutral, 0.1, ARCADE)).toBeNull();
  });

  it('préparation : sans temps, on bloque ; armé tôt, le coup part plein, sans rien de plus au-delà', () => {
    expect(preparation(0.1, ARCADE)).toBe(ARCADE.rally.blockSpeed);
    expect(preparation(ARCADE.rally.fullPrep, ARCADE)).toBe(1);
    expect(preparation(5, ARCADE)).toBe(1);
    expect(preparation(0.45, ARCADE)).toBeGreaterThan(ARCADE.rally.blockSpeed);
  });

  it('volée coupée sur une balle flottante : rasante, elle s’écrase et meurt avant la vitre', () => {
    // Coup de fond lent et haut vers le joueur au filet.
    const duel = incoming('normal', vec3(0, 1, 8.5), { forward: -0.5, right: 0 }, vec3(0.6, 0, -3), true);
    duel.players[1].lastHit = null;
    const shot = answer(duel, 'slice', { forward: 0, right: 0 });
    expect(shot?.style).toBe('cut');
    expect(shot?.volley).toBe(true);
    expect(shot?.perfect).toBe(true);
    const ball = createBall(shot!.contact, duel.ball!.vel, duel.ball!.spin);
    const { peak, second } = bounces(ball);
    expect(peak).toBeLessThan(0.35);
    expect(second).not.toBeNull();
    expect(second!).toBeLessThan(9);
  });

  it('chiquita : X stick vers soi sur une balle de fond, lente, courte et basse', () => {
    const duel = incoming('normal', vec3(0, 1, 3.5), { forward: 0, right: 0 }, vec3(0.6, 0, -8.5));
    const shot = answer(duel, 'slice', { forward: -1, right: 0 });
    expect(shot?.style).toBe('chiquita');
    expect(shot!.speed).toBeLessThan(ARCADE.rally.slice.speed);
    expect(Math.abs(shot!.target.z)).toBeLessThan(4);
  });

  it('armer trop tard : coup bloqué, plus lent qu’un coup préparé', () => {
    const drive = (pressAt: number): DuelShot =>
      answer(incoming('normal', vec3(0, 1, 7), { forward: 0, right: 0 }, vec3(0.6, 0, -3)), 'normal', { forward: 0, right: 0 }, pressAt)!;
    const prepared = drive(0);
    // Appui au dernier moment : la balle arrive à portée moins de 0,3 s plus tard.
    const plannedTick = (() => {
      const d = incoming('normal', vec3(0, 1, 7), { forward: 0, right: 0 }, vec3(0.6, 0, -3));
      d.step([{ stick: { forward: 0, right: 0 }, shot: 'normal' }, NEUTRAL_ARCADE]);
      return d.players[0].engagement!.plan!.tick;
    })();
    const late = drive(plannedTick - Math.round(0.15 / SIM_DT));
    expect(prepared.style).toBeNull();
    expect(late.style).toBe('block');
    // Plus lent à l'horizontale, il vole plus longtemps pour passer le filet : la vitesse totale baisse moins.
    expect(late.speed).toBeLessThan(prepared.speed * 0.9);
  });
});
