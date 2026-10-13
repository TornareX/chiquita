import { integrateFlight, type Ball } from './ball';
import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH } from './constants';
import { netHeightAt, WALLS, wallSurfaceAt, type Wall, type WallId } from './court';
import type { PhysicsProfile, SurfaceParams } from './profile';
import { add, addScaled, cross, dot, length, lerp, normalize, scale, sub, vec3, type Vec3 } from './vec3';

export type ContactSurface = 'ground' | 'glass' | 'mesh' | 'net' | 'tape' | 'out';

export interface Contact {
  surface: ContactSurface;
  wall?: WallId;
  pos: Vec3;
  /** Vitesse d'impact le long de la normale (m/s). */
  speed: number;
}

const MAX_CONTACTS_PER_STEP = 8;
/** Taille des cellules du bruit du grillage (m). */
const MESH_NOISE_CELL = 0.05;
const WALL_LIST: readonly Wall[] = Object.values(WALLS);
const UP = vec3(0, 1, 0);

/**
 * Réponse d'un rebond : restitution sur la normale, friction de Coulomb sur la tangente
 * (glissement, ou adhérence si la friction suffit à annuler le glissement au point de contact).
 * La friction échange vitesse tangentielle et spin ; l'énergie ne peut que diminuer.
 */
export function bounce(
  vel: Vec3,
  spin: Vec3,
  normal: Vec3,
  surface: SurfaceParams,
  inertiaFactor: number,
): { vel: Vec3; spin: Vec3 } {
  const vn = dot(vel, normal);
  const vTangent = addScaled(vel, normal, -vn);
  // Vitesse du point de contact de la balle par rapport à la surface.
  const slipVel = sub(vTangent, scale(cross(spin, normal), BALL_RADIUS));
  const slip = length(slipVel);

  let impulse = vec3(0, 0, 0);
  if (slip > 0) {
    const normalImpulse = (1 + surface.restitution) * -vn;
    const gripImpulse = (slip * inertiaFactor) / (1 + inertiaFactor);
    impulse = scale(slipVel, -Math.min(surface.friction * normalImpulse, gripImpulse) / slip);
  }

  return {
    vel: addScaled(add(vTangent, impulse), normal, -surface.restitution * vn),
    spin: addScaled(spin, cross(normal, impulse), -1 / (inertiaFactor * BALL_RADIUS)),
  };
}

function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 0x9e3779b1) ^ Math.imul(iy, 0x85ebca6b) ^ Math.imul(iz, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Normale du grillage, inclinée par un bruit qui ne dépend que du point d'impact. */
function meshNormal(normal: Vec3, pos: Vec3, roughness: number): Vec3 {
  const h = hash3(
    Math.round(pos.x / MESH_NOISE_CELL),
    Math.round(pos.y / MESH_NOISE_CELL),
    Math.round(pos.z / MESH_NOISE_CELL),
  );
  const a = (((h & 0xffff) / 0xffff) * 2 - 1) * roughness;
  const b = (((h >>> 16) / 0xffff) * 2 - 1) * roughness;
  return normalize(addScaled(addScaled(normal, UP, a), cross(normal, UP), b));
}

type Hit =
  | { kind: 'ground'; f: number }
  | { kind: 'wall'; f: number; wall: Wall }
  | { kind: 'net'; f: number; side: -1 | 1 };

function wallDistance(wall: Wall, p: Vec3): number {
  return dot(wall.normal, p) + (wall.axis === 'x' ? HALF_LENGTH : HALF_WIDTH);
}

/** Premier obstacle rencontré sur le segment p0 → p1 (f : fraction du segment). */
function findEarliestHit(p0: Vec3, p1: Vec3, out: boolean): Hit | null {
  let best: Hit | null = null;
  const consider = (hit: Hit): void => {
    if (!best || hit.f < best.f) best = hit;
  };
  // Un obstacle est touché si la balle s'en approche et finit à moins d'un rayon.
  const fraction = (d0: number, d1: number): number =>
    d0 <= BALL_RADIUS ? 0 : (d0 - BALL_RADIUS) / (d0 - d1);

  if (p1.y < BALL_RADIUS && p1.y < p0.y) consider({ kind: 'ground', f: fraction(p0.y, p1.y) });

  if (!out) {
    for (const wall of WALL_LIST) {
      const d0 = wallDistance(wall, p0);
      const d1 = wallDistance(wall, p1);
      if (d1 < BALL_RADIUS && d1 < d0) consider({ kind: 'wall', f: fraction(d0, d1), wall });
    }

    // Filet : la balle doit entrer dans la tranche |z| < rayon depuis l'un des deux camps.
    const side = p0.z <= -BALL_RADIUS ? -1 : p0.z >= BALL_RADIUS ? 1 : 0;
    if (side !== 0) {
      const d0 = side * p0.z;
      const d1 = side * p1.z;
      if (d1 < BALL_RADIUS) consider({ kind: 'net', f: fraction(d0, d1), side });
    }
  }
  return best;
}

function bounceOnGround(ball: Ball, p: PhysicsProfile, contacts: Contact[]): void {
  ball.pos = vec3(ball.pos.x, BALL_RADIUS, ball.pos.z);
  contacts.push({ surface: 'ground', pos: ball.pos, speed: -ball.vel.y });
  const result = bounce(ball.vel, ball.spin, UP, p.ground, p.inertiaFactor);
  ball.spin = result.spin;
  // Rebond trop faible : la balle reste au sol et roule.
  ball.vel = result.vel.y < p.restSpeed ? vec3(result.vel.x, 0, result.vel.z) : result.vel;
}

/** Ramène la balle à un rayon du mur et annule sa vitesse vers lui. */
function pressAgainstWall(ball: Ball, wall: Wall): void {
  const inset = (wall.axis === 'x' ? HALF_LENGTH : HALF_WIDTH) - BALL_RADIUS;
  ball.pos =
    wall.axis === 'x'
      ? vec3(ball.pos.x, ball.pos.y, -wall.normal.z * inset)
      : vec3(-wall.normal.x * inset, ball.pos.y, ball.pos.z);
  const vn = dot(ball.vel, wall.normal);
  if (vn < 0) ball.vel = addScaled(ball.vel, wall.normal, -vn);
}

function resolveHit(ball: Ball, hit: Hit, p: PhysicsProfile, contacts: Contact[]): void {
  const apply = (normal: Vec3, surface: SurfaceParams): void => {
    const result = bounce(ball.vel, ball.spin, normal, surface, p.inertiaFactor);
    ball.vel = result.vel;
    ball.spin = result.spin;
  };

  if (hit.kind === 'ground') {
    bounceOnGround(ball, p, contacts);
    return;
  }

  if (hit.kind === 'wall') {
    const { wall } = hit;
    const along = wall.axis === 'x' ? ball.pos.x : ball.pos.z;
    const surface = wallSurfaceAt(wall.id, along, ball.pos.y);
    const speed = -dot(ball.vel, wall.normal);
    if (surface === null) {
      // Au-dessus du mur : la balle quitte le terrain.
      ball.out = true;
      contacts.push({ surface: 'out', wall: wall.id, pos: ball.pos, speed });
      return;
    }
    // Recale la balle exactement à un rayon du mur.
    const inset = (wall.axis === 'x' ? HALF_LENGTH : HALF_WIDTH) - BALL_RADIUS;
    ball.pos =
      wall.axis === 'x'
        ? vec3(ball.pos.x, ball.pos.y, -wall.normal.z * inset)
        : vec3(-wall.normal.x * inset, ball.pos.y, ball.pos.z);
    contacts.push({ surface, wall: wall.id, pos: ball.pos, speed });

    if (surface === 'glass') {
      apply(wall.normal, p.glass);
      return;
    }
    const before = { vel: ball.vel, spin: ball.spin };
    const tilted = meshNormal(wall.normal, ball.pos, p.mesh.roughness);
    if (dot(ball.vel, tilted) < 0) apply(tilted, p.mesh);
    // Si la normale inclinée ne renvoie pas la balle vers le terrain, on retombe sur la vraie.
    if (dot(ball.vel, wall.normal) <= 0) {
      ball.vel = before.vel;
      ball.spin = before.spin;
      apply(wall.normal, p.mesh);
    }
    return;
  }

  // Filet.
  const { side } = hit;
  if (Math.abs(ball.pos.x) > HALF_WIDTH) return;
  const top = netHeightAt(ball.pos.x);
  const speed = Math.abs(ball.vel.z);
  if (ball.pos.y < top) {
    ball.pos = vec3(ball.pos.x, ball.pos.y, side * BALL_RADIUS);
    contacts.push({ surface: 'net', pos: ball.pos, speed });
    apply(vec3(0, 0, side), p.net);
  } else if (ball.pos.y < top + BALL_RADIUS) {
    // La balle accroche la bande : elle passe, freinée d'autant plus qu'elle la touche bas.
    const depth = (top + BALL_RADIUS - ball.pos.y) / BALL_RADIUS;
    const keep = 1 - p.tapeSpeedLoss * depth;
    contacts.push({ surface: 'tape', pos: ball.pos, speed });
    ball.vel = vec3(ball.vel.x * keep, ball.vel.y, ball.vel.z * keep);
    ball.spin = scale(ball.spin, keep);
  }
}

/**
 * Balle plaquée contre un obstacle par une force continue (Magnus, gravité) : elle glisse
 * le long de l'obstacle. `ball` contient la position atteinte sans collision ; on la ramène
 * sur les surfaces qu'elle a franchies et on annule sa vitesse vers elles.
 */
function slideAlong(ball: Ball, hit: Hit, p: PhysicsProfile, contacts: Contact[]): void {
  if (
    hit.kind === 'net' &&
    Math.abs(ball.pos.x) <= HALF_WIDTH &&
    ball.pos.y < netHeightAt(ball.pos.x)
  ) {
    ball.pos = vec3(ball.pos.x, ball.pos.y, hit.side * BALL_RADIUS);
    if (ball.vel.z * hit.side < 0) ball.vel = vec3(ball.vel.x, ball.vel.y, 0);
  }
  if (!ball.out) {
    for (const wall of WALL_LIST) {
      if (wallDistance(wall, ball.pos) >= BALL_RADIUS) continue;
      const along = wall.axis === 'x' ? ball.pos.x : ball.pos.z;
      if (wallSurfaceAt(wall.id, along, ball.pos.y) !== null) pressAgainstWall(ball, wall);
    }
  }
  if (ball.pos.y < BALL_RADIUS) {
    if (ball.vel.y < 0) bounceOnGround(ball, p, contacts);
    else ball.pos = vec3(ball.pos.x, BALL_RADIUS, ball.pos.z);
  }
}

/**
 * Avance la balle de `dt` secondes avec collisions. Les rebonds sont résolus un par un,
 * dans l'ordre chronologique, ce qui traite correctement les coins (double vitre).
 * Les contacts du pas sont ajoutés à `contacts`.
 */
export function stepBall(ball: Ball, dt: number, p: PhysicsProfile, contacts: Contact[]): void {
  let remaining = dt;
  let stalled = false;
  for (let i = 0; i < MAX_CONTACTS_PER_STEP && remaining > 0; i++) {
    const start = { pos: ball.pos, vel: ball.vel, spin: ball.spin };
    integrateFlight(ball, remaining, p);
    const hit = findEarliestHit(start.pos, ball.pos, ball.out);
    if (!hit) return;

    // Revient au début du sous-pas et n'avance que jusqu'à l'impact.
    const h = hit.f * remaining;
    if (h === 0) {
      // Deuxième impact sans que le temps avance : le rebond ne décolle pas la balle.
      if (stalled) {
        slideAlong(ball, hit, p, contacts);
        return;
      }
      stalled = true;
    }
    const predicted = lerp(start.pos, ball.pos, hit.f);
    ball.pos = start.pos;
    ball.vel = start.vel;
    ball.spin = start.spin;
    if (h > 0) integrateFlight(ball, h, p);
    if (hit.kind === 'net') {
      // Place la balle juste à l'intérieur de la tranche du filet : le test ne se redéclenche pas.
      ball.pos = vec3(predicted.x, predicted.y, hit.side * BALL_RADIUS * (1 - 1e-9));
    }
    resolveHit(ball, hit, p, contacts);
    remaining -= h;
  }
}
