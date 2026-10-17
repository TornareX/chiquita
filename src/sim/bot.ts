import { planIntercept } from './assist';
import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from './commands';
import { SIM_DT } from './constants';
import { HOME_DEPTH, NET_DEPTH, type Duel } from './duel';
import { ballColor, type BallColor } from './pressure';
import { Prng } from './prng';
import { forwardFor, rightFor } from './shots';
import { vec3, type Vec3 } from './vec3';
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

export type AiLevel = 'facile' | 'normal' | 'fort';
export const AI_LEVEL_NAMES: readonly AiLevel[] = ['facile', 'normal', 'fort'];

/**
 * Adversaires de l'étape B. [à calibrer en jouant] Le facile tape souvent tôt ou en retard (coups
 * normaux, quelques ratés) ; le fort relâche presque toujours dans la fenêtre parfaite et place la balle.
 */
export const AI_LEVELS: Record<AiLevel, BotOptions> = {
  facile: {
    ...DEFAULT_BOT,
    reaction: 0.35,
    aim: 0.45,
    release: { offset: 0.02, spread: 0.15 },
    overhead: { maxDepth: 6.4, remate: 0.3, vibora: 0, bajada: 0.1 },
    choices: { lob: 0.6, chiquita: 0.05, body: 0.05, cut: 0.15 },
  },
  normal: {
    ...DEFAULT_BOT,
    reaction: 0.25,
    aim: 0.75,
    release: { offset: 0.01, spread: 0.12 },
    tactics: true,
    overhead: { maxDepth: 7, remate: 0.35, vibora: 0.2, bajada: 0.4 },
    choices: { lob: 0.55, chiquita: 0.2, body: 0.15, cut: 0.5 },
  },
  fort: {
    ...DEFAULT_BOT,
    reaction: 0.15,
    aim: 0.95,
    release: { offset: 0, spread: 0.1 },
    tactics: true,
    overhead: { maxDepth: 7.4, remate: 0.9, vibora: 0.3, bajada: 0.6 },
    choices: { lob: 0.5, chiquita: 0.25, body: 0.2, cut: 0.8 },
  },
};

export class Bot {
  private readonly prng: Prng;
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

  constructor(
    private readonly index: 0 | 1,
    seed: number,
    private readonly options: BotOptions = DEFAULT_BOT,
  ) {
    this.prng = new Prng(seed);
  }

  /** Décide d'un nouveau coup : type et direction (reproductible). Au service, `duel` est omis. */
  private chooseShot(duel?: Duel): void {
    const roll = this.prng.next();
    const { normalShare, sliceShare, aim } = this.options;
    this.kind = roll < normalShare ? 'normal' : roll < normalShare + sliceShare ? 'slice' : 'lob';
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    this.stick = { forward: clamp(this.prng.range(-0.4, 0.8) * aim), right: clamp(this.prng.range(-1, 1) * aim) };
    if (this.options.tactics && duel) {
      const me = duel.players[this.index];
      const opponent = duel.players[this.index === 0 ? 1 : 0];
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
      // Côté libre, vu du joueur : à l'opposé de l'adversaire (au hasard s'il est au centre).
      const open = Math.abs(opponent.pos.x) > 0.6 ? -Math.sign(opponent.pos.x) : this.prng.next() < 0.5 ? -1 : 1;
      const right = open * rightFor(me.side).x;
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
    const { release } = this.options;
    this.releaseOffset = release.offset + this.prng.range(-1, 1) * release.spread;
    if (duel) this.chooseOverhead(duel);
  }

  /** Couleur de la balle qu'il va frapper, lue comme un humain lit l'anneau : où et quand il la prendra. */
  private readBall(duel: Duel): { color: BallColor; volley: boolean; height: number } {
    const me = duel.players[this.index];
    const ball = duel.ball;
    const unknown = { color: 'jaune' as const, volley: false, height: 1 };
    if (!ball) return unknown;
    const plan = planIntercept(ball, me.pos, me.side, duel.tick, duel.profile, 0, duel.bounces > 0);
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
    const me = duel.players[this.index];
    const ball = duel.ball;
    if (!ball) return;
    const r = duel.profile.rally;
    const plan = planIntercept(ball, me.pos, me.side, duel.tick, duel.profile, 0, duel.bounces > 0, true);
    const { maxDepth, remate, vibora, bajada } = this.options.overhead;
    if (!plan?.reachable || plan.outside || plan.contact.y <= r.hitHigh) return;
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
    const nearNet = Math.abs(plan.contact.z) <= r.remateZone - 0.3 && plan.contact.y >= r.remateLow + 0.1;
    if (nearNet && roll < remate) this.overheadStick = { forward: 1, right: right * this.prng.range(0.3, 0.8) * this.options.aim };
    else if (this.prng.next() < vibora) this.overheadStick = { forward: 0, right };
    // Bandeja : sans direction, elle part profonde vers le coin, le long de la ligne.
    else this.overheadStick = { forward: 0.2, right: 0 };
  }

  /** Stick qui fait courir vers `target`, assez vite pour arriver, assez lentement pour freiner (par la porte s'il faut). */
  private runTo(duel: Duel, target: Vec3): ArcadeCommands['stick'] {
    const me = duel.players[this.index];
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
    const me = duel.players[this.index];
    const impact = duel.phase === 'toss' ? duel.toss?.idealTick : me.engagement?.plan?.tick;
    if (me.heldShot === null) return null;
    // Moment d'impact pas encore connu : il garde le bouton.
    if (impact === undefined) return me.heldShot;
    return duel.tick < impact + Math.round(this.releaseOffset / SIM_DT) ? me.heldShot : null;
  }

  /**
   * Après sa frappe, monte-t-il au filet ? Comme au padel : après un service, un lob, une volée ou une
   * frappe parfaite qui met l'adversaire en difficulté. Après un coup défensif au fond, il reste derrière.
   */
  private netAfter(duel: Duel): boolean {
    const hit = duel.players[this.index].lastHit;
    if (!hit || hit.outside) return false;
    // La bandeja et la víbora gardent le filet ; le remate y reste aussi. La chiquita et la bajada
    // permettent de le reprendre.
    return hit.serve || hit.kind === 'lob' || hit.kind === 'overhead' || hit.style === 'chiquita' || hit.volley || hit.perfect;
  }

  commands(duel: Duel): ArcadeCommands {
    const me = duel.players[this.index];
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

    if (duel.isReceiving(this.index)) {
      const opponentHit = duel.players[this.index === 0 ? 1 : 0].lastHitTick;
      const engagement = me.engagement;
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
        if (runs) return { stick: this.runTo(duel, plan.stand), shot: this.holding(duel) };
        const stick = engagement.kind === 'overhead' ? this.overheadStick : plan?.volley ? this.volleyStick : this.stick;
        return { stick: aiming ? stick : { forward: 0, right: 0 }, shot: this.holding(duel) };
      }
      if (duel.tick - opponentHit >= this.options.reaction / SIM_DT) {
        if (this.pressedFor === null || this.pressedFor < opponentHit) this.chooseShot(duel);
        // Il appuie stick au repos : il visera plus tard, juste avant l'impact.
        return press({ forward: 0, right: 0 });
      }
      return NEUTRAL_ARCADE;
    }

    // Hors coup : retour à la position d'attente, au centre, au fond ou au filet.
    if (me.lastHitTick !== this.seenHitTick) {
      this.seenHitTick = me.lastHitTick;
      this.atNet = this.options.tactics && this.netAfter(duel);
    }
    // Après un lob, il ne monte que si le lob passe : l'adversaire qui arme un coup au-dessus de la
    // tête (ça se voit à l'écran) va le reprendre de volée, il reste derrière.
    const opponent = duel.players[this.index === 0 ? 1 : 0];
    if (this.atNet && me.lastHit?.kind === 'lob' && opponent.engagement?.kind === 'overhead') this.atNet = false;
    // Dehors (après une salida de pista), il rentre d'abord par la porte.
    const home = vec3(0, 0, me.side * (this.atNet ? NET_DEPTH : HOME_DEPTH));
    const next = waypoint(me.pos, home, me.side);
    const dx = next.x - me.pos.x;
    const dz = next.z - me.pos.z;
    const axis = (delta: number): number => (Math.abs(delta) < 0.15 ? 0 : Math.max(-1, Math.min(1, delta)));
    const f = forwardFor(me.side);
    const r = rightFor(me.side);
    return { stick: { forward: axis(dx * f.x + dz * f.z), right: axis(dx * r.x + dz * r.z) }, shot: null };
  }
}
