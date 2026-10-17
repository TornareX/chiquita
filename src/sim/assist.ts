import { createBall, integrateFlight, type Ball } from './ball';
import { HALF_LENGTH, HALF_WIDTH, PLAYER_HEIGHT, SIM_DT } from './constants';
import { predictBall } from './predict';
import type { PhysicsProfile } from './profile';
import { bandejaHeight, rightFor, type CourtSide } from './shots';
import { addScaled, vec3, type Vec3 } from './vec3';
import { clampWalkable, outsideCourt, pathDistance } from './walkable';

/** Marge de hauteur (m) gardée par la course assistée sous les hauteurs frappables limites. */
const PLAN_MARGIN = 0.1;

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
  /** Point hors du terrain : la balle est sortie après son rebond, le joueur sort par la porte. */
  outside: boolean;
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
 * Coup au-dessus de la tête (`overhead`) : balle haute, de volée partout dans son camp, ou après le
 * rebond (bajada). Une balle sortie du terrain après son rebond (por tres, por cuatro) se rattrape
 * dehors, avant qu'elle touche le sol : le trajet passe alors par la porte.
 * Si rien n'est atteignable, le point le moins en retard est retourné, marqué `reachable: false`.
 */
export function planIntercept(
  ball: Ball,
  playerPos: Vec3,
  side: CourtSide,
  tick: number,
  profile: PhysicsProfile,
  /** Coût par mètre à courir : favorise le point le plus proche du joueur (assistance aimant). */
  nearWeight = 0,
  /** La balle a déjà rebondi dans le camp du joueur : plus de volée, et le prochain rebond est le dernier. */
  bounced = false,
  /** Coup au-dessus de la tête : on cherche la balle haute. */
  overhead = false,
  /** Taille du joueur : la balle haute se prend à hauteur de ses yeux (bandeja). */
  playerHeight = PLAYER_HEIGHT,
  /** Coup haut préparé pour un remate (stick vers l'avant à l'appui) : près du filet, on la vise plus haut. */
  smash = false,
): Intercept | null {
  const r = profile.rally;
  const radius = profile.player.radius;
  const { points, bounce, bounceStep, glassStep } = predictBall(ball, profile, 5, 1, bounced);
  const bouncesHere = bounced || (bounce !== null && bounce.z * side > 0);
  const nearNet = Math.abs(playerPos.z) < r.volleyZone;
  const right = rightFor(side);
  const low = overhead ? r.overheadLow : r.hitLow;
  const high = overhead ? r.overheadHigh : r.hitHigh;
  const lateral = overhead ? r.overheadLateral : r.standLateral;
  const overheadIdeal = bandejaHeight(profile, playerHeight);

  let best: { cost: number; intercept: Intercept } | null = null;
  let fallback: { late: number; intercept: Intercept } | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const step = i + 1;
    const volley = !bounced && (bounceStep === null || step <= bounceStep);
    // Dehors : seulement une balle sortie après son rebond, bien décollée du mur.
    const outside = outsideCourt(p);
    if (outside) {
      if (volley || p.z * side < 0.4) continue;
      if (Math.abs(p.x) < HALF_WIDTH + 0.3 && Math.abs(p.z) < HALF_LENGTH + 0.3) continue;
    } else if (p.z * side < 0.4 || Math.abs(p.z) > HALF_LENGTH - 0.2 || Math.abs(p.x) > HALF_WIDTH - 0.15) continue;
    // Marge sous les hauteurs limites : un relâcher un peu décalé doit encore trouver la balle.
    if (p.y < low + PLAN_MARGIN || p.y > high - PLAN_MARGIN) continue;
    // Au-dessus de la tête, la volée se joue partout ; sinon seulement près du filet.
    if (volley ? !overhead && (!nearNet || Math.abs(p.z) > r.volleyZone + 1) : !bouncesHere) continue;
    const afterGlass = glassStep !== null && step > glassStep;
    // Avant la vitre, coincé contre elle : on la laisse passer. Après, on attend qu'elle s'en décolle.
    const room = HALF_LENGTH - Math.abs(p.z);
    if (!volley && !outside && glassStep !== null && room < (afterGlass ? r.glassGap : r.glassRoom)) continue;

    // Coup droit ou revers : le côté qui demande le moins de course. Balle dans le terrain : on y reste.
    const clamp = outside ? clampWalkable : clampToHalf;
    const forehand = clamp(addScaled(p, right, -lateral), side, radius);
    const backhand = clamp(addScaled(p, right, lateral), side, radius);
    const distanceTo = (s: Vec3): number => pathDistance(playerPos, s, side);
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
      outside,
    };
    if (late > 0) {
      if (!fallback || late < fallback.late) fallback = { late, intercept };
      continue;
    }
    // Au-dessus de la tête, la hauteur compte double : la balle prise haute ouvre le remate.
    // Balle haute : à hauteur des yeux (bandeja, víbora) ; remate préparé près du filet : bras tendu, plus haut.
    const ideal = smash && Math.abs(p.z) <= r.remateZone ? r.overheadIdeal : overheadIdeal;
    const height = overhead ? 2 * Math.abs(p.y - ideal) - (volley ? 0.5 : 0) : volley ? -1 : Math.abs(p.y - 0.95);
    const cost = height + 0.25 * time - (afterGlass ? r.glassBonus : 0) + nearWeight * distanceTo(stand);
    if (!best || cost < best.cost) best = { cost, intercept };
  }
  return best?.intercept ?? fallback?.intercept ?? null;
}

/**
 * Pas avant que la balle, en redescendant, passe sous `height` (vol libre, sans collision) ; `null` si
 * elle n'y descend pas dans les 2 s. Sert à attendre la hauteur des yeux pour une bandeja.
 */
export function ticksToHeight(ball: Ball, height: number, profile: PhysicsProfile): number | null {
  const b = createBall(ball.pos, ball.vel, ball.spin);
  for (let i = 1; i * SIM_DT < 2; i++) {
    integrateFlight(b, SIM_DT, profile);
    if (b.vel.y < 0 && b.pos.y <= height) return i;
  }
  return null;
}
