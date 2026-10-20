/**
 * Maths déterministes (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 0) : `Math.sin`, `Math.cos`, `Math.atan` ou
 * `Math.hypot` peuvent donner un résultat différent au dernier chiffre d'un navigateur à l'autre (la norme les laisse
 * « approchés »), et deux machines d'un match en ligne divergeraient peu à peu. Ces versions n'utilisent que
 * `+ - * /`, `Math.sqrt`, `Math.round` et `Math.abs`, exacts partout en IEEE 754 : même résultat au bit près dans
 * tous les moteurs. Elles reprennent les algorithmes de fdlibm (réduction de l'argument puis polynôme), à un
 * dernier chiffre près de `Math`. Toute la simulation passe par elles (`tests/sim/dmath.test.ts` l'impose).
 */

// Réduction de l'argument : x = k·π/2 + r, avec π/2 découpé en trois morceaux pour garder r exact (Cody-Waite).
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_3 = 2.02226624879595063154e-21;

// Polynômes de sin et cos sur [-π/4, π/4] (fdlibm, `__kernel_sin` et `__kernel_cos`).
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kernelSin(x: number): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + v * (S1 + z * r);
}

function kernelCos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + z * r);
}

/** Quart de tour et reste : `x = quadrant·π/2 + rest`, `rest` dans [-π/4, π/4] (pour |x| < ~10⁶). */
function reduce(x: number): { quadrant: number; rest: number } {
  const k = Math.round(x * INV_PIO2);
  const rest = x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3;
  return { quadrant: ((k % 4) + 4) % 4, rest };
}

export function dsin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  // Zéro garde son signe, comme Math.sin(-0).
  if (x === 0) return x;
  const { quadrant, rest } = reduce(x);
  switch (quadrant) {
    case 0:
      return kernelSin(rest);
    case 1:
      return kernelCos(rest);
    case 2:
      return -kernelSin(rest);
    default:
      return -kernelCos(rest);
  }
}

export function dcos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  const { quadrant, rest } = reduce(x);
  switch (quadrant) {
    case 0:
      return kernelCos(rest);
    case 1:
      return -kernelSin(rest);
    case 2:
      return -kernelCos(rest);
    default:
      return kernelSin(rest);
  }
}

// Arc tangente (fdlibm `atan`) : atan(x) = atan(c) + atan((x − c)/(1 + c·x)) autour de c = 0,5, 1, 1,5 ou ∞.
const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
] as const;

export function datan(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  const negative = x < 0;
  let a = Math.abs(x);
  if (a >= 7.37e19) return negative ? -ATAN_HI[3]! - ATAN_LO[3]! : ATAN_HI[3]! + ATAN_LO[3]!;
  let id = -1;
  if (a < 0.4375) {
    if (a < 1.862645149230957e-9) return x;
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return negative ? -(a - a * (s1 + s2)) : a - a * (s1 + s2);
  const result = ATAN_HI[id]! - (a * (s1 + s2) - ATAN_LO[id]! - a);
  return negative ? -result : result;
}

/** Longueur de (x, y) : `Math.sqrt`, exact partout (contrairement à `Math.hypot`). */
export function dhypot(x: number, y: number, z = 0): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Carré, à la place de `x ** 2` (l'exponentiation est elle aussi « approchée » par la norme). */
export function sq(x: number): number {
  return x * x;
}
