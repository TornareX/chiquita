import { flatDistance, clampToHalf, planIntercept, type Intercept } from './assist';
import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from './commands';
import { SIM_DT } from './constants';
import { ARCADE, type PhysicsProfile } from './profile';
import { aimTarget, forwardFor, rightFor, solveShot, type CourtSide } from './shots';
import { addScaled, length, vec3, type Vec3 } from './vec3';

/**
 * Assistance de course, réglable par joueur (GAME_DESIGN.md §6) :
 * - `full` : à l'appui, le joueur court seul au point d'impact ; le stick ne fait que viser ;
 * - `partial` : pareil, mais toucher au stick tôt pendant la charge reprend la main (placement manuel) ;
 * - `off` : le joueur se place toujours lui-même ; la frappe part dès que la balle est à portée.
 */
export type AssistLevel = 'full' | 'partial' | 'off';
export const ASSIST_LEVELS: readonly AssistLevel[] = ['full', 'partial', 'off'];

/** Coup en cours : armé par l'appui sur un bouton, joué à l'impact. */
export interface Engagement {
  kind: ShotKind;
  /** Pas de l'appui. */
  pressTick: number;
  /** Point d'impact visé par la course assistée, une fois la balle en route vers le joueur. */
  plan: Intercept | null;
  /** Le joueur se place lui-même pour ce coup : pas de course assistée, meilleurs angles. */
  manual: boolean;
  /** Stick au moment de l'appui : seul un changement après l'appui compte comme reprise en main. */
  pressStick: ArcadeCommands['stick'];
}

export interface DuelPlayer {
  side: CourtSide;
  pos: Vec3;
  vel: Vec3;
  /** Position au pas précédent, pour l'interpolation du rendu. */
  prevPos: Vec3;
  engagement: Engagement | null;
  /** Bouton maintenu au pas précédent, pour détecter l'appui. */
  heldShot: ShotKind | null;
  /** Stick au dernier pas : la direction du coup est lue au moment de l'impact. */
  stick: ArcadeCommands['stick'];
  /** Pas de la dernière frappe (animation, récupération). */
  lastHitTick: number;
  lastHit: DuelShot | null;
  assist: AssistLevel;
}

export interface DuelShot {
  player: 0 | 1;
  kind: ShotKind;
  /** Charge au moment de l'impact (0..1). */
  charge: number;
  contact: Vec3;
  target: Vec3;
  speed: number;
  volley: boolean;
  serve: boolean;
  /** Coup joué en placement manuel. */
  manual: boolean;
}

export type PointReason =
  | 'net'
  | 'own-ground'
  | 'own-mesh'
  | 'opponent-wall'
  | 'out'
  | 'second-bounce'
  | 'not-returned';

export interface PointResult {
  winner: 0 | 1;
  reason: PointReason;
  /** Nombre de coups de l'échange, service compris. */
  hits: number;
}

export type DuelPhase = 'serve' | 'rally' | 'dead';

/** Délai minimal avant de pouvoir servir, et pause après un point (s). */
const SERVE_DELAY = 0.4;
const DEAD_TIME = 1.4;
/** Un échange sans frappe pendant ce temps est arrêté (balle coincée). */
const STALL_TIME = 8;
/** Après le pas prévu, la frappe reste possible pendant ce temps si la balle est à portée (s). */
const HIT_WINDOW = 0.12;
/** Position d'attente et de service, en distance au filet (m). */
export const HOME_DEPTH = 7.5;
const SERVE_HEIGHT = 0.95;

function createDuelPlayer(side: CourtSide): DuelPlayer {
  const pos = vec3(0, 0, side * HOME_DEPTH);
  return {
    side,
    pos,
    vel: vec3(0, 0, 0),
    prevPos: pos,
    engagement: null,
    heldShot: null,
    stick: { forward: 0, right: 0 },
    lastHitTick: -Infinity,
    lastHit: null,
    assist: 'full',
  };
}

/**
 * Échange libre en 1 contre 1, sans score (GAME_DESIGN.md §12, étape A).
 * Avance uniquement par pas fixes, déterministe : mêmes commandes, même échange.
 * Joueur 0 côté Z négatif (près de la caméra), joueur 1 en face.
 */
export class Duel {
  tick = 0;
  profile: PhysicsProfile = structuredClone(ARCADE);
  players: [DuelPlayer, DuelPlayer] = [createDuelPlayer(-1), createDuelPlayer(1)];
  ball: Ball | null = null;
  prevBallPos: Vec3 | null = null;
  readonly contacts: Contact[] = [];
  phase: DuelPhase = 'serve';
  phaseTick = 0;
  server: 0 | 1 = 0;
  /** Dernier joueur à avoir frappé la balle en jeu. */
  lastHitter: 0 | 1 | null = null;
  /** Rebonds au sol dans le camp du receveur depuis la dernière frappe. */
  bounces = 0;
  touchedNet = false;
  /** Coups dans l'échange en cours, service compris. */
  hits = 0;
  /** Plus long échange depuis le début. */
  bestRally = 0;
  rallies = 0;
  /** Frappe pendant le dernier pas, sinon `null`. */
  shot: DuelShot | null = null;
  /** Point terminé pendant le dernier pas, sinon `null`. */
  result: PointResult | null = null;
  lastResult: PointResult | null = null;

  get time(): number {
    return this.tick * SIM_DT;
  }

  /** Le joueur `index` attend la balle : c'est à lui de frapper le prochain coup. */
  isReceiving(index: 0 | 1): boolean {
    return this.phase === 'rally' && this.lastHitter !== null && this.lastHitter !== index;
  }

  /** Position de la balle tenue par le serveur, avant le service. */
  servePosition(): Vec3 {
    const player = this.players[this.server];
    return vec3(
      player.pos.x - rightFor(player.side).x * this.profile.rally.standLateral,
      SERVE_HEIGHT,
      player.pos.z + forwardFor(player.side).z * 0.25,
    );
  }

  step(commands: readonly [ArcadeCommands, ArcadeCommands] = [NEUTRAL_ARCADE, NEUTRAL_ARCADE]): void {
    this.contacts.length = 0;
    this.shot = null;
    this.result = null;

    for (const index of [0, 1] as const) this.updatePlayer(index, commands[index]);

    if (this.ball) {
      this.prevBallPos = this.ball.pos;
      stepBall(this.ball, SIM_DT, this.profile, this.contacts);
    }
    if (this.phase === 'rally') {
      this.judge();
      if (this.phase === 'rally') for (const index of [0, 1] as const) this.tryHit(index);
      if (this.phase === 'rally' && this.tick - this.lastHitTick() > STALL_TIME / SIM_DT) {
        this.endPoint(this.lastHitter ?? 0, 'not-returned');
      }
    } else if (this.phase === 'dead' && this.tick - this.phaseTick >= DEAD_TIME / SIM_DT) {
      this.startServe(this.server === 0 ? 1 : 0);
    }
    this.tick++;
  }

  private lastHitTick(): number {
    return Math.max(this.players[0].lastHitTick, this.players[1].lastHitTick);
  }

  private startServe(server: 0 | 1): void {
    this.phase = 'serve';
    this.phaseTick = this.tick;
    this.server = server;
    this.ball = null;
    this.prevBallPos = null;
    this.lastHitter = null;
    this.hits = 0;
    for (const player of this.players) player.engagement = null;
  }

  private endPoint(winner: 0 | 1, reason: PointReason): void {
    const result: PointResult = { winner, reason, hits: this.hits };
    this.result = this.lastResult = result;
    this.bestRally = Math.max(this.bestRally, this.hits);
    this.rallies++;
    this.phase = 'dead';
    this.phaseTick = this.tick;
    for (const player of this.players) player.engagement = null;
  }

  private updatePlayer(index: 0 | 1, cmd: ArcadeCommands): void {
    const player = this.players[index];
    const r = this.profile.rally;
    player.prevPos = player.pos;
    player.stick = cmd.stick;
    const pressed = cmd.shot !== null && cmd.shot !== player.heldShot ? cmd.shot : null;
    player.heldShot = cmd.shot;

    if (this.phase === 'serve' && index === this.server) {
      if (pressed && this.tick - this.phaseTick >= SERVE_DELAY / SIM_DT) this.serve(index, pressed, cmd);
    } else if (pressed && this.phase === 'rally' && this.tick - player.lastHitTick >= r.recoverTime / SIM_DT) {
      // Appuyer à nouveau pendant la charge change seulement le type de coup.
      if (player.engagement) player.engagement.kind = pressed;
      else {
        player.engagement = {
          kind: pressed,
          pressTick: this.tick,
          plan: null,
          manual: player.assist === 'off',
          pressStick: cmd.stick,
        };
      }
    }

    const engagement = player.engagement;
    if (engagement && !engagement.plan && this.isReceiving(index) && this.ball) {
      engagement.plan = planIntercept(this.ball, player.pos, player.side, this.tick, this.profile);
    }
    if (engagement?.plan && !engagement.manual && player.assist === 'partial') {
      // Bouger le stick après l'appui, avant la fenêtre de visée, coupe l'assistance pour ce coup.
      // Garder la direction tenue en appuyant (en pleine course, par exemple) ne la coupe pas.
      const forward = cmd.stick.forward - engagement.pressStick.forward;
      const right = cmd.stick.right - engagement.pressStick.right;
      const touched = Math.sqrt(forward * forward + right * right) >= r.manualThreshold;
      if (touched && (engagement.plan.tick - this.tick) * SIM_DT > r.aimWindow) engagement.manual = true;
    }

    // Course assistée vers le point prévu ; sinon, le stick déplace le joueur.
    let desired: Vec3;
    const t = this.profile.player;
    if (engagement && !engagement.manual) {
      const target = engagement.plan?.stand;
      const gap = target ? flatDistance(target, player.pos) : 0;
      // Vitesse qui permet encore de s'arrêter pile sur le point.
      const speed = Math.min(t.maxSpeed, Math.sqrt(2 * t.deceleration * gap));
      desired =
        target && gap > 1e-3
          ? vec3(((target.x - player.pos.x) / gap) * speed, 0, ((target.z - player.pos.z) / gap) * speed)
          : vec3(0, 0, 0);
    } else {
      let { forward, right } = cmd.stick;
      const magnitude = Math.sqrt(forward * forward + right * right);
      if (magnitude > 1) {
        forward /= magnitude;
        right /= magnitude;
      }
      desired = addScaled(
        addScaled(vec3(0, 0, 0), forwardFor(player.side), forward * t.maxSpeed),
        rightFor(player.side),
        right * t.maxSpeed,
      );
    }

    // Inertie : la vitesse se rapproche de la cible à accélération bornée.
    const dx = desired.x - player.vel.x;
    const dz = desired.z - player.vel.z;
    const gap = Math.sqrt(dx * dx + dz * dz);
    const speeding = length(desired) >= length(player.vel);
    const maxChange = (speeding ? t.acceleration : t.deceleration) * SIM_DT;
    let vel = desired;
    if (gap > maxChange) vel = vec3(player.vel.x + (dx / gap) * maxChange, 0, player.vel.z + (dz / gap) * maxChange);

    const moved = clampToHalf(addScaled(player.pos, vel, SIM_DT), player.side, t.radius);
    // Contre un mur ou le filet, la vitesse dans cette direction tombe à zéro.
    player.vel = vec3((moved.x - player.pos.x) / SIM_DT, 0, (moved.z - player.pos.z) / SIM_DT);
    player.pos = vec3(moved.x, 0, moved.z);
  }

  private serve(index: 0 | 1, kind: ShotKind, cmd: ArcadeCommands): void {
    const contact = this.servePosition();
    this.ball = createBall(contact, vec3(0, 0, 0));
    this.prevBallPos = contact;
    this.phase = 'rally';
    this.phaseTick = this.tick;
    this.hit(index, kind, contact, cmd.stick, 0, false, true, false);
  }

  /**
   * Frappe du joueur `index` si son coup armé arrive à l'impact et que la balle est à portée.
   * En course assistée, l'impact a lieu au pas prévu ; en placement manuel, dès que la balle est
   * jouable à portée : le joueur qui se place lui-même peut frapper plus tôt.
   */
  private tryHit(index: 0 | 1): void {
    const player = this.players[index];
    const engagement = player.engagement;
    const ball = this.ball;
    if (!engagement || !ball || ball.out || !this.isReceiving(index)) return;
    const r = this.profile.rally;
    const plan = engagement.plan;
    const inReach = flatDistance(ball.pos, player.pos) <= r.reach && ball.pos.y >= r.hitLow && ball.pos.y <= r.hitHigh;
    const hitNow = (volley: boolean, manual: boolean): void => {
      // La charge commence à l'appui, mais pas avant que la balle parte vers le joueur.
      const chargeStart = Math.max(engagement.pressTick, this.lastHitTick());
      const charge = Math.min(1, ((this.tick - chargeStart) * SIM_DT) / r.chargeTime);
      this.hit(index, engagement.kind, ball.pos, player.stick, charge, volley, false, manual);
    };
    if (engagement.manual) {
      // Balle jouable : dans le camp du joueur, après le rebond, ou en volée près du filet.
      const volley = this.bounces === 0;
      const playable = ball.pos.z * player.side > 0 && (!volley || Math.abs(player.pos.z) < r.volleyZone);
      if (inReach && playable) hitNow(volley, true);
      return;
    }
    if (!plan || this.tick < plan.tick) return;
    if (inReach) {
      hitNow(plan.volley, false);
    } else if (this.tick > plan.tick + HIT_WINDOW / SIM_DT) {
      // Raté : le joueur peut réarmer, la course assistée recalculera un point.
      player.engagement = null;
    }
  }

  private hit(
    index: 0 | 1,
    kind: ShotKind,
    contact: Vec3,
    stick: ArcadeCommands['stick'],
    charge: number,
    volley: boolean,
    serve: boolean,
    manual: boolean,
  ): void {
    const player = this.players[index];
    const bonus = manual ? this.profile.rally.manualAimBonus : 1;
    const target = aimTarget(kind, player.side, stick, charge, this.profile, bonus);
    const solved = solveShot(kind, contact, target, charge, this.profile);
    const ball = this.ball!;
    ball.vel = solved.vel;
    ball.spin = solved.spin;
    player.engagement = null;
    player.lastHitTick = this.tick;
    this.lastHitter = index;
    this.bounces = 0;
    this.touchedNet = false;
    this.hits++;
    this.shot = player.lastHit = {
      player: index,
      kind,
      charge,
      contact,
      target,
      speed: length(solved.vel),
      volley,
      serve,
      manual,
    };
  }

  /** Règles du padel appliquées aux contacts du pas (sans service ni score à cette étape). */
  private judge(): void {
    const hitter = this.lastHitter;
    if (hitter === null) return;
    const receiver = hitter === 0 ? 1 : 0;
    const hitterSide = this.players[hitter].side;
    for (const contact of this.contacts) {
      const hitterHalf = contact.pos.z * hitterSide > 0;
      switch (contact.surface) {
        case 'ground':
          if (hitterHalf) {
            if (this.bounces > 0) return this.endPoint(hitter, 'not-returned');
            return this.endPoint(receiver, this.touchedNet ? 'net' : 'own-ground');
          }
          if (++this.bounces >= 2) return this.endPoint(hitter, 'second-bounce');
          break;
        case 'net':
          this.touchedNet = true;
          break;
        case 'tape':
          break;
        case 'glass':
          // Sa propre vitre est permise ; celle d'en face seulement après le rebond.
          if (!hitterHalf && this.bounces === 0) return this.endPoint(receiver, 'opponent-wall');
          break;
        case 'mesh':
          if (this.bounces === 0) return this.endPoint(receiver, hitterHalf ? 'own-mesh' : 'opponent-wall');
          break;
        case 'out':
          return this.bounces > 0 ? this.endPoint(hitter, 'not-returned') : this.endPoint(receiver, 'out');
      }
    }
  }
}
