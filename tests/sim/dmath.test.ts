import { describe, expect, it } from 'vitest';
import { datan, dcos, dhypot, dsin, sq } from '../../src/sim/dmath';
import { Prng } from '../../src/sim/prng';

/** Écart permis avec `Math` : deux ou trois derniers chiffres binaires (`Math` lui-même n'est pas exact au bit près). */
const close = (got: number, want: number): void => {
  expect(Math.abs(got - want)).toBeLessThanOrEqual(6e-16 * Math.max(1, Math.abs(want)));
};

describe('maths déterministes', () => {
  it('sin et cos suivent Math au dernier chiffre près, de -1000 à 1000 rad', () => {
    const rng = new Prng(3);
    for (let i = 0; i < 200_000; i++) {
      const x = i < 100_000 ? rng.range(-7, 7) : rng.range(-1000, 1000);
      close(dsin(x), Math.sin(x));
      close(dcos(x), Math.cos(x));
    }
    for (const x of [0, -0, Math.PI / 2, Math.PI, -Math.PI / 4, 1e-12, 0.785398, 2.356194]) {
      close(dsin(x), Math.sin(x));
      close(dcos(x), Math.cos(x));
    }
    expect(Object.is(dsin(-0), -0)).toBe(true);
    expect(dsin(Infinity)).toBeNaN();
  });

  it('atan suit Math au dernier chiffre près, sur toutes les échelles', () => {
    const rng = new Prng(5);
    for (let i = 0; i < 200_000; i++) {
      const x = (rng.next() < 0.5 ? -1 : 1) * 10 ** rng.range(-12, 12);
      close(datan(x), Math.atan(x));
    }
    for (const x of [0, 0.4375, 0.6875, 1, 1.1875, 2.4375, -1, 1e30, -1e30]) close(datan(x), Math.atan(x));
    expect(datan(Number.NaN)).toBeNaN();
  });

  it('hypot et carré', () => {
    expect(dhypot(3, 4)).toBe(5);
    expect(dhypot(1, 2, 2)).toBe(3);
    expect(sq(1.1)).toBe(1.1 * 1.1);
  });

  it('la simulation n’utilise aucune fonction mathématique « approchée » (sin, cos, pow, **…)', () => {
    // Les sources de la simulation, en texte (Vite).
    const sources = import.meta.glob<string>('../../src/sim/*.ts', { query: '?raw', import: 'default', eager: true });
    const forbidden =
      /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b|\*\*/;
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      const file = path.split('/').pop()!;
      if (file === 'dmath.ts') continue;
      // Sans les commentaires (ils peuvent citer ces fonctions).
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      code.split('\n').forEach((line, i) => {
        if (forbidden.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`);
      });
    }
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});
