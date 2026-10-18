import { describe, expect, it } from 'vitest';
import { IDLE_PAD, mergePads, readGamepad, toCommands } from '../../src/input/gamepad';
import { SWING, SwingStick, type SwingOutput } from '../../src/input/swingStick';
import { NEUTRAL_ARCADE, type ArcadeCommands, type SwingEnd } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot, type HighFloor } from '../../src/sim/duel';
import { AttemptWatcher, LESSONS, STICK_LESSONS, stickShotOf } from '../../src/sim/lessons';
import { ARCADE } from '../../src/sim/profile';
import { vec3, type Vec3 } from '../../src/sim/vec3';

type Point = [right: number, up: number];

/** Fins du geste préparé : chemins du stick après la préparation (stick tiré vers soi), un point par pas. */
const PATHS: Record<SwingEnd, Point[]> = {
  straight: [[0, -0.3], [0, 0.2], [0, 0.9]],
  arc: [[0.6, -0.8], [0.9, -0.3], [0.95, 0.2], [0.6, 0.75]],
  letGo: Array.from({ length: Math.ceil(SWING.dwell / SIM_DT) + 1 }, () => [0, 0] as Point),
};

/** Joue `arm` pas de préparation puis le chemin, puis `after` pas au centre ; sorties de chaque pas. */
function play(path: Point[], arm = 30, after = 3): SwingOutput[] {
  const swing = new SwingStick();
  const points: Point[] = [...Array.from({ length: arm }, () => [0, -1] as Point), ...path, ...Array.from({ length: after }, () => [0, 0] as Point)];
  return points.map(([right, up]) => swing.update(right, up, SIM_DT));
}
const release = (out: SwingOutput[]): SwingOutput | undefined => out.find((o, i) => i > 0 && o.shot === null);

describe('geste du stick droit', () => {
  it('stick tiré vers soi : préparation (coup tenu, préparé)', () => {
    const out = play([], 10, 0);
    expect(out.every((o) => o.shot !== null && o.swing?.prepared === true)).toBe(true);
  });

  it('trois fins : tout droit, en arc, lâché ; relâché à la fin du geste', () => {
    for (const end of ['straight', 'arc', 'letGo'] as const) {
      const out = play(PATHS[end]);
      expect(release(out)?.swing, end).toEqual({ prepared: true, end });
    }
  });

  it('arc qui s’arrête sur le côté puis lâché : lob quand même (pas une chiquita)', () => {
    // Du bas vers la droite, sans remonter jusqu'en haut, puis le stick revient au centre.
    const out = play([[0.5, -0.85], [0.85, -0.45], [0.95, 0], [0.4, 0.05], [0, 0]]);
    expect(release(out)?.swing).toEqual({ prepared: true, end: 'arc' });
  });

  it('arc par un côté qui remonte un peu vers l’avant : lob, sans attendre d’arriver en haut', () => {
    const out = play([[0.5, -0.85], [0.85, -0.45], [0.95, 0], [0.9, 0.3]]);
    expect(release(out)?.swing).toEqual({ prepared: true, end: 'arc' });
  });

  it('arc lent et peu large (le pouce passe vers la droite sans aller au bord) : lob', () => {
    // Un point tous les 4 pas : ~0,4 s pour le geste.
    const slow = (points: Point[]): Point[] => points.flatMap((p) => [p, p, p, p]);
    const out = play(slow([[0.3, -0.85], [0.5, -0.6], [0.6, -0.3], [0.55, 0], [0.45, 0.25], [0.3, 0.6]]));
    expect(release(out)?.swing).toEqual({ prepared: true, end: 'arc' });
  });

  it('un geste tout droit qui dévie un peu sur le côté reste tout droit', () => {
    const out = play([[0.15, -0.5], [0.25, 0], [0.2, 0.9]]);
    expect(release(out)?.swing?.end).toBe('straight');
  });

  it('un geste tout droit qui traverse le centre en un pas reste tout droit', () => {
    const out = play([[0, 0], [0, 0], [0, 0.8]]);
    expect(release(out)?.swing?.end).toBe('straight');
  });

  it('coup sec vers l’avant depuis le centre : appui sans préparation, relâché au pas suivant', () => {
    const swing = new SwingStick();
    const first = swing.update(0, 0.9, SIM_DT);
    expect(first.shot).not.toBeNull();
    expect(first.swing).toEqual({ prepared: false, end: 'straight' });
    expect(swing.update(0, 0.9, SIM_DT).shot).toBeNull();
  });

  it('après une frappe, il faut repasser par le centre pour rejouer', () => {
    const swing = new SwingStick();
    for (const [r, u] of [...Array.from({ length: 5 }, () => [0, -1] as Point), ...PATHS.straight]) swing.update(r, u, SIM_DT);
    expect(swing.update(0, 0.9, SIM_DT).shot).toBeNull();
    expect(swing.update(0, 0, SIM_DT).shot).toBeNull();
    expect(swing.update(0, -1, SIM_DT).shot).not.toBeNull();
  });
});

/** Geste à jouer : préparé avec une fin, ou coup sec sans préparation. */
type Gesture = { prepared: true; end: SwingEnd } | { prepared: false };

/**
 * Moment de la frappe, pris sur un essai témoin (comme un joueur qui voit venir la balle). Sans préparation, pas
 * de course assistée : sur une balle qui ne monte pas, quand elle passe au plus près du joueur.
 */
function impactTick(setup: (duel: Duel) => void, prepared: boolean, highFloor: HighFloor): number {
  const probe = new Duel(null);
  probe.highFloor = highFloor;
  setup(probe);
  if (!prepared) {
    const watch = new Duel(null);
    setup(watch);
    let best = { tick: 0, gap: Infinity };
    let maxY = 0;
    for (let i = 0; i < 4 / SIM_DT && watch.phase === 'rally'; i++) {
      watch.step([NEUTRAL_ARCADE, NEUTRAL_ARCADE]);
      const ball = watch.ball!;
      const me = watch.players[0];
      maxY = Math.max(maxY, ball.pos.z < 0 ? ball.pos.y : 0);
      const gap = Math.hypot(ball.pos.x - me.pos.x, ball.pos.z - me.pos.z);
      if (ball.pos.z < 0 && ball.pos.y > 0.4 && ball.pos.y < 1.4 && gap < best.gap) best = { tick: watch.tick, gap };
    }
    // Balle haute (lob) : la bandeja se juge à hauteur des yeux, comme la course assistée la prévoit.
    if (maxY < 2) return best.tick;
  }
  for (let i = 0; i < 2; i++) probe.step([{ stick: { forward: 0, right: 0 }, shot: 'overhead', swing: { prepared } }, NEUTRAL_ARCADE]);
  return probe.overheadReleaseTick(0) ?? probe.players[0].engagement!.plan!.tick;
}

/** Position du stick droit à `t` pas de la frappe : préparé, la fin du geste arrive à la frappe ; sinon coup sec juste avant. */
function stickAt(gesture: Gesture, t: number): Point {
  if (!gesture.prepared) return t <= 2 && t > -1 ? [0, 0.9] : [0, 0];
  const path = PATHS[gesture.end];
  return t >= path.length ? [0, -1] : (path[path.length - 1 - t] ?? [0, 0]);
}

/** Joue une situation au geste : `setup` place les joueurs et lance la balle de Rouge. */
function rally(setup: (duel: Duel) => void, gesture: Gesture, highFloor: HighFloor = 'epaules'): DuelShot | null {
  const impact = impactTick(setup, gesture.prepared, highFloor);
  const duel = new Duel(null);
  duel.highFloor = highFloor;
  setup(duel);
  const swing = new SwingStick();
  for (let i = 0; i < 6 / SIM_DT && duel.phase === 'rally'; i++) {
    const [right, up] = stickAt(gesture, impact - duel.tick);
    const out = swing.update(right, up, SIM_DT);
    duel.step([{ stick: { forward: 0, right: 0 }, shot: out.shot, ...(out.swing ? { swing: out.swing } : {}) }, NEUTRAL_ARCADE]);
    if (duel.shot?.player === 0) return duel.shot;
  }
  return null;
}

/** Bleu au fond, balle facile de Rouge. */
const baseline = (duel: Duel): void =>
  duel.playSituation(1, [vec3(0, 0, -8.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.9, 8.5), target: vec3(1.4, 0.03, -6.6) });
/** Bleu au filet : balle rapide (`fast`) ou flottante. */
const atNet =
  (fast: boolean) =>
  (duel: Duel): void =>
    duel.playSituation(
      1,
      [vec3(0, 0, -2.5), vec3(0, 0, 8.5)],
      fast
        ? { kind: 'normal', contact: vec3(0, 1, 8.5), target: vec3(0.8, 0.03, -8) }
        : { kind: 'slice', contact: vec3(0, 1, 8.5), target: vec3(0.8, 0.03, -4), error: 0.5 },
    );
/** Lob de Rouge sur Bleu en `at`. */
const lobOn =
  (at: Vec3, depth = 6.2) =>
  (duel: Duel): void =>
    duel.playSituation(1, [at, vec3(0, 0, 8.6)], { kind: 'lob', contact: vec3(0.3, 0.9, 8.6), target: vec3(0.6, 0.03, -depth) });

describe('au sol : coup choisi par la fin du geste', () => {
  it('tout droit : coup normal ; en arc : lob ; lâché : chiquita', () => {
    expect(stickShotOf(rally(baseline, { prepared: true, end: 'straight' })!)).toBe('normal');
    expect(stickShotOf(rally(baseline, { prepared: true, end: 'arc' })!)).toBe('lob');
    expect(stickShotOf(rally(baseline, { prepared: true, end: 'letGo' })!)).toBe('chiquita');
  });

  it('sans préparation : le coup part, moins fort qu’un coup préparé', () => {
    // Pas de course assistée sans préparation : la balle arrive près du joueur.
    const close = (duel: Duel): void =>
      duel.playSituation(1, [vec3(0, 0, -8.5), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.9, 8.5), target: vec3(0.6, 0.03, -6.6) });
    const quick = rally(close, { prepared: false })!;
    const full = rally(baseline, { prepared: true, end: 'straight' })!;
    expect(stickShotOf(quick)).toBe('sansPrep');
    expect(quick.speed).toBeLessThan(full.speed * 0.8);
  });
});

describe('de volée', () => {
  it('sans préparation : volée bloquée', () => {
    const shot = rally(atNet(true), { prepared: false })!;
    expect(shot.volley).toBe(true);
    expect(stickShotOf(shot)).toBe('voleeBloquee');
  });

  it('préparée, quelle que soit la fin : volée coupée', () => {
    for (const end of ['straight', 'arc', 'letGo'] as const) {
      const shot = rally(atNet(false), { prepared: true, end })!;
      expect(shot.volley, end).toBe(true);
      expect(stickShotOf(shot), end).toBe('voleeCoupee');
    }
  });
});

describe('au-dessus de la tête', () => {
  const lob = lobOn(vec3(0.3, 0, -3.5));

  it('sans préparation : bandeja ; préparé tout droit : smash ; en arc : víbora ; lâché : feinte', () => {
    expect(rally(lob, { prepared: false })?.overhead).toBe('bandeja');
    expect(rally(lob, { prepared: true, end: 'straight' })?.overhead).toBe('remate');
    expect(rally(lob, { prepared: true, end: 'arc' })?.overhead).toBe('vibora');
    expect(rally(lob, { prepared: true, end: 'letGo' })?.overhead).toBe('feinte');
  });

  it('feinte de smash : lente, elle rebondit chez l’adversaire', () => {
    const feinte = rally(lob, { prepared: true, end: 'letGo' })!;
    const smash = rally(lob, { prepared: true, end: 'straight' })!;
    expect(feinte.speed).toBeLessThan(smash.speed / 3);
    expect(feinte.target.z).toBeGreaterThan(3);
    expect(feinte.target.z).toBeLessThan(8);
  });

  it('smash de trop loin : il reste dans le terrain, l’adversaire peut contrer (pas de por tres)', () => {
    const far = rally(lobOn(vec3(0.3, 0, -7.5), 9.3), { prepared: true, end: 'straight' })!;
    expect(far.overhead).toBe('remate');
    expect(Math.abs(far.contact.z)).toBeGreaterThan(ARCADE.rally.remateZone);
    expect(Math.abs(far.target.z)).toBeGreaterThan(5);
  });

  it('seuil réglable : la même balle flottante est un coup haut aux épaules, une volée au-dessus de la tête', () => {
    const floaty = (duel: Duel): void =>
      duel.playSituation(1, [vec3(0, 0, -2.5), vec3(0, 0, 8.5)], { kind: 'slice', contact: vec3(0, 1, 8.5), target: vec3(0.8, 0.03, -5), error: 0.5 });
    const shoulders = rally(floaty, { prepared: true, end: 'straight' }, 'epaules')!;
    const head = rally(floaty, { prepared: true, end: 'straight' }, 'tete')!;
    expect(shoulders.contact.y).toBeGreaterThan(ARCADE.rally.overheadLow);
    expect(shoulders.overhead).not.toBeNull();
    expect(head.overhead).toBeNull();
    expect(stickShotOf(head)).toBe('voleeCoupee');
  });

  it('seuil aux yeux : la défense remise à plat, entre épaules et yeux, se joue de volée', () => {
    // Coup droit de défense frappé du fond sous un peu de pression : il arrive au volleyeur vers 1,5 m.
    const defence = (duel: Duel): void =>
      duel.playSituation(1, [vec3(0, 0, -2.8), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.5, 8.5), target: vec3(0.8, 0.03, -8.8), error: 0.4 });
    const shoulders = rally(defence, { prepared: true, end: 'straight' }, 'epaules')!;
    expect(shoulders.contact.y).toBeGreaterThan(ARCADE.rally.overheadLow);
    expect(shoulders.overhead).not.toBeNull();
    const eyes = rally(defence, { prepared: true, end: 'straight' }, 'yeux')!;
    expect(eyes.volley).toBe(true);
    expect(eyes.overhead).toBeNull();
    // Un lob, lui, reste un coup haut.
    expect(rally(lobOn(vec3(0.3, 0, -3.5)), { prepared: false }, 'yeux')?.overhead).toBe('bandeja');
  });

  it('seuil « lob » : coup haut seulement sur un lob ; la même défense coupée haute (~11 m/s) se joue de volée', () => {
    const floaty = (duel: Duel): void =>
      duel.playSituation(1, [vec3(0, 0, -2.5), vec3(0, 0, 8.5)], { kind: 'slice', contact: vec3(0, 1, 8.5), target: vec3(0.8, 0.03, -5), error: 0.5 });
    // Aux épaules, cette balle se smashe ; ici, la course assistée la prend de volée, à hauteur de volée.
    expect(rally(floaty, { prepared: true, end: 'straight' }, 'epaules')!.overhead).not.toBeNull();
    const volley = rally(floaty, { prepared: true, end: 'straight' }, 'lob')!;
    expect(volley.volley).toBe(true);
    expect(volley.overhead).toBeNull();
    expect(stickShotOf(volley)).toBe('voleeCoupee');
    const lob = lobOn(vec3(0.3, 0, -3.5));
    expect(rally(lob, { prepared: false }, 'lob')?.overhead).toBe('bandeja');
    expect(rally(lob, { prepared: true, end: 'straight' }, 'lob')?.overhead).toBe('remate');
    expect(rally(lob, { prepared: true, end: 'arc' }, 'lob')?.overhead).toBe('vibora');
  });

  it('seuil « lob » par défaut : la balle flottante (lente) au filet se smashe, la défense rapide se volleye', () => {
    expect(new Duel(null).highFloor).toBe('lob');
    // Balle qui flotte au-dessus du filet, à ~3,5 m/s : un smash, pas une volée qu'on ne peut pas atteindre.
    const floater = (duel: Duel): void => {
      duel.playSituation(1, [vec3(0.4, 0, -3), vec3(0, 0, 6)], { kind: 'normal', contact: vec3(0, 1, 6), target: vec3(0.5, 0.03, -3) });
      duel.ball!.pos = vec3(0.3, 2.6, 1);
      duel.ball!.vel = vec3(0, 2, -3.5);
    };
    expect(rally(floater, { prepared: true, end: 'straight' }, 'lob')?.overhead).toBe('remate');
    const defence = (duel: Duel): void =>
      duel.playSituation(1, [vec3(0, 0, -2.8), vec3(0, 0, 8.5)], { kind: 'normal', contact: vec3(0, 0.5, 8.5), target: vec3(0.8, 0.03, -8.8), error: 0.4 });
    const volley = rally(defence, { prepared: true, end: 'straight' }, 'lob')!;
    expect(volley.volley).toBe(true);
    expect(volley.overhead).toBeNull();
  });
});

describe('leçons au stick', () => {
  /** Joue l'essai 0 d'une leçon au stick avec son geste, et rend le verdict. */
  function lessonVerdict(id: string) {
    const lesson = LESSONS.find((l) => l.id === id)!;
    const gesture = lesson.stick!.swing;
    const g: Gesture = gesture.prepared ? { prepared: true, end: gesture.end ?? 'straight' } : { prepared: false };
    const setup = (duel: Duel): void => lesson.start(duel, 0);
    const impact = impactTick(setup, g.prepared, new Duel(null).highFloor);
    const duel = new Duel(null);
    setup(duel);
    const watcher = new AttemptWatcher(duel);
    const swing = new SwingStick();
    for (;;) {
      const [right, up] = stickAt(g, impact - duel.tick);
      const out = swing.update(right, up, SIM_DT);
      const commands: ArcadeCommands = { stick: { forward: 0, right: 0 }, shot: out.shot, ...(out.swing ? { swing: out.swing } : {}) };
      duel.step([commands, NEUTRAL_ARCADE]);
      const outcome = watcher.step(duel, commands);
      if (outcome) return lesson.judge(outcome, 0, duel.profile);
    }
  }

  for (const lesson of STICK_LESSONS) {
    it(`${lesson.title} : le bon geste réussit la leçon`, () => {
      const verdict = lessonVerdict(lesson.id);
      expect(verdict, verdict.message).toMatchObject({ success: true });
    });
  }

  it('un autre geste est expliqué : un lob dans la leçon du coup normal', () => {
    const lesson = LESSONS.find((l) => l.id === 'stick-normal')!;
    const setup = (duel: Duel): void => lesson.start(duel, 0);
    const impact = impactTick(setup, true, 'epaules');
    const duel = new Duel(null);
    setup(duel);
    const watcher = new AttemptWatcher(duel);
    const swing = new SwingStick();
    for (let i = 0; i < 8 / SIM_DT; i++) {
      const [right, up] = stickAt({ prepared: true, end: 'arc' }, impact - duel.tick);
      const out = swing.update(right, up, SIM_DT);
      const commands: ArcadeCommands = { stick: { forward: 0, right: 0 }, shot: out.shot, ...(out.swing ? { swing: out.swing } : {}) };
      duel.step([commands, NEUTRAL_ARCADE]);
      const outcome = watcher.step(duel, commands);
      if (outcome) {
        const verdict = lesson.judge(outcome, 0, duel.profile);
        expect(verdict.success).toBe(false);
        expect(verdict.message).toContain('lob');
        return;
      }
    }
    throw new Error('essai non terminé');
  });
});

describe('chemin complet de la manette', () => {
  it('la fin du geste arrive jusqu’aux commandes, fusionnées avec le clavier comme en jeu', () => {
    // Manette virtuelle : stick droit sur les axes 2 et 3 (vers le bas de l'écran = positif).
    const axes = [0, 0, 0, 0];
    const pad = { axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) } as unknown as Gamepad;
    const swing = new SwingStick();
    const step = (right: number, up: number): ArcadeCommands => {
      axes[2] = right;
      axes[3] = -up;
      return toCommands(mergePads(readGamepad(pad, swing, SIM_DT), IDLE_PAD), true);
    };
    for (const [end, path] of Object.entries(PATHS) as [SwingEnd, Point[]][]) {
      const all = [...Array.from({ length: 20 }, () => [0, -1] as Point), ...path, [0, 0] as Point, [0, 0] as Point].map(([r, u]) => step(r, u));
      const released = all.find((c, i) => i > 0 && c.shot === null);
      expect(released?.swing, end).toEqual({ prepared: true, end });
      for (let i = 0; i < 4; i++) step(0, 0);
    }
  });
});

describe('geste de contre-vitre au stick droit (tourné vers sa vitre)', () => {
  /** Stick poussé vers l'avant `arm` pas, puis le chemin ; contre-vitre proposée par le jeu tout du long. */
  function wall(path: Point[], arm = 20, ready = true): SwingOutput[] {
    const swing = new SwingStick();
    swing.wallReady = ready;
    const points: Point[] = [...Array.from({ length: arm }, () => [0, 1] as Point), ...path];
    return points.map(([right, up]) => swing.update(right, up, SIM_DT));
  }

  it('poussé vers l’avant : préparation de la contre-vitre ; ramené vers soi : la frappe', () => {
    const out = wall([[0, 0.2], [0, -0.9]]);
    expect(out[0]).toEqual({ shot: 'overhead', swing: { prepared: true, wall: true } });
    expect(release(out)).toEqual({ shot: null, swing: { prepared: true, end: 'straight', wall: true } });
  });

  it('poussé vers l’avant puis lâché : la frappe part aussi', () => {
    const out = wall(Array.from({ length: Math.ceil(SWING.dwell / SIM_DT) + 1 }, () => [0, 0] as Point));
    expect(release(out)?.swing).toEqual({ prepared: true, end: 'letGo', wall: true });
  });

  it('sans contre-vitre proposée : vers l’avant depuis le repos reste le coup sec', () => {
    const out = wall([], 1, false);
    expect(out[0]).toEqual({ shot: 'overhead', swing: { prepared: false, end: 'straight' } });
  });
});
