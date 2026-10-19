import { createBall, integrateFlight } from './ball';
import { stepBall, type Contact } from './collisions';
import type { ArcadeCommands, OverheadKind, ShotKind } from './commands';
import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, NET_HEIGHT_POSTS, PLAYER_HEIGHT, SIM_DT } from './constants';
import { netHeightAt } from './court';
import type { PhysicsProfile, ShotTypeTuning } from './profile';
import { addScaled, cross, length, normalize, scale, sub, vec3, type Vec3 } from './vec3';

/** Camp d'un joueur : -1 = côté Z négatif (près de la caméra), 1 = côté Z positif. */
export type CourtSide = -1 | 1;

const UP = vec3(0, 1, 0);
/** Profondeur maximale visée : un rebond juste devant la vitre du fond (m). */
export const HALF_LENGTH_SAFE = 9.5;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Direction « vers le filet » et « à droite » d'un joueur du camp `side`, qui fait face au filet. */
export function forwardFor(side: CourtSide): Vec3 {
  return vec3(0, 0, -side);
}
export function rightFor(side: CourtSide): Vec3 {
  return vec3(side, 0, 0);
}

/** Main qui tient la raquette : le coup droit se joue de ce côté du joueur, et les coups au-dessus de la tête aussi. */
export type Hand = 'right' | 'left';
export const HANDS: readonly Hand[] = ['right', 'left'];

/** Côté de frappe : coup droit (côté de la main) ou revers. */
export type Wing = 'fore' | 'back';

/** Direction du coup droit d'un joueur du camp `side` qui fait face au filet : sa droite, ou sa gauche s'il est gaucher. */
export function forehandFor(side: CourtSide, hand: Hand): Vec3 {
  return vec3(hand === 'right' ? side : -side, 0, 0);
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
 * (GAME_DESIGN.md §4 et §13, pas par le temps de préparation) : stick vers l'avant près du filet, sur une balle assez
 * haute : remate ; stick sur le côté : víbora ; sinon, ou loin du filet : bandeja.
 */
/**
 * Pourquoi un remate demandé n'a pas pu être joué en `contact` : balle trop basse ou trop loin du filet ;
 * `null` s'il était possible (ou si c'est une bajada, balle sortie de la vitre).
 */
export function remateRefusal(contact: Vec3, profile: PhysicsProfile): string | null {
  const r = profile.rally;
  const metres = (v: number): string => `${v.toFixed(1).replace('.', ',')} m`;
  if (contact.y < r.remateLow) return `balle trop basse pour un remate (${metres(contact.y)}, il faut ${metres(r.remateLow)}) : finis ton geste plus tôt`;
  if (Math.abs(contact.z) > r.remateZone) return `trop loin du filet pour un remate (${metres(Math.abs(contact.z))}, il faut ${metres(r.remateZone)} au plus)`;
  return null;
}

export function overheadKind(
  aim: ArcadeCommands['stick'],
  contact: Vec3,
  profile: PhysicsProfile,
  /** La balle a rebondi puis touché la vitre : stick vers l'avant, c'est une bajada. */
  afterGlass = false,
): OverheadKind {
  const r = profile.rally;
  const forward = aim.forward;
  const lateral = Math.abs(aim.right);
  if (forward >= r.overheadStick && forward >= lateral) {
    if (afterGlass) return 'bajada';
    return Math.abs(contact.z) <= r.remateZone && contact.y >= r.remateLow ? 'remate' : 'bandeja';
  }
  return lateral >= r.overheadStick ? 'vibora' : 'bandeja';
}

/**
 * Point de chute d'un coup au-dessus de la tête. Bandeja : profonde, vers le coin le long de la ligne,
 * au centre (stick vers l'avant ou l'arrière seulement), ou au stick comme un coup normal. Bajada : profonde, au stick.
 * Víbora : contre la vitre latérale du côté du stick, plus ou moins profonde selon le stick, ou au centre. Remate : parfait, court et dirigé au
 * stick (il rebondit haut et peut sortir du terrain : por tres de côté, por cuatro dans l'axe, surtout claqué
 * tout près du filet sur une balle flottante) ;
 * sinon plus long, il reste dans le terrain et revient de la vitre.
 */
export function overheadTarget(
  kind: OverheadKind,
  side: CourtSide,
  aim: ArcadeCommands['stick'],
  perfect: boolean,
  profile: PhysicsProfile,
  /** Position latérale du contact (x) : la bandeja sans direction part le long de la ligne. */
  contactX = 0,
  /** Distance du contact au filet (m) : tout près, le remate parfait se joue encore plus court. */
  contactDepth = Infinity,
): Vec3 {
  const r = profile.rally;
  const t = shotTuning(kind, profile);
  const toRight = rightFor(side).x;
  const limit = HALF_WIDTH - 0.6;
  const contactSide = contactX >= 0 ? 1 : -1;
  // Stick vers l'avant ou l'arrière seulement : au centre, entre les deux défenseurs (« al centro »).
  const centre = Math.abs(aim.right) < 0.2 && Math.abs(aim.forward) >= r.overheadCentreStick;
  if (kind === 'bandeja' && Math.abs(aim.right) < 0.2 && !centre) {
    // Bandeja sans direction : profonde, vers le coin de la vitre latérale, le long de la ligne : le coup sûr.
    const target = aimTarget(kind, side, aim, perfect, profile);
    return vec3(contactSide * r.bandejaLateral, target.y, target.z);
  }
  if (kind === 'bandeja' || kind === 'bajada' || kind === 'feinte') return aimTarget(kind, side, aim, perfect, profile);
  if (kind === 'vibora') {
    // Contre la vitre latérale, du côté du stick (sans direction, le long de la ligne) : elle y meurt basse. Le stick
    // vers l'arrière la raccourcit (angle fermé, elle ressort de la vitre vers le filet), vers l'avant l'allonge
    // jusqu'au coin des deux vitres ; tout droit, au centre, où l'effet latéral l'écarte du défenseur.
    const forward = clamp(aim.forward, -1, 1);
    const depth = forward >= 0 ? mix(t.depthNeutral, t.depthLong, forward) : mix(t.depthNeutral, t.depthShort, -forward);
    const lateral = centre ? r.viboraCentre : Math.min(HALF_WIDTH - 0.35, r.viboraLateral + (perfect ? 0.2 : 0));
    const x = Math.abs(aim.right) >= 0.2 ? Math.sign(aim.right) * toRight : contactSide;
    return vec3(x * lateral, BALL_RADIUS, -side * depth);
  }
  const depth = !perfect ? t.depthNeutral : contactDepth <= r.remateNearZone ? r.remateKillNear : r.remateKillDepth;
  const x = clamp(clamp(aim.right, -1, 1) * (perfect ? r.remateWidth : r.remateWidthLoose) * toRight, -limit, limit);
  return vec3(x, BALL_RADIUS, -side * depth);
}

/**
 * Hauteur de frappe d'une bandeja ou d'une víbora par rapport à l'idéal (hauteur des yeux) :
 * 0 dans la bande idéale, jusqu'à 1 au plus haut jouable (trop haute), jusqu'à -1 au plus bas (trop basse).
 */
export function overheadHeightOff(height: number, profile: PhysicsProfile, playerHeight = PLAYER_HEIGHT): number {
  const r = profile.rally;
  const ideal = bandejaHeight(profile, playerHeight);
  const d = height - ideal;
  if (Math.abs(d) <= r.overheadBand) return 0;
  if (d > 0) return clamp((d - r.overheadBand) / (r.overheadHigh - ideal - r.overheadBand), 0, 1);
  return -clamp((-d - r.overheadBand) / r.overheadLowSpan, 0, 1);
}

/** Hauteur idéale de frappe d'une bandeja ou d'une víbora pour un joueur de cette taille : ses yeux (m). */
export function bandejaHeight(profile: PhysicsProfile, playerHeight = PLAYER_HEIGHT): number {
  return playerHeight - profile.rally.eyesBelowHead;
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
  /** Effet imposé (fraction de la vitesse, négatif = coupé), à la place de celui du coup. */
  spinOverride: number | null = null,
  /** Part de l'effet gardée (coupé et latéral) : une bandeja prise trop haute perd son effet. */
  spinScale = 1,
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
    const effect = (spinOverride ?? (perfect && t.spinPerfect !== undefined ? t.spinPerfect : t.spin)) * spinScale;
    let spin = scale(cross(UP, direction), (effect * length(vel)) / BALL_RADIUS);
    if (t.sideSpin) {
      // Rotation autour de la verticale qui courbe la balle vers l'extérieur (le côté de la cible).
      const outward = Math.sign(target.x || 1);
      const curve = cross(UP, vel).x >= 0 ? 1 : -1;
      spin = addScaled(spin, UP, (outward * curve * t.sideSpin * spinScale * length(vel)) / BALL_RADIUS);
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

/** Vol complet d'une contre-vitre, collisions comprises : premier rebond au sol, et hauteur au passage du filet. */
function flyCounterWall(
  contact: Vec3,
  vel: Vec3,
  seconds: number,
  profile: PhysicsProfile,
): { landing: Vec3 | null; time: number; netHeight: number | null; glass: boolean; mesh: boolean } {
  const ball = createBall(contact, vel);
  const contacts: Contact[] = [];
  let netHeight: number | null = null;
  let glass = false;
  for (let i = 1; i * SIM_DT <= seconds; i++) {
    const before = ball.pos;
    contacts.length = 0;
    stepBall(ball, SIM_DT, profile, contacts);
    if (netHeight === null && Math.sign(before.z) !== Math.sign(ball.pos.z)) {
      const f = before.z / (before.z - ball.pos.z);
      netHeight = before.y + (ball.pos.y - before.y) * f;
    }
    for (const c of contacts) {
      if (c.surface === 'glass') glass = true;
      if (c.surface === 'ground' || c.surface === 'net' || c.surface === 'out' || c.surface === 'mesh') {
        return { landing: c.surface === 'ground' ? c.pos : null, time: i * SIM_DT, netHeight, glass, mesh: c.surface !== 'ground' && c.surface !== 'net' };
      }
    }
  }
  return { landing: null, time: seconds, netHeight, glass, mesh: false };
}

/**
 * Contre-vitre : la balle part vers la vitre du fond du camp `side`, y rebondit, repasse le filet et retombe sur
 * `target`, chez l'adversaire. Départ calculé comme si la vitre était un miroir (avec sa restitution), puis corrigé
 * par quelques vols simulés avec la vraie physique, vitre comprise. Pas d'effet : une balle lente et haute.
 */
export function solveCounterWall(contact: Vec3, target: Vec3, side: CourtSide, profile: PhysicsProfile): SolvedShot {
  const t = profile.rally.counterWall;
  const g = profile.gravity;
  const e = profile.glass.restitution;
  const glassZ = side * (HALF_LENGTH - BALL_RADIUS);
  const before = Math.abs(glassZ - contact.z);
  // Distance parcourue en longueur, dépliée à la vitre : jusqu'à elle, puis d'elle au point de chute.
  const unfolded = (z: number): number => before + Math.abs(glassZ - z);
  const goal = unfolded(target.z);
  const travelled = (flight: { landing: Vec3 | null; glass: boolean }): number =>
    flight.glass ? unfolded(flight.landing!.z) : Math.abs(flight.landing!.z - contact.z);
  let flightTime = t.flightTime;
  for (let attempt = 0; ; attempt++) {
    let along = (before + Math.abs(glassZ - target.z) / e) / flightTime;
    let vx = (target.x - contact.x) / flightTime;
    let vy = (target.y - contact.y + (g * flightTime * flightTime) / 2) / flightTime;
    let flight = flyCounterWall(contact, vec3(vx, vy, side * along), flightTime * 2, profile);
    for (let i = 0; i < 8 && flight.landing; i++) {
      const toGlass = before / along;
      along = Math.max(1, along + (goal - travelled(flight)) / (toGlass + e * Math.max(0.3, flightTime - toGlass)));
      vx += (target.x - flight.landing.x) / flightTime;
      vy += (g * (flightTime - flight.time)) / 2;
      flight = flyCounterWall(contact, vec3(vx, vy, side * along), flightTime * 2, profile);
    }
    const netTop = NET_HEIGHT_POSTS + BALL_RADIUS;
    const clears = flight.netHeight !== null && flight.netHeight >= netTop + t.clearance;
    if ((clears && !flight.mesh) || attempt >= 6) return { vel: vec3(vx, vy, side * along), spin: vec3(0, 0, 0), flightTime: flight.time };
    // Au-dessus de la vitre, dans le grillage : plus tendu. Trop bas au filet : plus haut, plus lent.
    flightTime *= flight.mesh ? 0.85 : 1.15;
  }
}
