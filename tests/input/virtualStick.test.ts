import { describe, expect, it } from 'vitest';
import { KEY_LAYOUTS } from '../../src/input/keyboardArcade';
import { SwingStick, type SwingOutput } from '../../src/input/swingStick';
import { KEY_GRACE, KeyStick, strongest } from '../../src/input/virtualStick';
import { SIM_DT } from '../../src/sim/constants';

const KEYS = KEY_LAYOUTS[0].swing;
const steps = (seconds: number): number => Math.ceil(seconds / SIM_DT);

/**
 * Joue une suite de touches tenues au stick droit du clavier, `[touches, durée en s]`, et la passe au même
 * reconnaisseur de geste que la manette. Sorties de chaque pas.
 */
function playKeys(sequence: [string[], number][], wallReady = false): SwingOutput[] {
  const stick = new KeyStick();
  const swing = new SwingStick();
  swing.wallReady = wallReady;
  const held = new Set<string>();
  const out: SwingOutput[] = [];
  for (const [codes, seconds] of sequence) {
    for (const code of codes) if (!held.has(code)) stick.press(code);
    for (const code of [...held]) if (!codes.includes(code)) held.delete(code);
    for (const code of codes) held.add(code);
    for (let i = 0; i < steps(seconds); i++) {
      const axes = stick.update(KEYS, held, SIM_DT);
      out.push(swing.update(axes.right, axes.up, SIM_DT));
    }
  }
  return out;
}
const finished = (out: SwingOutput[]) => out.find((o) => o.swing?.end !== undefined)?.swing;

describe('stick droit au clavier : les gestes de la manette', () => {
  it('K tenu puis I : préparé, tout droit', () => {
    expect(finished(playKeys([[['KeyK'], 0.3], [['KeyI'], 0.1], [[], 0.3]]))).toEqual({ prepared: true, end: 'straight' });
  });

  it('un petit trou entre K et I ne compte pas comme un stick lâché', () => {
    const gap = KEY_GRACE / 2;
    expect(finished(playKeys([[['KeyK'], 0.3], [[], gap], [['KeyI'], 0.1], [[], 0.3]]))).toEqual({ prepared: true, end: 'straight' });
  });

  it('I pressé avant de lâcher K : la dernière touche gagne, tout droit', () => {
    expect(finished(playKeys([[['KeyK'], 0.3], [['KeyK', 'KeyI'], 0.1], [[], 0.3]]))).toEqual({ prepared: true, end: 'straight' });
  });

  it('K, puis J (par le côté), puis I : arc', () => {
    expect(finished(playKeys([[['KeyK'], 0.3], [['KeyJ'], 0.1], [['KeyI'], 0.1], [[], 0.3]]))).toEqual({ prepared: true, end: 'arc' });
    expect(finished(playKeys([[['KeyK'], 0.3], [['KeyK', 'KeyL'], 0.05], [['KeyL'], 0.1], [['KeyL', 'KeyI'], 0.1], [[], 0.3]]))).toEqual({
      prepared: true,
      end: 'arc',
    });
  });

  it('K lâché et rien après : stick lâché (chiquita)', () => {
    expect(finished(playKeys([[['KeyK'], 0.3], [[], 0.4]]))).toEqual({ prepared: true, end: 'letGo' });
  });

  it('I seul, sans préparer : coup sec', () => {
    expect(finished(playKeys([[['KeyI'], 0.1], [[], 0.3]]))).toEqual({ prepared: false, end: 'straight' });
  });

  it('contre-vitre proposée : I prépare, K frappe contre la vitre', () => {
    expect(finished(playKeys([[['KeyI'], 0.3], [['KeyK'], 0.1], [[], 0.3]], true))).toEqual({ prepared: true, end: 'straight', wall: true });
  });

  it('diagonale ramenée au bord du stick, comme une manette', () => {
    const stick = new KeyStick();
    stick.press('KeyK');
    stick.press('KeyJ');
    const axes = stick.update(KEYS, new Set(['KeyK', 'KeyJ']), SIM_DT);
    expect(Math.hypot(axes.right, axes.up)).toBeCloseTo(1);
  });

  it('deux sources : le stick le plus poussé', () => {
    expect(strongest({ right: 0.2, up: 0 }, { right: 0, up: -0.9 })).toEqual({ right: 0, up: -0.9 });
  });
});
