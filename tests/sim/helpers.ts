import type { Ball } from '../../src/sim/ball';
import { stepBall, type Contact } from '../../src/sim/collisions';
import { BALL_MASS, BALL_RADIUS, SIM_DT } from '../../src/sim/constants';
import { REALISTIC, type PhysicsProfile } from '../../src/sim/profile';
import { dot } from '../../src/sim/vec3';

/** Profil sans air : ni traînée, ni Magnus, ni perte de spin. */
export const VACUUM: PhysicsProfile = { ...REALISTIC, dragCoefficient: 0, magnusScale: 0, spinDecay: 0 };

/** Simule `seconds` secondes et retourne tous les contacts. `onStep` est appelé après chaque pas. */
export function simulate(
  ball: Ball,
  seconds: number,
  profile: PhysicsProfile = REALISTIC,
  onStep?: (contacts: Contact[]) => void,
): Contact[] {
  const all: Contact[] = [];
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    const contacts: Contact[] = [];
    stepBall(ball, SIM_DT, profile, contacts);
    all.push(...contacts);
    onStep?.(contacts);
  }
  return all;
}

export function kineticEnergy(ball: Pick<Ball, 'vel' | 'spin'>, profile: PhysicsProfile): number {
  const inertia = profile.inertiaFactor * BALL_MASS * BALL_RADIUS * BALL_RADIUS;
  return 0.5 * BALL_MASS * dot(ball.vel, ball.vel) + 0.5 * inertia * dot(ball.spin, ball.spin);
}

export function totalEnergy(ball: Ball, profile: PhysicsProfile): number {
  return kineticEnergy(ball, profile) + BALL_MASS * profile.gravity * ball.pos.y;
}
