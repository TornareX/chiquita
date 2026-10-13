import { describe, expect, it } from 'vitest';
import { SIM_DT, SIM_HZ } from '../../src/sim/constants';
import { FixedStepLoop } from '../../src/sim/loop';
import { World } from '../../src/sim/world';

// dt = 0,25 s : puissance de deux, donc arithmétique exacte en flottant.
const DT = 0.25;

function makeLoop(maxFrameTime?: number) {
  let steps = 0;
  const loop = new FixedStepLoop(DT, () => steps++, maxFrameTime);
  return { loop, steps: () => steps };
}

describe('FixedStepLoop', () => {
  it("n'exécute aucun pas tant qu'un dt complet n'est pas écoulé", () => {
    const { loop, steps } = makeLoop(10);
    expect(loop.advance(0.125)).toBe(0.5);
    expect(steps()).toBe(0);
  });

  it('exécute un pas par dt écoulé et retourne la fraction restante', () => {
    const { loop, steps } = makeLoop(10);
    expect(loop.advance(0.625)).toBe(0.5);
    expect(steps()).toBe(2);
  });

  it("reporte le reste d'une image sur la suivante", () => {
    const { loop, steps } = makeLoop(10);
    loop.advance(0.125);
    expect(loop.advance(0.125)).toBe(0);
    expect(steps()).toBe(1);
  });

  it('plafonne le temps rattrapé après un gel', () => {
    const { loop, steps } = makeLoop(1);
    loop.advance(60);
    expect(steps()).toBe(4);
  });

  it('ignore un temps négatif', () => {
    const { loop, steps } = makeLoop(10);
    expect(loop.advance(-5)).toBe(0);
    expect(steps()).toBe(0);
  });

  it('le nombre de pas ne dépend pas de la cadence du rendu', () => {
    const run = (fps: number): number => {
      const world = new World();
      const loop = new FixedStepLoop(SIM_DT, () => world.step());
      for (let i = 0; i < fps; i++) loop.advance(1 / fps);
      return world.tick;
    };
    // 1 s simulée : 240 pas, à un pas près selon l'arrondi de l'accumulateur.
    for (const fps of [30, 60, 144]) {
      expect(Math.abs(run(fps) - SIM_HZ)).toBeLessThanOrEqual(1);
    }
  });
});

describe('World', () => {
  it('avance de SIM_DT par pas', () => {
    const world = new World();
    for (let i = 0; i < SIM_HZ; i++) world.step();
    expect(world.tick).toBe(SIM_HZ);
    expect(world.time).toBe(1);
  });
});
