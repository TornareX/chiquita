import { Prng } from '../sim/prng';

/** Réglages d'une fausse liaison : ce que le vrai réseau ferait aux paquets. */
export interface LinkConditions {
  /** Ping aller-retour (ms) : un paquet met la moitié pour arriver. */
  ping: number;
  /** Gigue (ms) : chaque paquet arrive jusqu'à ±gigue plus tôt ou plus tard (les paquets peuvent se doubler). */
  jitter: number;
  /** Part des paquets perdus (0 à 1). */
  loss: number;
}

export const PERFECT_LINK: LinkConditions = { ping: 0, jitter: 0, loss: 0 };

/**
 * Fausse liaison à sens unique, comme de l'UDP : chaque paquet arrive après la latence (avec la gigue), ou se
 * perd ; deux paquets peuvent arriver dans le désordre. Le temps est donné par l'appelant (ms), le hasard vient
 * d'une graine : un test se rejoue à l'identique.
 */
export class FakeLink<T> {
  private readonly inFlight: { at: number; order: number; packet: T }[] = [];
  private readonly prng: Prng;
  private sent = 0;
  /** Paquets envoyés et perdus, pour l'affichage. */
  readonly counts = { sent: 0, lost: 0 };

  constructor(
    public conditions: LinkConditions,
    seed = 1,
  ) {
    this.prng = new Prng(seed);
  }

  send(now: number, packet: T): void {
    this.counts.sent++;
    if (this.prng.next() < this.conditions.loss) {
      this.counts.lost++;
      return;
    }
    const { ping, jitter } = this.conditions;
    const delay = Math.max(0, ping / 2 + (this.prng.next() * 2 - 1) * jitter);
    this.inFlight.push({ at: now + delay, order: this.sent++, packet });
  }

  /** Paquets arrivés à l'instant `now`, dans leur ordre d'arrivée. */
  receive(now: number): T[] {
    const arrived = this.inFlight.filter((p) => p.at <= now).sort((a, b) => a.at - b.at || a.order - b.order);
    if (arrived.length === 0) return [];
    const left = this.inFlight.filter((p) => p.at > now);
    this.inFlight.length = 0;
    this.inFlight.push(...left);
    return arrived.map((p) => p.packet);
  }
}
