import { describe, expect, it } from 'vitest';
import { Bot, DEFAULT_BOT } from '../../src/sim/bot';
import { NEUTRAL_ARCADE } from '../../src/sim/commands';
import { Duel, type DuelShot } from '../../src/sim/duel';
import { LESSONS } from '../../src/sim/lessons';
import { ARCADE } from '../../src/sim/profile';
import { bandejaHeight, overheadHeightOff } from '../../src/sim/shots';
import type { Vec3 } from '../../src/sim/vec3';

/**
 * Hauteur de frappe de la bandeja et de la víbora : à hauteur des yeux, c'est propre ;
 * trop haute, la balle perd son effet et rebondit (balle facile pour l'adversaire) ; trop basse, elle
 * part à plat, vers le filet. Sur un lob qui redescend, c'est le moment du relâcher qui choisit la hauteur.
 */
interface Played {
  shot: DuelShot;
  /** Premier rebond de la balle frappée, et hauteur maximale de la balle ensuite (rebond, vitre). */
  landing: Vec3;
  peak: number;
}

function overhead(release: number, right: number): Played {
  const duel = new Duel(null);
  LESSONS.find((l) => l.id === 'bandeja')!.start(duel, 0);
  const bot = new Bot(0, 7, { ...DEFAULT_BOT, release: { offset: release, spread: 0 }, forced: { kind: 'overhead', stick: { forward: 0, right } } });
  let shot: DuelShot | null = null;
  let landing: Vec3 | null = null;
  let peak = 0;
  for (let i = 0; i < 3000 && !duel.result; i++) {
    duel.step([bot.commands(duel), NEUTRAL_ARCADE]);
    if (duel.shot?.player === 0) shot = duel.shot;
    if (!shot || !duel.ball) continue;
    const ground = duel.contacts.find((c) => c.surface === 'ground');
    if (ground && landing) break;
    if (ground) landing = ground.pos;
    else if (landing) peak = Math.max(peak, duel.ball.pos.y);
  }
  return { shot: shot!, landing: landing!, peak };
}

describe('hauteur de frappe de la bandeja et de la víbora', () => {
  it('se mesure par rapport à la hauteur des yeux, selon la taille du joueur', () => {
    const r = ARCADE.rally;
    const ideal = bandejaHeight(ARCADE);
    expect(overheadHeightOff(ideal, ARCADE)).toBe(0);
    expect(overheadHeightOff(ideal + r.overheadBand, ARCADE)).toBeCloseTo(0, 9);
    // Un joueur plus grand frappe plus haut : la même balle est pour lui un peu basse.
    expect(overheadHeightOff(ideal, ARCADE, 2)).toBeLessThan(0);
    expect(overheadHeightOff(r.overheadHigh, ARCADE)).toBe(1);
    expect(overheadHeightOff(ideal - r.overheadBand - r.overheadLowSpan, ARCADE)).toBe(-1);
    // Joueur de 1,80 m : yeux vers 1,68 m.
    expect(ideal).toBeCloseTo(1.68, 2);
    expect(overheadHeightOff(2.2, ARCADE)).toBeGreaterThan(0);
    expect(overheadHeightOff(1.4, ARCADE)).toBeLessThan(0);
  });

  for (const [name, right] of [
    ['bandeja', 0],
    ['víbora', 1],
  ] as const) {
    it(`${name} : au bon moment, frappe propre et balle qui reste basse`, () => {
      const clean = overhead(0, right);
      expect(clean.shot.heightOff).toBe(0);
      expect(clean.shot.perfect).toBe(true);
      expect(clean.landing.z).toBeGreaterThan(0);
    });

    it(`${name} : relâchée trop tôt, prise trop haute, elle rebondit bien plus haut`, () => {
      const clean = overhead(0, right);
      const high = overhead(-0.12, right);
      expect(high.shot.heightOff).toBeGreaterThan(0.3);
      expect(high.shot.perfect).toBe(false);
      expect(high.landing.z).toBeGreaterThan(0);
      expect(high.peak).toBeGreaterThan(clean.peak + 0.6);
    });

    if (name === 'bandeja') it(`${name} : un peu en retard, un peu basse, elle passe encore`, () => {
      const low = overhead(0.03, right);
      expect(low.shot.heightOff).toBeLessThan(0);
      expect(low.landing.z).toBeGreaterThan(0);
    });

    it(`${name} : relâchée trop tard, le joueur frappe quand même, sous les épaules : filet`, () => {
      for (const late of [0.06, 0.1]) {
        const low = overhead(late, right);
        expect(low.shot.overhead).not.toBeNull();
        expect(low.shot.heightOff).toBeLessThan(-0.6);
        // Elle ne passe pas : premier rebond dans son propre camp.
        expect(low.landing.z).toBeLessThan(0);
      }
    });
  }
});
