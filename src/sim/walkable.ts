import { DOOR_FAR, DOOR_NEAR, HALF_LENGTH, HALF_WIDTH, RUNOFF_BACK, RUNOFF_SIDE } from './constants';
import type { CourtSide } from './shots';
import { vec3, type Vec3 } from './vec3';
import { dhypot } from './dmath';

/**
 * Où un joueur peut se tenir (GAME_DESIGN.md §5, salida de pista) : sa moitié du terrain, ou toute la
 * zone autour du terrain (dehors, on va partout, jusque derrière le fond adverse). On passe de l'un à
 * l'autre seulement par la porte de son côté, dans l'un ou l'autre mur latéral. Un joueur est un disque de rayon `radius` ; dans la porte,
 * on tolère un rayon réduit (`DOOR_RADIUS`) pour qu'elle se franchisse sans viser au centimètre.
 */
const DOOR_RADIUS = 0.15;
/** Milieu de la porte, en distance au filet. */
export const DOOR_MID = (DOOR_NEAR + DOOR_FAR) / 2;

/** Dans sa moitié du terrain, à `radius` des murs et du filet. */
export function inCourt(p: Vec3, side: CourtSide, radius: number): boolean {
  const depth = p.z * side;
  return Math.abs(p.x) <= HALF_WIDTH - radius && depth >= radius && depth <= HALF_LENGTH - radius;
}

/** Hors du terrain (au-delà d'un mur, d'un côté ou de l'autre du filet), dans la zone praticable. */
export function inRunoff(p: Vec3, _side: CourtSide, radius: number): boolean {
  const depth = Math.abs(p.z);
  if (depth > HALF_LENGTH + RUNOFF_BACK || Math.abs(p.x) > HALF_WIDTH + RUNOFF_SIDE) return false;
  return Math.abs(p.x) >= HALF_WIDTH + radius || depth >= HALF_LENGTH + radius;
}

/** Dans l'embrasure d'une porte de son côté. */
export function inDoor(p: Vec3, side: CourtSide): boolean {
  const depth = p.z * side;
  return (
    depth >= DOOR_NEAR + DOOR_RADIUS &&
    depth <= DOOR_FAR - DOOR_RADIUS &&
    Math.abs(p.x) >= HALF_WIDTH - 0.5 &&
    Math.abs(p.x) <= HALF_WIDTH + 0.5
  );
}

export function isWalkable(p: Vec3, side: CourtSide, radius: number): boolean {
  return inCourt(p, side, radius) || inRunoff(p, side, radius) || inDoor(p, side);
}

/** Le point est hors du terrain (au-delà d'un mur). */
export function outsideCourt(p: Vec3): boolean {
  return Math.abs(p.x) > HALF_WIDTH || Math.abs(p.z) > HALF_LENGTH;
}

/** Ramène un point dans la zone où un joueur peut se tenir : sa moitié du terrain, ou la zone autour s'il est dehors. */
export function clampWalkable(p: Vec3, side: CourtSide, radius: number): Vec3 {
  if (!outsideCourt(p)) {
    const x = Math.min(HALF_WIDTH - radius, Math.max(-(HALF_WIDTH - radius), p.x));
    const depth = Math.min(HALF_LENGTH - radius, Math.max(radius, p.z * side));
    return vec3(x, p.y, depth * side);
  }
  let x = Math.min(HALF_WIDTH + RUNOFF_SIDE, Math.max(-(HALF_WIDTH + RUNOFF_SIDE), p.x));
  let z = Math.min(HALF_LENGTH + RUNOFF_BACK, Math.max(-(HALF_LENGTH + RUNOFF_BACK), p.z));
  // Trop près d'un mur, côté extérieur : écarté vers le mur le plus proche.
  if (Math.abs(x) < HALF_WIDTH + radius && Math.abs(z) < HALF_LENGTH + radius) {
    const toSide = HALF_WIDTH + radius - Math.abs(x);
    const toBack = HALF_LENGTH + radius - Math.abs(z);
    if (toSide <= toBack) x = Math.sign(x || 1) * (HALF_WIDTH + radius);
    else z = Math.sign(z || side) * (HALF_LENGTH + radius);
  }
  return vec3(x, p.y, z);
}

/**
 * Déplacement de `from` vers `to` (un pas) en restant praticable : contre un mur, on glisse le long
 * (un seul axe bouge) ; sinon on reste sur place.
 */
export function moveWithin(from: Vec3, to: Vec3, side: CourtSide, radius: number): Vec3 {
  for (const p of [to, vec3(to.x, to.y, from.z), vec3(from.x, to.y, to.z)]) {
    if (isWalkable(p, side, radius)) return p;
  }
  // Coincé (cas limite au bord d'une zone) : on ramène dans la zone la plus proche.
  return isWalkable(from, side, radius) ? from : clampWalkable(from, side, radius);
}

/** Point de passage par la porte, ou `null` si `from` et `to` sont du même côté des murs. */
function door(from: Vec3, to: Vec3, side: CourtSide): Vec3 | null {
  const fromOut = outsideCourt(from);
  if (fromOut === outsideCourt(to)) return null;
  const out = fromOut ? from : to;
  // Porte du mur latéral côté balle (derrière le fond, celle du côté du joueur).
  const sign = Math.abs(out.x) > HALF_WIDTH ? Math.sign(out.x) : Math.sign((fromOut ? to : from).x || 1);
  return vec3(sign * HALF_WIDTH, 0, side * DOOR_MID);
}

/** Longueur du trajet à pied de `from` à `to`, en passant par la porte s'il faut sortir ou rentrer. */
export function pathDistance(from: Vec3, to: Vec3, side: CourtSide): number {
  const flat = (a: Vec3, b: Vec3): number => dhypot(a.x - b.x, a.z - b.z);
  const via = door(from, to, side);
  return via ? flat(from, via) + flat(via, to) : flat(from, to);
}

/**
 * Prochain point vers lequel courir pour aller de `from` à `to` : `to` lui-même, ou, s'il faut
 * sortir ou rentrer, d'abord l'entrée de la porte (en face d'elle), puis sa sortie. Derrière un mur
 * du fond, le coin du terrain passe avant.
 */
export function waypoint(from: Vec3, to: Vec3, side: CourtSide): Vec3 {
  const via = door(from, to, side);
  if (!via) return to;
  const inward = outsideCourt(from) ? -1 : 1;
  const sign = Math.sign(via.x);
  // Dehors, derrière un mur du fond : d'abord le coin du terrain, pour ne pas frotter le long du mur.
  if (inward < 0 && Math.abs(from.z) > HALF_LENGTH && Math.abs(from.x) < HALF_WIDTH + 0.6) {
    return vec3(sign * (HALF_WIDTH + 0.7), 0, Math.sign(from.z) * (HALF_LENGTH + 0.7));
  }
  const depth = from.z * side;
  const aligned = depth >= DOOR_NEAR + DOOR_RADIUS + 0.05 && depth <= DOOR_FAR - DOOR_RADIUS - 0.05;
  // En face de la porte : on la franchit ; sinon on s'y présente, à 60 cm du mur.
  const x = aligned ? sign * (HALF_WIDTH + 0.6 * inward) : sign * (HALF_WIDTH - 0.6 * inward);
  return vec3(x, 0, side * DOOR_MID);
}
