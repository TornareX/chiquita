import { planIntercept } from './assist';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from './commands';
import { SIM_DT } from './constants';
import { HOME_DEPTH, NET_DEPTH, teamOf, type Duel, type DuelPlayer } from './duel';
import { ballColor, type BallColor } from './pressure';
import { Prng } from './prng';
import { forehandFor, forwardFor, rightFor } from './shots';
import { vec3, type Vec3 } from './vec3';
import { predictBall } from './predict';
import { pathDistance, waypoint } from './walkable';

/**
 * Joueur automatique. Il ne triche pas : il ne produit que des commandes, comme une manette (appui
 * sur un bouton, stick), et ne lit que ce qu'un humain voit à l'écran. Avec les réglages par défaut,
 * il sert à vérifier que l'échange est jouable ; avec `AI_LEVELS`, c'est l'adversaire du joueur.
 * Sa difficulté joue sur la lecture et la précision, jamais sur la physique (GAME_DESIGN.md §7).
 */
export interface BotOptions {
  /** Temps de réaction après la frappe adverse avant d'appuyer (s). */
  reaction: number;
  /** Part des coups normal / coupé / lob (le reste). */
  normalShare: number;
  sliceShare: number;
  /** Amplitude maximale de visée au stick (0..1). */
  aim: number;
  /**
   * Relâcher du bouton : il maintient et relâche à `offset` secondes du moment d'impact prévu
   * (négatif = avant), avec une erreur tirée uniformément dans ±`spread` : c'est sa précision de timing.
   * La frappe part au relâcher : trop tôt, coup dans le vide ; un peu tôt, coup normal.
   */
  release: { offset: number; spread: number };
  /**
   * Se place lui-même au stick pendant la préparation (assistance partielle ou désactivée) au lieu de
   * laisser la course assistée faire. Sinon, il ne touche au stick que pour viser, juste avant l'impact.
   */
  manualPlacement: boolean;
  /**
   * Joue placé : vise le côté où l'adversaire n'est pas, lobe un adversaire monté au filet. Sinon,
   * type et direction du coup sont tirés au hasard.
   */
  tactics: boolean;
  /**
   * Coup au-dessus de la tête (bouton B) sur une balle trop haute pour les autres coups, si elle se
   * prend à moins de `maxDepth` m du filet ; plus loin (lob profond), il recule et la joue après le
   * rebond. Parts du remate (s'il est assez près du filet) et de la víbora ; le reste en bandeja.
   */
  overhead: { maxDepth: number; remate: number; vibora: number; bajada: number };
  /**
   * Choix face à un joueur au filet (avec `tactics`) : parts du lob, de la chiquita et de la frappe au
   * corps sur une balle verte (moins sur une jaune), et de la volée coupée sur une balle flottante.
   */
  choices: { lob: number; chiquita: number; body: number; cut: number };
  /**
   * Coup imposé (démonstration du tutoriel) : toujours ce bouton, et ce stick au moment de l'impact,
   * quelle que soit la balle. Sans lui, le bot choisit selon ses parts et sa tactique.
   */
  forced?: { kind: ShotKind; stick: ArcadeCommands['stick'] };
  /**
   * Relâcher des coups hauts, plus précis que les autres : la bandeja ne se réussit qu'à hauteur des yeux,
   * en quelques centièmes. Sans lui, `release`.
   */
  overheadRelease?: { offset: number; spread: number };
  /**
   * En double (`research/tactique/TACTIQUE_2V2.md` §3.1 et §10) : basculement de la paire vers le frappeur
   * adverse (0 = ne bouge pas avec la balle, 0,4 = sur la bissectrice de ses angles), et part des balles visées
   * au milieu, entre les deux adversaires (le reste vers le plus grand trou).
   */
  doubles?: { shift: number; middle: number };
  /**
   * Avec `tactics` : part des coups (hors lob, chiquita et frappe au corps) visés sur le revers de l'adversaire, et
   * des lobs passés au-dessus de son revers, où il ne peut faire qu'un revers par-dessus la tête.
   */
  backhand?: number;
  /**
   * En double, partenaire humain : il se cale sur sa profondeur (les deux au filet ou les deux au fond) au lieu
   * de décider seul. Réglé par le mode de jeu.
   */
  followPartner?: boolean;
  /**
   * Contre-vitre (`CHANTIERS_PLAN.md`, étape 4) : envie de renvoyer contre sa vitre la balle qui l'a passé. Hors
   * d'atteinte après la vitre, il la tente avec 2,5 fois cette probabilité ; jouable après la vitre, avec 0,1 fois
   * (il l'attend). Seulement sur une balle dans son axe. Sans lui, jamais.
   */
  counterWall?: number;
}

export const DEFAULT_BOT: BotOptions = {
  reaction: 0.2,
  normalShare: 0.7,
  sliceShare: 0.15,
  aim: 0.7,
  // Un peu en avance : la balle entre à portée pendant le geste, coup normal sûr.
  release: { offset: -0.08, spread: 0 },
  manualPlacement: false,
  tactics: false,
  overhead: { maxDepth: 6.5, remate: 0.5, vibora: 0, bajada: 0.3 },
  choices: { lob: 0.6, chiquita: 0.15, body: 0.1, cut: 0.3 },
};

/**
 * En double (`TACTIQUE_2V2.md` §2 et §12) : profondeur au filet et au fond (m du filet), écart entre partenaires,
 * et profondeur de la balle à jouer au-delà de laquelle la paire au filet est lobée et recule. [à calibrer en jouant]
 */
const DOUBLES_NET_DEPTH = 2.8;
const DOUBLES_BACK_DEPTH = 8.2;
const DOUBLES_SPACING_NET = 3.2;
const DOUBLES_SPACING_BACK = 3.0;
const DOUBLES_LOBBED_DEPTH = 6.5;
/** Partenaire humain : bande centrale (m de part et d'autre du milieu du terrain), au joueur dont le coup droit y est. */
const HUMAN_MIDDLE_BAND = 0.7;
/**
 * Retour à la position d'attente entre les points : arrivé à moins de `ARRIVED` (m), il s'arrête et ne repart que si sa place
 * s'éloigne de plus de `DRIFT` (m). Sans cet écart, en double, la place qui suit le frappeur adverse le faisait
 * repartir et s'arrêter sans cesse par petits pas (jambes qui tremblent).
 */
const ARRIVED = 0.1;
const DRIFT = 0.4;

export type AiLevel = 'facile' | 'normal' | 'fort';
export const AI_LEVEL_NAMES: readonly AiLevel[] = ['facile', 'normal', 'fort'];

/**
 * Adversaires de l'étape B. [à calibrer en jouant] Le facile tape souvent tôt ou en retard (coups
 * normaux, quelques ratés) ; le fort relâche presque toujours dans la fenêtre parfaite et place la balle.
 */
export const AI_LEVELS: Record<AiLevel, BotOptions> = {
  facile: {
    ...DEFAULT_BOT,
    doubles: { shift: 0.15, middle: 0.3 },
    reaction: 0.35,
    aim: 0.45,
    release: { offset: 0.02, spread: 0.15 },
    overheadRelease: { offset: 0, spread: 0.04 },
    overhead: { maxDepth: 6.4, remate: 0.3, vibora: 0, bajada: 0.1 },
    choices: { lob: 0.6, chiquita: 0.05, body: 0.05, cut: 0.15 },
    counterWall: 0.1,
  },
  normal: {
    ...DEFAULT_BOT,
    doubles: { shift: 0.3, middle: 0.55 },
    reaction: 0.25,
    aim: 0.75,
    release: { offset: 0.01, spread: 0.12 },
    overheadRelease: { offset: 0, spread: 0.02 },
    tactics: true,
    backhand: 0.3,
    overhead: { maxDepth: 7, remate: 0.85, vibora: 0.2, bajada: 0.4 },
    choices: { lob: 0.55, chiquita: 0.2, body: 0.15, cut: 0.5 },
    counterWall: 0.25,
  },
  fort: {
    ...DEFAULT_BOT,
    doubles: { shift: 0.4, middle: 0.7 },
    reaction: 0.15,
    aim: 0.95,
    release: { offset: 0, spread: 0.1 },
    overheadRelease: { offset: 0, spread: 0.01 },
    tactics: true,
    backhand: 0.5,
    overhead: { maxDepth: 7.4, remate: 0.9, vibora: 0.3, bajada: 0.6 },
    choices: { lob: 0.5, chiquita: 0.25, body: 0.2, cut: 0.8 },
    counterWall: 0.35,
  },
};

export class Bot {
  private readonly prng: Prng;
  /** Tirages du coup visé sur le revers : à part, pour ne pas décaler les autres (reproductibles d'une version à l'autre). */
  private readonly backhandPrng: Prng;
  private pressedFor: number | null = null;
  private kind: ShotKind = 'normal';
  private stick = { forward: 0, right: 0 };
  /** Direction visée s'il prend la balle de volée : courte et croisée, pour conclure. */
  private volleyStick = { forward: 0, right: 0 };
  /** Direction au-dessus de la tête : vers l'avant pour le remate, sur le côté pour la víbora. */
  private overheadStick = { forward: 0, right: 0 };
  /** Écart de relâcher tiré pour le coup en cours (s). */
  private releaseOffset = 0;
  /** Dernière frappe prise en compte pour choisir sa position, et position choisie : au filet ou au fond. */
  private seenHitTick = -Infinity;
  private atNet = false;
  /** Bandeja : pas où la balle redescend à hauteur de ses yeux, calculé une fois par coup (appui). */
  private eyeTick: { press: number; tick: number } | null = null;
  /** En double : début du point en cours (la décision filet / fond de la paire repart du fond à chaque point). */
  private pointTick = -Infinity;
  /** Frappe adverse pour laquelle il a déjà annoncé « à toi ». */
  private calledFor: number | null = null;
  /** Balle laissée au partenaire humain, recalculée à chaque frappe, rebond ou vitre. */
  private yieldFor: { key: string; yields: boolean } | null = null;
  /** Entre les points, arrivé à sa position d'attente : il y reste tant qu'elle ne s'éloigne pas de plus de `DRIFT`. */
  private settled = false;
  /** Contre-vitre : tirages à part, et décision prise pour la balle en cours (clé : frappe adverse). */
  private readonly counterPrng: Prng;
  private counter: { key: number; go: boolean; right: number } | null = null;

  constructor(
    private readonly index: number,
    seed: number,
    private readonly options: BotOptions = DEFAULT_BOT,
  ) {
    this.prng = new Prng(seed);
    this.backhandPrng = new Prng(seed + 7919);
    this.counterPrng = new Prng(seed + 104729);
  }

  /**
   * Contre-vitre : la balle l'a passé et file vers sa vitre. Il décide une fois par balle s'il la joue contre la vitre
   * (toujours ou presque si elle est hors d'atteinte après la vitre) ; si oui, stick tiré vers sa vitre (et un peu de
   * côté), il relâche quand elle passe au point idéal derrière lui, avec son erreur de timing. `null` : il joue
   * normalement.
   */
  private counterWallCommands(duel: Duel): ArcadeCommands | null {
    const share = this.options.counterWall ?? 0;
    const me = duel.players[this.index]!;
    const chance = share > 0 && me.engagement ? duel.counterWall(this.index) : null;
    if (!chance) return null;
    const key = duel.lastHitter !== null ? duel.players[duel.lastHitter]!.lastHitTick : -1;
    if (this.counter?.key !== key) {
      // Jouable après la vitre : il l'attend presque toujours. Sinon, c'est son sauvetage. Jamais sur une balle mal
      // placée (trop loin de son point de frappe, sur le côté) : elle partirait dans son camp.
      const reachable = me.engagement?.plan?.reachable ?? false;
      const r = duel.profile.rally;
      const centred = Math.abs(Math.abs(chance.lateral) - r.standLateral) <= r.counterWall.sweetSpot;
      const go = centred && this.counterPrng.next() < (reachable ? share * 0.1 : Math.min(1, share * 2.5));
      const right = this.counterPrng.range(-1, 1) * this.options.aim;
      this.counter = { key, go, right };
    }
    if (!this.counter.go) return null;
    const stick = { forward: -1, right: this.counter.right };
    const holding = me.heldShot !== null && chance.timing < this.releaseOffset;
    return { stick, shot: holding ? me.heldShot : null };
  }

  /**
   * Contre-vitre non choisie : le stick ne se tire pas vers sa vitre (il viserait court, ou courrait vers la vitre),
   * sinon la balle partirait contre elle et il s'arrêterait.
   */
  private noCounterWall(duel: Duel, commands: ArcadeCommands): ArcadeCommands {
    const limit = -duel.profile.rally.counterWall.stick + 0.05;
    if (commands.stick.forward >= limit || !duel.counterWall(this.index)?.playable) return commands;
    return { ...commands, stick: { ...commands.stick, forward: limit } };
  }

  /** Décide d'un nouveau coup : type et direction (reproductible). Au service, `duel` est omis. */
  private chooseShot(duel?: Duel): void {
    const roll = this.prng.next();
    const { normalShare, sliceShare, aim } = this.options;
    this.kind = roll < normalShare ? 'normal' : roll < normalShare + sliceShare ? 'slice' : 'lob';
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    this.stick = { forward: clamp(this.prng.range(-0.4, 0.8) * aim), right: clamp(this.prng.range(-1, 1) * aim) };
    if (this.options.tactics && duel) {
      const me = duel.players[this.index]!;
      // En double, l'adversaire visé est le plus près du filet : c'est lui qu'on lobe ou qu'on met en difficulté.
      const opponent = this.closestOpponent(duel);
      // Adversaire au filet : il lit la balle comme l'anneau la montre. Verte, le lob le passe ;
      // rouge, un lob serait court : il la remet basse, aux pieds. Sinon, balle profonde du côté libre.
      const { color, volley, height } = this.readBall(duel);
      const atNet = Math.abs(opponent.pos.z) < 4.5;
      const { lob, chiquita: chiquitaShare, body: bodyShare, cut: cutShare } = this.options.choices;
      const roll = this.prng.next();
      // Balle verte : le choix est ouvert (lob, chiquita ou frappe au corps) ; rouge : on la remet basse.
      const lobChance = color === 'verte' ? lob : color === 'jaune' ? lob * 0.65 : 0.1;
      const chiquitaChance = color === 'rouge' ? 1 : color === 'verte' ? chiquitaShare : chiquitaShare * 0.5;
      // Au filet, une balle flottante se tue d'une volée coupée.
      const cut = volley && color === 'verte' && height >= duel.profile.rally.cutLow && roll < cutShare;
      const lobbing = !cut && atNet && !volley && roll < lobChance;
      const chiquita = !cut && !lobbing && atNet && !volley && roll < lobChance + chiquitaChance;
      const body = !cut && !lobbing && !chiquita && atNet && color !== 'rouge' && roll < lobChance + chiquitaChance + bodyShare;
      if (lobbing) this.kind = 'lob';
      else if (cut || chiquita) this.kind = 'slice';
      else if (this.kind === 'lob') this.kind = 'normal';
      // Côté libre, vu du joueur : à l'opposé de l'adversaire (au hasard s'il est au centre). En double : le milieu,
      // entre les deux adversaires (ils hésitent), ou le plus grand trou.
      const open = Math.abs(opponent.pos.x) > 0.6 ? -Math.sign(opponent.pos.x) : this.prng.next() < 0.5 ? -1 : 1;
      const gap = duel.doubles ? this.doublesGap(duel) : null;
      // Sur son revers : à un bon mètre de lui, du côté opposé à sa main.
      const share = this.options.backhand ?? 0;
      const onBackhand = share > 0 && !body && !chiquita && this.backhandPrng.next() < share;
      const backhandX = opponent.pos.x - forehandFor(opponent.side, opponent.hand).x * 1.2;
      const toBackhand = Math.max(-1, Math.min(1, backhandX / (duel.profile.rally.aimWidth * rightFor(me.side).x)));
      const right = onBackhand ? toBackhand : (gap ?? open * rightFor(me.side).x);
      this.stick = {
        forward: clamp(this.prng.range(0.2, 1) * aim),
        right: clamp(right * this.prng.range(0.6, 1) * aim),
      };
      this.volleyStick = { forward: clamp(this.prng.range(-0.8, 0.2) * aim), right: clamp(right * aim) };
      // Lob : profondeur variable ; trop long il sort, trop court c'est une balle de smash.
      if (this.kind === 'lob') this.stick = { ...this.stick, forward: clamp(this.prng.range(-0.7, 0.9) * aim) };
      // Chiquita : coupé court et bas, dans ses pieds.
      else if (chiquita) this.stick = { ...this.stick, forward: -0.8 };
      // Au corps : droit sur lui, plein, pour qu'il n'ait que le temps de bloquer.
      else if (body) {
        this.kind = 'normal';
        const at = (opponent.pos.x - me.pos.x * 0.3) / 3;
        this.stick = { forward: 1, right: clamp(at * rightFor(me.side).x) };
      }
      if (cut) this.volleyStick = { forward: clamp(this.prng.range(-0.6, 0.3) * aim), right: clamp(right * aim) };
    } else {
      this.volleyStick = this.stick;
    }
    if (duel) this.chooseOverhead(duel);
    const { forced } = this.options;
    if (forced) {
      this.kind = forced.kind;
      this.stick = this.volleyStick = this.overheadStick = forced.stick;
    }
    const release = this.kind === 'overhead' ? (this.options.overheadRelease ?? this.options.release) : this.options.release;
    this.releaseOffset = release.offset + this.prng.range(-1, 1) * release.spread;
  }

  /** Couleur de la balle qu'il va frapper, lue comme un humain lit l'anneau : où et quand il la prendra. */
  private readBall(duel: Duel): { color: BallColor; volley: boolean; height: number } {
    const me = duel.players[this.index]!;
    const ball = duel.ball;
    const unknown = { color: 'jaune' as const, volley: false, height: 1 };
    if (!ball) return unknown;
    const plan = planIntercept(ball, me.pos, me.side, duel.tick, duel.profile, 0, duel.bounces > 0, false, me.height, false, me.hand);
    if (!plan) return unknown;
    const speed = Math.sqrt(ball.vel.x ** 2 + ball.vel.z ** 2);
    const color = ballColor(duel.pressureOf(this.index, 'normal', plan.contact.y, speed, 0, plan.tick));
    return { color, volley: plan.volley, height: plan.contact.y };
  }

  /**
   * Balle trop haute pour les coups normaux : il la lit comme un humain (où et quand elle sera à
   * portée au-dessus de la tête) et joue B s'il l'atteint assez près du filet. Remate s'il est à
   * portée de filet, sinon víbora ou bandeja, vers le côté libre.
   */
  private chooseOverhead(duel: Duel): void {
    const me = duel.players[this.index]!;
    const ball = duel.ball;
    if (!ball) return;
    const r = duel.profile.rally;
    // Point le plus haut jouable près du filet : de quoi juger si le remate est possible.
    const plan = planIntercept(ball, me.pos, me.side, duel.tick, duel.profile, 0, duel.bounces > 0, true, me.height, true, me.hand);
    const { maxDepth, remate, vibora, bajada } = this.options.overhead;
    // Balle haute (un lob, ou une balle qui ressort haut de la vitre) : elle monte au-dessus des coups normaux.
    const apex = ball.vel.y > 0 ? ball.pos.y + (ball.vel.y * ball.vel.y) / (2 * duel.profile.gravity) : ball.pos.y;
    if (!plan?.reachable || plan.outside || apex <= r.hitHigh) return;
    const right = this.volleyStick.right >= 0 ? 1 : -1;
    const roll = this.prng.next();
    // Au fond, sur la balle haute qui ressort de la vitre : bajada, une attaque, puis il monte au filet.
    if (Math.abs(plan.contact.z) > maxDepth) {
      if (plan.volley || roll >= bajada) return;
      this.kind = 'overhead';
      this.overheadStick = { forward: 1, right: right * 0.5 * this.options.aim };
      return;
    }
    this.kind = 'overhead';
    // Remate : près du filet, sur une balle qui monte assez haut pour être frappée bras tendu.
    const nearNet = Math.abs(plan.contact.z) <= r.remateZone - 0.15 && plan.contact.y >= r.remateLow + 0.1;
    // Vers le côté libre, assez ouvert pour que la balle sorte par la vitre latérale (por tres) : visé
    // près de l'axe, le défenseur la reprend après son rebond.
    if (nearNet && roll < remate) this.overheadStick = { forward: 1, right: right * Math.min(1, this.prng.range(0.8, 1.3) * this.options.aim) };
    else if (this.prng.next() < vibora) this.overheadStick = { forward: 0, right };
    // Bandeja : sans direction, elle part profonde vers le coin, le long de la ligne.
    else this.overheadStick = { forward: 0.2, right: 0 };
  }

  /** Stick qui fait courir vers `target`, assez vite pour arriver, assez lentement pour freiner (par la porte s'il faut). */
  private runTo(duel: Duel, target: Vec3): ArcadeCommands['stick'] {
    const me = duel.players[this.index]!;
    const next = waypoint(me.pos, target, me.side);
    const dx = next.x - me.pos.x;
    const dz = next.z - me.pos.z;
    const leg = Math.sqrt(dx * dx + dz * dz);
    if (leg < 0.05) return { forward: 0, right: 0 };
    const t = duel.profile.player;
    const speed = Math.min(1, Math.sqrt(2 * t.deceleration * pathDistance(me.pos, target, me.side)) / t.maxSpeed);
    const f = forwardFor(me.side);
    const r = rightFor(me.side);
    return { forward: ((dx * f.x + dz * f.z) / leg) * speed, right: ((dx * r.x + dz * r.z) / leg) * speed };
  }

  /**
   * Bouton à tenir pendant la préparation : maintenu jusqu'au moment choisi pour relâcher. Le moment
   * d'impact est lu comme un humain le voit : point de course assistée, ou sommet du rebond au service.
   */
  private holding(duel: Duel): ShotKind | null {
    const me = duel.players[this.index]!;
    let impact = duel.phase === 'toss' ? duel.toss?.idealTick : me.engagement?.plan?.tick;
    // Coup haut : il relâche quand la balle redescend à la bonne hauteur, ses yeux pour la bandeja et la
    // víbora, plus haut pour le remate (bras tendu). Calculé une fois par coup, une fois le point prévu.
    if (me.engagement?.kind === 'overhead' && me.engagement.plan) {
      // Au stick, recalculé si le point prévu change (la balle jouée peut passer d'un coup haut à un coup bas).
      const press = me.engagement.pressTick + (me.engagement.swing ? me.engagement.plan.tick * 1e-6 : 0);
      if (this.eyeTick?.press !== press) {
        // Au stick (démonstrateur du tutoriel), tout coup haut préparé se joue bras tendu, comme le smash.
        const swing = me.engagement.swing;
        const smash = swing ? swing.prepared : this.overheadStick.forward >= duel.profile.rally.overheadStick;
        const tick = duel.overheadReleaseTick(this.index, smash);
        this.eyeTick = tick === null ? null : { press, tick };
      }
      if (this.eyeTick?.press === press) impact = this.eyeTick.tick;
    }
    if (me.heldShot === null) return null;
    // Moment d'impact pas encore connu : il garde le bouton.
    if (impact === undefined) return me.heldShot;
    return duel.tick < impact + Math.round(this.releaseOffset / SIM_DT) ? me.heldShot : null;
  }

  /**
   * Après sa frappe, monte-t-il au filet ? Comme au padel : après un service, un lob, une volée ou une
   * frappe parfaite qui met l'adversaire en difficulté. Après un coup défensif au fond, il reste derrière.
   */
  private netAfter(duel: Duel, hitter = this.index): boolean {
    const hit = duel.players[hitter]!.lastHit;
    if (!hit || hit.outside) return false;
    // La bandeja et la víbora gardent le filet ; le remate y reste aussi. La chiquita et la bajada
    // permettent de le reprendre.
    return hit.serve || hit.kind === 'lob' || hit.kind === 'overhead' || hit.style === 'chiquita' || hit.volley || hit.perfect;
  }

  /** Adversaire le plus près du filet (en simple, l'adversaire). */
  private closestOpponent(duel: Duel): DuelPlayer {
    const opponents = duel.players.filter((p) => p.team !== teamOf(this.index));
    return opponents.reduce((a, b) => (Math.abs(b.pos.z) < Math.abs(a.pos.z) ? b : a));
  }

  /**
   * En double, direction à viser au stick (`right`, de -1 à 1) : le milieu entre les deux adversaires (zone du
   * divorce, `TACTIQUE_2V2.md` §6.1), ou le plus grand trou entre un adversaire et sa vitre latérale.
   */
  private doublesGap(duel: Duel): number {
    const me = duel.players[this.index]!;
    const opponents = duel.players.filter((p) => p.team !== me.team);
    const middle = this.options.doubles?.middle ?? 0.5;
    let x: number;
    if (this.prng.next() < middle) x = opponents.reduce((sum, p) => sum + p.pos.x, 0) / opponents.length;
    else {
      // Trou le long d'une vitre : entre l'adversaire le plus au bord et la vitre de son côté.
      const xs = opponents.map((p) => p.pos.x).sort((a, b) => a - b);
      const low = xs[0]! + 5;
      const high = 5 - xs[xs.length - 1]!;
      x = low > high ? xs[0]! - low / 2 : xs[xs.length - 1]! + high / 2;
    }
    const width = duel.profile.rally.aimWidth;
    return Math.max(-1, Math.min(1, x / (width * rightFor(me.side).x)));
  }

  /**
   * En double : position d'attente de la paire (`TACTIQUE_2V2.md` §3.1). Les deux au filet ou les deux au fond ;
   * la paire glisse vers le côté où l'adversaire va frapper (ou d'où vient la balle qu'elle joue) ; chacun garde
   * sa moitié, à un écart constant de son partenaire.
   */
  private doublesHome(duel: Duel): Vec3 {
    const me = duel.players[this.index]!;
    const right = rightFor(me.side).x;
    const opponentTeam = me.team === 0 ? 1 : 0;
    // Le frappeur adverse : celui qui va jouer la balle (s'ils la reçoivent), sinon la balle elle-même.
    const striker = duel.owner(opponentTeam);
    const strikerX = striker !== null ? duel.players[striker]!.pos.x : (duel.ball?.pos.x ?? 0);
    const shift = this.options.doubles?.shift ?? 0.3;
    const centre = Math.max(-1.5, Math.min(1.5, shift * strikerX * right));
    const spacing = this.atNet ? DOUBLES_SPACING_NET : DOUBLES_SPACING_BACK;
    const lateral = centre + (me.half === 'right' ? 1 : -1) * (spacing / 2);
    const depth = this.atNet ? DOUBLES_NET_DEPTH : DOUBLES_BACK_DEPTH;
    return vec3(lateral * right, 0, me.side * depth);
  }

  /**
   * En double, la paire décide ensemble de monter ou de reculer : d'après le dernier coup de l'équipe (le sien ou
   * celui du partenaire). Lobé (la balle passe derrière la paire au filet), les deux reculent ; avec un partenaire
   * humain, il se cale sur sa profondeur.
   */
  private updateDoublesDepth(duel: Duel): void {
    const me = duel.players[this.index]!;
    const partnerIndex = duel.partnerOf(this.index)!;
    const partner = duel.players[partnerIndex]!;
    if (duel.phase === 'serve' && this.pointTick !== duel.phaseTick) {
      this.pointTick = duel.phaseTick;
      // Au service, le serveur et son partenaire attaquent ; le receveur et le sien défendent.
      this.atNet = teamOf(duel.server) === me.team;
      this.seenHitTick = Math.max(me.lastHitTick, partner.lastHitTick);
    }
    const teamHitTick = Math.max(me.lastHitTick, partner.lastHitTick);
    if (teamHitTick !== this.seenHitTick) {
      this.seenHitTick = teamHitTick;
      const hitter = me.lastHitTick >= partner.lastHitTick ? this.index : partnerIndex;
      this.atNet = this.options.tactics ? this.netAfter(duel, hitter) : false;
    }
    // Lob de la paire que l'adversaire reprend au-dessus de la tête : il ne passe pas, on reste derrière.
    const teamHit = (me.lastHitTick >= partner.lastHitTick ? me : partner).lastHit;
    const opponentArming = duel.players.some((p) => p.team !== me.team && p.engagement?.kind === 'overhead');
    if (this.atNet && teamHit?.kind === 'lob' && opponentArming) this.atNet = false;
    // Lobés : la balle qu'on doit jouer passe derrière la ligne de service, les deux reculent.
    if (this.atNet && duel.isReceiving(partnerIndex) && duel.ball) {
      const owner = duel.owner(me.team);
      const plan = owner !== null ? duel.players[owner]!.engagement?.plan : null;
      if (plan && !plan.volley && Math.abs(plan.contact.z) > DOUBLES_LOBBED_DEPTH) this.atNet = false;
    }
    if (this.options.followPartner && partnerIndex !== duel.lastHitter) {
      const depth = Math.abs(partner.pos.z);
      if (depth < 4.5) this.atNet = true;
      else if (depth > 6.5) this.atNet = false;
    }
  }

  commands(duel: Duel): ArcadeCommands {
    const me = duel.players[this.index]!;
    const press = (stick = this.stick): ArcadeCommands => {
      // Un appui est un front montant : le bouton est relâché au pas suivant.
      if (this.pressedFor === duel.tick - 1) return { stick, shot: null };
      this.pressedFor = duel.tick;
      return { stick, shot: this.kind };
    };

    if (duel.phase === 'serve' || duel.phase === 'toss') {
      if (duel.server !== this.index) return NEUTRAL_ARCADE;
      if (duel.phase === 'toss') return { stick: this.stick, shot: this.holding(duel) };
      if (duel.tick - duel.phaseTick < 0.6 / SIM_DT) return NEUTRAL_ARCADE;
      if (this.pressedFor === null || this.pressedFor < duel.phaseTick) this.chooseShot();
      return press();
    }
    if (duel.phase === 'over') return NEUTRAL_ARCADE;
    if (duel.doubles) this.updateDoublesDepth(duel);

    // En double, il ne joue que les balles qui lui reviennent (sa moitié, ou le milieu s'il y est le mieux placé) ;
    // celles du partenaire, il les lui laisse et se replace.
    const owner = duel.doubles ? duel.owner(me.team) : this.index;
    const yields = duel.doubles && this.yieldsToPartner(duel);
    const mine = duel.isReceiving(this.index) && ((owner === this.index && !yields) || me.engagement !== null);
    if (mine) {
      const opponentHit = duel.lastHitter !== null ? duel.players[duel.lastHitter]!.lastHitTick : -Infinity;
      const engagement = me.engagement;
      const counter = this.counterWallCommands(duel);
      if (counter) return counter;
      if (engagement) {
        const plan = engagement.plan;
        // Visée seulement dans la fenêtre d'avant l'impact : plus tôt, elle couperait l'assistance partielle.
        const aiming = plan !== null && (plan.tick - duel.tick) * SIM_DT <= duel.profile.rally.aimWindow;
        const distance = plan ? pathDistance(me.pos, plan.stand, me.side) : 0;
        // Il court lui-même : placement manuel, ou aimant tant qu'il est loin du point d'impact (même
        // pendant la fenêtre de visée : hors de l'aimant, il ne viserait que dans le vide).
        const runs =
          plan !== null &&
          (this.options.manualPlacement || (me.assist === 'magnet' && distance > duel.profile.rally.magnetRadius));
        // Il lit la trajectoire comme un humain et court vers le point d'impact.
        if (runs) return this.noCounterWall(duel, { stick: this.runTo(duel, plan.stand), shot: this.holding(duel) });
        const stick = engagement.kind === 'overhead' ? this.overheadStick : plan?.volley ? this.volleyStick : this.stick;
        return this.noCounterWall(duel, { stick: aiming ? stick : { forward: 0, right: 0 }, shot: this.holding(duel) });
      }
      if (duel.tick - opponentHit >= this.options.reaction / SIM_DT) {
        if (this.pressedFor === null || this.pressedFor < opponentHit) this.chooseShot(duel);
        // Il appuie stick au repos : il visera plus tard, juste avant l'impact. Pour un remate, stick vers
        // l'avant dès l'appui : la course assistée le prépare bras tendu.
        const smash = this.kind === 'overhead' && this.overheadStick.forward >= duel.profile.rally.overheadStick;
        return press(smash ? this.overheadStick : { forward: 0, right: 0 });
      }
      return NEUTRAL_ARCADE;
    }

    // Hors coup : retour à la position d'attente, au centre, au fond ou au filet.
    let home: Vec3;
    if (duel.doubles) {
      home = this.doublesHome(duel);
      // Le partenaire joue une balle du milieu : « à toi ! ».
      // Une fois par balle.
      const shotTick = duel.lastHitter !== null ? duel.players[duel.lastHitter]!.lastHitTick : null;
      const taker = yields ? duel.partnerOf(this.index) : owner;
      const call = taker !== null && taker !== this.index && duel.isReceiving(taker) && shotTick !== this.calledFor ? ('tuya' as const) : undefined;
      if (call) this.calledFor = shotTick;
      return { ...this.walkTo(duel, home), ...(call ? { call } : {}) };
    }
    if (me.lastHitTick !== this.seenHitTick) {
      this.seenHitTick = me.lastHitTick;
      this.atNet = this.options.tactics && this.netAfter(duel);
    }
    // Après un lob, il ne monte que si le lob passe : l'adversaire qui arme un coup au-dessus de la
    // tête (ça se voit à l'écran) va le reprendre de volée, il reste derrière.
    const opponent = this.closestOpponent(duel);
    if (this.atNet && me.lastHit?.kind === 'lob' && opponent.engagement?.kind === 'overhead') this.atNet = false;
    home = vec3(0, 0, me.side * (this.atNet ? NET_DEPTH : HOME_DEPTH));
    return this.walkTo(duel, home);
  }

  /**
   * Partenaire humain : la balle dont le deuxième rebond tomberait dans sa moitié est la sienne, même s'il en
   * est loin. Au milieu, celui dont le coup droit est au centre (le droitier de gauche, le gaucher de droite ; les
   * deux ou aucun : le joueur de gauche), comme `Duel.owner`. L'humain décide seul ; l'IA ne lui vole rien.
   */
  private yieldsToPartner(duel: Duel): boolean {
    if (!this.options.followPartner || !duel.ball || duel.phase !== 'rally') return false;
    const key = `${duel.phaseTick}:${duel.hits}:${duel.bounces}:${duel.glassWalls.length}`;
    if (this.yieldFor?.key === key) return this.yieldFor.yields;
    const me = duel.players[this.index]!;
    const partner = duel.players[duel.partnerOf(this.index)!]!;
    const { end, bounce, points } = predictBall(duel.ball, duel.profile, 5, 8, duel.bounces > 0);
    const spot = end ?? points[points.length - 1] ?? bounce;
    let yields = false;
    if (spot) {
      // Écart au milieu du terrain, vers la droite de la paire.
      const offset = spot.x * rightFor(me.side).x;
      const humanLeft = partner.half === 'left';
      const [left, right] = humanLeft ? [partner, me] : [me, partner];
      const middleToLeft = !(right.hand === 'left' && left.hand !== 'right');
      // Bande du milieu comprise dans la moitié de l'humain s'il a le coup droit au centre.
      const band = humanLeft === middleToLeft ? HUMAN_MIDDLE_BAND : -HUMAN_MIDDLE_BAND;
      yields = humanLeft ? offset < band : offset > -band;
    }
    this.yieldFor = { key, yields };
    return yields;
  }

  /** Commandes pour rejoindre sa position d'attente ; dehors (après une salida de pista), par la porte. */
  private walkTo(duel: Duel, home: Vec3): ArcadeCommands {
    const me = duel.players[this.index]!;
    const next = waypoint(me.pos, home, me.side);
    const dx = next.x - me.pos.x;
    const dz = next.z - me.pos.z;
    const f = forwardFor(me.side);
    const r = rightFor(me.side);
    if (duel.phase === 'rally') {
      // Dans l'échange, il suit sa place au plus près.
      this.settled = false;
      const axis = (delta: number): number => (Math.abs(delta) < 0.15 ? 0 : Math.max(-1, Math.min(1, delta)));
      return { stick: { forward: axis(dx * f.x + dz * f.z), right: axis(dx * r.x + dz * r.z) }, shot: null };
    }
    // Entre les points : il rejoint sa place en ralentissant, s'y arrête et n'en repart que si elle s'éloigne.
    const distance = pathDistance(me.pos, home, me.side);
    if (distance < ARRIVED) this.settled = true;
    else if (distance > DRIFT) this.settled = false;
    const leg = Math.sqrt(dx * dx + dz * dz);
    if (this.settled || leg < 1e-3) return NEUTRAL_ARCADE;
    const speed = Math.min(1, distance);
    return { stick: { forward: ((dx * f.x + dz * f.z) / leg) * speed, right: ((dx * r.x + dz * r.z) / leg) * speed }, shot: null };
  }
}
