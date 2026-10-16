import { NEUTRAL_ARCADE, type ArcadeCommands, type ShotKind } from './commands';
import { SIM_DT } from './constants';
import { HOME_DEPTH, type Duel } from './duel';
import { Prng } from './prng';
import { forwardFor, rightFor } from './shots';

/**
 * Joueur automatique de l'échange arcade. Il ne triche pas : il ne produit que des commandes,
 * comme une manette (appui sur un bouton, stick), et ne lit que ce qu'un humain voit à l'écran.
 * Il sert à vérifier que l'échange est jouable, pas à faire une IA d'adversaire.
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
}

export const DEFAULT_BOT: BotOptions = {
  reaction: 0.2,
  normalShare: 0.7,
  sliceShare: 0.15,
  aim: 0.7,
  release: null,
  manualPlacement: false,
};

export class Bot {
  private readonly prng: Prng;
  private pressedFor: number | null = null;
  private kind: ShotKind = 'normal';
  private stick = { forward: 0, right: 0 };
  /** Écart de relâcher tiré pour le coup en cours (s). */
  private releaseOffset = 0;

  constructor(
    private readonly index: 0 | 1,
    seed: number,
    private readonly options: BotOptions = DEFAULT_BOT,
  ) {
    this.prng = new Prng(seed);
  }

  /** Décide d'un nouveau coup : type et direction, tirés au hasard (reproductible). */
  private chooseShot(): void {
    const roll = this.prng.next();
    const { normalShare, sliceShare, aim } = this.options;
    this.kind = roll < normalShare ? 'normal' : roll < normalShare + sliceShare ? 'slice' : 'lob';
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    this.stick = { forward: clamp(this.prng.range(-0.4, 0.8) * aim), right: clamp(this.prng.range(-1, 1) * aim) };
    const { release } = this.options;
    this.releaseOffset = release ? release.offset + this.prng.range(-1, 1) * release.spread : 0;
  }

  /** Bouton à tenir pendant la préparation : maintenu jusqu'au moment choisi pour relâcher. */
  private holding(duel: Duel): ShotKind | null {
    const me = duel.players[this.index];
    const plan = me.engagement?.plan;
    if (!this.options.release || !plan || me.heldShot === null) return null;
    return duel.tick < plan.tick + Math.round(this.releaseOffset / SIM_DT) ? me.heldShot : null;
  }

  commands(duel: Duel): ArcadeCommands {
    const me = duel.players[this.index];
    const press = (stick = this.stick): ArcadeCommands => {
      // Un appui est un front montant : le bouton est relâché au pas suivant.
      if (this.pressedFor === duel.tick - 1) return { stick, shot: null };
      this.pressedFor = duel.tick;
      return { stick, shot: this.kind };
    };

    if (duel.phase === 'serve' && duel.server === this.index) {
      if (duel.tick - duel.phaseTick < 0.6 / SIM_DT) return NEUTRAL_ARCADE;
      if (this.pressedFor === null || this.pressedFor < duel.phaseTick) this.chooseShot();
      return press();
    }

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
        return { stick: aiming ? this.stick : { forward: 0, right: 0 }, shot: this.holding(duel) };
      }
      if (duel.tick - opponentHit >= this.options.reaction / SIM_DT) {
        if (this.pressedFor === null || this.pressedFor < opponentHit) this.chooseShot();
        // Il appuie stick au repos : il visera plus tard, juste avant l'impact.
        return press({ forward: 0, right: 0 });
      }
      return NEUTRAL_ARCADE;
    }

    // Hors coup : retour à la position d'attente, au centre.
    const dx = 0 - me.pos.x;
    const dz = me.side * HOME_DEPTH - me.pos.z;
    const axis = (delta: number): number => (Math.abs(delta) < 0.15 ? 0 : Math.max(-1, Math.min(1, delta)));
    const f = forwardFor(me.side);
    const r = rightFor(me.side);
    return { stick: { forward: axis(dx * f.x + dz * f.z), right: axis(dx * r.x + dz * r.z) }, shot: null };
  }
}
