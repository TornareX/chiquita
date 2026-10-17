import type { ShotKind } from './commands';
import type { PhysicsProfile } from './profile';

/**
 * Couleur de la balle reçue, comme la lisent les joueurs de padel (zones par hauteur et par temps) :
 * - verte : balle confortable, avec du temps et à bonne hauteur : on peut lober profond ou attaquer ;
 * - jaune : balle de transition ;
 * - rouge : balle basse, rapide, prise sans temps de préparation (volée au corps, balle dans les pieds) :
 *   on la remet devant soi, le plus près possible du filet, et c'est là qu'on rate.
 */
export type BallColor = 'verte' | 'jaune' | 'rouge';

/** Ce que le joueur voit de la balle qu'il va frapper. */
export interface Incoming {
  /** Temps entre la frappe adverse et l'impact (s) : le temps de préparation. */
  prep: number;
  /** Hauteur de la balle à l'impact (m). */
  height: number;
  /** Vitesse horizontale de la balle à l'impact (m/s). */
  speed: number;
  /** Vitesse du joueur à l'impact (m/s) : frapper en courant est plus dur. */
  running: number;
  /** La balle sort d'un coin (deux vitres). */
  doubleGlass: boolean;
  /** Coup choisi : le coupé s'accommode mieux d'une balle basse, et au-dessus de la tête la hauteur ne gêne pas. */
  kind: ShotKind;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
/** 0 à `easy`, 1 à `hard`, linéaire entre les deux (dans un sens ou dans l'autre). */
const ramp = (value: number, easy: number, hard: number): number => clamp01((value - easy) / (hard - easy));

/**
 * Pression de la balle reçue, de 0 (verte) à 1 (rouge). Déterministe : même balle, même pression.
 * Réglages dans `profile.rally.pressure` ; `scale` = 0 désactive tout l'effet.
 */
export function ballPressure(ball: Incoming, profile: PhysicsProfile): number {
  const t = profile.rally.pressure;
  const time = ramp(ball.prep, t.prepEasy, t.prepHard);
  // Balle basse : sous les genoux, c'est rouge ; le coupé la remet mieux. Au-dessus de la tête, pas de gêne.
  const low = ball.kind === 'overhead' ? 0 : ramp(ball.height, t.comfortLow, t.lowHeight) * (ball.kind === 'slice' ? t.sliceLow : 1);
  const fast = ramp(ball.speed, t.slowSpeed, t.fastSpeed);
  const running = ramp(ball.running, t.runEasy, t.runHard);
  const sum = t.weights.time * time + t.weights.low * low + t.weights.fast * fast + t.weights.running * running;
  return clamp01(sum + (ball.doubleGlass ? t.doubleGlass : 0));
}

export function ballColor(pressure: number): BallColor {
  return pressure < 1 / 3 ? 'verte' : pressure < 2 / 3 ? 'jaune' : 'rouge';
}

/**
 * Erreur d'un coup, de 0 (parfait) à 1, d'après la pression et la précision du contact :
 * - `timing` : écart au moment idéal (s), négatif en avance ; c'est aussi être placé trop devant ou
 *   trop derrière la balle, puisque la frappe part quand la balle est à portée ;
 * - `miss` : distance de la balle au point idéal à côté du joueur, sur le côté (m).
 * Une frappe parfaite divise la part de la pression : bien frapper une balle rouge reste possible. Et
 * l'imprécision coûte d'autant plus que la balle est dure.
 */
export function shotError(pressure: number, timing: number, miss: number, perfect: boolean, profile: PhysicsProfile): number {
  const r = profile.rally;
  const t = r.pressure;
  const early = ramp(-timing, r.perfectBefore, r.perfectBefore + t.earlySpan);
  const late = ramp(timing, r.perfectAfter, r.lateWindow);
  const off = ramp(miss, r.sweetSpot * 0.5, r.reach);
  const imprecision = clamp01(t.timingError * Math.max(early, late) + t.missError * off);
  // Mal frappée, une balle facile reste jouable ; sous pression, la moindre imprécision coûte.
  const cost = t.calmImprecision + (1 - t.calmImprecision) * pressure;
  return clamp01(t.scale * (pressure * (perfect ? t.perfectRelief : 1) * t.pressureError + imprecision * cost));
}
