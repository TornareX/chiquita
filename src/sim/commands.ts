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
