import { flatDistance, planIntercept, runTime, ticksToHeight, type Intercept } from './assist';
import { createBall, type Ball } from './ball';
import { stepBall, type Contact } from './collisions';
import { NEUTRAL_ARCADE, type ArcadeCommands, type OverheadKind, type ShotKind, type SwingEnd } from './commands';
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
  /** Coup joué au stick droit (`ArcadeCommands.swing`) : préparation, et fin du geste une fois connue. */
  swing?: { prepared: boolean; end?: SwingEnd };
}

/**
 * Seuil des coups au-dessus de la tête au stick droit : les épaules (par défaut), les yeux ou le dessus de la
 * tête. Au-dessus, bandeja, víbora, smash ou feinte ; en dessous, volée ou coup au sol.
 * `lob` (à l'essai) : coups hauts aux épaules, mais seulement sur une balle qui vient d'un lob ; toute autre
 * balle se joue de volée ou au sol, aux boutons comme au stick, IA comprise.
 */
export type HighFloor = 'epaules' | 'yeux' | 'tete' | 'lob';

/** Équipe : 0 (bleus, camp Z négatif) ou 1 (rouges). Le joueur `i` est dans l'équipe `i % 2`. */
export type Team = 0 | 1;
export const teamOf = (index: number): Team => (index % 2 === 0 ? 0 : 1);
export const otherTeam = (team: Team): Team => (team === 0 ? 1 : 0);

/** Simple (1 contre 1) ou double (2 contre 2, GAME_DESIGN.md §12, étape C). */
export type DuelFormat = 'simple' | 'double';

/**
 * Côté du joueur dans sa paire, vu du joueur qui regarde le filet : droite (drive) ou gauche (revés).
 * Il le garde tout le match ; c'est aussi le côté d'où il reçoit le service (`research/tactique/TACTIQUE_2V2.md` §3.0).
 */
export type Half = 'right' | 'left';

/** Annonce entre partenaires, affichée au-dessus du joueur : « ¡Mía! », « ¡Tuya! ». */
export type CallKind = 'mia' | 'tuya';

export interface DuelPlayer {
  side: CourtSide;
  team: Team;
  half: Half;
  /** Dernière annonce et son pas, ou `null`. */
  call: { kind: CallKind; tick: number } | null;
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
  player: number;
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
  touch = false,
): ShotStyle | null {
  const r = profile.rally;
  if (outside || (kind !== 'slice' && kind !== 'normal')) return null;
  if (prepared < r.blockPrep) return 'block';
  if (kind === 'slice' && volley) return 'cut';
  if (kind === 'slice' && (touch || stick.forward <= -r.overheadStick)) return 'chiquita';
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
  hitter: number;
  wall: WallId;
  tick: number;
  pos: Vec3;
}

export interface PointResult {
  /** Équipe gagnante (en simple, c'est aussi le numéro du joueur). */
  winner: Team;
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
/** En double : position latérale de base, au milieu de sa moitié (m), et profondeur du partenaire du serveur. */
export const DOUBLE_LATERAL = 1.6;
const SERVER_PARTNER_DEPTH = 2.6;
/** En double : profondeur du partenaire du receveur, un pas derrière la ligne de service (m). */
const RECEIVER_PARTNER_DEPTH = 7.4;
/** Ordre de service en double : un joueur de chaque équipe à tour de rôle (A1, B1, A2, B2). */
const DOUBLE_ROTATION = [0, 1, 2, 3] as const;
/** Deux partenaires ne se chevauchent pas : écart minimal entre leurs centres (m). */
const PARTNER_GAP = 0.75;
/** Bande centrale partagée entre partenaires, de part et d'autre du centre de la paire (m), et égalité d'arrivée (s). */
const MIDDLE_BAND = 0.7;
const MIDDLE_TIE = 0.15;
/** Attribution de la balle entre partenaires recalculée tous les ce nombre de pas. */
const OWNER_TICKS = 6;
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

function createDuelPlayer(index: number, format: DuelFormat): DuelPlayer {
  const team = teamOf(index);
  const side: CourtSide = team === 0 ? -1 : 1;
  // En double, les joueurs 0 et 1 jouent à droite, 2 et 3 à gauche.
  const half: Half = index < 2 ? 'right' : 'left';
  const lateral = format === 'double' ? (half === 'right' ? 1 : -1) * DOUBLE_LATERAL * rightFor(side).x : 0;
  const pos = vec3(lateral, 0, side * HOME_DEPTH);
  return {
    side,
    team,
    half,
    call: null,
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
  /** Joueurs : 2 en simple, 4 en double. Le joueur `i` est dans l'équipe `i % 2` (`teamOf`). */
  players: [DuelPlayer, DuelPlayer, ...DuelPlayer[]] = [] as unknown as [DuelPlayer, DuelPlayer];
  /** Seuil des coups au-dessus de la tête au stick droit (`?coupshauts=`). */
  highFloor: HighFloor = 'epaules';
  ball: Ball | null = null;
  prevBallPos: Vec3 | null = null;
  readonly contacts: Contact[] = [];
  phase: DuelPhase = 'serve';
  phaseTick = 0;
  server = 0;
  /** Receveur du service en cours : lui seul peut renvoyer le service. */
  receiver = 1;
  /** Dernier joueur à avoir frappé la balle en jeu. */
  lastHitter: number | null = null;
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

  /**
   * Attribution de la balle dans chaque équipe (`owner`), recalculée tous les `OWNER_TICKS` pas, ou plus tôt si la
   * balle a été frappée, a rebondi ou touché une vitre depuis.
   */
  private readonly ownerCache: ({ tick: number; key: string; owner: number } | null)[] = [null, null];

  /**
   * Règles du match, ou `null` en échange libre. Changées, elles s'appliquent à la prochaine partie (`restart`).
   * `format` : simple (2 joueurs) ou double (4 joueurs) ; changé, il s'applique aussi au `restart`.
   */
  constructor(
    public rules: MatchRules | null = null,
    public format: DuelFormat = 'simple',
  ) {
    this.restart();
  }

  get doubles(): boolean {
    return this.players.length === 4;
  }

  /** Partenaire du joueur `index` en double, sinon `null`. */
  partnerOf(index: number): number | null {
    return this.doubles ? (index + 2) % 4 : null;
  }

  /** Joueurs de l'équipe `team`. */
  teamPlayers(team: Team): number[] {
    return this.players.map((_, i) => i).filter((i) => teamOf(i) === team);
  }

  /** Nouvelle partie : score à zéro, premier service au joueur 0. */
  restart(): void {
    const count = this.format === 'double' ? 4 : 2;
    if (this.players.length !== count) {
      // Les réglages propres aux joueurs (assistance, taille) survivent au changement de format.
      const old = this.players;
      this.players = Array.from({ length: count }, (_, i): DuelPlayer => {
        const player = createDuelPlayer(i, this.format);
        const previous = old[i] ?? old[teamOf(i)];
        if (previous) {
          player.assist = previous.assist;
          player.height = previous.height;
        }
        return player;
      }) as [DuelPlayer, DuelPlayer, ...DuelPlayer[]];
    }
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

  /**
   * Le joueur `index` attend la balle : c'est à son équipe de frapper le prochain coup. En double, les deux
   * partenaires peuvent la jouer (le premier qui la touche), sauf le service, que seul le receveur renvoie.
   */
  isReceiving(index: number): boolean {
    if (this.phase !== 'rally' || this.lastHitter === null || teamOf(this.lastHitter) === teamOf(index)) return false;
    return !this.doubles || this.hits !== 1 || index === this.receiver;
  }

  /**
   * Qui doit prendre la balle dans l'équipe `team` qui la reçoit (`TACTIQUE_2V2.md` §3.0 et §3.4) : celui qui
   * s'est engagé le premier ; sinon le propriétaire de la moitié où elle se joue ; au milieu, celui qui arrive
   * nettement le premier, sinon le joueur de gauche (son coup droit est au centre) ; si celui-là ne peut pas
   * l'atteindre et son partenaire si, le partenaire (cambio). En simple, le joueur de l'équipe ; `null` hors
   * échange. Les IA partenaires s'en servent pour ne pas se gêner ; un humain reste libre de la prendre.
   */
  owner(team: Team): number | null {
    if (this.phase !== 'rally' || !this.ball || this.lastHitter === null || teamOf(this.lastHitter) === team) return null;
    if (!this.doubles) return team;
    if (this.hits === 1) return this.receiver;
    const [a, b] = this.teamPlayers(team) as [number, number];
    const pa = this.players[a]!;
    const pb = this.players[b]!;
    if (pa.engagement && !pb.engagement) return a;
    if (pb.engagement && !pa.engagement) return b;
    if (pa.engagement && pb.engagement) return pa.engagement.pressTick <= pb.engagement.pressTick ? a : b;
    const key = `${this.hits}:${this.bounces}:${this.glassWalls.length}`;
    const cached = this.ownerCache[team];
    if (cached && cached.key === key && this.tick - cached.tick < OWNER_TICKS) return cached.owner;
    const owner = this.computeOwner(a, b);
    this.ownerCache[team] = { tick: this.tick, key, owner };
    return owner;
  }

  private computeOwner(a: number, b: number): number {
    const pa = this.players[a]!;
    const pb = this.players[b]!;
    const side = pa.side;
    const right = rightFor(side).x;
    const planOf = (p: DuelPlayer): Intercept | null =>
      planIntercept(this.ball!, p.pos, p.side, this.tick, this.profile, 0, this.bounces > 0, false, p.height);
    const plans = new Map([
      [a, planOf(pa)],
      [b, planOf(pb)],
    ]);
    // Joueur de gauche : le plus à gauche maintenant (après un cambio, les rôles suivent les places).
    const [left, rightPlayer] = pa.pos.x * right <= pb.pos.x * right ? [a, b] : [b, a];
    const contact = (plans.get(a) ?? plans.get(b))?.contact;
    if (!contact) return left;
    const offset = (contact.x - (pa.pos.x + pb.pos.x) / 2) * right;
    let owner: number;
    if (Math.abs(offset) > MIDDLE_BAND) owner = offset < 0 ? left : rightPlayer;
    else {
      const time = (i: number): number => {
        const plan = plans.get(i);
        return plan ? runTime(pathDistance(this.players[i]!.pos, plan.stand, side), this.profile) : Infinity;
      };
      const [tl, tr] = [time(left), time(rightPlayer)];
      owner = Math.abs(tl - tr) > MIDDLE_TIE ? (tl < tr ? left : rightPlayer) : left;
    }
    const mate = owner === a ? b : a;
    if (!plans.get(owner)?.reachable && plans.get(mate)?.reachable) owner = mate;
    return owner;
  }

  /** Position de la balle tenue par le serveur, avant le service : côté coup droit. */
  servePosition(): Vec3 {
    const player = this.players[this.server]!;
    return vec3(
      player.pos.x + rightFor(player.side).x * this.profile.rally.standLateral,
      SERVE_HEIGHT,
      player.pos.z + forwardFor(player.side).z * 0.25,
    );
  }

  step(commands: readonly ArcadeCommands[] = []): void {
    this.contacts.length = 0;
    this.shot = null;
    this.result = null;
    this.serveCall = null;

    for (let index = 0; index < this.players.length; index++) this.updatePlayer(index, commands[index] ?? NEUTRAL_ARCADE);
    if (this.doubles) this.separatePartners();

    if (this.ball) {
      this.prevBallPos = this.ball.pos;
      stepBall(this.ball, SIM_DT, this.profile, this.contacts);
    }
    if (this.phase === 'toss') {
      this.updateToss();
    } else if (this.phase === 'rally') {
      this.judge();
      for (let index = 0; index < this.players.length && this.phase === 'rally'; index++) this.tryHit(index);
      if (this.phase === 'rally' && this.tick - this.lastHitTick() > STALL_TIME / SIM_DT) {
        this.endPoint(teamOf(this.lastHitter ?? 0), 'not-returned');
      }
    } else if (this.phase === 'dead' && this.tick - this.phaseTick >= (this.replayServe ? FAULT_TIME : DEAD_TIME) / SIM_DT) {
      if (this.replayServe) this.startServe(this.server, false);
      else if (this.match?.winner != null) {
        this.phase = 'over';
        this.phaseTick = this.tick;
      } else this.startServe(this.nextServer());
    }
    this.tick++;
  }

  /**
   * Serveur du prochain point. En simple, celui du match (ou chacun son tour en échange libre). En double,
   * un joueur de chaque équipe à tour de rôle, à chaque jeu (A1, B1, A2, B2), en jeu décisif aussi.
   */
  private nextServer(): number {
    if (!this.doubles) return this.match ? this.match.server : this.server === 0 ? 1 : 0;
    const turn = this.match ? this.match.serveTurn : this.rallies;
    return DOUBLE_ROTATION[turn % 4]!;
  }

  private lastHitTick(): number {
    return Math.max(...this.players.map((p) => p.lastHitTick));
  }

  /** En double, deux partenaires qui se rentrent dedans s'écartent l'un de l'autre, chacun de la moitié. */
  private separatePartners(): void {
    const radius = this.profile.player.radius;
    for (const team of [0, 1] as const) {
      const [a, b] = this.teamPlayers(team).map((i) => this.players[i]!) as [DuelPlayer, DuelPlayer];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const gap = Math.sqrt(dx * dx + dz * dz);
      if (gap >= PARTNER_GAP) continue;
      // L'un exactement sur l'autre : on les écarte en largeur, chacun vers sa moitié.
      const toRight = rightFor(a.side).x;
      const [ux, uz] = gap > 1e-6 ? [dx / gap, dz / gap] : [a.half === 'right' ? -toRight : toRight, 0];
      const push = (PARTNER_GAP - gap) / 2;
      a.pos = moveWithin(a.pos, vec3(a.pos.x - ux * push, 0, a.pos.z - uz * push), a.side, radius);
      b.pos = moveWithin(b.pos, vec3(b.pos.x + ux * push, 0, b.pos.z + uz * push), b.side, radius);
    }
  }

  /** Prépare un service : nouveau point, ou service rejoué (second service, let). */
  /**
   * Labo de sensations : rejoue une situation de match. Les joueurs sont placés en `positions`, puis
   * `hitter` frappe le coup d'ouverture (`kind`, de `contact` vers `target`) comme en jeu ; le point se
   * joue ensuite normalement. Avec `kind` = `serve`, le point repart d'un service de `hitter`.
   */
  playSituation(
    hitter: number,
    positions: readonly Vec3[],
    /** `error` : coup raté exprès (balle plus haute et plus lente, comme une défense sous pression). */
    opening: { kind: ShotKind; contact: Vec3; target: Vec3; perfect?: boolean; overhead?: OverheadKind; error?: number } | 'serve',
  ): void {
    this.startServe(hitter);
    for (const [i, pos] of positions.entries()) {
      const player = this.players[i];
      if (!player) continue;
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
    const volley = Math.abs(positions[hitter]!.z) < this.profile.rally.volleyZone;
    this.hit(hitter, kind, contact, target, perfect, 0, volley, false, false, overhead ? { overhead, error } : { error });
  }

  private startServe(server: number, newPoint = true): void {
    this.phase = 'serve';
    this.phaseTick = this.tick;
    this.server = server;
    this.replayServe = false;
    if (newPoint) this.serveNumber = 1;
    this.serveSide = this.match ? this.match.serveSide : this.rallies % 2 === 0 ? 'right' : 'left';
    // Serveur et receveur prennent place en diagonale. En double, reçoit le joueur adverse de ce côté.
    const serverSide = this.players[server]!.side;
    const spots = servePositions(serverSide, this.serveSide, this.profile);
    const receiving = otherTeam(teamOf(server));
    const receiver = this.doubles ? this.teamPlayers(receiving).find((i) => this.players[i]!.half === this.serveSide)! : receiving;
    this.receiver = receiver;
    const places: [number, Vec3][] = [
      [server, spots.server],
      [receiver, spots.receiver],
    ];
    // Personne ne change de côté, même au service : le partenaire du serveur attend au filet dans sa propre moitié
    // (devant le serveur quand celui-ci sert du côté du partenaire ; le serveur rejoint ensuite la sienne). Celui du
    // receveur attend dans la sienne, un pas derrière la ligne de service.
    const ownHalf = (index: number, depth: number): Vec3 => {
      const player = this.players[index]!;
      const lateral = (player.half === 'right' ? 1 : -1) * DOUBLE_LATERAL * rightFor(player.side).x;
      return vec3(lateral, 0, player.side * depth);
    };
    const partnerServer = this.partnerOf(server);
    const partnerReceiver = this.partnerOf(receiver);
    if (partnerServer !== null) places.push([partnerServer, ownHalf(partnerServer, SERVER_PARTNER_DEPTH)]);
    if (partnerReceiver !== null) places.push([partnerReceiver, ownHalf(partnerReceiver, RECEIVER_PARTNER_DEPTH)]);
    for (const [index, pos] of places) {
      const player = this.players[index]!;
      player.pos = player.prevPos = pos;
      player.vel = vec3(0, 0, 0);
      player.call = null;
    }
    this.toss = null;
    this.ball = null;
    this.prevBallPos = null;
    this.lastHitter = null;
    this.hits = 0;
    this.exit = null;
    for (const player of this.players) player.engagement = null;
  }

  private endPoint(winner: Team, reason: PointReason): void {
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

  private updatePlayer(index: number, cmd: ArcadeCommands): void {
    const player = this.players[index]!;
    const r = this.profile.rally;
    player.prevPos = player.pos;
    player.stick = cmd.stick;
    const pressed = cmd.shot !== null && cmd.shot !== player.heldShot ? cmd.shot : null;
    player.heldShot = cmd.shot;
    if (cmd.call) player.call = { kind: cmd.call, tick: this.tick };
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
        if (cmd.swing) player.engagement.swing = { ...cmd.swing };
        else delete player.engagement.swing;
      } else {
        // En double, s'engager sur une balle à recevoir, c'est l'annoncer à son partenaire.
        if (this.doubles && this.isReceiving(index)) player.call = { kind: 'mia', tick: this.tick };
        player.engagement = {
          kind: pressed,
          pressTick: this.tick,
          releaseTick: null,
          plan: null,
          manual: player.assist === 'off',
          pressStick: cmd.stick,
          ...(cmd.swing ? { swing: { ...cmd.swing } } : {}),
        };
      }
    }

    const engagement = player.engagement;
    // Fin du geste au stick droit : connue au relâcher.
    if (engagement?.swing && cmd.swing?.end) engagement.swing.end = cmd.swing.end;
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
            this.rematePrepared(index),
          );
        engagement.plan = plan(engagement.kind === 'overhead');
        // Balle qui ne monte pas assez pour un coup haut (B, ou geste au stick) : préparé comme un coup au sol
        // ou une volée.
        const belowFloor = (engagement.plan?.contact.y ?? 0) < this.overheadFloor(engagement, player.height);
        if (engagement.swing && engagement.plan?.reachable && !belowFloor) {
          // Au stick, le coup se choisit selon la balle : on prend la première balle jouable. Au-dessus de la
          // tête si elle y passe d'abord (un lob) ; sinon au sol ou de volée, plutôt que d'attendre qu'elle
          // remonte en sortant de la vitre.
          // Après un rebond, au sol aussi, sauf si elle remonte vraiment haut (au moins aux yeux : un lob qui
          // rebondit très haut, joué en bajada près de la vitre).
          const low = plan(false);
          const reallyHigh = engagement.plan.contact.y >= this.overheadFloor(engagement, player.height, !engagement.plan.volley);
          if (low?.reachable && (low.tick < engagement.plan.tick || !reallyHigh)) engagement.plan = low;
        } else if (engagement.kind === 'overhead' && (!engagement.plan?.reachable || belowFloor)) {
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
    const player = this.players[this.server]!;
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
    if (reason && this.serveNumber === 2) return this.endPoint(otherTeam(teamOf(this.server)), 'double-fault');
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
  private tryHit(index: number): void {
    const player = this.players[index]!;
    const engagement = player.engagement;
    const ball = this.ball;
    if (!engagement || engagement.releaseTick === null || !ball || !this.isReceiving(index)) return;
    const r = this.profile.rally;
    // Au-dessus de la tête : la balle se prend haute, à la hauteur prévue par la course assistée.
    const overhead = engagement.kind === 'overhead';
    const plannedHigh = overhead && (engagement.plan?.contact.y ?? 0) >= this.overheadFloor(engagement, player.height);
    // Balle haute relâchée en retard : descendue sous la zone du coup haut, le joueur fait quand même son
    // geste (trop bas : filet), tant qu'elle n'est pas tombée sous les épaules.
    // Au stick, seulement en retard (le moment prévu est passé) : avant, la balle basse se joue comme elle vient.
    const late = !engagement.swing || (engagement.plan !== null && this.tick >= engagement.plan.tick);
    const high =
      overhead && (ball.pos.y >= this.overheadFloor(engagement, player.height) || (plannedHigh && late && ball.pos.y >= r.overheadMissLow));
    // Hauteur de référence du timing : celle du coup joué. Remate : bras tendu (`overheadIdeal`), plus haut et
    // plus tôt que le point prévu par la course assistée (les yeux, pour la bandeja et la víbora).
    const smash = high && this.overheadVariant(index, ball.pos) === 'remate';
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
    const kind: ShotKind = high && !outside ? 'overhead' : outside ? 'lob' : this.lowShotKind(engagement, volley);
    // Balle verte, jaune ou rouge : sous pression, la sous-fenêtre parfaite rétrécit (réflexes).
    const pressure = this.pressureOf(index, kind, ball.pos.y, Math.sqrt(ball.vel.x ** 2 + ball.vel.z ** 2), length(player.vel));
    const shrink = 1 - r.pressure.windowShrink * r.pressure.scale * pressure;
    const perfect = timing >= -r.perfectBefore * shrink && timing <= r.perfectAfter * shrink && miss <= r.sweetSpot;
    // Erreur du coup : pression, timing, et balle trop loin du point idéal.
    let error = shotError(pressure, timing, miss, perfect, this.profile);
    if (kind === 'overhead') {
      error *= r.pressure.overheadFactor;
      const variant = this.overheadVariant(index, ball.pos);
      // Bandeja et víbora : la hauteur fait la frappe parfaite (aux yeux, alignée), pas le moment prévu par la
      // course assistée, qui vise la hauteur du remate près du filet. Au stick, la víbora est préparée comme le
      // smash : elle se juge au moment, comme lui.
      const byHeight = variant === 'bandeja' || (variant === 'vibora' && !engagement.swing);
      // Bandeja et víbora : la hauteur de frappe compte (trop haute, elle rebondit ; trop basse, filet).
      const heightOff = byHeight ? overheadHeightOff(ball.pos.y, this.profile, player.height) : 0;
      const clean = byHeight ? heightOff === 0 && miss <= r.sweetSpot : perfect;
      // Smash au stick joué loin du filet : il ne sort pas du terrain (pas de por tres), l'adversaire peut contrer.
      const far = variant === 'remate' && Math.abs(ball.pos.z) > r.remateZone;
      let aimed = overheadTarget(variant, player.side, player.stick, clean && !far, this.profile, ball.pos.x);
      if (heightOff > 0) {
        const depth = Math.min(HALF_LENGTH_SAFE, Math.abs(aimed.z) + heightOff * r.overheadHighDepth);
        aimed = vec3(aimed.x, aimed.y, -player.side * depth);
      }
      const target = byHeight ? aimed : lateDrift(aimed, player.side, timing, this.profile);
      this.hit(index, kind, ball.pos, target, clean, timing, volley, false, engagement.manual, {
        overhead: variant,
        pressure,
        error,
        heightOff,
      });
      return;
    }
    // Toucher : volée coupée sur une balle flottante, chiquita (stick vers soi, ou geste lâché), ou blocage sans
    // préparation (au stick : le coup sec, sans tirer le stick vers soi).
    const prepared = engagement.swing && !engagement.swing.prepared ? 0 : (this.tick - engagement.pressTick) * SIM_DT;
    const style = shotStyle(kind, volley, outside, player.stick, prepared, this.profile, engagement.swing?.end === 'letGo');
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
  pressureOf(index: number, kind: ShotKind, height: number, speed: number, running: number, tick = this.tick): number {
    // L'adversaire qui a frappé la balle ; avant le premier coup, le premier joueur de l'autre équipe.
    const team = teamOf(index);
    const opponent =
      this.lastHitter !== null && teamOf(this.lastHitter) !== team ? this.players[this.lastHitter]! : this.players[otherTeam(team)]!;
    const doubleGlass = this.glassWalls.length >= 2;
    // Un coup frappé fort met la pression même après la vitre, qui le ralentit : on garde une part de sa vitesse de départ.
    const struck = (opponent.lastHit?.speed ?? 0) * this.profile.rally.pressure.struckSpeed;
    const felt = Math.max(speed, struck);
    return ballPressure({ prep: (tick - opponent.lastHitTick) * SIM_DT, height, speed: felt, running, doubleGlass, kind }, this.profile);
  }

  /** Seuil des coups au-dessus de la tête au stick droit (`?coupshauts=`), pour un joueur de cette taille (m). */
  swingFloor(playerHeight: number): number {
    if (!this.overheadAllowed()) return Infinity;
    if (this.highFloor === 'tete') return playerHeight;
    if (this.highFloor === 'yeux') return bandejaHeight(this.profile, playerHeight);
    return this.profile.rally.overheadLow * (playerHeight / PLAYER_HEIGHT);
  }

  /** Seuil `lob` : un coup haut ne se joue que sur la balle d'un lob (la dernière frappe en jeu). */
  private overheadAllowed(): boolean {
    if (this.highFloor !== 'lob') return true;
    const hitter = this.lastHitter === null ? null : this.players[this.lastHitter];
    return hitter?.lastHit?.kind === 'lob';
  }

  /**
   * Hauteur à partir de laquelle un coup haut préparé se joue au-dessus de la tête : les épaules pour B, le seuil
   * réglé au stick. Au stick, après un rebond, au moins les yeux : une balle de fond qui ressort de la vitre à
   * hauteur d'épaules se joue au sol ; un lob qui rebondit très haut, en bajada.
   */
  private overheadFloor(engagement: Engagement, playerHeight: number, bounced = this.bounces > 0): number {
    if (!engagement.swing) return this.overheadAllowed() ? this.profile.rally.overheadLow : Infinity;
    const floor = this.swingFloor(playerHeight);
    return bounced ? Math.max(floor, bandejaHeight(this.profile, playerHeight) - 0.02) : floor;
  }

  /**
   * Coup joué sur une balle qui n'est pas haute :
   * - B sur une balle basse : coup défensif, coupé ;
   * - au stick droit : de volée, volée coupée si préparée (bloquée sinon, faute de préparation) ; après le
   *   rebond, coup normal (tout droit, ou sans préparation : moins fort), lob (en arc), chiquita (lâché).
   */
  private lowShotKind(engagement: Engagement, volley: boolean): ShotKind {
    const swing = engagement.swing;
    if (swing) {
      if (volley) return swing.prepared ? 'slice' : 'normal';
      if (!swing.prepared) return 'normal';
      return swing.end === 'arc' ? 'lob' : swing.end === 'letGo' ? 'slice' : 'normal';
    }
    if (engagement.kind === 'overhead') return 'slice';
    return engagement.kind;
  }

  /**
   * Remate préparé : au stick, tout geste préparé (smash, víbora, feinte : même préparation) ; sinon stick vers
   * l'avant à l'appui (ou maintenant, avec `now`). La course assistée vise alors la hauteur du remate.
   */
  rematePrepared(index: number, now = false): boolean {
    const player = this.players[index]!;
    const swing = player.engagement?.swing;
    if (swing) return swing.prepared;
    const r = this.profile.rally;
    return (now && player.stick.forward >= r.overheadStick) || (player.engagement?.pressStick.forward ?? 0) >= r.overheadStick;
  }

  /**
   * Variante du coup haut joué en `contact`. Au stick droit : sans préparation, bandeja ; préparé, smash (tout
   * droit ; bajada sur la balle sortie de la vitre), víbora (en arc), feinte (lâché). Sinon, d'après le stick
   * de déplacement.
   */
  overheadVariant(index: number, contact: Vec3): OverheadKind {
    const player = this.players[index]!;
    const swing = player.engagement?.swing;
    const afterGlass = this.bounces > 0 && this.touchedGlass;
    if (swing) {
      if (!swing.prepared) return 'bandeja';
      if (swing.end === 'arc') return 'vibora';
      if (swing.end === 'letGo') return 'feinte';
      return afterGlass ? 'bajada' : 'remate';
    }
    return overheadKind(player.stick, contact, this.profile, afterGlass);
  }

  /**
   * Moment idéal pour relâcher un coup haut préparé : quand la balle redescend à hauteur des yeux
   * (bandeja, víbora), ou plus haut pour le remate (`smash` : stick vers l'avant, à l'appui ou maintenant).
   * `null` hors coup haut.
   */
  overheadReleaseTick(index: number, smash = this.rematePrepared(index, true)): number | null {
    const player = this.players[index]!;
    const plan = player.engagement?.plan;
    const ball = this.ball;
    if (player.engagement?.kind !== 'overhead' || !plan || !ball) return null;
    const r = this.profile.rally;
    // Balle trop basse pour un coup haut : préparé comme un coupé, au point prévu. Au stick, un coup préparé se
    // finit au point prévu par la course assistée (bras tendu près du filet).
    if (plan.contact.y < r.overheadLow || player.engagement.swing?.prepared) return plan.tick;
    const target = smash ? r.overheadIdeal : bandejaHeight(this.profile, player.height);
    if (Math.abs(plan.contact.y - target) <= r.overheadBand) return plan.tick;
    if (ball.vel.y < 0 && ball.pos.y <= target) return this.tick;
    const ticks = ticksToHeight(ball, target, this.profile);
    return ticks === null ? plan.tick : this.tick + ticks;
  }

  /** Pression prévue pour le coup préparé (point d'impact de la course assistée), pour l'affichage. */
  plannedPressure(index: number): number | null {
    const engagement = this.players[index]!.engagement;
    const plan = engagement?.plan;
    if (!engagement || !plan || !this.ball) return null;
    const speed = Math.sqrt(this.ball.vel.x ** 2 + this.ball.vel.z ** 2);
    const kind = engagement.kind === 'overhead' && plan.contact.y < this.profile.rally.overheadLow ? 'slice' : engagement.kind;
    return this.pressureOf(index, kind, plan.contact.y, speed, 0, plan.tick);
  }

  /** Coup dans le vide : relâché sans balle à portée. Le joueur peut réarmer. */
  private whiff(index: number): void {
    const player = this.players[index]!;
    player.lastWhiffKind = player.engagement?.kind ?? null;
    const plan = player.engagement?.plan;
    player.lastWhiffLate = plan !== null && plan !== undefined && (player.engagement?.releaseTick ?? 0) > plan.tick;
    player.engagement = null;
    player.lastWhiffTick = this.tick;
  }

  private hit(
    index: number,
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
    const player = this.players[index]!;
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
    // En double, le partenaire qui préparait aussi la balle n'a plus rien à frapper.
    const partner = this.partnerOf(index);
    if (partner !== null) this.players[partner]!.engagement = null;
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
    const hitterIndex = this.lastHitter;
    if (hitterIndex === null) return;
    const hitter = teamOf(hitterIndex);
    const receiver = otherTeam(hitter);
    const hitterSide = this.players[hitterIndex]!.side;
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
          this.exit = this.lastExit = { hitter: hitterIndex, wall: contact.wall ?? 'backFar', tick: this.tick, pos: contact.pos };
          break;
      }
    }
  }
}
