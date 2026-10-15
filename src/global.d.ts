import type { Bot } from './sim/bot';
import type { PlayerCommands } from './sim/commands';
import type { Duel } from './sim/duel';
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
    /** Échange arcade, exposé en mode debug (preview, Playwright). */
    __duel?: { duel: Duel; Bot: typeof Bot };
  }
}

export {};
