import type { DuelShot } from '../sim/duel';
import type { PhysicsProfile } from '../sim/profile';
import { shotQuality, type ShotQuality } from '../sim/verdict';

/** Texte et ton de chaque qualité de frappe (`sim/verdict.ts`). */
export const QUALITY_TEXT: Record<ShotQuality, { text: string; tone: 'perfect' | 'good' | 'off' }> = {
  parfait: { text: 'parfait', tone: 'perfect' },
  haute: { text: 'prise trop haute', tone: 'off' },
  basse: { text: 'prise trop basse', tone: 'off' },
  pasPrepare: { text: 'pas préparé', tone: 'off' },
  retard: { text: 'en retard', tone: 'off' },
  avance: { text: 'en avance', tone: 'off' },
  malPlace: { text: 'mal placé', tone: 'off' },
  pression: { text: 'sous pression', tone: 'good' },
  propre: { text: 'propre', tone: 'good' },
};

/**
 * Verdict d'une frappe d'un humain, en un mot : ce qui l'a rendue bonne ou moins bonne, pour que le skill se voie
 * (Xavier, 23/10).
 */
export function shotVerdict(shot: DuelShot, profile: PhysicsProfile): { text: string; tone: 'perfect' | 'good' | 'off' } {
  return QUALITY_TEXT[shotQuality(shot, profile)];
}
