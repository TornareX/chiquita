import { SIM_DT } from './constants';

/** État complet de la simulation. Avance uniquement par pas fixes de SIM_DT. */
export class World {
  tick = 0;

  /** Temps simulé en secondes, dérivé du compteur de pas pour éviter toute dérive. */
  get time(): number {
    return this.tick * SIM_DT;
  }

  step(): void {
    this.tick++;
  }
}
