import type { Bot } from './sim/bot';
import type { PlayerCommands } from './sim/commands';
import type { Duel } from './sim/duel';
import type { Effects } from './render/effects';
import type { World } from './sim/world';
import type { Arena } from './render/arena';
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
    __duel?: { duel: Duel; Bot: typeof Bot; net?: () => import('./net/duelNet').NetMatch | null };
    /** Tutoriel, exposé en mode debug (Playwright) : étape en cours, réussites, essai. */
    __tutorial?: { readonly phase: string; readonly successes: number; readonly attempt: number };
    /** Effets de balle et de vitre de la vue du match, exposés en mode debug (compteurs, ralenti pour les captures). */
    __effects?: Effects;
    /** Visionneur d'animations (`?mode=animations`) : aller à un instant du geste, phase affichée. */
    __anim?: { seek(t: number): void; readonly phase: string };
    /** Arène et public (étape E6), exposés en mode debug. */
    __arena?: Arena;
  }
}

export {};
