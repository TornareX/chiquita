import { createBall, integrateFlight } from './ball';
import type { ArcadeCommands, ShotKind } from './commands';
import { BALL_RADIUS, HALF_WIDTH, SIM_DT } from './constants';
import { netHeightAt } from './court';
import type { PhysicsProfile, ShotTypeTuning } from './profile';
import { cross, length, normalize, scale, sub, vec3, type Vec3 } from './vec3';

/** Camp d'un joueur : -1 = côté Z négatif (près de la caméra), 1 = côté Z positif. */
export type CourtSide = -1 | 1;

const UP = vec3(0, 1, 0);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Direction « vers le filet » et « à droite » d'un joueur du camp `side`, qui fait face au filet. */
export function forwardFor(side: CourtSide): Vec3 {
  return vec3(0, 0, -side);
}
export function rightFor(side: CourtSide): Vec3 {
  return vec3(side, 0, 0);
}

export function shotTuning(kind: ShotKind, profile: PhysicsProfile): ShotTypeTuning {
  return profile.rally[kind];
}

/**
 * Point de chute visé dans le camp adverse, d'après le stick au moment de l'impact.
 * Sans direction : coup sûr, au centre. La frappe parfaite élargit la plage latérale (coup plus précis).
 */
export function aimTarget(
  kind: ShotKind,
  side: CourtSide,
  aim: ArcadeCommands['stick'],
  perfect: boolean,
  profile: PhysicsProfile,
  /** Multiplicateur de la plage latérale (récompense du placement manuel). */
  widthFactor = 1,
): Vec3 {
  const t = shotTuning(kind, profile);
  const r = profile.rally;
  const forward = clamp(aim.forward, -1, 1);
  const depth = forward >= 0 ? mix(t.depthNeutral, t.depthLong, forward) : mix(t.depthNeutral, t.depthShort, -forward);
  const width = (perfect ? r.aimWidthPerfect : r.aimWidth) * widthFactor;
  const x = clamp(clamp(aim.right, -1, 1) * width * rightFor(side).x, -(HALF_WIDTH - 0.6), HALF_WIDTH - 0.6);
  return vec3(x, BALL_RADIUS, -side * depth);
}

/**
 * Frappe en retard : relâchée après la sous-fenêtre parfaite, la balle part plus large et plus long,
 * d'autant plus que le retard approche la fin de la fenêtre. Déterministe : même retard, même écart.
 */
export function lateDrift(target: Vec3, side: CourtSide, timing: number, profile: PhysicsProfile): Vec3 {
  const r = profile.rally;
  if (timing <= r.perfectAfter) return target;
  const k = Math.min(1, (timing - r.perfectAfter) / (r.lateWindow - r.perfectAfter));
  const outward = target.x >= 0 ? 1 : -1;
  return vec3(target.x + outward * k * r.lateDriftLateral, target.y, target.z - side * k * r.lateDriftDepth);
}

/** Simule le vol libre (sans collision) pendant `seconds` et retourne la position atteinte. */
function flyFor(pos: Vec3, vel: Vec3, spin: Vec3, seconds: number, profile: PhysicsProfile): Vec3 {
  const ball = createBall(pos, vel, spin);
  const steps = Math.floor(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) integrateFlight(ball, SIM_DT, profile);
  integrateFlight(ball, seconds - steps * SIM_DT, profile);
  return ball.pos;
}

/** Hauteur de la balle quand elle passe le filet (z = 0), en simulant le vol libre ; `null` si elle ne le passe pas. */
function heightAtNet(pos: Vec3, vel: Vec3, spin: Vec3, maxSeconds: number, profile: PhysicsProfile): number | null {
  const ball = createBall(pos, vel, spin);
  for (let i = 0; i * SIM_DT < maxSeconds; i++) {
    const before = ball.pos;
    integrateFlight(ball, SIM_DT, profile);
    if (Math.sign(before.z) !== Math.sign(ball.pos.z) || ball.pos.z === 0) {
      const f = before.z / (before.z - ball.pos.z);
      return before.y + (ball.pos.y - before.y) * f;
    }
  }
  return null;
}

export interface SolvedShot {
  vel: Vec3;
  spin: Vec3;
  /** Temps de vol prévu jusqu'au point de chute (s). */
  flightTime: number;
}

/**
 * Trajectoire calculée depuis une cible, comme dans un jeu de tennis arcade : la balle part du
 * contact et retombe sur `target`. Le temps de vol vient de la vitesse maximale du coup, allongé
 * si besoin pour passer le filet avec la marge du coup. Le vol réel (traînée, effet) est corrigé
 * par quelques tirs simulés : la physique de la balle reste celle du moteur, entièrement déterministe.
 */
export function solveShot(
  kind: ShotKind,
  contact: Vec3,
  target: Vec3,
  perfect: boolean,
  profile: PhysicsProfile,
  /** Multiplicateur de la vitesse du coup (volée). */
  speedFactor = 1,
): SolvedShot {
  const t = shotTuning(kind, profile);
  const g = profile.gravity;
  const flat = vec3(target.x - contact.x, 0, target.z - contact.z);
  const distance = Math.max(0.5, length(flat));
  const direction = normalize(flat);
  // Part du trajet avant le filet (le contact et la cible sont de part et d'autre).
  const f = contact.z * target.z < 0 ? clamp(Math.abs(contact.z) / Math.abs(contact.z - target.z), 0.05, 0.95) : 0.5;
  const xAtNet = contact.x + (target.x - contact.x) * f;
  const netTop = netHeightAt(xAtNet) + BALL_RADIUS;

  let flightTime: number;
  if (t.flightTime > 0) {
    flightTime = perfect ? t.flightTimePerfect : t.flightTime;
  } else {
    const fastest = distance / ((perfect ? t.speedPerfect : t.speed) * speedFactor);
    // Parabole sans air : hauteur au filet = y0 + (yL - y0)·f + g·T²·f(1-f)/2.
    const clearance = t.clearance * (perfect ? profile.rally.perfectClearance : 1);
    const rise = netTop + clearance - contact.y - (target.y - contact.y) * f;
    const clearing = rise > 0 ? Math.sqrt((2 * rise) / (g * f * (1 - f))) : 0;
    flightTime = Math.max(fastest, clearing, 0.3);
  }

  for (let attempt = 0; ; attempt++) {
    let vel = vec3(
      (target.x - contact.x) / flightTime,
      (target.y - contact.y + (g * flightTime * flightTime) / 2) / flightTime,
      (target.z - contact.z) / flightTime,
    );
    const spin = scale(cross(UP, direction), (t.spin * length(vel)) / BALL_RADIUS);
    // Tir par approximations successives : on corrige la vitesse de l'écart à l'arrivée.
    for (let i = 0; i < 6; i++) {
      const miss = sub(flyFor(contact, vel, spin, flightTime, profile), target);
      vel = sub(vel, scale(miss, 1 / flightTime));
    }
    const atNet = heightAtNet(contact, vel, spin, flightTime, profile);
    // Effet ou traînée font plonger la balle dans le filet : on la fait voler plus longtemps.
    if (atNet === null || atNet >= netTop + 0.08 || attempt >= 4) return { vel, spin, flightTime };
    flightTime *= 1.15;
  }
}
