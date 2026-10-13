import type { PlayerCommands } from './sim/commands';
import type { World } from './sim/world';
import type { Aids } from './ui/aids';

declare global {
  interface Window {
    /** État de la simulation, exposé en mode debug pour les tests Playwright. */
    __sim?: {
      world: World;
      aids: Aids;
      /** Si défini, ses commandes remplacent celles du clavier et de la souris à chaque pas. */
      commandScript?: (world: World) => Partial<PlayerCommands>;
    };
  }
}

export {};
