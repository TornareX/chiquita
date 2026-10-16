import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from './commands';
import { SIM_DT } from './constants';
import { HOME_DEPTH, NET_DEPTH, type Duel } from './duel';
import { Prng } from './prng';
import { forwardFor, rightFor } from './shots';

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
   * Relâcher du bouton. `null` : il tape (appui bref), le coup part normal à l'impact. Sinon, il
   * maintient et relâche à `offset` secondes du moment d'impact prévu (négatif = avant), avec une
   * erreur tirée uniformément dans ±`spread` : c'est sa précision de timing.
   */
  release: { offset: number; spread: number } | null;
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
}

export const DEFAULT_BOT: BotOptions = {
  reaction: 0.2,
  normalShare: 0.7,
  sliceShare: 0.15,
  aim: 0.7,
  release: null,
  manualPlacement: false,
  tactics: false,
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
  },
  normal: {
    ...DEFAULT_BOT,
    reaction: 0.25,
    aim: 0.75,
    release: { offset: 0.01, spread: 0.12 },
    tactics: true,
  },
  fort: {
    ...DEFAULT_BOT,
    reaction: 0.15,
    aim: 0.95,
    release: { offset: 0, spread: 0.085 },
    tactics: true,
  },
};

export class Bot {
  private readonly prng: Prng;
  private pressedFor: number | null = null;
  private kind: ShotKind = 'normal';
  private stick = { forward: 0, right: 0 };
  /** Direction visée s'il prend la balle de volée : courte et croisée, pour conclure. */
  private volleyStick = { forward: 0, right: 0 };
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
      // Adversaire au filet : le lob le passe ; sinon, balle profonde du côté libre.
      if (Math.abs(opponent.pos.z) < 4.5 && this.prng.next() < 0.6) this.kind = 'lob';
      else if (this.kind === 'lob') this.kind = 'normal';
      // Côté libre, vu du joueur : à l'opposé de l'adversaire (au hasard s'il est au centre).
      const open = Math.abs(opponent.pos.x) > 0.6 ? -Math.sign(opponent.pos.x) : this.prng.next() < 0.5 ? -1 : 1;
      const right = open * rightFor(me.side).x;
      this.stick = {
        forward: clamp(this.prng.range(0.2, 1) * aim),
        right: clamp(right * this.prng.range(0.6, 1) * aim),
      };
      this.volleyStick = { forward: clamp(this.prng.range(-0.8, 0.2) * aim), right: clamp(right * aim) };
    } else {
      this.volleyStick = this.stick;
    }
    const { release } = this.options;
    this.releaseOffset = release ? release.offset + this.prng.range(-1, 1) * release.spread : 0;
  }

  /**
   * Bouton à tenir pendant la préparation : maintenu jusqu'au moment choisi pour relâcher. Le moment
   * d'impact est lu comme un humain le voit : point de course assistée, ou sommet du rebond au service.
   */
  private holding(duel: Duel): ShotKind | null {
    const me = duel.players[this.index];
    const impact = duel.phase === 'toss' ? duel.toss?.idealTick : me.engagement?.plan?.tick;
    if (!this.options.release || impact === undefined || me.heldShot === null) return null;
    return duel.tick < impact + Math.round(this.releaseOffset / SIM_DT) ? me.heldShot : null;
  }

  /**
   * Après sa frappe, monte-t-il au filet ? Comme au padel : après un service, un lob, une volée ou une
   * frappe parfaite qui met l'adversaire en difficulté. Après un coup défensif au fond, il reste derrière.
   */
  private netAfter(duel: Duel): boolean {
    const hit = duel.players[this.index].lastHit;
    if (!hit) return false;
    return hit.serve || hit.kind === 'lob' || hit.volley || hit.perfect;
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
        if (this.options.manualPlacement && plan) {
          // Il lit la trajectoire comme un humain et court lui-même vers le point d'impact.
          const dx = plan.stand.x - me.pos.x;
          const dz = plan.stand.z - me.pos.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          if (distance < 0.05) return { stick: { forward: 0, right: 0 }, shot: this.holding(duel) };
          const t = duel.profile.player;
          // Assez vite pour arriver, assez lentement pour freiner à temps.
          const speed = Math.min(1, Math.sqrt(2 * t.deceleration * distance) / t.maxSpeed);
          const f = forwardFor(me.side);
          const r = rightFor(me.side);
          const stick = {
            forward: ((dx * f.x + dz * f.z) / distance) * speed,
            right: ((dx * r.x + dz * r.z) / distance) * speed,
          };
          return { stick, shot: this.holding(duel) };
        }
        // Visée seulement dans la fenêtre d'avant l'impact : plus tôt, elle couperait l'assistance partielle.
        const aiming = plan !== null && (plan.tick - duel.tick) * SIM_DT <= duel.profile.rally.aimWindow;
        const stick = plan?.volley ? this.volleyStick : this.stick;
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
    const dx = 0 - me.pos.x;
    const dz = me.side * (this.atNet ? NET_DEPTH : HOME_DEPTH) - me.pos.z;
    const axis = (delta: number): number => (Math.abs(delta) < 0.15 ? 0 : Math.max(-1, Math.min(1, delta)));
    const f = forwardFor(me.side);
    const r = rightFor(me.side);
    return { stick: { forward: axis(dx * f.x + dz * f.z), right: axis(dx * r.x + dz * r.z) }, shot: null };
  }
}
