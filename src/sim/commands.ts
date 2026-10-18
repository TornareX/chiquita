/**
 * Commandes du joueur pour un pas de simulation, indépendantes de leur source
 * (clavier/souris, manette, réseau, IA).
 */
export interface PlayerCommands {
  /** Déplacement voulu, relatif au regard : chaque axe dans [-1, 1]. */
  move: { forward: number; right: number };
  /** Rotation du regard pendant ce pas (rad) : yaw positif vers la droite, pitch positif vers le haut. */
  look: { yaw: number; pitch: number };
  /** Split-step : vrai uniquement au pas où il est déclenché. */
  jump: boolean;
  /** Préparation du coup, tant que maintenu. */
  prepare: boolean;
  /** Coup de toucher, tant que maintenu. */
  softShot: boolean;
}

export const NEUTRAL_COMMANDS: PlayerCommands = {
  move: { forward: 0, right: 0 },
  look: { yaw: 0, pitch: 0 },
  jump: false,
  prepare: false,
  softShot: false,
};

/**
 * Boutons de coup arcade (GAME_DESIGN.md §4) : A = normal (lift), X = coupé, Y = lob,
 * B = au-dessus de la tête (bandeja, víbora ou remate selon la situation et le stick).
 */
export type ShotKind = 'normal' | 'slice' | 'lob' | 'overhead';

/**
 * Coups au-dessus de la tête (GAME_DESIGN.md §4) : la bandeja par défaut, sûre et profonde ; la víbora
 * au stick latéral, plus rapide, avec un effet qui longe la vitre latérale ; le remate au stick vers
 * l'avant, à plat, seulement près du filet ; la bajada, stick vers l'avant sur une balle haute qui ressort
 * de la vitre du fond : une attaque jouée depuis le fond.
 */
export type OverheadKind = 'bandeja' | 'vibora' | 'remate' | 'bajada' | 'feinte';

/** Fin d'un geste préparé au stick droit : tout droit, en arc, ou lâché (`src/input/swingStick.ts`). */
export type SwingEnd = 'straight' | 'arc' | 'letGo';

/**
 * Commandes d'un joueur de l'échange arcade pour un pas de simulation, quelle que soit la source
 * (manette, clavier, IA, réseau). Les axes sont relatifs au joueur : `forward` vers le filet,
 * `right` vers sa droite ; la conversion depuis l'écran se fait côté entrée.
 */
export interface ArcadeCommands {
  /** Stick : déplacement hors coup ; pendant un coup, direction (`right`) et profondeur (`forward`). Axes dans [-1, 1]. */
  stick: { forward: number; right: number };
  /** Bouton de coup maintenu, ou `null`. Seul l'appui (front montant) déclenche un coup. */
  shot: ShotKind | null;
  /**
   * Coup joué au stick droit : préparé (stick tiré vers soi) ou non (coup sec), et la fin du geste, connue au
   * relâcher. La simulation choisit alors le coup selon la balle (`Duel.swingShot`).
   */
  swing?: { prepared: boolean; end?: SwingEnd; wall?: boolean };
  /** En double : annonce au partenaire (« ¡Mía! », « ¡Tuya! »), affichée au-dessus du joueur. */
  call?: 'mia' | 'tuya';
}

export const NEUTRAL_ARCADE: ArcadeCommands = { stick: { forward: 0, right: 0 }, shot: null };
