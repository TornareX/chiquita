import type { World } from './sim/world';

declare global {
  interface Window {
    /** État de la simulation, exposé en mode debug pour les tests Playwright. */
    __sim?: { world: World };
  }
}

export {};
