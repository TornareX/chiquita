import { describe, expect, it } from 'vitest';
import type { DuelShot } from '../../src/sim/duel';
import { ARCADE } from '../../src/sim/profile';
import { shotVerdict } from '../../src/ui/shotVerdict';

describe('verdict de chaque frappe', () => {
  const shot = (over: Partial<DuelShot>): DuelShot =>
    ({ perfect: false, timing: 0, heightOff: 0, pressure: 0.2, volley: false, style: null, kind: 'normal', overhead: null, ...over }) as DuelShot;
  it('dit ce qui a fait le coup : parfait, en retard, en avance, mal placé, pas préparé, sous pression, propre', () => {
    expect(shotVerdict(shot({ perfect: true }), ARCADE).text).toBe('parfait');
    expect(shotVerdict(shot({ timing: 0.1 }), ARCADE).text).toBe('en retard');
    expect(shotVerdict(shot({ timing: -0.15 }), ARCADE).text).toBe('en avance');
    expect(shotVerdict(shot({ miss: 0.9 }), ARCADE).text).toBe('mal placé');
    expect(shotVerdict(shot({ style: 'block', prepared: 0 }), ARCADE).text).toBe('pas préparé');
    expect(shotVerdict(shot({ pressure: 0.8 }), ARCADE).text).toBe('sous pression');
    expect(shotVerdict(shot({}), ARCADE).text).toBe('propre');
  });
});
