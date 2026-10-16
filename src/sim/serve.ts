import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import type { ArcadeCommands } from './commands';
import { BALL_RADIUS, HALF_WIDTH, LINE_WIDTH, SERVICE_LINE_DISTANCE, SIM_DT } from './constants';
import type { PhysicsProfile } from './profile';
import type { ServeSide } from './score';
import { rightFor, type CourtSide } from './shots';
import { vec3, type Vec3 } from './vec3';

/**
 * Service à la cuillère, en diagonale (règles FIP) : le serveur laisse tomber la balle, la frappe
 * après le rebond, et elle doit rebondir dans le carré de service opposé en diagonale.
 */

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Signe en X du carré de service visé, dans le camp du receveur. Servir « à droite », c'est servir
 * depuis sa propre droite : le receveur attend lui aussi à sa droite, en diagonale.
 */
function boxSign(receiverSide: CourtSide, serveSide: ServeSide): number {
  return rightFor(receiverSide).x * (serveSide === 'right' ? 1 : -1);
}

/** Position d'attente d'un joueur pour ce point : le serveur derrière la ligne de service, le receveur au fond. */
export function servePositions(
  server: CourtSide,
  serveSide: ServeSide,
  profile: PhysicsProfile,
): { server: Vec3; receiver: Vec3 } {
  const t = profile.rally.serve;
  const sign = serveSide === 'right' ? 1 : -1;
  const receiver = -server as CourtSide;
  return {
    server: vec3(rightFor(server).x * sign * t.standLateral, 0, server * t.serverDepth),
    receiver: vec3(rightFor(receiver).x * sign * t.standLateral, 0, receiver * t.receiverDepth),
  };
}

/** La balle rebondit-elle dans le bon carré de service ? Les lignes sont bonnes. */
export function inServiceBox(pos: Vec3, receiverSide: CourtSide, serveSide: ServeSide): boolean {
  const depth = pos.z * receiverSide;
  const lateral = pos.x * boxSign(receiverSide, serveSide);
  const margin = LINE_WIDTH / 2 + BALL_RADIUS;
  return depth > 0 && depth <= SERVICE_LINE_DISTANCE + margin && lateral >= -margin && lateral <= HALF_WIDTH;
}

/** Point de chute visé par le service, dans le carré en diagonale, d'après le stick au moment de la frappe. */
export function serveTarget(
  server: CourtSide,
  serveSide: ServeSide,
  aim: ArcadeCommands['stick'],
  perfect: boolean,
  profile: PhysicsProfile,
): Vec3 {
  const t = profile.rally.serve;
  const receiver = -server as CourtSide;
  const sign = boxSign(receiver, serveSide);
  const forward = clamp(aim.forward, -1, 1);
  const depth = forward >= 0 ? mix(t.depthNeutral, t.depthLong, forward) : mix(t.depthNeutral, t.depthShort, -forward);
  const width = perfect ? t.aimWidthPerfect : t.aimWidth;
  // Le stick vise vers la droite du serveur.
  const x = sign * t.centerLateral + clamp(aim.right, -1, 1) * width * rightFor(server).x;
  // Toujours dans le carré, à bonne distance des lignes.
  const lateral = clamp(x * sign, 0.35, HALF_WIDTH - 0.35);
  return vec3(lateral * sign, BALL_RADIUS, receiver * depth);
}

/**
 * Moment idéal de la frappe de service : le sommet du rebond, après que la balle lâchée a touché
 * le sol. Simulé avec la physique du moteur, donc exact et déterministe. Retourne un compteur de pas
 * absolu (`tick` = pas du lâcher, où la balle avance déjà une première fois).
 */
export function serveIdealTick(ball: Ball, tick: number, profile: PhysicsProfile): number {
  const copy = createBall(ball.pos, ball.vel, ball.spin);
  const contacts: Contact[] = [];
  let bounced = false;
  for (let step = 1; step * SIM_DT < 3; step++) {
    contacts.length = 0;
    stepBall(copy, SIM_DT, profile, contacts);
    if (contacts.some((c) => c.surface === 'ground')) bounced = true;
    // Au pas `tick + step - 1` du duel, la balle aura avancé de `step` pas.
    else if (bounced && copy.vel.y <= 0) return tick + step - 1;
  }
  return tick + Math.round(1 / SIM_DT);
}
