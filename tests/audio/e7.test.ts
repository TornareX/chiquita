import { describe, expect, it } from 'vitest';
import { gruntRecipe, shotPower, squeakRecipe, SqueakDetector, VOICES } from '../../src/audio/recipes';
import { SIM_DT } from '../../src/sim/constants';
import { vec3, type Vec3 } from '../../src/sim/vec3';

describe('crissements de semelles', () => {
  /** Fait courir le joueur selon `speeds` (une vitesse par pas) et compte les crissements. */
  function run(vels: Vec3[]): number[] {
    const detector = new SqueakDetector();
    return vels.map((v) => detector.update(0, v, SIM_DT)).filter((i) => i > 0);
  }
  const steps = (n: number, v: Vec3): Vec3[] => Array.from({ length: n }, () => v);

  it('un crissement sur un arrêt net après une course, aucun en courant ou en marchant', () => {
    expect(run([...steps(120, vec3(6, 0, 0)), ...steps(10, vec3(3, 0, 0)), ...steps(10, vec3(0, 0, 0))])).toHaveLength(1);
    expect(run(steps(400, vec3(6, 0, 0)))).toHaveLength(0);
    expect(run([...steps(120, vec3(2, 0, 0)), ...steps(20, vec3(0, 0, 0))])).toHaveLength(0);
  });

  it('pas plus d’un crissement toutes les 2 s par joueur', () => {
    const stop = [...steps(120, vec3(6, 0, 0)), ...steps(20, vec3(0, 0, 0))];
    expect(run([...stop, ...stop])).toHaveLength(1);
    expect(run([...stop, ...steps(400, vec3(0, 0, 0)), ...stop])).toHaveLength(2);
  });

  it('un crissement sur un changement de direction franc, pas sur un virage doux', () => {
    expect(run([...steps(120, vec3(5, 0, 0)), ...steps(120, vec3(-5, 0, 0))])).toHaveLength(1);
    expect(run([...steps(120, vec3(5, 0, 0)), ...steps(120, vec3(4, 0, 3))])).toHaveLength(0);
  });

  it('court, aigu, plus fort sur un gros freinage', () => {
    const soft = squeakRecipe(vec3(0, 0, -8), 0.2);
    const hard = squeakRecipe(vec3(0, 0, -8), 1);
    const gain = (r: typeof soft) => r.layers.reduce((s, l) => s + l.gain, 0);
    expect(gain(hard)).toBeGreaterThan(gain(soft));
    for (const layer of hard.layers) expect((layer.delay ?? 0) + (layer.attack ?? 0) + layer.duration).toBeLessThan(0.15);
    expect(hard.layers.some((l) => l.type === 'tone' && l.from > 1500)).toBe(true);
  });
});

describe('souffle à la frappe', () => {
  it('seulement sur les coups forts ; chaque personnage a sa voix', () => {
    expect(shotPower({ speed: 12, overhead: null })).toBe(0);
    expect(shotPower({ speed: 35, overhead: null })).toBe(1);
    expect(shotPower({ speed: 18, overhead: 'remate' })).toBe(1);
    expect(gruntRecipe(vec3(0, 1, -8), 0.2, VOICES[0]!)).toBeNull();
    const pitches = VOICES.map((v) => JSON.stringify(gruntRecipe(vec3(0, 1, -8), 1, v)!.layers));
    expect(new Set(pitches).size).toBe(VOICES.length);
  });
});
