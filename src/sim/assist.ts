import type { Ball } from './ball';
import { HALF_LENGTH, HALF_WIDTH, SIM_DT } from './constants';
import { predictBall } from './predict';
import type { PhysicsProfile } from './profile';
import { rightFor, type CourtSide } from './shots';
import { addScaled, vec3, type Vec3 } from './vec3';

/** Point d'impact choisi par la course assistée. */
export interface Intercept {
  /** Pas de simulation (compteur absolu) où la balle sera au point de contact. */
  tick: number;
  contact: Vec3;
  /** Où le joueur doit se tenir pour avoir la balle sur le côté, à bonne distance. */
  stand: Vec3;
  /** Frappe avant le rebond. */
  volley: boolean;
  /** Le joueur a le temps d'y arriver en courant. */
  reachable: boolean;
}

/** Distance horizontale. Math.sqrt plutôt que Math.hypot : résultat identique sur toutes les plateformes. */
export function flatDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Temps minimal pour parcourir `distance` en partant et en finissant à l'arrêt (s). */
export function runTime(distance: number, profile: PhysicsProfile): number {
  const { maxSpeed: v, acceleration: a, deceleration: b } = profile.player;
  const ramps = (v * v) / (2 * a) + (v * v) / (2 * b);
  if (distance >= ramps) return distance / v + v / (2 * a) + v / (2 * b);
  const peak = Math.sqrt((2 * distance * a * b) / (a + b));
  return peak / a + peak / b;
}

/** Garde un point dans le camp `side`, à `margin` des murs et du filet. */
export function clampToHalf(pos: Vec3, side: CourtSide, margin: number): Vec3 {
  const x = Math.min(HALF_WIDTH - margin, Math.max(-(HALF_WIDTH - margin), pos.x));
  const depth = Math.min(HALF_LENGTH - margin, Math.max(margin, pos.z * side));
  return vec3(x, pos.y, depth * side);
}

/**
 * Course assistée (GAME_DESIGN.md §4-5) : rejoue la trajectoire avec `predictBall` et choisit où
 * frapper dans le camp du joueur. Préférence : une balle après rebond, à hauteur de hanche, le plus
 * tôt possible ; une volée seulement si le joueur est déjà près du filet. Une balle qui va jusqu'à
 * la vitre se joue après la vitre, comme au padel, sauf si on peut la prendre bien devant.
 * Si rien n'est atteignable, le point le moins en retard est retourné, marqué `reachable: false`.
 */
export function planIntercept(
  ball: Ball,
  playerPos: Vec3,
  side: CourtSide,
  tick: number,
  profile: PhysicsProfile,
): Intercept | null {
  const r = profile.rally;
  const radius = profile.player.radius;
  const { points, bounce, bounceStep, glassStep } = predictBall(ball, profile, 5, 1);
  const bouncesHere = bounce !== null && bounce.z * side > 0;
  const nearNet = Math.abs(playerPos.z) < r.volleyZone;
  const right = rightFor(side);

  let best: { cost: number; intercept: Intercept } | null = null;
  let fallback: { late: number; intercept: Intercept } | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const step = i + 1;
    if (p.z * side < 0.4 || Math.abs(p.z) > HALF_LENGTH - 0.2 || Math.abs(p.x) > HALF_WIDTH - 0.15) continue;
    if (p.y < r.hitLow || p.y > r.hitHigh) continue;
    const volley = bounceStep === null || step <= bounceStep;
    if (volley ? !nearNet || Math.abs(p.z) > r.volleyZone + 1 : !bouncesHere) continue;
    const afterGlass = glassStep !== null && step > glassStep;
    // Avant la vitre, coincé contre elle : on la laisse passer. Après, on attend qu'elle s'en décolle.
    const room = HALF_LENGTH - Math.abs(p.z);
    if (!volley && glassStep !== null && room < (afterGlass ? r.glassGap : r.glassRoom)) continue;

    // Coup droit ou revers : le côté qui demande le moins de course.
    const forehand = clampToHalf(addScaled(p, right, -r.standLateral), side, radius);
    const backhand = clampToHalf(addScaled(p, right, r.standLateral), side, radius);
    const distanceTo = (s: Vec3): number => flatDistance(s, playerPos);
    const stand = distanceTo(forehand) <= distanceTo(backhand) ? forehand : backhand;
    if (flatDistance(stand, p) > r.reach * 0.95) continue;

    const time = step * SIM_DT;
    const late = runTime(distanceTo(stand), profile) + r.arriveMargin - time;
    const intercept: Intercept = {
      tick: tick + step,
      contact: p,
      stand: vec3(stand.x, 0, stand.z),
      volley,
      reachable: late <= 0,
    };
    if (late > 0) {
      if (!fallback || late < fallback.late) fallback = { late, intercept };
      continue;
    }
    const cost = (volley ? -1 : Math.abs(p.y - 0.95)) + 0.25 * time - (afterGlass ? r.glassBonus : 0);
    if (!best || cost < best.cost) best = { cost, intercept };
  }
  return best?.intercept ?? fallback?.intercept ?? null;
}
