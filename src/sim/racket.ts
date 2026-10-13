import type { Ball } from './ball';
import type { PlayerCommands } from './commands';
import { BALL_RADIUS, NET_HEIGHT_CENTER } from './constants';
import { forwardOf, rightOf, type Player } from './player';
import type { PhysicsProfile, RacketTuning } from './profile';
import { addScaled, cross, dot, length, scale, sub, vec3, type Vec3 } from './vec3';

export type RacketPhase = 'idle' | 'preparing' | 'swinging' | 'recovering';

export interface Racket {
  phase: RacketPhase;
  /** Temps écoulé dans la phase courante (s). */
  phaseTime: number;
  /** 1 = coup droit (à droite du joueur), -1 = revers. Choisi selon le côté de la balle. */
  side: 1 | -1;
  /** Niveau de préparation, de 0 à 1. */
  charge: number;
  /** Hauteur du centre du tamis au-dessus du sol (m). */
  height: number;
  /** Mouvement de souris accumulé depuis le début du swing (rad) : droite et haut positifs. */
  gestureX: number;
  gestureY: number;
  /** Le swing en cours a déjà touché la balle. */
  hasHit: boolean;
  /** Pourquoi le dernier swing a manqué la balle ; `null` s'il l'a touchée ou si elle était hors de portée de vue. */
  miss: SwingMiss | null;
  /** Centre du tamis dans le monde. */
  headPos: Vec3;
}

/** Raison d'un swing dans le vide. */
export type SwingMiss = 'early' | 'late' | 'far' | 'close' | 'high' | 'low';

/**
 * Position de la balle dans la zone de frappe, en écarts normalisés au point idéal :
 * 0 = idéal, ±1 = limite de la zone. La balle est à portée si les trois sont dans [-1, 1].
 */
export interface Reach {
  /** Le long du regard : positif = balle encore devant (swing en avance), négatif = déjà passée. */
  depth: number;
  /** Du côté de la raquette : positif = balle trop loin, négatif = trop près du corps. */
  side: number;
  /** Positif = balle trop haute, négatif = trop basse. */
  height: number;
}

/** Résultat d'une frappe. */
export interface Shot {
  /** Qualité du contact : 1 au centre du tamis, 0 au bord. */
  quality: number;
  perfect: boolean;
  /** Vitesse de la balle après la frappe (m/s). */
  speed: number;
  /** Écart de profondeur de la balle au point idéal (-1..1) : positif = swing en avance, négatif = en retard. */
  timing: number;
  side: 1 | -1;
  soft: boolean;
  contact: Vec3;
}

const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createRacket(): Racket {
  return {
    phase: 'idle',
    phaseTime: 0,
    side: 1,
    charge: 0,
    height: 1,
    gestureX: 0,
    gestureY: 0,
    hasHit: false,
    miss: null,
    headPos: vec3(0, 1, 0),
  };
}

export function swingDuration(charge: number, t: RacketTuning): number {
  return mix(t.swingDurationMax, t.swingDurationMin, charge);
}

/** Avancement du swing de 0 à 1 : départ et arrivée en douceur, vitesse maximale au milieu. */
export function swingProgress(racket: Racket, t: RacketTuning): number {
  if (racket.phase !== 'swinging') return racket.phase === 'recovering' ? 1 : 0;
  const tau = clamp(racket.phaseTime / swingDuration(racket.charge, t), 0, 1);
  return tau * tau * (3 - 2 * tau);
}

/**
 * Position du tamis par rapport au joueur : `forward` le long du regard, `lateral` vers la droite.
 * Pendant le swing, le tamis avance en ligne presque droite le long du regard, décalé sur le côté :
 * c'est le « couloir de frappe » dans lequel la balle doit se trouver.
 */
export function headOffset(racket: Racket, t: RacketTuning): { forward: number; lateral: number } {
  const path = (u: number): { forward: number; lateral: number } => ({
    forward: mix(-mix(t.backswingMin, t.backswingMax, racket.charge), t.reachForward, u),
    lateral: racket.side * mix(t.lateralStart, t.lateralEnd, u * u),
  });
  const ready = { forward: t.readyForward, lateral: racket.side * t.readyLateral };
  switch (racket.phase) {
    case 'idle':
      return ready;
    case 'preparing':
      return path(0);
    case 'swinging':
      return path(swingProgress(racket, t));
    case 'recovering': {
      const end = path(1);
      const k = clamp(racket.phaseTime / t.recoverTime, 0, 1);
      return { forward: mix(end.forward, ready.forward, k), lateral: mix(end.lateral, ready.lateral, k) };
    }
  }
}

function headWorldPos(racket: Racket, player: Player, t: RacketTuning): Vec3 {
  const offset = headOffset(racket, t);
  const base = addScaled(
    addScaled(player.pos, forwardOf(player.yaw), offset.forward),
    rightOf(player.yaw),
    offset.lateral,
  );
  return vec3(base.x, player.pos.y + racket.height, base.z);
}

export function reachOf(player: Player, racket: Racket, ball: Ball, t: RacketTuning): Reach {
  const rel = sub(ball.pos, player.pos);
  const forward = dot(rel, forwardOf(player.yaw));
  const lateral = dot(rel, rightOf(player.yaw)) * racket.side;
  const k = t.tolerance;
  // Écart à l'idéal, rapporté à la distance entre l'idéal et la limite du même côté.
  const offset = (value: number, min: number, idealMin: number, idealMax: number, max: number): number => {
    if (value > idealMax) return (value - idealMax) / ((max - idealMax) * k);
    if (value < idealMin) return (value - idealMin) / ((idealMin - min) * k);
    return 0;
  };
  return {
    depth: offset(forward, t.reachBack, t.idealForward, t.idealForward, t.reachFront),
    side: offset(lateral, t.reachInside, t.idealLateral, t.idealLateral, t.reachLateral),
    height: offset(rel.y, t.reachLow, t.comfortLow, t.comfortHigh, t.reachHigh),
  };
}

export function isInReach(reach: Reach): boolean {
  return Math.abs(reach.depth) <= 1 && Math.abs(reach.side) <= 1 && Math.abs(reach.height) <= 1;
}

function missReason(reach: Reach): SwingMiss {
  if (reach.depth > 1) return 'early';
  if (reach.depth < -1) return 'late';
  if (reach.side > 1) return 'far';
  if (reach.side < -1) return 'close';
  return reach.height > 1 ? 'high' : 'low';
}

/** Au-delà de cette distance, un swing dans le vide n'est pas commenté (m). */
const MISS_FEEDBACK_DISTANCE = 4;

export interface ShotInput {
  /** Position de la balle au contact. */
  contact: Vec3;
  ballVel: Vec3;
  /** Regard du joueur (rad). */
  yaw: number;
  pitch: number;
  /** Vitesse du tamis au contact (m/s). */
  headSpeed: number;
  side: 1 | -1;
  charge: number;
  /** Avancement du swing au contact (0..1). */
  progress: number;
  /** Décalage du point d'impact par rapport au centre du tamis, en fraction du rayon utile. */
  offsetRight: number;
  offsetUp: number;
  /** Écart de profondeur de la balle au point idéal (-1..1) : dégrade le contact, comme un décentrage. */
  depth: number;
  gestureX: number;
  gestureY: number;
  soft: boolean;
}

/** Angle de tir (rad) pour passer à la hauteur `height` au-dessus du sol à la distance `distance`. */
function elevationFor(speed: number, distance: number, rise: number, gravity: number): number {
  // Tir tendu : la plus petite des deux solutions de la parabole. La traînée est compensée
  // en comptant une vitesse un peu plus faible.
  const k = (gravity * distance * distance) / (2 * (speed * 0.93) ** 2);
  const discriminant = distance * distance - 4 * k * (k + rise);
  // Vitesse insuffisante : on prend l'angle qui passe le plus haut possible à cette distance.
  const tangent = discriminant >= 0 ? (distance - Math.sqrt(discriminant)) / (2 * k) : distance / (2 * k);
  return clamp(Math.atan(tangent), -25 * DEG, 60 * DEG);
}

/**
 * Calcule la balle sortante. Comme un joueur, le coup vise un passage au-dessus du filet :
 * la direction suit le regard, la hauteur de passage se règle avec le regard vertical et le geste
 * de souris (vers le haut : lift et lob ; vers le bas : slice, balle rasante). La vitesse vient du
 * swing, plus une part de la vitesse de la balle entrante. Le timing et le point d'impact
 * dévient et affaiblissent le coup.
 * Retourne `null` si la balle s'éloigne plus vite que le tamis n'avance (pas de contact réel).
 */
export function computeShot(
  input: ShotInput,
  profile: PhysicsProfile,
): { vel: Vec3; spin: Vec3; quality: number } | null {
  const t = profile.racket;
  const offset = Math.min(1, Math.sqrt(input.offsetRight ** 2 + input.offsetUp ** 2 + input.depth ** 2));
  const quality = 1 - offset;
  // Une préparation complète stabilise le tamis : les coups décentrés dévient moins.
  const deviation = t.edgeDeviation * (1 - 0.5 * input.charge);

  const yaw =
    input.yaw +
    input.gestureX * (1 - t.swingLookFactor) +
    // En retard, la balle part du côté de la raquette ; en avance, elle est tirée de l'autre côté.
    input.side * (t.idealContact - input.progress) * t.timingAngle * DEG +
    input.offsetRight * deviation * DEG;
  const direction = vec3(-Math.sin(yaw), 0, Math.cos(yaw));

  // Vitesse : le tamis pousse la balle, et une balle qui arrive vite repart plus vite.
  const headSpeed = input.headSpeed * (input.soft ? t.softFactor : 1) * (1 - t.edgeSpeedLoss * offset);
  const incoming = -dot(input.ballVel, direction);
  if (headSpeed + incoming <= 0) return null;
  const speed = Math.max(1, (1 + t.restitution) * headSpeed + t.restitution * incoming);

  // Hauteur de passage visée au filet.
  const brush = clamp(input.gestureY * t.brushGain, -t.maxBrush, t.maxBrush) / t.maxBrush;
  const clearance = Math.max(
    0.1,
    t.netClearance +
      (input.pitch / DEG) * t.clearancePerPitch +
      (brush > 0 ? brush * t.lobClearance : brush * t.sliceClearance),
  );
  // Distance au filet le long de la direction du coup ; sans objet si le joueur lui tourne le dos.
  const towardNet = Math.cos(yaw);
  const elevation =
    (towardNet > 0.2
      ? elevationFor(
          speed,
          Math.max(0.5, -input.contact.z / towardNet),
          NET_HEIGHT_CENTER + clearance - input.contact.y,
          profile.gravity,
        )
      : 10 * DEG) +
    input.offsetUp * deviation * DEG;

  const vel = vec3(
    direction.x * speed * Math.cos(elevation),
    speed * Math.sin(elevation),
    direction.z * speed * Math.cos(elevation),
  );
  // Brossage : lift (positif) ou slice (négatif), autour de l'axe horizontal perpendiculaire au coup.
  const spinRate = (brush * t.spinGain * speed) / BALL_RADIUS;
  const spin = scale(cross(vec3(0, 1, 0), direction), spinRate);
  return { vel, spin, quality };
}

/**
 * Avance la raquette d'un pas. Si la balle est dans la zone de frappe pendant le swing,
 * elle est renvoyée et la frappe est retournée.
 */
export function stepRacket(
  racket: Racket,
  player: Player,
  ball: Ball | null,
  cmd: PlayerCommands,
  dt: number,
  profile: PhysicsProfile,
): Shot | null {
  const t = profile.racket;
  const right = rightOf(player.yaw);
  const free = racket.phase === 'idle' || racket.phase === 'preparing';

  if (ball && !ball.out) {
    // Coup droit ou revers selon le côté de la balle (avec une zone morte au centre).
    if (free) {
      const lateral = dot(sub(ball.pos, player.pos), right);
      if (lateral > 0.1) racket.side = 1;
      else if (lateral < -0.1) racket.side = -1;
    }
    // Le tamis accompagne la hauteur de la balle, à vitesse limitée.
    const target = clamp(ball.pos.y - player.pos.y, t.heightMin, t.heightMax);
    racket.height += clamp(target - racket.height, -t.heightRate * dt, t.heightRate * dt);
  } else {
    racket.height += clamp(t.readyHeight - racket.height, -t.heightRate * dt, t.heightRate * dt);
  }

  const wasSwinging = racket.phase === 'swinging';
  const progressBefore = swingProgress(racket, t);
  const headBefore = racket.headPos;

  racket.phaseTime += dt;
  switch (racket.phase) {
    case 'idle':
      if (cmd.prepare) {
        racket.phase = 'preparing';
        racket.phaseTime = 0;
        racket.charge = 0;
      }
      break;
    case 'preparing':
      racket.charge = Math.min(1, racket.charge + dt / t.prepareTime);
      if (!cmd.prepare) {
        racket.phase = 'swinging';
        racket.phaseTime = 0;
        racket.gestureX = 0;
        racket.gestureY = 0;
        racket.hasHit = false;
        racket.miss = null;
      }
      break;
    case 'swinging':
      racket.gestureX += cmd.look.yaw;
      racket.gestureY += cmd.look.pitch;
      if (racket.phaseTime >= swingDuration(racket.charge, t)) {
        racket.phase = 'recovering';
        racket.phaseTime = 0;
      }
      break;
    case 'recovering':
      if (racket.phaseTime >= t.recoverTime) {
        racket.phase = 'idle';
        racket.phaseTime = 0;
        racket.charge = 0;
      }
      break;
  }

  racket.headPos = headWorldPos(racket, player, t);

  // Contact : seulement pendant le swing, une fois par swing.
  if (!wasSwinging || racket.hasHit || !ball || ball.out) return null;

  const progress = swingProgress(racket, t);
  const reach = reachOf(player, racket, ball, t);
  if (racket.phase !== 'swinging' && length(sub(ball.pos, player.pos)) < MISS_FEEDBACK_DISTANCE) {
    // Le swing se termine sans avoir touché la balle : on dit pourquoi.
    racket.miss = missReason(reach);
  }
  if (progress < t.contactStart || progressBefore > t.contactEnd || !isInReach(reach)) return null;
  // Le tamis attend la balle au point idéal : tant qu'elle est encore devant, le contact est
  // retardé jusqu'à ce qu'elle y arrive, ou jusqu'à la fin de la fenêtre de contact.
  if (reach.depth > 0 && progress < t.contactEnd) return null;

  const headTravel = sub(racket.headPos, headBefore);
  const result = computeShot(
    {
      contact: ball.pos,
      ballVel: ball.vel,
      yaw: player.yaw,
      pitch: player.pitch,
      headSpeed: length(vec3(headTravel.x, 0, headTravel.z)) / dt,
      side: racket.side,
      charge: racket.charge,
      // Balle encore devant : le contact se fait tard dans le swing ; déjà passée : tôt.
      progress: t.idealContact + reach.depth * t.timingSpread,
      // Balle loin du corps : elle touche le bord extérieur du tamis.
      offsetRight: reach.side * racket.side,
      offsetUp: reach.height,
      depth: reach.depth,
      gestureX: racket.gestureX,
      gestureY: racket.gestureY,
      soft: cmd.softShot,
    },
    profile,
  );
  if (!result) return null;

  racket.hasHit = true;
  racket.miss = null;
  ball.vel = result.vel;
  ball.spin = result.spin;
  return {
    quality: result.quality,
    perfect: result.quality >= t.perfectQuality,
    speed: length(result.vel),
    timing: reach.depth,
    side: racket.side,
    soft: cmd.softShot,
    contact: ball.pos,
  };
}
