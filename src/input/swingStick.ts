import type { ShotKind, SwingEnd } from '../sim/commands';
import type { HighFloor } from '../sim/duel';

export type { SwingEnd };

/**
 * Frappe au stick droit : le geste fait le coup, comme le « Skill Stick » de NHL (tirer pour armer un
 * gros tir). Une seule préparation, et la simulation choisit le coup selon la balle (hauteur, volée) :
 * - **préparé** : stick tiré vers soi (le temps d'armer améliore la qualité et la précision), puis
 *   - ramené **tout droit** vers l'avant : coup normal ; de volée, volée coupée ; au-dessus de la tête, smash ;
 *   - ramené vers l'avant **en arc**, par un côté : lob ; au-dessus de la tête, víbora ;
 *   - **lâché** (le stick revient au centre et y reste) : chiquita ; au-dessus de la tête, feinte de smash ;
 * - **sans préparation** : un coup sec vers l'avant depuis le centre, quand on n'a pas le temps : coup moins
 *   fort et moins précis ; de volée, volée bloquée ; au-dessus de la tête, bandeja.
 *
 * Pour la simulation, le geste parle le langage des boutons : un coup maintenu pendant la préparation,
 * relâché à la fin du geste (ce qui déclenche la frappe), avec la préparation et la fin du geste en plus.
 */
export type SwingPhase = 'idle' | 'armed' | 'swing' | 'done';

export interface SwingOutput {
  /** Coup maintenu tant que le geste dure ; `null` une fois relâché. */
  shot: ShotKind | null;
  /** Préparation, et fin du geste une fois connue (au relâcher). */
  swing?: { prepared: boolean; end?: SwingEnd };
}

/** Réglages du geste, le long de l'axe vers soi / vers l'avant. [à calibrer en jouant] */
export const SWING = {
  /** Stick tiré vers soi au-delà de tant : préparation. */
  arm: 0.6,
  /** Préparation tenue tant que le stick reste en dessous de tant vers soi. */
  hold: -0.35,
  /** Arrivée devant : fin du geste ; depuis le repos, coup sec sans préparation. */
  front: 0.5,
  /**
   * Passage par un côté (arc) : |x| au moins tant, avec |y| au plus `sideY`. Assez large pour un arc fait à la
   * manette sans viser le bord : un geste tout droit dévie bien moins. [à calibrer en jouant]
   */
  side: 0.45,
  sideY: 0.75,
  /** Après le passage par un côté, l'arc est fini dès que le stick remonte au-dessus de tant (ou est lâché). */
  arcEnd: 0.2,
  /** Stick au centre (lâché) : rayon, et durée qu'il doit y rester (s). */
  center: 0.3,
  dwell: 0.04,
  /** Geste commencé mais jamais fini : frappe tout droit au bout de tant (s). */
  timeout: 0.8,
} as const;

/** Coup maintenu pendant un geste au stick : la simulation choisit ensuite selon la balle. */
const HELD: ShotKind = 'overhead';

/** Zone morte radiale du stick droit. [à calibrer] */
const DEAD_ZONE = 0.15;

/** Applique la zone morte du stick droit, sans saut à sa sortie. */
export function rightStickAxes(x: number, y: number): { right: number; up: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude < DEAD_ZONE) return { right: 0, up: 0 };
  const k = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE)) / magnitude;
  return { right: x * k, up: y * k };
}

export class SwingStick {
  phase: SwingPhase = 'idle';
  /** Le geste en cours (ou le dernier) a été préparé. */
  prepared = false;
  /** Dernier geste fini, et ses points (repère écran, `up` vers le haut) pour l'affichage. */
  last: { prepared: boolean; end: SwingEnd } | null = null;
  readonly trail: { right: number; up: number }[] = [];
  /** Le geste en cours est passé par un côté : il finira en arc. */
  sideSeen = false;
  /** Nombre de gestes finis : change à chaque coup joué au stick. */
  count = 0;
  private centerTime = 0;
  private swingTime = 0;

  /** Un pas : position du stick droit (après zone morte), durée du pas (s). */
  update(right: number, up: number, dt: number): SwingOutput {
    const magnitude = Math.hypot(right, up);
    if (this.phase === 'armed' || this.phase === 'swing') {
      this.trail.push({ right, up });
      if (this.trail.length > 90) this.trail.shift();
    }
    switch (this.phase) {
      case 'done':
        // Après une frappe, le stick doit revenir au centre avant un nouveau geste.
        if (magnitude < SWING.center) this.phase = 'idle';
        return { shot: null };
      case 'idle':
        if (up <= -SWING.arm) {
          this.phase = 'armed';
          this.prepared = true;
          this.trail.length = 0;
          this.trail.push({ right, up });
          return this.held();
        }
        if (up >= SWING.front) {
          // Coup sec vers l'avant sans préparation : appui et relâcher au pas suivant (phase `done`).
          this.prepared = false;
          this.trail.length = 0;
          this.trail.push({ right: 0, up: 0 }, { right, up });
          this.finishGesture('straight');
          return { shot: HELD, swing: { prepared: false, end: 'straight' } };
        }
        return { shot: null };
      case 'armed':
        if (up <= SWING.hold) return this.held();
        this.phase = 'swing';
        this.sideSeen = false;
        this.centerTime = 0;
        this.swingTime = 0;
        return this.swingStep(right, up, magnitude, dt);
      case 'swing':
        return this.swingStep(right, up, magnitude, dt);
    }
  }

  private held(): SwingOutput {
    return { shot: HELD, swing: { prepared: true } };
  }

  private swingStep(right: number, up: number, magnitude: number, dt: number): SwingOutput {
    this.swingTime += dt;
    if (Math.abs(right) >= SWING.side && Math.abs(up) <= SWING.sideY) this.sideSeen = true;
    if (up >= SWING.front) return this.release(this.sideSeen ? 'arc' : 'straight');
    // Passé par un côté : c'est un arc, qu'il remonte un peu vers l'avant ou que le stick soit lâché après le côté
    // (on ne finit pas toujours l'arc jusqu'en haut).
    if (this.sideSeen && (up >= SWING.arcEnd || magnitude < SWING.center)) return this.release('arc');
    if (magnitude < SWING.center) {
      this.centerTime += dt;
      if (this.centerTime >= SWING.dwell) return this.release('letGo');
    } else this.centerTime = 0;
    // Retour en arrière sans être passé par un côté : on reprend la préparation.
    if (up <= SWING.hold && !this.sideSeen) {
      this.phase = 'armed';
      return this.held();
    }
    if (this.swingTime >= SWING.timeout) return this.release(this.sideSeen ? 'arc' : 'straight');
    return this.held();
  }

  /** Fin du geste préparé : relâché ce pas-ci, avec la fin du geste. */
  private release(end: SwingEnd): SwingOutput {
    this.finishGesture(end);
    return { shot: null, swing: { prepared: true, end } };
  }

  private finishGesture(end: SwingEnd): void {
    this.phase = 'done';
    this.last = { prepared: this.prepared, end };
    this.count++;
  }
}

/**
 * Seuil des coups au-dessus de la tête, réglable : `?coupshauts=epaules`, `yeux` ou `tete`, ou `lob` par
 * défaut (coups hauts sur un lob ; sur une autre balle, seulement trop haute pour la volée).
 */
export function highFloorFromUrl(): HighFloor {
  const value = new URLSearchParams(location.search).get('coupshauts');
  return value === 'epaules' || value === 'tete' || value === 'yeux' ? value : 'lob';
}
