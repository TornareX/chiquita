import { describe, expect, it } from 'vitest';
import { planIntercept } from '../../src/sim/assist';
import { createBall } from '../../src/sim/ball';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from '../../src/sim/commands';
import { SIM_DT } from '../../src/sim/constants';
import { contactTiming, Duel, teamOf, type DuelShot } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { DEFAULT_RULES } from '../../src/sim/score';
import { aimTarget, forehandFor, solveShot, type Hand } from '../../src/sim/shots';
import { addScaled, vec3, type Vec3 } from '../../src/sim/vec3';

/**
 * Main forte (`CHANTIERS_PLAN.md`, étape 2) : coup droit côté main, revers de l'autre ; au-dessus de la tête,
 * côté main forte, sinon revers par-dessus la tête, sans force. Placement, IA et règles en tiennent compte.
 */

/** Lob du joueur 1 vers le joueur 0, au filet en `at`. */
function lobTo(at: Vec3, hand: Hand): Duel {
  const from = vec3(0, 1, 8.5);
  const shot = solveShot('lob', from, aimTarget('lob', 1, { forward: -1, right: 0 }, false, ARCADE), false, ARCADE);
  const duel = new Duel();
  duel.phase = 'rally';
  duel.lastHitter = 1;
  duel.hits = 4;
  duel.players[1].lastHitTick = duel.tick;
  duel.players[1].lastHit = { kind: 'lob' } as DuelShot;
  duel.players[0].pos = duel.players[0].prevPos = at;
  duel.players[0].hand = hand;
  duel.ball = createBall(from, shot.vel, shot.spin);
  return duel;
}

/** Le joueur 0, immobile (placement manuel), appuie sur `kind` et relâche au moment idéal. */
function play(duel: Duel, kind: ShotKind, stick: ArcadeCommands['stick']): DuelShot | null {
  duel.players[0].assist = 'off';
  let released = false;
  for (let i = 0; i < 8 / SIM_DT && duel.phase === 'rally'; i++) {
    const plan = duel.players[0].engagement?.plan;
    const ideal = plan ? (duel.overheadReleaseTick(0) ?? plan.tick) : 0;
    if (!released && plan && duel.tick >= ideal) released = true;
    duel.step([{ stick, shot: released ? null : kind }, NEUTRAL_ARCADE]);
    if (duel.shot?.player === 0) return duel.shot;
  }
  return null;
}

/** Lob joué au-dessus de la tête, la balle passant à `offset` m du joueur vers son coup droit (négatif : revers). */
function overheadAt(hand: Hand, offset: number, stick: ArcadeCommands['stick']): DuelShot | null {
  const probe = lobTo(vec3(0.3, 0, -3), hand);
  const plan = planIntercept(probe.ball!, probe.players[0].pos, -1, probe.tick, ARCADE, 0, false, true)!;
  const fore = forehandFor(-1, hand);
  const at = addScaled(vec3(plan.contact.x, 0, plan.contact.z), fore, -offset);
  return play(lobTo(at, hand), 'overhead', stick);
}

describe('main forte : coup droit et revers', () => {
  it('le côté de frappe suit la main : la balle à droite est un coup droit pour un droitier, un revers pour un gaucher', () => {
    const duel = new Duel();
    const player = duel.players[0];
    player.pos = vec3(0, 0, -8);
    // Balle venant du fond adverse, à 0,6 m à droite du joueur (droite de Bleu : -X).
    const ball = createBall(vec3(-0.6, 0.9, -7), vec3(0, 0, -15));
    expect(contactTiming(ball, player, 0.6).wing).toBe('fore');
    player.hand = 'left';
    expect(contactTiming(ball, player, 0.6).wing).toBe('back');
  });

  it('au-dessus de la tête : coup droit côté main, revers par-dessus la tête de l’autre côté, sans remate et plus lent', () => {
    for (const hand of ['right', 'left'] as const) {
      const smash = { forward: 1, right: 0 };
      const fore = overheadAt(hand, 0.35, smash)!;
      // Balle à 30 cm côté revers : encore un coup droit, en se penchant.
      const lean = overheadAt(hand, -0.3, smash)!;
      // À 60 cm côté revers : revers par-dessus la tête.
      const back = overheadAt(hand, -0.6, smash)!;
      expect(fore.wing).toBe('fore');
      expect(lean.wing).toBe('fore');
      expect(back.wing).toBe('back');
      expect(back.kind).toBe('overhead');
      expect(fore.overhead).toBe('remate');
      expect(back.overhead).toBe('bandeja');
      expect(back.perfect).toBe(false);
      expect(back.speed).toBeLessThan(fore.speed * 0.7);
    }
  });

  it('la balle tenue au service est du côté de la main', () => {
    const duel = new Duel();
    const server = duel.players[duel.server]!;
    const fore = forehandFor(server.side, 'right').x;
    expect((duel.servePosition().x - server.pos.x) * fore).toBeGreaterThan(0);
    server.hand = 'left';
    expect((duel.servePosition().x - server.pos.x) * fore).toBeLessThan(0);
  });
});

describe('placement : il tourne autour de la balle pour la jouer en coup droit quand il a le temps', () => {
  /** Balle lente qui arrive au centre, joueur 0 juste à côté, du côté de son revers. */
  function standFor(hand: Hand, overhead = false) {
    const fore = forehandFor(-1, hand);
    const start = addScaled(vec3(0, 0, -7.5), fore, -0.4);
    const ball = overhead
      ? createBall(vec3(0, 6, -3), vec3(0, 0, -2))
      : createBall(vec3(0, 1.2, 2), vec3(0, 1.5, -9));
    const plan = planIntercept(ball, start, -1, 0, ARCADE, 0, false, overhead, undefined, false, hand)!;
    // Côté du joueur par rapport à la balle, compté vers son coup droit : négatif = la balle est côté coup droit.
    return { side: (plan.stand.x - plan.contact.x) * fore.x, plan };
  }

  it('au sol, droitier et gaucher se placent pour un coup droit', () => {
    for (const hand of ['right', 'left'] as const) {
      const { side, plan } = standFor(hand);
      expect(plan.reachable).toBe(true);
      expect(side).toBeLessThan(0);
    }
  });

  it('au-dessus de la tête aussi', () => {
    for (const hand of ['right', 'left'] as const) {
      const { side, plan } = standFor(hand, true);
      expect(plan.reachable).toBe(true);
      expect(side).toBeLessThan(0);
    }
  });
});

describe('en double, la balle du milieu revient au coup droit du centre', () => {
  /** Balle lente qui arrive pile au milieu de l'équipe bleue, les deux joueurs à égale distance. */
  function middleOwner(hands: [Hand, Hand]): number | null {
    const duel = new Duel(null, 'double');
    duel.phase = 'rally';
    duel.lastHitter = 1;
    duel.hits = 4;
    // Joueur 0 à droite (x < 0 pour Bleu), joueur 2 à gauche.
    duel.players[0]!.pos = vec3(-1.6, 0, -7);
    duel.players[2]!.pos = vec3(1.6, 0, -7);
    duel.players[0]!.hand = hands[0];
    duel.players[2]!.hand = hands[1];
    duel.ball = createBall(vec3(0, 1.2, 4), vec3(0, 2, -10));
    return duel.owner(0);
  }

  it('deux droitiers : le joueur de gauche ; gaucher à droite et droitier à gauche : celui de gauche aussi', () => {
    expect(middleOwner(['right', 'right'])).toBe(2);
    expect(middleOwner(['left', 'right'])).toBe(2);
  });

  it('deux gauchers : le joueur de droite, dont le coup droit est au centre', () => {
    expect(middleOwner(['left', 'left'])).toBe(0);
  });
});

/** IA normale contre IA normale, joueur 1 gaucher ou non : coups droits, revers et points. */
function measure(seconds: number, seed: number, rightHand: Hand) {
  const duel = new Duel(DEFAULT_RULES);
  duel.players[1].hand = rightHand;
  const bots = [new Bot(0, seed, AI_LEVELS.normal), new Bot(1, seed + 1, AI_LEVELS.normal)];
  const s = { points: 0, won: [0, 0], shots: [0, 0], backhands: [0, 0], backOverheads: [0, 0], overheads: [0, 0] };
  while (duel.time < seconds) {
    if (duel.phase === 'over') {
      duel.restart();
      duel.players[1].hand = rightHand;
    }
    duel.step(bots.map((bot) => bot.commands(duel)));
    if (duel.result) {
      s.points++;
      s.won[duel.result.winner]!++;
    }
    const shot = duel.shot;
    if (!shot || shot.serve) continue;
    const t = teamOf(shot.player);
    s.shots[t]!++;
    if (shot.kind === 'overhead') s.overheads[t]!++;
    if (shot.wing === 'back') {
      if (shot.kind === 'overhead') s.backOverheads[t]!++;
      else s.backhands[t]!++;
    }
  }
  return s;
}

describe('IA contre IA', () => {
  it('l’IA joue des coups droits et des revers, rarement un revers par-dessus la tête ; un gaucher en face ne casse rien', () => {
    for (const hand of ['right', 'left'] as const) {
      const s = measure(900, 5, hand);
      const backShare = (s.backhands[0]! + s.backhands[1]!) / (s.shots[0]! + s.shots[1]!);
      const backOverheadShare = (s.backOverheads[0]! + s.backOverheads[1]!) / Math.max(1, s.overheads[0]! + s.overheads[1]!);
      console.log(
        `rouge ${hand === 'right' ? 'droitier' : 'gaucher'} : ${s.points} points (bleu ${s.won[0]}, rouge ${s.won[1]}), ` +
          `revers ${(backShare * 100).toFixed(0)} % des coups, revers par-dessus la tête ${(backOverheadShare * 100).toFixed(0)} % des coups hauts`,
      );
      expect(s.points).toBeGreaterThan(40);
      expect(backShare).toBeGreaterThan(0.1);
      expect(backShare).toBeLessThan(0.6);
      expect(backOverheadShare).toBeLessThan(0.25);
      // Ni l'un ni l'autre n'écrase l'autre : la main ne fait pas le niveau.
      expect(Math.min(s.won[0]!, s.won[1]!) / s.points).toBeGreaterThan(0.3);
    }
  }, 120_000);
});
