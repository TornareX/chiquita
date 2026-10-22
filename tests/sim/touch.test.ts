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

describe('volée au filet', () => {
  it('se joue coupée : après la vitre du fond, elle ressort basse, là où un coup lifté remonte', () => {
    /** Hauteur maximale de la balle après la vitre du fond (avant le second rebond). */
    const afterGlass = (spin: number): number => {
      const contact = vec3(0.5, 1.3, 3.2);
      const shot = solveShot('normal', contact, vec3(-2, 0.03, -8.8), false, ARCADE, ARCADE.rally.volleySpeed, 0, spin);
      const ball = createBall(contact, shot.vel, shot.spin);
      const contacts: Contact[] = [];
      let glass = false;
      let peak = 0;
      for (let i = 0; i < 4 / SIM_DT; i++) {
        contacts.length = 0;
        stepBall(ball, SIM_DT, ARCADE, contacts);
        if (contacts.some((c) => c.surface === 'glass')) glass = true;
        if (glass && contacts.some((c) => c.surface === 'ground')) break;
        if (glass) peak = Math.max(peak, ball.pos.y);
      }
      return peak;
    };
    expect(afterGlass(ARCADE.rally.volleySpin)).toBeLessThan(0.8);
    expect(afterGlass(ARCADE.rally.normal.spin)).toBeGreaterThan(1.5);
  });
});

describe('toucher : volée coupée, chiquita, blocage', () => {
  it('se choisit par la situation et le stick', () => {
    const neutral = { forward: 0, right: 0 };
    const back = { forward: -1, right: 0 };
    // X de volée : toujours coupée (sous pression, elle rate plus souvent) ; sans préparation, un blocage.
    expect(shotStyle('slice', true, false, neutral, 1, ARCADE)).toBe('cut');
    expect(shotStyle('slice', true, false, neutral, 0.1, ARCADE)).toBe('block');
    expect(shotStyle('slice', false, false, back, 1, ARCADE)).toBe('chiquita');
    expect(shotStyle('normal', false, false, back, 1, ARCADE)).toBeNull();
    expect(shotStyle('normal', true, false, neutral, 0.1, ARCADE)).toBe('block');
    expect(shotStyle('lob', false, false, neutral, 0.1, ARCADE)).toBeNull();
  });

  it('volée préparée : de pression par défaut, de définition seulement sur une balle offerte, basse sous le filet', () => {
    const neutral = { forward: 0, right: 0 };
    const back = { forward: -1, right: 0 };
    const ball = { height: 1.3, pressure: 0.2, perfect: true, nearNet: true };
    const style = (b: Partial<typeof ball>, volley = true) => shotStyle('slice', volley, false, neutral, 1, ARCADE, false, { ...ball, ...b });
    expect(style({})).toBe('punch');
    // Pas parfaite, balle jaune ou prise sous la bande : la volée de pression.
    expect(style({ perfect: false })).toBe('cut');
    expect(style({ pressure: 0.5 })).toBe('cut');
    expect(style({ height: 0.95 })).toBe('cut');
    // Sous la bande du filet (une chiquita), de volée ou au pied : volée basse, on remonte la balle.
    expect(style({ height: 0.5 })).toBe('low');
    expect(style({ height: 0.4 }, false)).toBe('low');
    expect(style({ height: 0.4, nearNet: false }, false)).toBeNull();
    // Sans préparation, toujours le blocage ; la chiquita reste une chiquita.
    expect(shotStyle('slice', true, false, neutral, 0.1, ARCADE, false, { ...ball, height: 0.5 })).toBe('block');
    expect(shotStyle('slice', false, false, back, 1, ARCADE, false, { ...ball, height: 0.4 })).toBe('chiquita');
  });

  it('vitesses : la volée coupée met la pression (~70 km/h), la définition conclut, la volée basse remonte la balle', () => {
    const { cut, punch, lowVolley } = ARCADE.rally;
    expect(cut.speed * 3.6).toBeGreaterThan(60);
    expect(cut.speed * 3.6).toBeLessThan(80);
    expect(punch.speed).toBeGreaterThan(cut.speed * 1.25);
    expect(lowVolley.speed).toBeLessThan(cut.speed);
    expect(lowVolley.clearance).toBeGreaterThan(cut.clearance);
  });

  it('préparation : sans temps, on bloque ; armé tôt, le coup part plein, sans rien de plus au-delà', () => {
    expect(preparation(0.1, ARCADE)).toBe(ARCADE.rally.blockSpeed);
    expect(preparation(ARCADE.rally.fullPrep, ARCADE)).toBe(1);
    expect(preparation(5, ARCADE)).toBe(1);
    expect(preparation(0.45, ARCADE)).toBeGreaterThan(ARCADE.rally.blockSpeed);
  });

  it('volée coupée parfaite sur une balle flottante : volée de définition, aussi rapide que la volée normale, elle rebondit plus bas', () => {
    // Coup de fond lent et haut vers le joueur au filet.
    const volley = (kind: 'slice' | 'normal') => {
      const duel = incoming('normal', vec3(0, 1, 8.5), { forward: -0.5, right: 0 }, vec3(0.6, 0, -3), true);
      duel.players[1].lastHit = null;
      const shot = answer(duel, kind, { forward: 0, right: 0 })!;
      return { shot, ...bounces(createBall(shot.contact, duel.ball!.vel, duel.ball!.spin)) };
    };
    const cut = volley('slice');
    const flat = volley('normal');
    expect(cut.shot.style).toBe('punch');
    expect(cut.shot.volley).toBe(true);
    expect(cut.shot.perfect).toBe(true);
    // Au padel, la volée se joue coupée, aussi fort.
    expect(cut.shot.speed).toBeGreaterThan(flat.shot.speed * 0.9);
    expect(cut.peak).toBeLessThan(flat.peak);
    expect(cut.peak).toBeLessThan(0.45);
    expect(cut.second).not.toBeNull();
  });

  it('la volée coupée demande du temps : sur une balle rapide, elle rate plus que la volée normale', () => {
    const volley = (kind: 'slice' | 'normal') =>
      answer(incoming('normal', vec3(0, 1, 7), { forward: 0, right: 0 }, vec3(0.6, 0, -3)), kind, { forward: 0, right: 0 })!;
    const cut = volley('slice');
    const flat = volley('normal');
    expect(cut.style).toBe('cut');
    expect(cut.pressure).toBeGreaterThan(1 / 3);
    expect(cut.error).toBeGreaterThan(flat.error * 1.3);
  });

  it('chiquita : X stick vers soi sur une balle de fond, lente, courte et basse', () => {
    const duel = incoming('normal', vec3(0, 1, 3.5), { forward: 0, right: 0 }, vec3(0.6, 0, -8.5));
    const shot = answer(duel, 'slice', { forward: -1, right: 0 });
    expect(shot?.style).toBe('chiquita');
    expect(shot!.speed).toBeLessThan(ARCADE.rally.slice.speed);
    expect(Math.abs(shot!.target.z)).toBeLessThan(4);
  });

  it('armer trop tard : coup bloqué, plus lent qu’un coup préparé', () => {
    // Le coup se joue de volée : on lui rend le seuil des autres coups (la volée a le sien, plus court : volley.test.ts).
    const drive = (pressAt: number): DuelShot => {
      const duel = incoming('normal', vec3(0, 1, 7), { forward: 0, right: 0 }, vec3(0.6, 0, -3));
      duel.profile.rally.volleyPrep = duel.profile.rally.blockPrep;
      return answer(duel, 'normal', { forward: 0, right: 0 }, pressAt)!;
    };
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

describe('reprendre une chiquita, au filet', () => {
  /** Chiquita du joueur 1 (stick `forward`) depuis le fond ; le joueur 0, monté au filet, réagit quand elle le passe. */
  function chiquita(forward: number, fromZ: number): Duel {
    const duel = new Duel();
    duel.phase = 'rally';
    duel.lastHitter = 1;
    duel.hits = 4;
    duel.players[1].lastHitTick = duel.tick;
    duel.players[0].pos = duel.players[0].prevPos = vec3(0.4, 0, -2.2);
    duel.players[0].assist = 'full';
    const from = vec3(0, 0.6, fromZ);
    const shot = solveShot('chiquita', from, aimTarget('chiquita', 1, { forward, right: 0 }, false, ARCADE), false, ARCADE);
    duel.ball = createBall(from, shot.vel, shot.spin);
    while (duel.ball!.pos.z > -0.3) duel.step();
    return duel;
  }

  it('la balle qui plonge aux pieds se reprend sous le filet, même relâchée un peu en retard', () => {
    // Avant, la course assistée prévoyait une volée à 30 cm juste avant le rebond : 0,06 s de retard, coup dans le vide.
    for (const [forward, fromZ] of [[-1, 6], [-0.6, 6], [-0.6, 7.5]] as const) {
      for (const offset of [0, 0.06, 0.1]) {
        const shot = answer(chiquita(forward, fromZ), 'normal', { forward: 0, right: 0 }, 0, offset);
        expect(shot, `stick ${forward}, depuis ${fromZ} m, relâché ${offset} s en retard`).not.toBeNull();
        // Sous la bande du filet : il doit la remonter.
        expect(shot!.contact.y).toBeLessThan(0.88);
        if (shot!.volley) expect(shot!.contact.y).toBeGreaterThanOrEqual(ARCADE.rally.volleyLow - 0.05);
      }
    }
  });

  it('ramassée aux pieds et mal frappée, elle finit parfois dans le filet ; bien frappée, elle passe', () => {
    const end = (error: number) => {
      const duel = new Duel();
      duel.playSituation(0, [vec3(0.4, 0, -2.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0.4, 0.2, -2.3), target: vec3(0, 0.03, 7.5), error });
      for (let i = 0; i < 4 / SIM_DT && duel.phase === 'rally'; i++) duel.step();
      return duel.lastResult;
    };
    expect(end(1)).toMatchObject({ winner: 1, reason: 'net' });
    expect(end(0)?.reason).not.toBe('net');
  });
});
