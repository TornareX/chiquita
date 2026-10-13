/** Aides d'entraînement, toutes désactivables : la progression consiste à les retirer une à une. */
export interface Aids {
  /** Trajectoire prévue de la balle, en pointillé. */
  trajectory: boolean;
  /** Marqueur du prochain point de rebond au sol. */
  bounceMarker: boolean;
  /** Taille de la zone de frappe (1 = réelle). */
  tolerance: number;
  /** Vitesse du temps : 1, 0,75 ou 0,5. */
  timeScale: number;
}

export const TIME_SCALES = [1, 0.75, 0.5] as const;
export const MAX_TOLERANCE = 2;

export function createAids(): Aids {
  return { trajectory: true, bounceMarker: true, tolerance: 1.5, timeScale: 1 };
}
