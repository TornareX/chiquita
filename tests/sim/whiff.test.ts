import { describe, expect, it } from 'vitest';
import { Bot, DEFAULT_BOT, type BotOptions } from '../../src/sim/bot';
import { createBall } from '../../src/sim/ball';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { Duel, type DuelShot } from '../../src/sim/duel';
import { HALF_WIDTH } from '../../src/sim/constants';
import { vec3 } from '../../src/sim/vec3';

/**
 * Coups dans le vide injustes (journal des frappes, 22/10) : relâché un peu tôt sur une balle qui arrive, la raquette
 * l'attend ; dehors, après le rebond, la balle se joue même passée de l'autre côté du filet.
 */
function play(seconds: number, seed: number, options: BotOptions): { shots: DuelShot[]; whiffs: (string | null)[] } {
  const duel = new Duel();
  for (const player of duel.players) player.assist = 'full';
  const bots = [new Bot(0, seed, options), new Bot(1, seed + 1, options)] as const;
  const shots: DuelShot[] = [];
  const whiffs: (string | null)[] = [];
  while (duel.time < seconds) {
    duel.step([bots[0].commands(duel), bots[1].commands(duel)]);
    if (duel.shot && !duel.shot.serve) shots.push(duel.shot);
    for (const player of duel.players) if (player.lastWhiffTick === duel.tick - 1) whiffs.push(player.lastWhiffReason);
  }
  return { shots, whiffs };
}

describe('raquette partie en avance', () => {
  it('relâché 0,3 s trop tôt : la balle est frappée, en avance, jamais dans le vide', () => {
    const { shots, whiffs } = play(60, 7, { ...DEFAULT_BOT, release: { offset: -0.3, spread: 0 } });
    expect(shots.length).toBeGreaterThan(20);
    // Plus de coup dans le vide sur une balle qui arrivait : seule reste la balle qui a passé le joueur mal placé.
    expect(whiffs.filter((reason) => reason !== 'passee')).toEqual([]);
    // Jugés en avance : presque jamais parfaits (le bot relâche par rapport à son point prévu, pas à la balle).
    const low = shots.filter((shot) => shot.kind !== 'overhead');
    expect(low.filter((shot) => shot.perfect).length).toBeLessThan(low.length * 0.1);
  });

  it('relâché en avance, le coup est moins bon que relâché à temps', () => {
    const early = play(60, 7, { ...DEFAULT_BOT, release: { offset: -0.3, spread: 0 } }).shots;
    const onTime = play(60, 7, { ...DEFAULT_BOT, release: { offset: 0, spread: 0 } }).shots;
    const error = (list: DuelShot[]): number => list.reduce((a, s) => a + s.error, 0) / list.length;
    expect(error(early)).toBeGreaterThan(error(onTime));
  });
});

describe('dehors après le rebond', () => {
  it('la balle passée de l’autre côté du filet, hors du terrain, se joue encore', () => {
    const duel = new Duel();
    for (let i = 0; i < 0.5 / SIM_DT; i++) duel.step();
    // Échange en cours : le joueur 1 a frappé, la balle a rebondi chez le joueur 0 (camp z < 0) puis est sortie sur le
    // côté ; dehors, elle a passé la ligne du filet et file vers le joueur 0, sorti la chercher.
    duel.phase = 'rally';
    duel.lastHitter = 1;
    duel.hits = 3;
    duel.bounces = 1;
    const x = HALF_WIDTH + 1.5;
    const player = duel.players[0];
    player.pos = vec3(x, 0, 1.4);
    player.vel = vec3(0, 0, 0);
    duel.players[1].lastHitTick = duel.tick;
    // Sortie par-dessus la vitre latérale (por tres) : en jeu tant qu'elle ne touche pas le sol dehors.
    duel.ball = { ...createBall(vec3(x + 0.6, 1, 0.3), vec3(0, 0.5, 3)), out: true };
    duel.exit = { hitter: 1, wall: 'sidePosX', tick: duel.tick, pos: vec3(HALF_WIDTH, 3, -2) };
    const hold = { stick: { forward: 0, right: 0 }, shot: 'normal' as const };
    for (let i = 0; i < 0.1 / SIM_DT; i++) duel.step([hold, NEUTRAL_ARCADE]);
    const before = player.lastHitTick;
    for (let i = 0; i < 0.6 / SIM_DT && player.lastHitTick === before; i++) duel.step();
    expect(player.lastHitTick).not.toBe(before);
    expect(duel.shot?.player).toBe(0);
  });
});

describe('volée au filet, raquette prête', () => {
  /**
   * Joueur 1 au filet, figé (sans assistance), balle du joueur 0 qui passe à `side` m de lui. Il prépare puis relâche
   * `early` s avant qu'elle arrive à sa hauteur : le cas du journal (« j'ai préparé, poussé, et je rate la balle »).
   */
  function volleyAt(side: number, early: number): Duel {
    const duel = new Duel();
    duel.phase = 'rally';
    duel.lastHitter = 0;
    duel.hits = 2;
    duel.players[0].lastHitTick = duel.tick;
    const player = duel.players[1];
    player.pos = player.prevPos = vec3(0, 0, 2.5);
    player.assist = 'off';
    duel.ball = createBall(vec3(side, 1.4, -3), vec3(0, 2.5, 10));
    const hold = { stick: { forward: 0, right: 0 }, shot: 'normal' as const };
    while (duel.ball!.pos.z < 2.5 - early * 10) duel.step([NEUTRAL_ARCADE, hold]);
    for (let i = 0; i < 0.8 / SIM_DT && player.lastHitTick === -Infinity && player.lastWhiffTick === -Infinity; i++) duel.step();
    return duel;
  }

  it('relâché 0,4 s avant, balle à 1,2 m : volée bloquée, pas dans le vide', () => {
    const duel = volleyAt(1.2, 0.4);
    expect(duel.players[1].lastWhiffTick).toBe(-Infinity);
    expect(duel.shot?.player).toBe(1);
    expect(duel.shot?.volley).toBe(true);
    expect(duel.shot?.style).toBe('block');
  });

  it('balle à 2,5 m : hors de portée, dans le vide', () => {
    const duel = volleyAt(2.5, 0.25);
    expect(duel.players[1].lastHitTick).toBe(-Infinity);
    expect(duel.players[1].lastWhiffReason).toBe('portee');
  });
});

describe('balle qui rebondit dans les pieds', () => {
  it('la raquette prête attend qu’elle remonte : demi-volée, pas dans le vide', () => {
    for (const x of [0.9, 1.2]) {
      const duel = new Duel();
      duel.phase = 'rally';
      duel.lastHitter = 0;
      duel.hits = 2;
      duel.players[0].lastHitTick = duel.tick;
      const player = duel.players[1];
      player.pos = player.prevPos = vec3(0, 0, 5.3);
      player.assist = 'off';
      // À 9 m/s, elle rebondit à hauteur du joueur, à `x` m sur le côté (le cas du journal : relâché 0,3 s avant).
      const flight = 4.3 / 9;
      duel.ball = createBall(vec3(-x, 1, 1), vec3(0, (4.9 * flight * flight - 1) / flight, 9));
      const hold = { stick: { forward: 0, right: 0 }, shot: 'normal' as const };
      while (duel.ball!.pos.z < 5.3 - 0.3 * 9) duel.step([NEUTRAL_ARCADE, hold]);
      for (let i = 0; i < 0.8 / SIM_DT && player.lastHitTick === -Infinity && player.lastWhiffTick === -Infinity; i++) duel.step();
      expect(player.lastWhiffTick).toBe(-Infinity);
      expect(duel.shot?.player).toBe(1);
      expect(duel.shot?.volley).toBe(false);
    }
  });
});

describe('contre-vitre', () => {
  /** Échange en cours : le joueur 1 a frappé, la balle a rebondi chez le joueur 0, placé en `z`. */
  function receiving(z: number, ball: ReturnType<typeof createBall>, bounces: number): Duel {
    const duel = new Duel();
    duel.phase = 'rally';
    duel.lastHitter = 1;
    duel.hits = 3;
    duel.bounces = bounces;
    duel.players[1].lastHitTick = duel.tick;
    const player = duel.players[0];
    player.pos = player.prevPos = vec3(0.6, 0, z);
    player.assist = 'off';
    duel.ball = ball;
    return duel;
  }

  it('au filet, elle n’est pas proposée : pousser le stick reste le coup sec (volée bloquée)', () => {
    // Le cas du journal : à 3,9 m du filet, balle basse et rapide qui va rebondir derrière lui, il recule.
    const duel = receiving(-3.9, createBall(vec3(0, 1.2, 1), vec3(0, 0, -13.5)), 0);
    duel.players[0].vel = vec3(0, 0, -3);
    expect(duel.counterWallReady(0)).toBe(false);
    // Au fond, la même balle passée : proposée.
    const deep = receiving(-7.5, createBall(vec3(0, 0.6, -6.5), vec3(0, -1, -8)), 1);
    deep.players[0].vel = vec3(0, 0, -3);
    expect(deep.counterWallReady(0)).toBe(true);
  });

  it('à 6,3 m du filet, elle est proposée (le journal : sa préparation y devenait un coup sec)', () => {
    const duel = receiving(-6.3, createBall(vec3(0, 0.6, -5.5), vec3(0, -1, -8)), 1);
    expect(duel.counterWallReady(0)).toBe(true);
  });

  /** Geste de contre-vitre préparé jusqu'au rebond (`untilBounce`) ou `hold` s, puis ramené vers soi. */
  function wallGesture(duel: Duel, hold: number, untilBounce = false): void {
    const wall = { prepared: true, wall: true };
    for (let i = 0; i < hold / SIM_DT && !(untilBounce && duel.bounces > 0) && !duel.result; i++) {
      duel.step([{ stick: { forward: 0, right: 0 }, shot: 'overhead', swing: wall }, NEUTRAL_ARCADE]);
    }
    for (let i = 0; i < 1.5 / SIM_DT && !duel.result && duel.players[0].lastHitTick === -Infinity && duel.players[0].lastWhiffTick === -Infinity; i++) {
      duel.step([{ stick: { forward: 0, right: 0 }, shot: null, swing: { ...wall, end: 'straight' } }, NEUTRAL_ARCADE]);
    }
  }

  it('engagée, elle s’y tient : la balle encore devant lui, qui file vers sa vitre, n’est pas jouée en coup normal', () => {
    // Le cas du journal : à 7,8 m du filet, balle rebondie 1,7 m devant lui, lente, vers sa vitre. Avant, le jeu jouait
    // aussitôt un coup normal raté.
    const duel = receiving(-7.8, createBall(vec3(0.6, 0.56, -6.1), vec3(0, 0.3, -4.6)), 1);
    wallGesture(duel, 0.1);
    expect(duel.shot?.player).toBe(0);
    expect(duel.shot?.counterWall).toBe(true);
  });

  it('devenue impossible (balle ressortie de la vitre) : coup normal de secours, pas un raté', () => {
    // Elle a rebondi devant lui et touche sa vitre avant qu'il frappe : elle revient vers lui.
    const duel = receiving(-8.2, createBall(vec3(0.6, 0.6, -9.4), vec3(0, 0.5, -6)), 1);
    wallGesture(duel, 0.25);
    expect(duel.players[0].lastWhiffTick).toBe(-Infinity);
    expect(duel.shot?.player).toBe(0);
    expect(duel.shot?.counterWall).not.toBe(true);
  });

  it('balle basse et lente qui va mourir avant le point idéal : la contre-vitre part quand même', () => {
    const duel = receiving(-8.4, createBall(vec3(0, 0.17, -8.1), vec3(0, -0.5, -5.2)), 1);
    const wall = { prepared: true, wall: true };
    duel.step([{ stick: { forward: 0, right: 0 }, shot: 'overhead', swing: wall }, NEUTRAL_ARCADE]);
    for (let i = 0; i < 0.6 / SIM_DT && !duel.result && duel.players[0].lastHitTick === -Infinity; i++) {
      duel.step([{ stick: { forward: 0, right: 0 }, shot: null, swing: { ...wall, end: 'straight' } }, NEUTRAL_ARCADE]);
    }
    expect(duel.shot?.player).toBe(0);
    expect(duel.shot?.counterWall).toBe(true);
  });
});
