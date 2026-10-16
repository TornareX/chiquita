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
  /** Numéro du pas (à partir de 1) où a lieu ce premier rebond. */
  bounceStep: number | null;
  /** Numéro du pas du premier contact avec une vitre après ce rebond (balle qui revient de la vitre). */
  glassStep: number | null;
}

/**
 * Prédit la trajectoire de la balle en rejouant la même physique sur une copie.
 * S'arrête au deuxième rebond au sol (au prochain si `bounced`) ou après `seconds` secondes.
 */
export function predictBall(
  ball: Ball,
  profile: PhysicsProfile,
  seconds = 3,
  /** Un point tous les `stride` pas de simulation. */
  stride = 8,
  /** La balle a déjà rebondi : le prochain rebond au sol est le dernier. */
  bounced = false,
): Prediction {
  const copy: Ball = { ...ball };
  const prediction: Prediction = { points: [], bounce: null, bounceStep: null, glassStep: null };
  const contacts: Contact[] = [];
  let grounds = bounced ? 1 : 0;
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 1; i <= steps && grounds < 2; i++) {
    contacts.length = 0;
    stepBall(copy, SIM_DT, profile, contacts);
    for (const contact of contacts) {
      if (contact.surface === 'glass' && (prediction.bounce || bounced) && prediction.glassStep === null) prediction.glassStep = i;
      if (contact.surface !== 'ground') continue;
      grounds++;
      if (!prediction.bounce) {
        prediction.bounce = contact.pos;
        prediction.bounceStep = i;
      }
    }
    if (i % stride === 0) prediction.points.push(copy.pos);
  }
  return prediction;
}
