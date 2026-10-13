import type { PlayerCommands } from './commands';
import { HALF_LENGTH, HALF_WIDTH } from './constants';
import type { PhysicsProfile } from './profile';
import { vec3, type Vec3 } from './vec3';

export interface Player {
  /** Position des pieds (y > 0 pendant le split-step). */
  pos: Vec3;
  vel: Vec3;
  /** Orientation du regard (rad). Yaw 0 = face au filet (+Z), positif vers la droite. */
  yaw: number;
  /** Positif vers le haut. */
  pitch: number;
  airborne: boolean;
  /** Instant jusqu'auquel le premier pas est accéléré par un split-step réussi. */
  boostUntil: number;
  /** Nombre de split-steps réussis. */
  splitSteps: number;
}

/** Instants de lancement de la machine, pour juger le timing du split-step. */
export interface LaunchTiming {
  lastLaunchTime: number;
  nextLaunchTime: number;
}

export const NO_LAUNCH: LaunchTiming = { lastLaunchTime: -Infinity, nextLaunchTime: Infinity };

const MAX_PITCH = (85 * Math.PI) / 180;

export function createPlayer(pos: Vec3 = vec3(0, 0, -7)): Player {
  return { pos, vel: vec3(0, 0, 0), yaw: 0, pitch: 0, airborne: false, boostUntil: -Infinity, splitSteps: 0 };
}

/** Direction horizontale du regard. */
export function forwardOf(yaw: number): Vec3 {
  return vec3(-Math.sin(yaw), 0, Math.cos(yaw));
}

/** Direction horizontale à droite du regard. */
export function rightOf(yaw: number): Vec3 {
  return vec3(-Math.cos(yaw), 0, -Math.sin(yaw));
}

export function stepPlayer(
  player: Player,
  cmd: PlayerCommands,
  dt: number,
  profile: PhysicsProfile,
  timing: LaunchTiming,
  time: number,
): void {
  const t = profile.player;

  player.yaw += cmd.look.yaw;
  player.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, player.pitch + cmd.look.pitch));

  // Direction voulue, bornée à 1 pour que la diagonale ne soit pas plus rapide.
  let { forward, right } = cmd.move;
  const magnitude = Math.sqrt(forward * forward + right * right);
  if (magnitude > 1) {
    forward /= magnitude;
    right /= magnitude;
  }

  const boosted = time < player.boostUntil;
  const maxSpeed =
    t.maxSpeed * (cmd.prepare ? t.prepareSpeedFactor : 1) * (boosted ? t.boostSpeedFactor : 1);
  const f = forwardOf(player.yaw);
  const r = rightOf(player.yaw);
  const targetX = (f.x * forward + r.x * right) * maxSpeed;
  const targetZ = (f.z * forward + r.z * right) * maxSpeed;

  // Inertie : la vitesse se rapproche de la cible à accélération bornée.
  const rate = (magnitude > 0 ? t.acceleration : t.deceleration) * (boosted ? t.boostAccelFactor : 1);
  const dx = targetX - player.vel.x;
  const dz = targetZ - player.vel.z;
  const gap = Math.sqrt(dx * dx + dz * dz);
  const maxChange = rate * dt;
  let vx = targetX;
  let vz = targetZ;
  if (gap > maxChange) {
    vx = player.vel.x + (dx / gap) * maxChange;
    vz = player.vel.z + (dz / gap) * maxChange;
  }

  // Split-step : petit saut, jugé à la réception.
  let vy = player.vel.y;
  let y = player.pos.y;
  if (cmd.jump && !player.airborne) {
    player.airborne = true;
    vy = t.hopSpeed;
  }
  if (player.airborne) {
    vy -= profile.gravity * dt;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      player.airborne = false;
      const sinceLaunch = time - timing.lastLaunchTime;
      const untilLaunch = timing.nextLaunchTime - time;
      const wellTimed =
        (sinceLaunch >= 0 && sinceLaunch <= t.splitStepWindowAfter) ||
        (untilLaunch >= 0 && untilLaunch <= t.splitStepWindowBefore);
      if (wellTimed) {
        player.boostUntil = time + t.boostDuration;
        player.splitSteps++;
      }
    }
  }

  // Le joueur reste dans son camp : murs et filet.
  let x = player.pos.x + vx * dt;
  let z = player.pos.z + vz * dt;
  const maxX = HALF_WIDTH - t.radius;
  if (x > maxX) {
    x = maxX;
    vx = Math.min(vx, 0);
  } else if (x < -maxX) {
    x = -maxX;
    vx = Math.max(vx, 0);
  }
  if (z > -t.radius) {
    z = -t.radius;
    vz = Math.min(vz, 0);
  } else if (z < -HALF_LENGTH + t.radius) {
    z = -HALF_LENGTH + t.radius;
    vz = Math.max(vz, 0);
  }

  player.pos = vec3(x, y, z);
  player.vel = vec3(vx, vy, vz);
}
