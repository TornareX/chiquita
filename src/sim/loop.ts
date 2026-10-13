/**
 * Boucle à pas fixe : accumule le temps réel écoulé et exécute autant de pas
 * de simulation que nécessaire, indépendamment de la cadence d'affichage.
 */
export class FixedStepLoop {
  private accumulator = 0;

  constructor(
    private readonly dt: number,
    private readonly step: () => void,
    /** Plafond par image, pour ne pas rattraper indéfiniment après un gel (onglet en arrière-plan…). */
    private readonly maxFrameTime = 0.25,
  ) {}

  /**
   * Avance la simulation de `frameTime` secondes.
   * Retourne la fraction de pas restante (0..1), pour interpoler le rendu.
   */
  advance(frameTime: number): number {
    this.accumulator += Math.min(Math.max(frameTime, 0), this.maxFrameTime);
    while (this.accumulator >= this.dt) {
      this.step();
      this.accumulator -= this.dt;
    }
    return this.accumulator / this.dt;
  }
}
