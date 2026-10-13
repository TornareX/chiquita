import type { Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { SIM_DT } from './constants';
import type { PhysicsProfile } from './profile';
import type { Vec3 } from './vec3';

export interface Prediction {
  /** Positions futures de la balle, à intervalle régulier. */
  points: Vec3[];
  /** Prochain point de rebond au sol, s'il y en a un dans l'horizon de prédiction. */
  bounce: Vec3 | null;
}

/**
 * Prédit la trajectoire de la balle en rejouant la même physique sur une copie.
 * S'arrête au deuxième rebond au sol ou après `seconds` secondes.
 */
export function predictBall(
  ball: Ball,
  profile: PhysicsProfile,
  seconds = 3,
  /** Un point tous les `stride` pas de simulation. */
  stride = 8,
): Prediction {
  const copy: Ball = { ...ball };
  const prediction: Prediction = { points: [], bounce: null };
  const contacts: Contact[] = [];
  let grounds = 0;
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 1; i <= steps && grounds < 2; i++) {
    contacts.length = 0;
    stepBall(copy, SIM_DT, profile, contacts);
    for (const contact of contacts) {
      if (contact.surface !== 'ground') continue;
      grounds++;
      prediction.bounce ??= contact.pos;
    }
    if (i % stride === 0) prediction.points.push(copy.pos);
  }
  return prediction;
}
