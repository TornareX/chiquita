import { describe, expect, it } from 'vitest';
import { planIntercept } from '../../src/sim/assist';
import { createBall } from '../../src/sim/ball';
import { AI_LEVELS, Bot, type BotOptions } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from '../../src/sim/commands';
import { HALF_WIDTH, SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot, type PointReason } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { DEFAULT_RULES } from '../../src/sim/score';
import { aimTarget, overheadKind, overheadTarget, solveShot } from '../../src/sim/shots';
import { length, vec3, type Vec3 } from '../../src/sim/vec3';
import { clampWalkable, DOOR_MID, isWalkable, moveWithin, outsideCourt } from '../../src/sim/walkable';

const KMH = 3.6;

/**
 * Échange en cours : `hitter` vient de frapper la balle (`pos`, `vel`), l'autre joueur attend en `at`.
 * Course assistée complète pour le receveur : les tests portent sur le coup, pas sur le placement.
 */
function rally(hitter: 0 | 1, ball: { pos: Vec3; vel: Vec3; spin?: Vec3 }, at: Vec3): Duel {
  const duel = new Duel();
  const receiver = hitter === 0 ? 1 : 0;
  duel.phase = 'rally';
  duel.lastHitter = hitter;
  duel.hits = 4;
  duel.players[hitter].lastHitTick = duel.tick;
  duel.players[receiver].pos = duel.players[receiver].prevPos = at;
  duel.players[receiver].assist = 'full';
  duel.ball = createBall(ball.pos, ball.vel, ball.spin);
  return duel;
}

/** Lob du joueur 1 depuis le fond (stick `aim`), vers le joueur 0 qui attend en `at`. */
function lobTo(at: Vec3, aim: ArcadeCommands['stick'], perfect = false): Duel {
  const from = vec3(0, 1, 8.5);
  const shot = solveShot('lob', from, aimTarget('lob', 1, aim, perfect, ARCADE), perfect, ARCADE);
  return rally(1, { pos: from, vel: shot.vel, spin: shot.spin }, at);
}

/**
 * Le joueur 0 appuie sur `kind`, tient le stick `stick`, et relâche `offset` s après le moment d'impact
 * prévu par la course assistée. Retourne sa frappe, et le point s'il se termine.
 */
function play(duel: Duel, kind: ShotKind, stick: ArcadeCommands['stick'], offset = 0) {
  let released = false;
  let shot: DuelShot | null = null;
  let exited = false;
  for (let i = 0; i < 8 / SIM_DT && duel.phase === 'rally'; i++) {
    const plan = duel.players[0].engagement?.plan;
    // Coup haut : relâché quand la balle est à la hauteur du coup (yeux, ou plus haut pour le remate).
    const ideal = plan ? (duel.overheadReleaseTick(0) ?? plan.tick) : 0;
    if (!released && plan && duel.tick >= ideal + Math.round(offset / SIM_DT)) released = true;
    duel.step([{ stick, shot: released ? null : kind }, NEUTRAL_ARCADE]);
    if (duel.shot?.player === 0) shot = duel.shot;
    if (duel.exit) exited = true;
  }
  return { shot, exited, result: duel.lastResult };
}

describe('coup au-dessus de la tête : la variante vient du stick et de la situation', () => {
  const near = vec3(0.5, 2.6, -2.5);
  it.each([
    [{ forward: 0, right: 0 }, near, 'bandeja'],
    [{ forward: 0.3, right: -0.2 }, near, 'bandeja'],
    [{ forward: 0, right: 1 }, near, 'vibora'],
    [{ forward: -0.2, right: -0.8 }, near, 'vibora'],
    [{ forward: 1, right: 0.4 }, near, 'remate'],
    // Remate demandé loin du filet, ou sur une balle trop basse : bandeja.
    [{ forward: 1, right: 0 }, vec3(0, 2.6, -6), 'bandeja'],
    [{ forward: 1, right: 0 }, vec3(0, 2.0, -2.5), 'bandeja'],
  ] as const)('stick %o, contact %o : %s', (stick, contact, expected) => {
    expect(overheadKind(stick, contact, ARCADE)).toBe(expected);
  });

  it('remate à plat entre 120 et 135 km/h ; bandeja plus lente que la víbora', () => {
    const contact = vec3(0.3, 2.6, -2.5);
    const speed = (kind: 'bandeja' | 'vibora' | 'remate', perfect: boolean, stick = { forward: 1, right: 0 }): number =>
      length(solveShot(kind, contact, overheadTarget(kind, -1, stick, perfect, ARCADE), perfect, ARCADE).vel) * KMH;
    for (const perfect of [false, true]) {
      expect(speed('remate', perfect)).toBeGreaterThanOrEqual(118);
      expect(speed('remate', perfect)).toBeLessThanOrEqual(137);
    }
    expect(speed('remate', true)).toBeGreaterThan(speed('remate', false));
    const bandeja = speed('bandeja', false, { forward: 0, right: 0 });
    const vibora = speed('vibora', false, { forward: 0, right: 1 });
    expect(vibora).toBeGreaterThan(bandeja * 1.15);
    expect(speed('remate', false)).toBeGreaterThan(vibora * 1.2);
  });

  it('la víbora va chercher la vitre latérale, la bandeja reste profonde et centrée', () => {
    const vibora = overheadTarget('vibora', -1, { forward: 0, right: 1 }, false, ARCADE);
    const bandeja = overheadTarget('bandeja', -1, { forward: 0, right: 0.3 }, false, ARCADE);
    expect(Math.abs(vibora.x)).toBeGreaterThan(HALF_WIDTH - 1.5);
    expect(Math.abs(bandeja.x)).toBeLessThan(1.5);
    expect(bandeja.z).toBeGreaterThan(7.5);
  });
});

describe('sur un lob, au filet', () => {
  it('B reprend un lob court de volée, au-dessus de la tête', () => {
    const { shot } = play(lobTo(vec3(0.3, 0, -3), { forward: -1, right: 0 }), 'overhead', { forward: 0, right: 0 });
    expect(shot?.kind).toBe('overhead');
    expect(shot?.overhead).toBe('bandeja');
    expect(shot?.volley).toBe(true);
    // Prise à hauteur des yeux : propre.
    expect(shot!.heightOff).toBe(0);
  });

  it('un remate parfait près du filet sort du terrain : por tres, point pour le frappeur', () => {
    const { shot, exited, result } = play(lobTo(vec3(0.3, 0, -3), { forward: -1, right: 0 }), 'overhead', { forward: 1, right: 0.6 });
    expect(shot?.overhead).toBe('remate');
    expect(shot?.perfect).toBe(true);
    expect(Math.abs(shot!.contact.z)).toBeLessThanOrEqual(ARCADE.rally.remateZone);
    expect(shot!.speed * KMH).toBeGreaterThan(120);
    expect(exited).toBe(true);
    expect(result).toMatchObject({ winner: 0, reason: 'por-tres' });
  });

  it('un remate non parfait reste dans le terrain', () => {
    for (const right of [0, 0.6, 1]) {
      // Relâché en avance : coup normal, pas parfait.
      const { shot, exited } = play(lobTo(vec3(0.3, 0, -3), { forward: -1, right: 0 }), 'overhead', { forward: 1, right }, -0.08);
      expect(shot?.overhead).toBe('remate');
      expect(shot?.perfect).toBe(false);
      expect(exited).toBe(false);
    }
  });

  it('le lob profond se prend au-dessus de la tête loin du filet : bandeja, même stick en avant', () => {
    const { shot } = play(lobTo(vec3(0.3, 0, -3), { forward: 1, right: 0 }), 'overhead', { forward: 1, right: 0 });
    expect(shot?.overhead).toBe('bandeja');
    expect(Math.abs(shot!.contact.z)).toBeGreaterThan(ARCADE.rally.remateZone);
  });

  it('B sur une balle basse : coup défensif coupé', () => {
    const from = vec3(0, 1, 7);
    const drive = solveShot('slice', from, aimTarget('slice', 1, { forward: 0, right: 0 }, false, ARCADE), false, ARCADE);
    const duel = rally(1, { pos: from, vel: drive.vel, spin: drive.spin }, vec3(0.6, 0, -6));
    const { shot } = play(duel, 'overhead', { forward: 0, right: 0 });
    expect(shot?.kind).toBe('slice');
    expect(shot?.overhead).toBeNull();
  });
});

describe('lob', () => {
  const flight = (aim: ArcadeCommands['stick'], perfect = false): { time: number; depth: number } => {
    const from = vec3(0, 1, -8.5);
    const target = aimTarget('lob', -1, aim, perfect, ARCADE);
    return { time: solveShot('lob', from, target, perfect, ARCADE).flightTime, depth: target.z };
  };

  it('profond : 2,5 à 3 s de vol, le temps de monter au filet', () => {
    for (const lob of [flight({ forward: 0, right: 0 }), flight({ forward: 1, right: 0 }), flight({ forward: 0.5, right: 0 }, true)]) {
      expect(lob.time).toBeGreaterThanOrEqual(2.5);
      expect(lob.time).toBeLessThanOrEqual(3);
    }
  });

  it('court : plus bref et plus bas, une balle de smash près du filet', () => {
    const short = flight({ forward: -1, right: 0 });
    expect(short.time).toBeLessThan(2);
    expect(short.depth).toBeLessThan(6);
    // Le joueur au filet le prend haut, à portée de remate.
    const from = vec3(0, 1, 8.5);
    const shot = solveShot('lob', from, aimTarget('lob', 1, { forward: -1, right: 0 }, false, ARCADE), false, ARCADE);
    const plan = planIntercept(createBall(from, shot.vel, shot.spin), vec3(0, 0, -3.5), -1, 0, ARCADE, 0, false, true);
    expect(plan?.reachable).toBe(true);
    expect(Math.abs(plan!.contact.z)).toBeLessThanOrEqual(ARCADE.rally.remateZone);
  });

  it('relâché trop tôt, il raccourcit', () => {
    // Balle qui revient de la vitre, lente : on peut la frapper bien avant le point idéal.
    const lob = (offset: number): DuelShot => {
      const from = vec3(0, 1, 7);
      const drive = solveShot('normal', from, aimTarget('normal', 1, { forward: 0, right: 0 }, false, ARCADE), false, ARCADE);
      const duel = rally(1, { pos: from, vel: drive.vel, spin: drive.spin }, vec3(-0.6, 0, -7));
      return play(duel, 'lob', { forward: 0, right: 0 }, offset).shot!;
    };
    const onTime = lob(0);
    const early = lob(-0.1);
    expect(onTime.perfect).toBe(true);
    expect(early.timing).toBeLessThan(-ARCADE.rally.perfectBefore);
    expect(Math.abs(early.target.z)).toBeLessThan(ARCADE.rally.lob.depthNeutral);
    expect(Math.abs(early.target.z)).toBeLessThan(Math.abs(onTime.target.z) - 0.5);
  });
});

describe('portes et sortie du terrain (salida de pista)', () => {
  const r = ARCADE.player.radius;

  it('on ne traverse les murs latéraux que par la porte', () => {
    // Contre le mur, loin de la porte : bloqué.
    const wall = vec3(HALF_WIDTH - r, 0, 4);
    expect(moveWithin(wall, vec3(HALF_WIDTH - r + 0.05, 0, 4), 1, r)).toEqual(wall);
    // Dans l'axe de la porte : on passe, et on se tient dehors.
    let pos = vec3(HALF_WIDTH - 0.5, 0, DOOR_MID);
    for (let i = 0; i < 60; i++) pos = moveWithin(pos, vec3(pos.x + 0.03, 0, pos.z), 1, r);
    expect(outsideCourt(pos)).toBe(true);
    expect(isWalkable(vec3(HALF_WIDTH + 3, 0, 5), 1, r)).toBe(true);
    // Jamais de l'autre côté du filet, ni dans le mur.
    expect(isWalkable(vec3(HALF_WIDTH + 3, 0, -2), 1, r)).toBe(false);
    expect(isWalkable(vec3(HALF_WIDTH, 0, 4), 1, r)).toBe(false);
    expect(clampWalkable(vec3(HALF_WIDTH + 0.1, 0, 4), 1, r).x).toBeGreaterThanOrEqual(HALF_WIDTH + r);
  });

  it('au stick, pousser vers le mur près de la porte fait sortir le joueur', () => {
    const duel = new Duel();
    duel.phase = 'dead';
    duel.players[0].pos = duel.players[0].prevPos = vec3(-(HALF_WIDTH - 1), 0, -1.6);
    // Joueur 0 : sa droite est vers -X. Pas de service avant 1,4 s.
    for (let i = 0; i < 1 / SIM_DT; i++) duel.step([{ stick: { forward: 0, right: 1 }, shot: null }, NEUTRAL_ARCADE]);
    expect(outsideCourt(duel.players[0].pos)).toBe(true);
  });

  /** Remate parfait du joueur 0 qui sort par le côté, haut et loin, avec du temps pour le rattraper. */
  function porTres(defender: Vec3): Duel {
    const contact = vec3(0, 2.8, -2.5);
    const target = overheadTarget('remate', -1, { forward: 1, right: 0 }, true, ARCADE);
    const shot = solveShot('remate', contact, target, true, ARCADE);
    return rally(0, { pos: contact, vel: shot.vel, spin: shot.spin }, defender);
  }

  /** Le joueur 1 appuie sur A tout de suite et relâche juste avant l'impact prévu. */
  function defend(duel: Duel) {
    let pressed = false;
    let catchShot: DuelShot | null = null;
    let exited = false;
    let wentOut = false;
    for (let i = 0; i < 12 / SIM_DT && duel.phase === 'rally'; i++) {
      const plan = duel.players[1].engagement?.plan;
      const hold = !pressed || (plan !== null && plan !== undefined && duel.tick < plan.tick - 5);
      pressed = true;
      duel.step([NEUTRAL_ARCADE, { stick: { forward: 0, right: 0 }, shot: hold ? 'normal' : null }]);
      if (duel.exit) exited = true;
      if (outsideCourt(duel.players[1].pos)) wentOut = true;
      if (duel.shot?.player === 1) catchShot = duel.shot;
    }
    return { catchShot, exited, wentOut, result: duel.lastResult };
  }

  it('sans défenseur, la balle sortie après le rebond donne le point au frappeur quand elle touche le sol dehors', () => {
    const duel = porTres(vec3(0, 0, 8.5));
    let exitTick = -1;
    for (let i = 0; i < 6 / SIM_DT && duel.phase === 'rally'; i++) {
      duel.step();
      if (duel.exit && exitTick < 0) exitTick = duel.tick;
    }
    expect(exitTick).toBeGreaterThan(0);
    // Le point ne s'arrête pas à la sortie : la balle reste jouable dehors jusqu'au sol.
    expect(duel.tick - exitTick).toBeGreaterThan(0.5 / SIM_DT);
    expect(duel.lastResult).toMatchObject({ winner: 0, reason: 'por-tres' });
  });

  it('rattrapable : le défenseur sort par la porte, renvoie la balle dehors et le point continue', () => {
    const { catchShot, exited, wentOut, result } = defend(porTres(vec3(0, 0, 8.5)));
    expect(exited).toBe(true);
    expect(wentOut).toBe(true);
    expect(catchShot?.outside).toBe(true);
    expect(outsideCourt(catchShot!.contact)).toBe(true);
    // Renvoyée dans le camp du frappeur, qui ne bouge pas : point au défenseur.
    expect(result).toMatchObject({ winner: 1, reason: 'second-bounce' });
  });

  it('une balle renvoyée de dehors qui retombe hors du terrain est sortie', () => {
    const duel = rally(1, { pos: vec3(HALF_WIDTH + 2, 1.5, 3), vel: vec3(0, 3, -6) }, vec3(0, 0, -8.5));
    duel.ball!.out = false;
    for (let i = 0; i < 3 / SIM_DT && duel.phase === 'rally'; i++) duel.step();
    expect(duel.lastResult).toMatchObject({ winner: 0, reason: 'out' });
  });

  it('une balle sortie avant son rebond reste une faute', () => {
    const duel = rally(0, { pos: vec3(0, 2, -2), vel: vec3(6, 6, 10) }, vec3(0, 0, 8.5));
    for (let i = 0; i < 3 / SIM_DT && duel.phase === 'rally'; i++) duel.step();
    expect(duel.lastResult).toMatchObject({ winner: 1, reason: 'out' });
  });
});

describe('IA au filet', () => {
  /** Le joueur 1 lobe ; l'IA (joueur 0) attend au filet. Retourne son coup suivant. */
  function aiAgainstLob(aim: ArcadeCommands['stick'], perfect: boolean, level: BotOptions = AI_LEVELS.normal): DuelShot | null {
    const duel = lobTo(vec3(0, 0, -3.5), aim, perfect);
    duel.players[0].assist = 'magnet';
    const bot = new Bot(0, 1, level);
    for (let i = 0; i < 6 / SIM_DT && duel.phase === 'rally'; i++) {
      duel.step([bot.commands(duel), NEUTRAL_ARCADE]);
      if (duel.shot?.player === 0) return duel.shot;
    }
    return null;
  }

  it('reprend un lob atteignable au-dessus de la tête', () => {
    for (const aim of [{ forward: -1, right: 0 }, { forward: 0, right: 0.5 }]) {
      const shot = aiAgainstLob(aim, false);
      expect(shot?.kind).toBe('overhead');
      expect(shot?.volley).toBe(true);
    }
  });

  it('smashe un lob court', () => {
    const shot = aiAgainstLob({ forward: -1, right: 0 }, false, { ...AI_LEVELS.fort, overhead: { ...AI_LEVELS.fort.overhead, remate: 1 } });
    expect(shot?.overhead).toBe('remate');
  });

  it('recule sur un lob profond et le joue après le rebond', () => {
    const shot = aiAgainstLob({ forward: 1, right: 0 }, true);
    expect(shot).not.toBeNull();
    expect(shot!.volley).toBe(false);
    expect(shot!.overhead).toBeNull();
  });
});

/**
 * Mesure, IA normale contre IA normale (3 × 15 min simulées), comme `glass.test.ts`. Repères pros
 * (research/padel-pro/NOTES.md) : 8 à 11 coups par point ; le smash fait 35 à 43 % des coups gagnants ;
 * environ 30 % des lobs passent le joueur au filet.
 */
describe('IA contre IA : le jeu au-dessus de la tête', () => {
  function measure(seconds: number, seed: number, level: BotOptions) {
    const duel = new Duel(DEFAULT_RULES);
    const bots = [new Bot(0, seed, level), new Bot(1, seed + 1, level)] as const;
    const s = { points: 0, hits: 0, winners: 0, smashWinners: 0, overheadWinners: 0, lobs: 0, lobsPassed: 0, exits: 0, catches: 0 };
    const winnerReasons: PointReason[] = ['second-bounce', 'not-returned', 'por-tres', 'por-cuatro'];
    let whiffed = false;
    let last: DuelShot | null = null;
    let pendingLob: DuelShot | null = null;
    let exitCounted = false;
    while (duel.time < seconds) {
      if (duel.phase === 'over') duel.restart();
      const reachable = duel.players.map((p) => p.engagement?.plan?.reachable ?? true);
      const atNet = duel.players.map((p) => Math.abs(p.pos.z) < 4.5);
      duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
      duel.players.forEach((p, i) => {
        if (p.lastWhiffTick === duel.tick - 1 && reachable[i]) whiffed = true;
      });
      if (duel.exit && !exitCounted) {
        exitCounted = true;
        s.exits++;
      }
      const shot = duel.shot;
      if (shot) {
        // Lob qui passe : le joueur au filet ne le reprend pas de volée.
        if (pendingLob && !shot.volley) s.lobsPassed++;
        pendingLob = null;
        if (shot.kind === 'lob' && !shot.serve && atNet[shot.player === 0 ? 1 : 0]) {
          s.lobs++;
          pendingLob = shot;
        }
        if (shot.outside) s.catches++;
        last = shot;
        exitCounted = false;
      }
      const result = duel.result;
      if (result) {
        s.points++;
        s.hits += result.hits;
        if (pendingLob && result.winner === pendingLob.player && winnerReasons.includes(result.reason)) s.lobsPassed++;
        pendingLob = null;
        if (winnerReasons.includes(result.reason) && !whiffed) {
          s.winners++;
          if (last?.player === result.winner && last.overhead) {
            s.overheadWinners++;
            if (last.overhead === 'remate') s.smashWinners++;
          }
        }
        whiffed = false;
        last = null;
      }
    }
    return s;
  }

  it('les smashes concluent, les lobs passent parfois, ~9 coups par point', () => {
    const t = { points: 0, hits: 0, winners: 0, smashWinners: 0, overheadWinners: 0, lobs: 0, lobsPassed: 0, exits: 0, catches: 0 };
    for (const seed of [3, 11, 29]) {
      const s = measure(900, seed, AI_LEVELS.normal);
      for (const key of Object.keys(t) as (keyof typeof t)[]) t[key] += s[key];
    }
    const perPoint = t.hits / t.points;
    console.log(
      `${t.points} points, ${perPoint.toFixed(1)} coups/point, gagnants ${((100 * t.winners) / t.points).toFixed(0)} %, ` +
        `dont remate ${((100 * t.smashWinners) / t.winners).toFixed(0)} % (au-dessus de la tête ${((100 * t.overheadWinners) / t.winners).toFixed(0)} %), ` +
        `lobs qui passent ${((100 * t.lobsPassed) / t.lobs).toFixed(0)} % sur ${t.lobs}, sorties ${t.exits}, rattrapées dehors ${t.catches}`,
    );
    // Bandeja et víbora à hauteur des yeux (17/10, demandé par Xavier) : prises plus bas, elles concluent
    // moins (~9 % des gagnants, pros 5-13 % ; avant, ~28 %, trop) ; le remate reste rare (3-8 %, pros 35-43 %,
    // déjà le cas avant). 6 parties : 6,8 coups/point, coups hauts 17 % des gagnants, lobs qui passent 42 %.
    // [à recaler en jouant]
    expect(perPoint).toBeGreaterThan(6.3);
    expect(perPoint).toBeLessThan(11.5);
    expect(t.overheadWinners / t.winners).toBeGreaterThan(0.1);
    expect(t.smashWinners).toBeGreaterThan(0);
    expect(t.lobsPassed / t.lobs).toBeGreaterThan(0.05);
    expect(t.lobsPassed / t.lobs).toBeLessThan(0.55);
    expect(t.exits).toBeGreaterThan(0);
  }, 120000);
});
