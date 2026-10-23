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
 *   fort et moins précis ; de volée, volée bloquée ; au-dessus de la tête, bandeja ;
 * - **contre-vitre**, à la manette (`wallByButton`) : L1 / LB (ou R1 / RB) tenu prépare (le joueur se tourne vers sa
 *   vitre), le stick droit poussé vers l'avant frappe, et le bouton lâché sans frapper annule. Xavier a pris L1 d'instinct. Proposée à Xavier (23/10) pour ne plus la
 *   confondre avec le coup sec. Au clavier, quand le jeu la propose (`wallReady`) : tourné vers sa vitre, le geste est inversé. Stick
 *   poussé vers l'avant : préparation ; ramené vers soi (vers sa vitre), ou lâché : frappe contre la vitre.
 *
 * Pour la simulation, le geste parle le langage des boutons : un coup maintenu pendant la préparation,
 * relâché à la fin du geste (ce qui déclenche la frappe), avec la préparation et la fin du geste en plus.
 */
export type SwingPhase = 'idle' | 'armed' | 'swing' | 'done' | 'wallArmed';

export interface SwingOutput {
  /** Coup maintenu tant que le geste dure ; `null` une fois relâché. */
  shot: ShotKind | null;
  /** Préparation, et fin du geste une fois connue (au relâcher) ; `wall` : contre-vitre. */
  swing?: { prepared: boolean; end?: SwingEnd; wall?: boolean };
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
  last: { prepared: boolean; end: SwingEnd; wall?: boolean } | null = null;
  readonly trail: { right: number; up: number }[] = [];
  /** Le geste en cours est passé par un côté : il finira en arc. */
  sideSeen = false;
  /** Nombre de gestes finis : change à chaque coup joué au stick. */
  count = 0;
  /**
   * Contre-vitre proposée par le jeu à ce pas. Au geste (clavier), pousser vers l'avant depuis le repos la prépare ; au
   * bouton (manette), elle ne sert qu'à l'afficher.
   */
  wallReady = false;
  /** Contre-vitre au bouton (manette) plutôt qu'au geste : le bouton tenu est passé à `update`. */
  wallByButton = false;
  /** Au bouton : le stick était déjà en avant à la préparation, il doit revenir avant de frapper. */
  private wallForward = false;
  /** Bouton de contre-vitre tenu au pas précédent : seul un nouvel appui prépare. */
  private wallWasHeld = false;
  private centerTime = 0;
  private swingTime = 0;

  /** Un pas : position du stick droit (après zone morte), durée du pas (s), et le bouton de contre-vitre tenu. */
  update(right: number, up: number, dt: number, wallHeld = false): SwingOutput {
    const magnitude = Math.hypot(right, up);
    if (this.phase === 'armed' || this.phase === 'swing' || this.phase === 'wallArmed') {
      this.trail.push({ right, up });
      if (this.trail.length > 90) this.trail.shift();
    }
    if (this.wallByButton) {
      const pressed = wallHeld && !this.wallWasHeld;
      this.wallWasHeld = wallHeld;
      const wall = this.wallButton(up, wallHeld, pressed);
      if (wall) return wall;
    }
    switch (this.phase) {
      case 'done':
        // Après une frappe, le stick doit revenir au centre avant un nouveau geste.
        if (magnitude < SWING.center) this.phase = 'idle';
        return { shot: null };
      case 'idle':
        if (!this.wallByButton && this.wallReady && up >= SWING.arm) {
          this.phase = 'wallArmed';
          this.prepared = true;
          this.centerTime = 0;
          this.trail.length = 0;
          this.trail.push({ right, up });
          return { shot: HELD, swing: { prepared: true, wall: true } };
        }
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
      case 'wallArmed':
        // Ramené vers soi (vers sa vitre) : frappe. Lâché au centre : frappe aussi.
        if (up <= -SWING.front) return this.releaseWall('straight');
        if (magnitude < SWING.center) {
          this.centerTime += dt;
          if (this.centerTime >= SWING.dwell) return this.releaseWall('letGo');
        } else this.centerTime = 0;
        return { shot: HELD, swing: { prepared: true, wall: true } };
    }
  }

  /**
   * Contre-vitre au bouton : appuyé au repos (ou juste après un coup), il prépare ; le stick droit poussé vers
   * l'avant frappe ; lâché sans frapper, il annule (aucune frappe). `null` : le bouton ne change rien à ce pas.
   */
  private wallButton(up: number, held: boolean, pressed: boolean): SwingOutput | null {
    if (this.phase === 'wallArmed') {
      if (!held) {
        this.phase = 'idle';
        this.prepared = false;
        return { shot: null };
      }
      if (up >= SWING.front && !this.wallForward) return this.releaseWall('straight');
      if (up < SWING.front) this.wallForward = false;
      return { shot: HELD, swing: { prepared: true, wall: true } };
    }
    if (!pressed || (this.phase !== 'idle' && this.phase !== 'done')) return null;
    this.phase = 'wallArmed';
    this.prepared = true;
    this.wallForward = up >= SWING.front;
    this.trail.length = 0;
    return { shot: HELD, swing: { prepared: true, wall: true } };
  }

  private releaseWall(end: SwingEnd): SwingOutput {
    this.finishGesture(end);
    this.last = { prepared: true, end, wall: true };
    return { shot: null, swing: { prepared: true, end, wall: true } };
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
