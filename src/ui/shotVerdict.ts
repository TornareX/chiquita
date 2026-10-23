import type { DuelShot } from '../sim/duel';
import type { PhysicsProfile } from '../sim/profile';

/**
 * Verdict d'une frappe d'un humain, en un mot : ce qui l'a rendue bonne ou moins bonne, pour que le skill se voie
 * (Xavier, 23/10). Dans l'ordre : parfaite ; hauteur de la bandeja ou de la víbora ; pas préparée ; en retard, en
 * avance ; mal placé (balle loin du point idéal) ; sous pression (balle rouge) ; sinon propre.
 */
export function shotVerdict(shot: DuelShot, profile: PhysicsProfile): { text: string; tone: 'perfect' | 'good' | 'off' } {
  const r = profile.rally;
  if (shot.perfect) return { text: 'parfait', tone: 'perfect' };
  if (shot.heightOff >= 0.3) return { text: 'prise trop haute', tone: 'off' };
  if (shot.heightOff <= -0.3) return { text: 'prise trop basse', tone: 'off' };
  const prep = shot.volley ? r.volleyPrep : r.blockPrep;
  if (shot.style === 'block' && shot.prepared !== undefined && shot.prepared < prep) return { text: 'pas préparé', tone: 'off' };
  if (shot.timing > r.perfectAfter + 0.02) return { text: 'en retard', tone: 'off' };
  if (shot.timing < -(r.perfectBefore + 0.02)) return { text: 'en avance', tone: 'off' };
  if ((shot.miss ?? 0) > r.sweetSpot) return { text: 'mal placé', tone: 'off' };
  if (shot.pressure >= 0.6) return { text: 'sous pression', tone: 'good' };
  return { text: 'propre', tone: 'good' };
}
