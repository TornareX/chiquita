import { flatDistance, clampToHalf, planIntercept, type Intercept } from './assist';
import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from './commands';
import { SIM_DT } from './constants';
import { ARCADE, type PhysicsProfile } from './profile';
import { Match, type MatchRules, type PointOutcome, type ServeSide } from './score';
import { inServiceBox, serveIdealTick, servePositions, serveTarget } from './serve';
import { aimTarget, forwardFor, lateDrift, rightFor, solveShot, type CourtSide } from './shots';
import { addScaled, length, vec3, type Vec3 } from './vec3';

/**
 * Assistance de course, réglable par joueur (GAME_DESIGN.md §6) :
 * - `full` : à l'appui, le joueur court seul au point d'impact ; le stick ne fait que viser ;
 * - `partial` : pareil, mais toucher au stick tôt pendant la préparation reprend la main (placement manuel) ;
 * - `off` : le joueur se place toujours lui-même ; la frappe part dès que la balle est à portée.
 */
export type AssistLevel = 'full' | 'partial' | 'off';
export const ASSIST_LEVELS: readonly AssistLevel[] = ['full', 'partial', 'off'];

/**
 * Coup en cours : préparé tant que le bouton est maintenu, déclenché au relâcher (GAME_DESIGN.md §4).
 * Relâché tôt, il part au moment d'impact ; relâché autour de l'impact, frappe parfaite ; maintenu
 * trop longtemps après, il est raté.
 */
export interface Engagement {
  kind: ShotKind;
  /** Pas de l'appui. */
  pressTick: number;
  /** Pas où le bouton a été relâché, `null` tant qu'il est maintenu. */
  releaseTick: number | null;
  /** Premier pas où la balle était frappable (moment d'impact), `null` avant. */
  readyTick: number | null;
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
  /** Pas du dernier coup raté par maintien trop long (faute de retard). */
  lastWhiffTick: number;
  /** A raté la balle en cours : ne peut plus la reprendre. */
  whiffed: boolean;
  assist: AssistLevel;
}

export interface DuelShot {
  player: 0 | 1;
  kind: ShotKind;
  /** Relâché dans la sous-fenêtre de frappe parfaite. */
  perfect: boolean;
  /** Relâcher par rapport au moment d'impact (s) : négatif = en avance, positif = en retard. */
  timing: number;
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
  | 'not-returned'
  | 'double-fault';

export interface PointResult {
  winner: 0 | 1;
  reason: PointReason;
  /** Nombre de coups de l'échange, service compris. */
  hits: number;
}

/**
 * - `serve` : le serveur a la balle en main ;
 * - `toss` : il l'a lâchée (bouton maintenu), elle rebondit, il la frappe en relâchant ;
 * - `rally` : balle en jeu ; `dead` : pause après un point, une faute ou un let ;
 * - `over` : match terminé, un appui relance une partie.
 */
export type DuelPhase = 'serve' | 'toss' | 'rally' | 'dead' | 'over';

/**
 * Faute de service : `late` = maintenu trop longtemps, la balle n'est pas frappée ; `net` = dans le
 * filet ; `box` = hors du carré de service ; `wall` = vitre ou grillage avant le rebond, ou grillage après.
 */
export type ServeFault = 'late' | 'net' | 'box' | 'wall';

/** Annonce sur un service : faute, ou let (filet puis bon carré, le service est rejoué). */
export interface ServeCall {
  call: 'fault' | 'let';
  reason: ServeFault | null;
  /** Service concerné : premier ou second. */
  serveNumber: 1 | 2;
}

/** Balle lâchée par le serveur, bouton maintenu. */
export interface Toss {
  kind: ShotKind;
  releaseTick: number | null;
  /** Pas du moment idéal pour frapper : le sommet du rebond. */
  idealTick: number;
}

/** Délai minimal avant de pouvoir servir, et pause après un point (s). */
const SERVE_DELAY = 0.4;
const DEAD_TIME = 1.4;
/** Pause après une faute de service ou un let (s). */
const FAULT_TIME = 1;
/** Un échange sans frappe pendant ce temps est arrêté (balle coincée). */
const STALL_TIME = 8;
/** Position d'attente en défense, en distance au filet (m) : 1,5 m devant la vitre du fond. */
export const HOME_DEPTH = 8.5;
/** Position d'attaque au filet, en distance au filet (m). */
export const NET_DEPTH = 3.5;
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
    lastWhiffTick: -Infinity,
    whiffed: false,
    assist: 'full',
  };
}

/**
 * Match en 1 contre 1 (GAME_DESIGN.md §12, étape B), ou échange libre sans score (étape A) si aucune
 * règle de match n'est donnée. Le service suit les règles FIP dans les deux cas.
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
  /** La balle a touché une vitre depuis la dernière frappe. */
  touchedGlass = false;
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
  /** Score du match, ou `null` en échange libre. */
  match: Match | null = null;
  /** Ce qu'a terminé le dernier point (jeu, set, match), en match seulement. */
  lastOutcome: PointOutcome | null = null;
  serveNumber: 1 | 2 = 1;
  serveSide: ServeSide = 'right';
  toss: Toss | null = null;
  /** Faute ou let annoncé pendant le dernier pas, sinon `null`. */
  serveCall: ServeCall | null = null;
  lastServeCall: ServeCall | null = null;
  /** Après la pause, le service est rejoué (faute de premier service ou let) au lieu d'un nouveau point. */
  private replayServe = false;

  constructor(readonly rules: MatchRules | null = null) {
    this.restart();
  }

  /** Nouvelle partie : score à zéro, premier service au joueur 0. */
  restart(): void {
    this.match = this.rules ? new Match(this.rules) : null;
    this.bestRally = 0;
    this.rallies = 0;
    this.lastResult = null;
    this.lastOutcome = null;
    this.lastServeCall = null;
    this.startServe(0);
  }

  get time(): number {
    return this.tick * SIM_DT;
  }

  /** Le joueur `index` attend la balle : c'est à lui de frapper le prochain coup. */
  isReceiving(index: 0 | 1): boolean {
    return this.phase === 'rally' && this.lastHitter !== null && this.lastHitter !== index;
  }

  /** Position de la balle tenue par le serveur, avant le service : côté coup droit. */
  servePosition(): Vec3 {
    const player = this.players[this.server];
    return vec3(
      player.pos.x + rightFor(player.side).x * this.profile.rally.standLateral,
      SERVE_HEIGHT,
      player.pos.z + forwardFor(player.side).z * 0.25,
    );
  }

  step(commands: readonly [ArcadeCommands, ArcadeCommands] = [NEUTRAL_ARCADE, NEUTRAL_ARCADE]): void {
    this.contacts.length = 0;
    this.shot = null;
    this.result = null;
    this.serveCall = null;

    for (const index of [0, 1] as const) this.updatePlayer(index, commands[index]);

    if (this.ball) {
      this.prevBallPos = this.ball.pos;
      stepBall(this.ball, SIM_DT, this.profile, this.contacts);
    }
    if (this.phase === 'toss') {
      this.updateToss();
    } else if (this.phase === 'rally') {
      this.judge();
      if (this.phase === 'rally') for (const index of [0, 1] as const) this.tryHit(index);
      if (this.phase === 'rally' && this.tick - this.lastHitTick() > STALL_TIME / SIM_DT) {
        this.endPoint(this.lastHitter ?? 0, 'not-returned');
      }
    } else if (this.phase === 'dead' && this.tick - this.phaseTick >= (this.replayServe ? FAULT_TIME : DEAD_TIME) / SIM_DT) {
      if (this.replayServe) this.startServe(this.server, false);
      else if (this.match?.winner != null) {
        this.phase = 'over';
        this.phaseTick = this.tick;
      } else this.startServe(this.match ? this.match.server : this.server === 0 ? 1 : 0);
    }
    this.tick++;
  }

  private lastHitTick(): number {
    return Math.max(this.players[0].lastHitTick, this.players[1].lastHitTick);
  }

  /** Prépare un service : nouveau point, ou service rejoué (second service, let). */
  private startServe(server: 0 | 1, newPoint = true): void {
    this.phase = 'serve';
    this.phaseTick = this.tick;
    this.server = server;
    this.replayServe = false;
    if (newPoint) this.serveNumber = 1;
    this.serveSide = this.match ? this.match.serveSide : this.rallies % 2 === 0 ? 'right' : 'left';
    // Serveur et receveur prennent place en diagonale.
    const spots = servePositions(this.players[server].side, this.serveSide, this.profile);
    const receiver = server === 0 ? 1 : 0;
    for (const [index, pos] of [
      [server, spots.server],
      [receiver, spots.receiver],
    ] as const) {
      const player = this.players[index];
      player.pos = player.prevPos = pos;
      player.vel = vec3(0, 0, 0);
    }
    this.toss = null;
    this.ball = null;
    this.prevBallPos = null;
    this.lastHitter = null;
    this.hits = 0;
    for (const player of this.players) {
      player.engagement = null;
      player.whiffed = false;
    }
  }

  private endPoint(winner: 0 | 1, reason: PointReason): void {
    const result: PointResult = { winner, reason, hits: this.hits };
    this.result = this.lastResult = result;
    if (this.match) this.lastOutcome = this.match.awardPoint(winner);
    this.lastServeCall = null;
    this.replayServe = false;
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
    // Relâcher le bouton déclenche le coup préparé.
    if (player.engagement && player.engagement.releaseTick === null && cmd.shot === null) {
      player.engagement.releaseTick = this.tick;
    }

    if (this.phase === 'over') {
      if (pressed && this.tick - this.phaseTick >= DEAD_TIME / SIM_DT) this.restart();
      return;
    }
    if ((this.phase === 'serve' || this.phase === 'toss') && index === this.server) {
      // Appuyer lâche la balle ; relâcher la frappe (voir `updateToss`).
      if (this.phase === 'serve' && pressed && this.tick - this.phaseTick >= SERVE_DELAY / SIM_DT) {
        this.startToss(pressed);
      } else if (this.phase === 'toss' && this.toss) {
        if (pressed) {
          this.toss.kind = pressed;
          this.toss.releaseTick = null;
        } else if (cmd.shot === null) this.toss.releaseTick ??= this.tick;
      }
      // Le serveur reste en place jusqu'à sa frappe.
      player.vel = vec3(0, 0, 0);
      return;
    }
    if (
      pressed &&
      (this.phase === 'rally' || this.phase === 'toss') &&
      !player.whiffed &&
      this.tick - player.lastHitTick >= r.recoverTime / SIM_DT
    ) {
      // Appuyer à nouveau pendant la préparation change le type de coup, et se remet à préparer.
      if (player.engagement) {
        player.engagement.kind = pressed;
        player.engagement.releaseTick = null;
      } else {
        player.engagement = {
          kind: pressed,
          pressTick: this.tick,
          releaseTick: null,
          readyTick: null,
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

  /** Le serveur lâche la balle : elle rebondit, il la frappera au relâcher. */
  private startToss(kind: ShotKind): void {
    const contact = this.servePosition();
    this.ball = createBall(contact, vec3(0, 0, 0));
    this.prevBallPos = contact;
    this.phase = 'toss';
    this.phaseTick = this.tick;
    this.toss = { kind, releaseTick: null, idealTick: serveIdealTick(this.ball, this.tick, this.profile) };
  }

  /**
   * Frappe de service, même fenêtre de timing qu'en échange : relâché avant le sommet du rebond, le
   * service part au sommet ; autour du sommet, frappe parfaite ; maintenu trop longtemps, faute.
   */
  private updateToss(): void {
    const toss = this.toss;
    const ball = this.ball;
    if (!toss || !ball || this.tick < toss.idealTick) return;
    const r = this.profile.rally;
    if (toss.releaseTick === null) {
      if ((this.tick - toss.idealTick) * SIM_DT > r.lateWindow) this.serveFault('late');
      return;
    }
    const timing = (toss.releaseTick - toss.idealTick) * SIM_DT;
    const perfect = timing >= -r.perfectBefore && timing <= r.perfectAfter;
    const player = this.players[this.server];
    const aimed = serveTarget(player.side, this.serveSide, player.stick, perfect, this.profile);
    const target = lateDrift(aimed, player.side, timing, this.profile);
    this.phase = 'rally';
    this.phaseTick = this.tick;
    this.toss = null;
    this.hit(this.server, toss.kind, ball.pos, target, perfect, timing, false, true, false);
  }

  /** Faute de service (`reason`) ou let (`null`) : le service est rejoué, ou le point perdu sur double faute. */
  private serveFault(reason: ServeFault | null): void {
    const call: ServeCall = { call: reason ? 'fault' : 'let', reason, serveNumber: this.serveNumber };
    this.serveCall = this.lastServeCall = call;
    this.toss = null;
    if (reason && this.serveNumber === 2) return this.endPoint(this.server === 0 ? 1 : 0, 'double-fault');
    if (reason) this.serveNumber = 2;
    this.replayServe = true;
    this.phase = 'dead';
    this.phaseTick = this.tick;
    for (const player of this.players) player.engagement = null;
  }

  /**
   * Frappe du joueur `index`, selon la fenêtre de timing. Le moment d'impact est le premier pas où
   * la balle est frappable : en course assistée, au pas prévu ; en placement manuel, dès que la balle
   * est jouable à portée (le joueur qui se place lui-même peut frapper plus tôt). Relâché avant, le
   * coup part à ce moment ; relâché après, il part au relâcher, tant que la fenêtre de retard court.
   */
  private tryHit(index: 0 | 1): void {
    const player = this.players[index];
    const engagement = player.engagement;
    const ball = this.ball;
    if (!engagement || !ball || ball.out || !this.isReceiving(index)) return;
    // Le service doit rebondir avant d'être renvoyé.
    if (this.hits === 1 && this.bounces === 0) return;
    const r = this.profile.rally;
    const distance = flatDistance(ball.pos, player.pos);
    const heightOk = ball.pos.y >= r.hitLow && ball.pos.y <= r.hitHigh;
    const plan = engagement.plan;
    let volley: boolean;
    if (engagement.manual) {
      // Balle jouable : dans le camp du joueur, après le rebond, ou en volée près du filet.
      volley = this.bounces === 0;
      const playable = ball.pos.z * player.side > 0 && (!volley || Math.abs(player.pos.z) < r.volleyZone);
      if (engagement.readyTick === null && !(playable && heightOk && distance <= r.reach)) return;
    } else {
      if (!plan || this.tick < plan.tick) return;
      volley = plan.volley;
      if (engagement.readyTick === null && !(heightOk && distance <= r.reach)) {
        // Hors de portée au pas prévu : le joueur peut réarmer, la course assistée recalculera un point.
        if (this.tick > plan.tick + r.lateWindow / SIM_DT) player.engagement = null;
        return;
      }
    }
    engagement.readyTick ??= this.tick;

    const sinceReady = (this.tick - engagement.readyTick) * SIM_DT;
    if (engagement.releaseTick === null) {
      if (sinceReady > r.lateWindow) this.whiff(index);
      return;
    }
    // En retard, la balle a dépassé le joueur : un peu plus de portée pour la rattraper.
    if (!heightOk || distance > r.reach * (sinceReady > 0 ? r.lateReach : 1)) return this.whiff(index);
    const timing = (engagement.releaseTick - engagement.readyTick) * SIM_DT;
    const perfect = timing >= -r.perfectBefore && timing <= r.perfectAfter;
    const bonus = (engagement.manual ? r.manualAimBonus : 1) * (volley ? r.volleyWidth : 1);
    const aimed = aimTarget(engagement.kind, player.side, player.stick, perfect, this.profile, bonus);
    const target = lateDrift(aimed, player.side, timing, this.profile);
    this.hit(index, engagement.kind, ball.pos, target, perfect, timing, volley, false, engagement.manual);
  }

  /** Coup raté par maintien trop long : la balle passe, le joueur ne peut plus la reprendre. */
  private whiff(index: 0 | 1): void {
    const player = this.players[index];
    player.engagement = null;
    player.whiffed = true;
    player.lastWhiffTick = this.tick;
  }

  private hit(
    index: 0 | 1,
    kind: ShotKind,
    contact: Vec3,
    target: Vec3,
    perfect: boolean,
    timing: number,
    volley: boolean,
    serve: boolean,
    manual: boolean,
  ): void {
    const player = this.players[index];
    const r = this.profile.rally;
    const speedFactor = kind === 'lob' ? 1 : volley ? r.volleySpeed : this.touchedGlass ? r.glassSpeed : 1;
    const solved = solveShot(kind, contact, target, perfect, this.profile, speedFactor);
    const ball = this.ball!;
    ball.vel = solved.vel;
    ball.spin = solved.spin;
    player.engagement = null;
    player.lastHitTick = this.tick;
    this.lastHitter = index;
    this.bounces = 0;
    this.touchedNet = false;
    this.touchedGlass = false;
    this.hits++;
    for (const other of this.players) other.whiffed = false;
    this.shot = player.lastHit = {
      player: index,
      kind,
      perfect,
      timing,
      contact,
      target,
      speed: length(solved.vel),
      volley,
      serve,
      manual,
    };
  }

  /** Règles du padel appliquées aux contacts du pas. */
  private judge(): void {
    const hitter = this.lastHitter;
    if (hitter === null) return;
    const receiver = hitter === 0 ? 1 : 0;
    const hitterSide = this.players[hitter].side;
    for (const contact of this.contacts) {
      const hitterHalf = contact.pos.z * hitterSide > 0;
      if (this.hits === 1) {
        // Service pas encore renvoyé : il doit rebondir dans le carré en diagonale, et ne toucher
        // ni vitre avant le rebond, ni grillage du tout.
        switch (contact.surface) {
          case 'ground':
            if (this.bounces > 0) break;
            if (!hitterHalf && inServiceBox(contact.pos, -hitterSide as CourtSide, this.serveSide)) {
              if (this.touchedNet) return this.serveFault(null);
              this.bounces = 1;
              continue;
            }
            return this.serveFault(hitterHalf ? 'net' : 'box');
          case 'glass':
            if (this.bounces === 0) return this.serveFault('wall');
            break;
          case 'mesh':
            return this.serveFault('wall');
          case 'out':
            if (this.bounces === 0) return this.serveFault('box');
            break;
        }
      }
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
          this.touchedGlass = true;
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
