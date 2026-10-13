/** Générateur pseudo-aléatoire à seed (mulberry32) : toute la part d'aléatoire de la simulation passe par lui. */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Nombre uniforme dans [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Nombre uniforme dans [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}
