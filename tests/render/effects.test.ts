import { describe, expect, it } from 'vitest';
import {
  BANNER_LIFE,
  bannerFor,
  dustLook,
  Effects,
  EFFECT_COLORS,
  fade,
  glassLook,
  glassStrength,
  impactLook,
  meshOffset,
  meshStrength,
  Pool,
  ringOpening,
  type StepEvents,
} from '../../src/render/effects';
import type { Contact } from '../../src/sim/collisions';
import { HALF_LENGTH, HALF_WIDTH } from '../../src/sim/constants';
import { vec3 } from '../../src/sim/vec3';

/** Hasard reproductible pour les tests. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const step = (partial: Partial<StepEvents>): StepEvents => ({ contacts: [], shot: null, exit: null, result: null, ...partial });
const shot = (perfect: boolean, overhead: 'remate' | 'bandeja' | null = null, speed = 20) => ({ perfect, overhead, speed, contact: vec3(0, 1, -8) });
const active = (fx: Effects) => fx.effects.items.filter((e) => e.active);

describe('effets de balle et de vitre', () => {
  it('la réserve ne grossit pas : le plus ancien cède sa place', () => {
    const pool = new Pool(4, () => ({ active: false, id: 0 }));
    for (let i = 0; i < 10; i++) Object.assign(pool.acquire(), { active: true, id: i });
    expect(pool.items.length).toBe(4);
    expect(pool.items.map((x) => x.id).sort()).toEqual([6, 7, 8, 9]);

    const fx = new Effects(32, 256, seeded());
    for (let i = 0; i < 500; i++) {
      fx.fromStep(step({ shot: shot(i % 2 === 0, 'remate'), contacts: [{ surface: 'ground', pos: vec3(0, 0, 3), speed: 9 }] }));
    }
    expect(fx.effects.items.length).toBe(32);
    expect(fx.particles.items.length).toBe(256);
    expect(fx.effects.activeCount).toBe(32);
    expect(fx.spawned.impact).toBe(500);
  });

  it("frappe parfaite : éclat doré, plus gros et plus long ; smash plus marqué encore", () => {
    const normal = impactLook(shot(false));
    const perfect = impactLook(shot(true));
    const smash = impactLook(shot(false, 'remate'));
    expect(normal.color).toBe(EFFECT_COLORS.normal);
    expect(perfect.color).toBe(EFFECT_COLORS.perfect);
    expect(perfect.size).toBeGreaterThan(normal.size);
    expect(perfect.life).toBeGreaterThan(normal.life);
    expect(perfect.sparks).toBeGreaterThan(normal.sparks);
    expect(smash.size).toBeGreaterThan(normal.size);
    expect(smash.sparks).toBeGreaterThan(normal.sparks);
    expect(impactLook(shot(true, 'remate')).size).toBeGreaterThan(perfect.size);
    // Une balle qui part vite donne un éclat un peu plus grand.
    expect(impactLook(shot(false, null, 30)).size).toBeGreaterThan(impactLook(shot(false, null, 5)).size);
  });

  it('onde de vitre : plus forte et plus large si la balle va vite, sur le plan de la vitre', () => {
    expect(glassStrength(25)).toBeGreaterThan(glassStrength(8));
    expect(glassStrength(0)).toBeGreaterThan(0);
    expect(glassStrength(100)).toBe(1);
    expect(glassLook(1).size).toBeGreaterThan(glassLook(0.2).size);

    const fx = new Effects(32, 256, seeded());
    const contact: Contact = { surface: 'glass', wall: 'backFar', pos: vec3(1.5, 1.2, HALF_LENGTH - 0.0325), speed: 12 };
    fx.fromStep(step({ contacts: [contact] }));
    const waves = active(fx);
    expect(waves.map((e) => e.kind)).toEqual(['glass', 'glass']);
    for (const e of waves) {
      expect(e.z).toBeCloseTo(HALF_LENGTH - 0.01, 6);
      expect([e.nx, e.ny, e.nz]).toEqual([0, 0, -1]);
    }
    // La seconde onde part un peu après.
    expect(waves[1]!.age).toBeLessThan(0);

    const side = new Effects(32, 256, seeded());
    side.contact({ surface: 'glass', wall: 'sideNegX', pos: vec3(-HALF_WIDTH + 0.0325, 1, 6), speed: 6 }, false);
    expect(active(side)[0]!.x).toBeCloseTo(-HALF_WIDTH + 0.01, 6);
  });

  it('poussière au rebond proportionnée à la vitesse verticale, couleur du sol', () => {
    expect(dustLook(0.5).count).toBe(0);
    expect(dustLook(10).count).toBeGreaterThan(dustLook(3).count);
    const fx = new Effects(32, 256, seeded());
    fx.contact({ surface: 'ground', pos: vec3(1, 0.03, 4), speed: 8 }, false);
    const grains = fx.particles.items.filter((p) => p.active);
    expect(grains.length).toBe(dustLook(8).count);
    expect(grains.every((p) => p.color === EFFECT_COLORS.turf)).toBe(true);
    // Balle sortie qui retombe dehors : poussière du sol autour du terrain.
    const outside = new Effects(32, 256, seeded());
    outside.contact({ surface: 'ground', pos: vec3(HALF_WIDTH + 1.5, 0.03, 4), speed: 8 }, false);
    expect(outside.particles.items.filter((p) => p.active).every((p) => p.color === EFFECT_COLORS.surround)).toBe(true);
    // Elle roule : rien.
    const rolling = new Effects(32, 256, seeded());
    rolling.contact({ surface: 'ground', pos: vec3(0, 0.03, 4), speed: 0.4 }, false);
    expect(rolling.particles.activeCount).toBe(0);
  });

  it('grillage qui vibre, de moins en moins, plus fort sur un choc rapide', () => {
    expect(meshStrength(14)).toBeGreaterThan(meshStrength(4));
    const peak = (age0: number, age1: number): number => {
      let m = 0;
      for (let a = age0; a < age1; a += 0.001) m = Math.max(m, Math.abs(meshOffset(a, 1)));
      return m;
    };
    expect(peak(0, 0.05)).toBeGreaterThan(peak(0.2, 0.25) * 3);
    const fx = new Effects(32, 256, seeded());
    fx.contact({ surface: 'mesh', wall: 'sidePosX', pos: vec3(HALF_WIDTH - 0.0325, 3.4, 1), speed: 9 }, false);
    expect(active(fx)[0]!.kind).toBe('mesh');
    expect(active(fx)[0]!.nx).toBe(-1);
  });

  it('por tres et por cuatro : éclair et annonce, qui s’effacent', () => {
    expect(bannerFor('por-tres')).toBe('¡POR TRES!');
    expect(bannerFor('por-cuatro')).toBe('¡POR CUATRO!');
    expect(bannerFor('second-bounce')).toBeNull();
    const fx = new Effects(32, 256, seeded());
    // Sortie par-dessus le mur après le rebond : éclat au sommet du mur ; avant le rebond (faute), rien.
    fx.fromStep(step({ contacts: [{ surface: 'out', wall: 'sidePosX', pos: vec3(HALF_WIDTH, 4.2, 6), speed: 6 }], exit: {} }));
    expect(fx.spawned.exit).toBe(1);
    fx.fromStep(step({ contacts: [{ surface: 'out', wall: 'backFar', pos: vec3(0, 4.2, HALF_LENGTH), speed: 6 }] }));
    expect(fx.spawned.exit).toBe(1);

    fx.fromStep(step({ result: { reason: 'por-tres' } }));
    expect(fx.banner).toBe('¡POR TRES!');
    expect(fx.flashAge).toBe(0);
    fx.update(BANNER_LIFE + 0.01);
    expect(fx.banner).toBeNull();
  });

  it('les effets vieillissent au temps réel, restent figés pendant la micro-pause, puis s’éteignent', () => {
    const fx = new Effects(32, 256, seeded());
    fx.fromStep(step({ shot: shot(true) }));
    const look = impactLook(shot(true));
    fx.update(0.05);
    const [e] = active(fx);
    expect(e!.age).toBeCloseTo(0.05, 9);
    const sparks = fx.particles.items.filter((p) => p.active).map((p) => [p.x, p.y, p.z]);
    // Micro-pause : rien ne bouge.
    for (let i = 0; i < 10; i++) fx.update(0);
    expect(e!.age).toBeCloseTo(0.05, 9);
    expect(fx.particles.items.filter((p) => p.active).map((p) => [p.x, p.y, p.z])).toEqual(sparks);
    fx.update(look.life);
    expect(fx.effects.activeCount).toBe(0);
    fx.update(1);
    expect(fx.particles.activeCount).toBe(0);
  });

  it('anneau qui s’ouvre et éclat qui s’éteint, bornés', () => {
    expect(ringOpening(0)).toBe(0);
    expect(ringOpening(1)).toBe(1);
    expect(ringOpening(0.3)).toBeGreaterThan(0.3);
    expect(fade(0)).toBe(1);
    expect(fade(1)).toBe(0);
    expect(fade(2)).toBe(0);
  });
});
