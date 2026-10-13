import { BALL_AREA, BALL_MASS, BALL_RADIUS } from './constants';
import type { PhysicsProfile } from './profile';
import { addScaled, cross, length, scale, vec3, ZERO, type Vec3 } from './vec3';

export interface Ball {
  pos: Vec3;
  vel: Vec3;
  /** Vitesse angulaire (rad/s). Avec une balle allant vers +Z, un spin +X est un lift. */
  spin: Vec3;
  /** La balle est passée par-dessus un mur : elle ne rebondit plus sur les murs ni le filet. */
  out: boolean;
}

export function createBall(pos: Vec3, vel: Vec3, spin: Vec3 = ZERO): Ball {
  return { pos, vel, spin, out: false };
}

/** La balle est posée au sol et roule (ou est arrêtée). */
export function isGrounded(ball: Ball): boolean {
  return ball.pos.y <= BALL_RADIUS && ball.vel.y === 0;
}

/** Accélération en vol : gravité, traînée et effet Magnus. */
export function flightAcceleration(vel: Vec3, spin: Vec3, p: PhysicsProfile): Vec3 {
  let a = vec3(0, -p.gravity, 0);
  const speed = length(vel);
  if (speed === 0) return a;

  const k = (0.5 * p.airDensity * BALL_AREA) / BALL_MASS;
  // Traînée : -k · Cd · |v| · v
  a = addScaled(a, vel, -k * p.dragCoefficient * speed);

  const spinRate = length(spin);
  if (spinRate > 0 && p.magnusScale > 0) {
    // Cl croît avec le rapport vitesse de surface / vitesse de la balle, puis sature.
    const s = (BALL_RADIUS * spinRate) / speed;
    const cl = (p.magnusScale * s) / (2 * s + 1);
    // Magnus : k · Cl · |v|² · (ω̂ × v̂)
    a = addScaled(a, cross(spin, vel), (k * cl * speed) / spinRate);
  }
  return a;
}

/** Avance la balle de `h` secondes sans tenir compte des collisions. */
export function integrateFlight(ball: Ball, h: number, p: PhysicsProfile): void {
  if (isGrounded(ball)) {
    const speed = length(ball.vel);
    const loss = p.rollingDeceleration * h;
    const newVel = speed <= loss ? ZERO : scale(ball.vel, 1 - loss / speed);
    ball.pos = addScaled(addScaled(ball.pos, ball.vel, h / 2), newVel, h / 2);
    ball.vel = newVel;
  } else {
    // Exact pour une accélération constante (donc pour la parabole sans air).
    const a = flightAcceleration(ball.vel, ball.spin, p);
    ball.pos = addScaled(addScaled(ball.pos, ball.vel, h), a, (h * h) / 2);
    ball.vel = addScaled(ball.vel, a, h);
  }
  ball.spin = scale(ball.spin, Math.max(0, 1 - p.spinDecay * h));
}
