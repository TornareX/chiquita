import { flatDistance, planIntercept, ticksToHeight, type Intercept } from './assist';
import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { NEUTRAL_ARCADE, type ArcadeCommands, type OverheadKind, type ShotKind } from './commands';
import { HALF_WIDTH, PLAYER_HEIGHT, SIM_DT } from './constants';
import type { WallId } from './court';
import { ARCADE, type PhysicsProfile } from './profile';
import { Match, type MatchRules, type PointOutcome, type ServeSide } from './score';
import { inServiceBox, serveIdealTick, servePositions, serveTarget } from './serve';
import {
  aimTarget,
  forwardFor,
  bandejaHeight,
  HALF_LENGTH_SAFE,
  lateDrift,
  overheadHeightOff,
  overheadKind,
  overheadTarget,
  rightFor,
  solveShot,
  type CourtSide,
  type ShotTuningKey,
} from './shots';
import { ballPressure, shotError } from './pressure';
import { addScaled, length, vec3, type Vec3 } from './vec3';
import { DOOR_MID, inCourt, moveWithin, outsideCourt, pathDistance, waypoint } from './walkable';

/**
 * Assistance de course, réglable par joueur (GAME_DESIGN.md §6) :
 * - `full` : à l'appui, le joueur court seul au point d'impact ; le stick ne fait que viser ;
 * - `magnet` (par défaut) : le joueur court lui-même au stick ; la course assistée ne fait que les
 *   derniers pas (`magnetRadius`). Le point d'impact suit sa position : aller au-devant de la balle la
 *   fait prendre plus tôt (avant la vitre, de volée) ;
 * - `partial` : comme `full`, mais toucher au stick tôt pendant la préparation reprend la main (placement manuel) ;
 * - `off` : le joueur se place toujours lui-même ; la frappe part dès que la balle est à portée.
 */
export type AssistLevel = 'magnet' | 'full' | 'partial' | 'off';
export const ASSIST_LEVELS: readonly AssistLevel[] = ['magnet', 'full', 'partial', 'off'];
/** En mode aimant, le point d'impact est recalculé tous les ce nombre de pas, d'après la position du joueur. */
const REPLAN_TICKS = 12;

/**
 * Coup en cours : préparé tant que le bouton est maintenu, déclenché au relâcher (GAME_DESIGN.md §4).
 * La frappe part au relâcher (voir `tryHit`).
 */
export interface Engagement {
  kind: ShotKind;
  /** Pas de l'appui. */
  pressTick: number;
  /** Pas où le bouton a été relâché, `null` tant qu'il est maintenu. */
  releaseTick: number | null;
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
  /** Pas du dernier coup dans le vide (relâché sans balle à portée), et le coup tenté (pour le geste). */
  lastWhiffTick: number;
  lastWhiffKind: ShotKind | null;
  /** Le dernier coup dans le vide a été relâché après le moment prévu : la balle était passée. */
  lastWhiffLate: boolean;
  /** Taille du joueur (m) : la bandeja et la víbora se frappent légèrement au-dessus de sa tête. */
  height: number;
  assist: AssistLevel;
}

export interface DuelShot {
  player: 0 | 1;
  /** Coup joué : B sur une balle basse donne un coupé, et toute balle rattrapée dehors repart en lob. */
  kind: ShotKind;
  /** Variante du coup au-dessus de la tête, sinon `null`. */
  overhead: OverheadKind | null;
  /** Balle rattrapée hors du terrain (salida de pista). */
  outside: boolean;
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
  /** Pression de la balle reçue, de 0 (verte) à 1 (rouge), et erreur du coup, de 0 à 1 (`pressure.ts`). */
  pressure: number;
  error: number;
  /** Toucher particulier : volée coupée, chiquita, ou coup bloqué faute de préparation. */
  style: ShotStyle | null;
  /** Bandeja ou víbora : hauteur de frappe par rapport à l'idéal, de -1 (trop basse) à 1 (trop haute) ; sinon 0. */
  heightOff: number;
}

/** Ce qu'une frappe ajoute aux réglages de base. */
interface HitExtra {
  overhead?: OverheadKind;
  outside?: boolean;
  pressure?: number;
  /** Erreur du coup : la balle passe plus haut au-dessus du filet et part moins vite. */
  error?: number;
  style?: ShotStyle | null;
  /** Temps de préparation : de l'appui à la frappe (s). */
  prepared?: number;
  /** Bandeja ou víbora : hauteur de frappe par rapport à l'idéal, de -1 (trop basse) à 1 (trop haute). */
  heightOff?: number;
}

/**
 * Toucher d'un coup, choisi par la situation et le stick (comme les variantes au-dessus de la tête) :
 * - `cut` : volée coupée, X de volée : aussi rapide que la volée normale, plus coupée, elle reste basse
 *   au rebond. Elle demande du temps : sur une balle pressée (rapide, basse, sans préparation), elle rate
 *   plus souvent que la volée normale (`pressure.cutRush`) ;
 * - `chiquita` : X stick vers soi, balle après rebond : lente et basse, elle plonge aux pieds du joueur
 *   au filet, qui doit remonter la balle ;
 * - `block` : coup normal ou coupé armé trop tard (moins de `blockPrep` s) : on ne fait que bloquer.
 */
export type ShotStyle = 'cut' | 'chiquita' | 'block';

export function shotStyle(
  kind: ShotKind,
  volley: boolean,
  outside: boolean,
  stick: ArcadeCommands['stick'],
  prepared: number,
  profile: PhysicsProfile,
): ShotStyle | null {
  const r = profile.rally;
  if (outside || (kind !== 'slice' && kind !== 'normal')) return null;
  if (prepared < r.blockPrep) return 'block';
  if (kind === 'slice' && volley) return 'cut';
  if (kind === 'slice' && stick.forward <= -r.overheadStick) return 'chiquita';
  return null;
}

/** Part de la vitesse du coup selon la préparation : `blockSpeed` sans préparation, pleine à `fullPrep` s. */
export function preparation(prepared: number, profile: PhysicsProfile): number {
  const r = profile.rally;
  const k = Math.min(1, Math.max(0, (prepared - r.blockPrep) / (r.fullPrep - r.blockPrep)));
  return prepared < r.blockPrep ? r.blockSpeed : r.blockSpeed + (1 - r.blockSpeed) * (0.5 + 0.5 * k);
}

export type PointReason =
  | 'net'
  | 'own-ground'
  | 'own-mesh'
  | 'opponent-wall'
  | 'out'
  | 'second-bounce'
  | 'not-returned'
  | 'double-fault'
  /** Balle sortie du terrain après son rebond, par-dessus (ou par la porte d') un mur latéral, puis du fond. */
  | 'por-tres'
  | 'por-cuatro';

/** Balle sortie du terrain après son rebond : elle reste jouable dehors jusqu'à ce qu'elle touche le sol. */
export interface BallExit {
  /** Joueur qui a frappé la balle sortie. */
  hitter: 0 | 1;
  wall: WallId;
  tick: number;
  pos: Vec3;
}

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

/**
 * Timing d'une frappe, lu sur la trajectoire : temps (s) écoulé depuis le passage de la balle au plus
 * près du point idéal, à `lateral` m sur le côté du joueur (coup droit ou revers, le plus proche).
 * Négatif : la balle n'y est pas encore. `miss` : distance horizontale de ce passage au point idéal (m).
 * Au-dessus de la tête (`height` donné), le point idéal est en l'air à cette hauteur et le passage se
 * lit en trois dimensions : une balle qui tombe presque à la verticale a son moment comme une autre.
 */
export function contactTiming(
  ball: Ball,
  player: DuelPlayer,
  lateral: number,
  height: number | null = null,
): { timing: number; miss: number } {
  const right = rightFor(player.side);
  const { x: vx, z: vz } = ball.vel;
  const vy = height === null ? 0 : ball.vel.y;
  // Balle presque verticale : vitesse plancher, le timing reste borné.
  const speed2 = Math.max(vx * vx + vy * vy + vz * vz, 2.25);
  let best = { timing: Infinity, miss: Infinity };
  for (const sign of [1, -1]) {
    const rx = ball.pos.x - (player.pos.x + right.x * lateral * sign);
    const ry = height === null ? 0 : ball.pos.y - height;
    const rz = ball.pos.z - player.pos.z;
    const timing = (rx * vx + ry * vy + rz * vz) / speed2;
    const miss = Math.sqrt((rx - timing * vx) ** 2 + (rz - timing * vz) ** 2);
    if (miss < best.miss) best = { timing, miss };
  }
  return best;
}

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
    lastWhiffKind: null,
    lastWhiffLate: false,
    height: PLAYER_HEIGHT,
    assist: 'magnet',
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
  /** Vitres touchées depuis la dernière frappe, chacune une fois (deux : la balle sort d'un coin). */
  glassWalls: WallId[] = [];
  /** Balle sortie du terrain après son rebond, depuis la dernière frappe (por tres, por cuatro). */
  exit: BallExit | null = null;
  /** Dernière sortie, gardée après le point pour l'affichage. */
  lastExit: BallExit | null = null;
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

  /** Règles du match, ou `null` en échange libre. Changées, elles s'appliquent à la prochaine partie (`restart`). */
  constructor(public rules: MatchRules | null = null) {
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
  /**
   * Labo de sensations : rejoue une situation de match. Les joueurs sont placés en `positions`, puis
   * `hitter` frappe le coup d'ouverture (`kind`, de `contact` vers `target`) comme en jeu ; le point se
   * joue ensuite normalement. Avec `kind` = `serve`, le point repart d'un service de `hitter`.
   */
  playSituation(
    hitter: 0 | 1,
    positions: readonly [Vec3, Vec3],
    /** `error` : coup raté exprès (balle plus haute et plus lente, comme une défense sous pression). */
    opening: { kind: ShotKind; contact: Vec3; target: Vec3; perfect?: boolean; overhead?: OverheadKind; error?: number } | 'serve',
  ): void {
    this.startServe(hitter);
    for (const [i, pos] of positions.entries()) {
      const player = this.players[i as 0 | 1];
      player.pos = player.prevPos = pos;
      player.lastHit = null;
    }
    if (opening === 'serve') return;
    const { kind, contact, target, perfect = false, overhead, error = 0 } = opening;
    this.phase = 'rally';
    this.phaseTick = this.tick;
    this.hits = 1;
    this.ball = createBall(contact, vec3(0, 0, 0));
    this.prevBallPos = contact;
    // Une volée si le frappeur est près du filet : l'IA en déduit qu'elle y reste.
    const volley = Math.abs(positions[hitter].z) < this.profile.rally.volleyZone;
    this.hit(hitter, kind, contact, target, perfect, 0, volley, false, false, overhead ? { overhead, error } : { error });
  }

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
    this.exit = null;
    for (const player of this.players) player.engagement = null;
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
      this.tick - Math.max(player.lastHitTick, player.lastWhiffTick) >= r.recoverTime / SIM_DT
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
          plan: null,
          manual: player.assist === 'off',
          pressStick: cmd.stick,
        };
      }
    }

    const engagement = player.engagement;
    const magnet = player.assist === 'magnet';
    if (engagement && this.isReceiving(index) && this.ball) {
      const plan = engagement.plan;
      // Aimant : tant que l'impact n'est pas imminent, le point choisi suit le joueur qui court.
      // Point hors d'atteinte (lob par-dessus un joueur au filet) : recalculé en chemin, tous modes.
      const replan =
        plan !== null &&
        (magnet || !plan.reachable) &&
        engagement.releaseTick === null &&
        (plan.tick - this.tick) * SIM_DT > r.aimWindow &&
        (this.tick - engagement.pressTick) % REPLAN_TICKS === 0;
      if (!plan || replan) {
        const plan = (overhead: boolean): Intercept | null =>
          planIntercept(
            this.ball!,
            player.pos,
            player.side,
            this.tick,
            this.profile,
            magnet ? r.magnetNear : 0,
            this.bounces > 0,
            overhead,
            player.height,
            engagement.pressStick.forward >= r.overheadStick,
          );
        engagement.plan = plan(engagement.kind === 'overhead');
        // B sur une balle qui ne monte pas assez : coup défensif, préparé comme un coup normal.
        if (engagement.kind === 'overhead' && !engagement.plan?.reachable) {
          const low = plan(false);
          if (low?.reachable || !engagement.plan) engagement.plan = low;
        }
      }
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
    const target = engagement?.plan?.stand;
    const gap = target ? pathDistance(player.pos, target, player.side) : 0;
    // Aimant : loin du point d'impact, c'est le stick qui déplace le joueur.
    if (engagement && !engagement.manual && (!magnet || (target && gap <= r.magnetRadius))) {
      // Vitesse qui permet encore de s'arrêter pile sur le point ; pour sortir ou rentrer, par la porte.
      const speed = Math.min(t.maxSpeed, Math.sqrt(2 * t.deceleration * gap));
      const next = target ? waypoint(player.pos, target, player.side) : null;
      const leg = next ? flatDistance(next, player.pos) : 0;
      desired =
        next && leg > 1e-3
          ? vec3(((next.x - player.pos.x) / leg) * speed, 0, ((next.z - player.pos.z) / leg) * speed)
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
      desired = this.towardDoor(player, desired);
    }

    // Inertie : la vitesse se rapproche de la cible à accélération bornée.
    const dx = desired.x - player.vel.x;
    const dz = desired.z - player.vel.z;
    const change = Math.sqrt(dx * dx + dz * dz);
    const speeding = length(desired) >= length(player.vel);
    const maxChange = (speeding ? t.acceleration : t.deceleration) * SIM_DT;
    let vel = desired;
    if (change > maxChange) vel = vec3(player.vel.x + (dx / change) * maxChange, 0, player.vel.z + (dz / change) * maxChange);

    const moved = moveWithin(player.pos, addScaled(player.pos, vel, SIM_DT), player.side, t.radius);
    // Contre un mur ou le filet, la vitesse dans cette direction tombe à zéro.
    player.vel = vec3((moved.x - player.pos.x) / SIM_DT, 0, (moved.z - player.pos.z) / SIM_DT);
    player.pos = vec3(moved.x, 0, moved.z);
  }

  /**
   * Aide à franchir la porte au stick : contre le mur latéral, près de la porte, pousser vers le mur
   * (pour sortir) ou vers le terrain (pour rentrer) fait glisser le joueur jusqu'à l'embrasure.
   */
  private towardDoor(player: DuelPlayer, desired: Vec3): Vec3 {
    const { pos, side } = player;
    const radius = this.profile.player.radius;
    const sign = Math.sign(pos.x || 1);
    const outward = desired.x * sign;
    const nearWall = Math.abs(Math.abs(pos.x) - HALF_WIDTH) < radius + 0.15;
    const offset = side * DOOR_MID - pos.z;
    const pushing = inCourt(pos, side, radius) ? outward > 0.5 : outsideCourt(pos) && outward < -0.5;
    if (!nearWall || !pushing || Math.abs(offset) > 1.5 || Math.abs(offset) < 0.05) return desired;
    const speed = this.profile.player.maxSpeed * 0.8;
    return vec3(desired.x, 0, Math.sign(offset) * Math.min(speed, Math.abs(offset) * 12));
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
    // Pas de service au-dessus de la tête : B sert comme A.
    const kind = toss.kind === 'overhead' ? 'normal' : toss.kind;
    this.hit(this.server, kind, ball.pos, target, perfect, timing, false, true, false);
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
   * Frappe au relâcher (GAME_DESIGN.md §4) : la raquette part quand le bouton est relâché et reste
   * active `swingWindow` secondes. La balle est frappée au premier pas où elle est jouable à portée,
   * de volée ou après rebond, partout dans le camp du joueur. Si elle ne vient pas, coup dans le
   * vide : le joueur peut réarmer. Le timing se lit sur la balle : l'écart entre ce pas et son
   * passage au point idéal (à côté du joueur). En avance : coup normal ; autour : frappe parfaite ;
   * en retard : la balle part plus large et plus long ; au-delà de `lateWindow`, elle a passé le joueur.
   */
  private tryHit(index: 0 | 1): void {
    const player = this.players[index];
    const engagement = player.engagement;
    const ball = this.ball;
    if (!engagement || engagement.releaseTick === null || !ball || !this.isReceiving(index)) return;
    const r = this.profile.rally;
    // Au-dessus de la tête : la balle se prend haute, à la hauteur prévue par la course assistée.
    const overhead = engagement.kind === 'overhead';
    const plannedHigh = overhead && (engagement.plan?.contact.y ?? 0) >= r.overheadLow;
    // Balle haute relâchée en retard : descendue sous la zone du coup haut, le joueur fait quand même son
    // geste (trop bas : filet), tant qu'elle n'est pas tombée sous les épaules.
    const high = overhead && (ball.pos.y >= r.overheadLow || (plannedHigh && ball.pos.y >= r.overheadMissLow));
    // Hauteur de référence du timing : celle du coup joué. Remate : bras tendu (`overheadIdeal`), plus haut et
    // plus tôt que le point prévu par la course assistée (les yeux, pour la bandeja et la víbora).
    const smash = high && overheadKind(player.stick, ball.pos, this.profile, this.bounces > 0 && this.touchedGlass) === 'remate';
    const ideal = !high ? null : smash ? r.overheadIdeal : Math.max(r.overheadLow, engagement.plan?.contact.y ?? bandejaHeight(this.profile, player.height));
    const { timing, miss } = contactTiming(ball, player, high ? r.overheadLateral : r.standLateral, ideal);
    const heightOk = ball.pos.y >= r.hitLow && ball.pos.y <= (overhead ? r.overheadHigh : r.hitHigh);
    const reach = r.reach * (timing > 0 ? r.lateReach : 1);
    const lateWindow = high ? r.overheadLateWindow : r.lateWindow;
    const playable =
      // Sortie avant le rebond : faute, déjà jugée. Après le rebond, elle se rattrape dehors.
      !(ball.out && this.bounces === 0) &&
      // Le service doit rebondir avant d'être renvoyé.
      !(this.hits === 1 && this.bounces === 0) &&
      ball.pos.z * player.side > 0 &&
      heightOk &&
      flatDistance(ball.pos, player.pos) <= reach &&
      timing <= lateWindow;
    if (!playable) {
      if ((this.tick - engagement.releaseTick) * SIM_DT >= r.swingWindow) this.whiff(index);
      return;
    }
    const volley = this.bounces === 0;
    const outside = outsideCourt(ball.pos);
    // Dehors, on renvoie la balle en lob par-dessus le mur ; B sur une balle basse : coup défensif, coupé.
    const kind: ShotKind = high && !outside ? 'overhead' : outside ? 'lob' : engagement.kind === 'overhead' ? 'slice' : engagement.kind;
    // Balle verte, jaune ou rouge : sous pression, la sous-fenêtre parfaite rétrécit (réflexes).
    const pressure = this.pressureOf(index, kind, ball.pos.y, Math.sqrt(ball.vel.x ** 2 + ball.vel.z ** 2), length(player.vel));
    const shrink = 1 - r.pressure.windowShrink * r.pressure.scale * pressure;
    const perfect = timing >= -r.perfectBefore * shrink && timing <= r.perfectAfter * shrink && miss <= r.sweetSpot;
    // Erreur du coup : pression, timing, et balle trop loin du point idéal.
    let error = shotError(pressure, timing, miss, perfect, this.profile);
    if (kind === 'overhead') {
      error *= r.pressure.overheadFactor;
      const variant = overheadKind(player.stick, ball.pos, this.profile, this.bounces > 0 && this.touchedGlass);
      // Bandeja et víbora : la hauteur de frappe compte (trop haute, elle rebondit ; trop basse, filet).
      const heightOff = variant === 'bandeja' || variant === 'vibora' ? overheadHeightOff(ball.pos.y, this.profile, player.height) : 0;
      // Bandeja et víbora : la hauteur fait la frappe parfaite (aux yeux, alignée), pas le moment prévu
      // par la course assistée, qui vise la hauteur du remate près du filet.
      const byHeight = variant === 'bandeja' || variant === 'vibora';
      const clean = byHeight ? heightOff === 0 && miss <= r.sweetSpot : perfect;
      let aimed = overheadTarget(variant, player.side, player.stick, clean, this.profile, ball.pos.x);
      if (heightOff > 0) {
        const depth = Math.min(HALF_LENGTH_SAFE, Math.abs(aimed.z) + heightOff * r.overheadHighDepth);
        aimed = vec3(aimed.x, aimed.y, -player.side * depth);
      }
      const target = byHeight ? aimed : lateDrift(aimed, player.side, timing, this.profile);
      this.hit(index, kind, ball.pos, target, clean, timing, volley, false, engagement.manual, { overhead: variant, pressure, error, heightOff });
      return;
    }
    // Toucher : volée coupée sur une balle flottante, chiquita au stick vers soi, ou blocage sans préparation.
    const prepared = (this.tick - engagement.pressTick) * SIM_DT;
    const style = shotStyle(kind, volley, outside, player.stick, prepared, this.profile);
    // La volée coupée demande du temps : pressée, elle rate plus souvent (plus haute, plus longue).
    if (style === 'cut') error = Math.min(1, error * (1 + r.pressure.cutRush * pressure));
    const tuning = style === 'cut' || style === 'chiquita' ? style : kind;
    const bonus = (engagement.manual ? r.manualAimBonus : 1) * (volley ? r.volleyWidth : 1) * (style === 'block' ? r.blockWidth : 1);
    let aimed = aimTarget(tuning, player.side, player.stick, perfect, this.profile, bonus);
    // Lob sur une balle rouge, ou relâché trop tôt : il raccourcit, et devient une balle de smash.
    if (kind === 'lob' && error > 0) aimed = vec3(aimed.x, aimed.y, aimed.z + player.side * error * r.pressure.lobShort);
    // Coup mal frappé ou sous pression : il part long (vers la vitre adverse, la faute de fond de court).
    else if (!outside && error > 0) aimed = vec3(aimed.x, aimed.y, aimed.z - player.side * error * r.pressure.long);
    const target = lateDrift(aimed, player.side, timing, this.profile);
    this.hit(index, kind, ball.pos, target, perfect, timing, volley, false, engagement.manual, { outside, pressure, error, style, prepared });
  }

  /**
   * Pression de la balle que le joueur `index` frappe, ou va frapper : temps depuis la frappe adverse,
   * hauteur et vitesse de la balle, course du joueur, coin.
   */
  pressureOf(index: 0 | 1, kind: ShotKind, height: number, speed: number, running: number, tick = this.tick): number {
    const opponent = this.players[index === 0 ? 1 : 0];
    const doubleGlass = this.glassWalls.length >= 2;
    // Un coup frappé fort met la pression même après la vitre, qui le ralentit : on garde une part de sa vitesse de départ.
    const struck = (opponent.lastHit?.speed ?? 0) * this.profile.rally.pressure.struckSpeed;
    const felt = Math.max(speed, struck);
    return ballPressure({ prep: (tick - opponent.lastHitTick) * SIM_DT, height, speed: felt, running, doubleGlass, kind }, this.profile);
  }

  /**
   * Moment idéal pour relâcher un coup haut préparé : quand la balle redescend à hauteur des yeux
   * (bandeja, víbora), ou plus haut pour le remate (`smash` : stick vers l'avant, à l'appui ou maintenant).
   * `null` hors coup haut.
   */
  overheadReleaseTick(
    index: 0 | 1,
    smash = this.players[index].stick.forward >= this.profile.rally.overheadStick ||
      (this.players[index].engagement?.pressStick.forward ?? 0) >= this.profile.rally.overheadStick,
  ): number | null {
    const player = this.players[index];
    const plan = player.engagement?.plan;
    const ball = this.ball;
    if (player.engagement?.kind !== 'overhead' || !plan || !ball) return null;
    const r = this.profile.rally;
    // Balle trop basse pour un coup haut : préparé comme un coupé, au point prévu.
    if (plan.contact.y < r.overheadLow) return plan.tick;
    const target = smash ? r.overheadIdeal : bandejaHeight(this.profile, player.height);
    if (Math.abs(plan.contact.y - target) <= r.overheadBand) return plan.tick;
    if (ball.vel.y < 0 && ball.pos.y <= target) return this.tick;
    const ticks = ticksToHeight(ball, target, this.profile);
    return ticks === null ? plan.tick : this.tick + ticks;
  }

  /** Pression prévue pour le coup préparé (point d'impact de la course assistée), pour l'affichage. */
  plannedPressure(index: 0 | 1): number | null {
    const engagement = this.players[index].engagement;
    const plan = engagement?.plan;
    if (!engagement || !plan || !this.ball) return null;
    const speed = Math.sqrt(this.ball.vel.x ** 2 + this.ball.vel.z ** 2);
    const kind = engagement.kind === 'overhead' && plan.contact.y < this.profile.rally.overheadLow ? 'slice' : engagement.kind;
    return this.pressureOf(index, kind, plan.contact.y, speed, 0, plan.tick);
  }

  /** Coup dans le vide : relâché sans balle à portée. Le joueur peut réarmer. */
  private whiff(index: 0 | 1): void {
    const player = this.players[index];
    player.lastWhiffKind = player.engagement?.kind ?? null;
    const plan = player.engagement?.plan;
    player.lastWhiffLate = plan !== null && plan !== undefined && (player.engagement?.releaseTick ?? 0) > plan.tick;
    player.engagement = null;
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
    extra: HitExtra = {},
  ): void {
    const player = this.players[index];
    const r = this.profile.rally;
    const { overhead = null, outside = false, pressure = 0, error = 0, style = null, prepared = Infinity, heightOff = 0 } = extra;
    const tuning: ShotTuningKey = overhead ?? (style === 'cut' || style === 'chiquita' ? style : kind === 'overhead' ? 'bandeja' : kind);
    const touch = style === 'cut' || style === 'chiquita';
    const base = kind === 'lob' || overhead || touch ? 1 : volley ? r.volleySpeed : this.touchedGlass ? r.glassSpeed : 1;
    // Préparation : sans temps pour armer, on ne fait que bloquer ; armé assez tôt, le coup part plein.
    const speedFactor = base * (1 - r.pressure.speedLoss * error) * (touch || kind === 'lob' ? 1 : preparation(prepared, this.profile));
    // Au padel, la volée se joue coupée : la balle reste basse, même après la vitre.
    const spin = volley && kind === 'normal' && !touch ? r.volleySpin : null;
    const spinScale = 1 - Math.max(0, heightOff) * r.overheadHighSpin;
    const solved = solveShot(tuning, contact, target, perfect, this.profile, speedFactor, error * r.pressure.clearance, spin, spinScale);
    const ball = this.ball!;
    // Prise trop basse : la balle part plus à plat, vers le filet. Coup haut sous la hauteur des yeux, ou
    // balle ramassée aux pieds et mal frappée.
    const p = r.pressure;
    const scooped = !overhead && kind !== 'lob' && contact.y < p.netLow ? Math.max(0, (error - 0.5) / 0.5) * p.netDip : 0;
    const dip = Math.max(0, -heightOff) * r.overheadLowDip + scooped;
    ball.vel = dip > 0 ? vec3(solved.vel.x, solved.vel.y - dip, solved.vel.z) : solved.vel;
    ball.spin = solved.spin;
    // Renvoyée de dehors, la balle rentre par-dessus le mur : les murs ne la gênent qu'une fois rentrée.
    ball.out = false;
    this.exit = null;
    player.engagement = null;
    player.lastHitTick = this.tick;
    this.lastHitter = index;
    this.bounces = 0;
    this.touchedNet = false;
    this.touchedGlass = false;
    this.glassWalls = [];
    this.hits++;
    this.shot = player.lastHit = {
      player: index,
      kind,
      overhead,
      outside,
      perfect,
      timing,
      contact,
      target,
      speed: length(solved.vel),
      volley,
      serve,
      manual,
      pressure,
      error,
      style,
      heightOff,
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
      // Sortie après le rebond : point pour le frappeur quand elle touche le sol dehors, sauf si
      // l'adversaire l'a rattrapée avant (salida de pista).
      if (this.exit && contact.surface === 'ground') {
        const side = this.exit.wall === 'sidePosX' || this.exit.wall === 'sideNegX';
        return this.endPoint(hitter, side ? 'por-tres' : 'por-cuatro');
      }
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
          // Balle renvoyée de dehors qui retombe hors du terrain : sortie.
          if (outsideCourt(contact.pos) && this.bounces === 0) return this.endPoint(receiver, 'out');
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
          if (contact.wall && !this.glassWalls.includes(contact.wall)) this.glassWalls.push(contact.wall);
          // Sa propre vitre est permise ; celle d'en face seulement après le rebond.
          if (!hitterHalf && this.bounces === 0) return this.endPoint(receiver, 'opponent-wall');
          break;
        case 'mesh':
          if (this.bounces === 0) return this.endPoint(receiver, hitterHalf ? 'own-mesh' : 'opponent-wall');
          break;
        case 'out':
          if (this.bounces === 0) return this.endPoint(receiver, 'out');
          this.exit = this.lastExit = { hitter, wall: contact.wall ?? 'backFar', tick: this.tick, pos: contact.pos };
          break;
      }
    }
  }
}
