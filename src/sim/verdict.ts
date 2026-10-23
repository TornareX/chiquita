import type { DuelShot } from './duel';
import type { PhysicsProfile } from './profile';

/**
 * Qualité d'une frappe, ce qui l'a rendue bonne ou moins bonne. Dans l'ordre : parfaite ; hauteur de la bandeja ou de
 * la víbora ; pas préparée ; en retard, en avance ; mal placé (balle loin du point idéal) ; sous pression (balle
 * rouge) ; sinon propre. Le texte affiché est dans `ui/shotVerdict.ts`.
 */
export type ShotQuality = 'parfait' | 'haute' | 'basse' | 'pasPrepare' | 'retard' | 'avance' | 'malPlace' | 'pression' | 'propre';

/** Balle reçue à partir de laquelle la frappe est « sous pression » : une faute dessus est provoquée par l'adversaire. */
export const PRESSURE_FORCED = 0.6;

export function shotQuality(shot: DuelShot, profile: PhysicsProfile): ShotQuality {
  const r = profile.rally;
  if (shot.perfect) return 'parfait';
  if (shot.heightOff >= 0.3) return 'haute';
  if (shot.heightOff <= -0.3) return 'basse';
  const prep = shot.volley ? r.volleyPrep : r.blockPrep;
  if (shot.style === 'block' && shot.prepared !== undefined && shot.prepared < prep) return 'pasPrepare';
  if (shot.timing > r.perfectAfter + 0.02) return 'retard';
  if (shot.timing < -(r.perfectBefore + 0.02)) return 'avance';
  if ((shot.miss ?? 0) > r.sweetSpot) return 'malPlace';
  if (shot.pressure >= PRESSURE_FORCED) return 'pression';
  return 'propre';
}
