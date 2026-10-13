import type { Ball } from './ball';
import { bounce } from './collisions';
import type { PlayerCommands } from './commands';
import { BALL_RADIUS } from './constants';
import { forwardOf, rightOf, type Player } from './player';
import type { PhysicsProfile, RacketTuning } from './profile';
import { add, addScaled, dot, length, lerp, scale, sub, vec3, type Vec3 } from './vec3';

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
  /** Centre du tamis dans le monde. */
  headPos: Vec3;
}

/** Résultat d'une frappe. */
export interface Shot {
  /** Qualité du contact : 1 au centre du tamis, 0 au bord. */
  quality: number;
  perfect: boolean;
  /** Vitesse de la balle après la frappe (m/s). */
  speed: number;
  /** Écart au point de contact idéal le long du swing : négatif = en retard. */
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

export interface ShotInput {
  ballVel: Vec3;
  ballSpin: Vec3;
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
  gestureX: number;
  gestureY: number;
  soft: boolean;
}

/**
 * Calcule la balle sortante. Le tamis est une surface orientée par le regard, le geste de souris,
 * le timing et le point d'impact ; il se déplace à la vitesse du swing, avec une composante
 * verticale (brossage) donnée par le geste. La balle rebondit dessus : sa vitesse et son effet
 * sortants combinent donc le swing et la balle entrante.
 * Retourne `null` si la balle s'éloigne du tamis plus vite qu'il n'avance (pas de contact réel).
 */
export function computeShot(
  input: ShotInput,
  profile: PhysicsProfile,
): { vel: Vec3; spin: Vec3; quality: number } | null {
  const t = profile.racket;
  const offset = Math.min(1, Math.sqrt(input.offsetRight ** 2 + input.offsetUp ** 2));
  const quality = 1 - offset;
  // Une préparation complète stabilise le tamis : les coups décentrés dévient moins.
  const deviation = t.edgeDeviation * (1 - 0.5 * input.charge);

  const brush = clamp(input.gestureY * t.brushGain, -t.maxBrush, t.maxBrush);
  const yaw =
    input.yaw +
    input.gestureX * (1 - t.swingLookFactor) +
    // En retard, la balle part du côté de la raquette ; en avance, elle est tirée de l'autre côté.
    input.side * (t.idealContact - input.progress) * t.timingAngle * DEG +
    input.offsetRight * deviation * DEG;
  const speed = input.headSpeed * (input.soft ? t.softFactor : 1) * (1 - t.edgeSpeedLoss * offset);
  const elevation =
    (t.baseLoft +
      // Plus le coup est lent, plus le tamis s'ouvre, pour que la balle passe quand même le filet.
      t.slowLoft * clamp(1 - speed / t.referenceSpeed, 0, 1) +
      clamp((input.pitch / DEG) * t.pitchInfluence, -t.maxPitchLoft, t.maxPitchLoft) +
      Math.max(brush, 0) * t.loftPerBrush +
      input.offsetUp * deviation) *
    DEG;

  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);
  const normal = vec3(-Math.sin(yaw) * cosE, sinE, Math.cos(yaw) * cosE);
  // Vecteur « vers le haut » dans le plan du tamis.
  const faceUp = vec3(Math.sin(yaw) * sinE, cosE, -Math.cos(yaw) * sinE);

  const headVel = add(scale(normal, speed * Math.cos(brush * DEG)), scale(faceUp, speed * Math.sin(brush * DEG)));

  // Rebond dans le repère du tamis.
  const relative = sub(input.ballVel, headVel);
  if (dot(relative, normal) >= 0) return null;
  const result = bounce(relative, input.ballSpin, normal, t, profile.inertiaFactor);
  return { vel: add(result.vel, headVel), spin: result.spin, quality };
}

/**
 * Avance la raquette d'un pas. `prevBallPos` est la position de la balle au début du pas.
 * Si le tamis touche la balle pendant le swing, la balle est renvoyée et la frappe est retournée.
 */
export function stepRacket(
  racket: Racket,
  player: Player,
  ball: Ball | null,
  prevBallPos: Vec3 | null,
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
  if (!wasSwinging || racket.hasHit || !ball || ball.out || !prevBallPos) return null;

  // Balayage : le tamis est un disque face au regard ; on cherche l'instant du pas où la balle,
  // venue de devant, arrive à un rayon de son plan.
  const forward = forwardOf(player.yaw);
  const before = sub(prevBallPos, headBefore);
  const after = sub(ball.pos, racket.headPos);
  const gapBefore = dot(before, forward);
  const gapAfter = dot(after, forward);
  if (gapBefore <= BALL_RADIUS || gapAfter > BALL_RADIUS) return null;

  const f = (gapBefore - BALL_RADIUS) / (gapBefore - gapAfter);
  const relative = lerp(before, after, f);
  const reach = (t.headRadius + BALL_RADIUS / 2) * t.tolerance;
  const offsetRight = dot(relative, right) / reach;
  const offsetUp = relative.y / reach;
  if (offsetRight * offsetRight + offsetUp * offsetUp > 1) return null;

  const headTravel = sub(racket.headPos, headBefore);
  const progress = mix(progressBefore, swingProgress(racket, t), f);
  const result = computeShot(
    {
      ballVel: ball.vel,
      ballSpin: ball.spin,
      yaw: player.yaw,
      pitch: player.pitch,
      headSpeed: length(vec3(headTravel.x, 0, headTravel.z)) / dt,
      side: racket.side,
      charge: racket.charge,
      progress,
      offsetRight,
      offsetUp,
      gestureX: racket.gestureX,
      gestureY: racket.gestureY,
      soft: cmd.softShot,
    },
    profile,
  );
  if (!result) return null;

  racket.hasHit = true;
  ball.pos = lerp(prevBallPos, ball.pos, f);
  ball.vel = result.vel;
  ball.spin = result.spin;
  return {
    quality: result.quality,
    perfect: result.quality >= t.perfectQuality,
    speed: length(result.vel),
    timing: progress - t.idealContact,
    side: racket.side,
    soft: cmd.softShot,
    contact: ball.pos,
  };
}
