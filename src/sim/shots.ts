import { createBall, integrateFlight } from './ball';
import type { ArcadeCommands, OverheadKind, ShotKind } from './commands';
import { BALL_RADIUS, HALF_WIDTH, SIM_DT } from './constants';
import { netHeightAt } from './court';
import type { PhysicsProfile, ShotTypeTuning } from './profile';
import { addScaled, cross, length, normalize, scale, sub, vec3, type Vec3 } from './vec3';

/** Camp d'un joueur : -1 = côté Z négatif (près de la caméra), 1 = côté Z positif. */
export type CourtSide = -1 | 1;

const UP = vec3(0, 1, 0);
/** Profondeur maximale visée : un rebond juste devant la vitre du fond (m). */
const HALF_LENGTH_SAFE = 9.5;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Direction « vers le filet » et « à droite » d'un joueur du camp `side`, qui fait face au filet. */
export function forwardFor(side: CourtSide): Vec3 {
  return vec3(0, 0, -side);
}
export function rightFor(side: CourtSide): Vec3 {
  return vec3(side, 0, 0);
}

/** Réglages d'un coup : un bouton (sauf B, qui se décline) ou une variante du coup au-dessus de la tête. */
export type ShotTuningKey = Exclude<ShotKind, 'overhead'> | OverheadKind | 'cut' | 'chiquita';

export function shotTuning(kind: ShotTuningKey, profile: PhysicsProfile): ShotTypeTuning {
  return profile.rally[kind];
}

/**
 * Point de chute visé dans le camp adverse, d'après le stick au moment de l'impact.
 * Sans direction : coup sûr, au centre. La frappe parfaite élargit la plage latérale (coup plus précis).
 */
export function aimTarget(
  kind: ShotTuningKey,
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
  let depth = forward >= 0 ? mix(t.depthNeutral, t.depthLong, forward) : mix(t.depthNeutral, t.depthShort, -forward);
  // Lob parfait : plus profond (plus dur à prendre de volée au filet), sans sortir.
  if (kind === 'lob' && perfect) depth = Math.min(HALF_LENGTH_SAFE, depth + r.lobPerfectDepth);
  const width = (perfect ? r.aimWidthPerfect : r.aimWidth) * widthFactor;
  const x = clamp(clamp(aim.right, -1, 1) * width * rightFor(side).x, -(HALF_WIDTH - 0.6), HALF_WIDTH - 0.6);
  return vec3(x, BALL_RADIUS, -side * depth);
}

/**
 * Variante du coup au-dessus de la tête, choisie par la situation et le stick au moment de l'impact
 * (GAME_DESIGN.md §4 et §13, pas de charge) : stick vers l'avant près du filet, sur une balle assez
 * haute : remate ; stick sur le côté : víbora ; sinon, ou loin du filet : bandeja.
 */
export function overheadKind(aim: ArcadeCommands['stick'], contact: Vec3, profile: PhysicsProfile): OverheadKind {
  const r = profile.rally;
  const forward = aim.forward;
  const lateral = Math.abs(aim.right);
  if (forward >= r.overheadStick && forward >= lateral) {
    return Math.abs(contact.z) <= r.remateZone && contact.y >= r.remateLow ? 'remate' : 'bandeja';
  }
  return lateral >= r.overheadStick ? 'vibora' : 'bandeja';
}

/**
 * Point de chute d'un coup au-dessus de la tête. Bandeja : profonde, au stick comme un coup normal.
 * Víbora : contre la vitre latérale du côté du stick, au fond. Remate : parfait, court et dirigé au
 * stick (il rebondit haut et peut sortir du terrain : por tres de côté, por cuatro dans l'axe) ;
 * sinon plus long, il reste dans le terrain et revient de la vitre.
 */
export function overheadTarget(
  kind: OverheadKind,
  side: CourtSide,
  aim: ArcadeCommands['stick'],
  perfect: boolean,
  profile: PhysicsProfile,
): Vec3 {
  const r = profile.rally;
  const t = shotTuning(kind, profile);
  const toRight = rightFor(side).x;
  const limit = HALF_WIDTH - 0.6;
  if (kind === 'bandeja') return aimTarget('bandeja', side, aim, perfect, profile);
  if (kind === 'vibora') {
    const lateral = r.viboraLateral + (perfect ? 0.3 : 0);
    return vec3(clamp(Math.sign(aim.right) * lateral * toRight, -limit, limit), BALL_RADIUS, -side * t.depthNeutral);
  }
  const depth = perfect ? r.remateKillDepth : t.depthNeutral;
  const x = clamp(clamp(aim.right, -1, 1) * (perfect ? r.remateWidth : r.remateWidthLoose) * toRight, -limit, limit);
  return vec3(x, BALL_RADIUS, -side * depth);
}

/**
 * Frappe en retard : relâchée après la sous-fenêtre parfaite, la balle part plus large et plus long,
 * d'autant plus que le retard approche la fin de la fenêtre. Déterministe : même retard, même écart.
 */
export function lateDrift(
  target: Vec3,
  side: CourtSide,
  timing: number,
  profile: PhysicsProfile,
  /** Multiplicateur de la dérive (bandeja : coup sûr). */
  factor = 1,
): Vec3 {
  const r = profile.rally;
  if (timing <= r.perfectAfter) return target;
  const k = factor * Math.min(1, (timing - r.perfectAfter) / (r.lateWindow - r.perfectAfter));
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

/**
 * Temps de vol le plus court pour lequel la balle, partie à `speed` m/s, couvre `distance` m à
 * l'horizontale et `rise` m à la verticale (parabole sans air) : smash frappé vers le bas.
 */
function launchTime(distance: number, rise: number, speed: number, g: number): number {
  const launch = (T: number): number => Math.sqrt((distance / T) ** 2 + ((rise + (g * T * T) / 2) / T) ** 2);
  let T = 0.05;
  while (T < 2 && launch(T) > speed) T += 0.005;
  return T;
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
  kind: ShotTuningKey,
  contact: Vec3,
  target: Vec3,
  perfect: boolean,
  profile: PhysicsProfile,
  /** Multiplicateur de la vitesse du coup (volée). */
  speedFactor = 1,
  /** Passage au-dessus du filet ajouté (m) : coup imprécis ou sous pression, la balle monte. */
  extraClearance = 0,
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
    // Lob court : vol plus bref, plus bas.
    if (t.flightTimeShort !== undefined) {
      const k = clamp((Math.abs(target.z) - t.depthShort) / (t.depthNeutral - t.depthShort), 0, 1);
      flightTime = mix(t.flightTimeShort, flightTime, k);
    }
  } else {
    const speed = (perfect ? t.speedPerfect : t.speed) * speedFactor;
    const fastest = t.launchSpeed ? launchTime(distance, target.y - contact.y, speed, g) : distance / speed;
    // Parabole sans air : hauteur au filet = y0 + (yL - y0)·f + g·T²·f(1-f)/2.
    const clearance = t.clearance * (perfect ? profile.rally.perfectClearance : 1) + extraClearance;
    const rise = netTop + clearance - contact.y - (target.y - contact.y) * f;
    const clearing = rise > 0 ? Math.sqrt((2 * rise) / (g * f * (1 - f))) : 0;
    // Plancher de temps de vol : un smash frappé vers le bas arrive plus vite qu'un coup tendu.
    flightTime = Math.max(fastest, clearing, t.launchSpeed ? 0.1 : 0.3);
  }

  for (let attempt = 0; ; attempt++) {
    let vel = vec3(
      (target.x - contact.x) / flightTime,
      (target.y - contact.y + (g * flightTime * flightTime) / 2) / flightTime,
      (target.z - contact.z) / flightTime,
    );
    const effect = perfect && t.spinPerfect !== undefined ? t.spinPerfect : t.spin;
    let spin = scale(cross(UP, direction), (effect * length(vel)) / BALL_RADIUS);
    if (t.sideSpin) {
      // Rotation autour de la verticale qui courbe la balle vers l'extérieur (le côté de la cible).
      const outward = Math.sign(target.x || 1);
      const curve = cross(UP, vel).x >= 0 ? 1 : -1;
      spin = addScaled(spin, UP, (outward * curve * t.sideSpin * length(vel)) / BALL_RADIUS);
    }
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
