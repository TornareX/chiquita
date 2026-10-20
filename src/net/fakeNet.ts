import { SIM_DT } from '../sim/constants';
import type { Duel } from '../sim/duel';
import type { LinkConditions } from './link';

/** Pas de simulation par image affichée (60 images/s). */
export const TICKS_PER_FRAME = Math.round(1 / 60 / SIM_DT);

/** Réglages du mode « faux réseau », lus dans l'URL. */
export interface FakeNetConfig {
  conditions: LinkConditions;
  /** Délai d'entrée local, en images (1/60 s) puis en pas de simulation. */
  delayFrames: number;
  inputDelay: number;
  /** Fenêtre de rollback (ms) puis en pas : au-delà, la partie attend les commandes. */
  windowMs: number;
  maxRollback: number;
}

/** Délai d'entrée par défaut (images) et fenêtre de rollback (ms). [à juger à la manette] */
const DEFAULT_DELAY_FRAMES = 1;
const DEFAULT_WINDOW_MS = 150;

/**
 * Mode « faux réseau » (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 0) : `?reseau=120` (ping aller-retour, ms),
 * avec `&gigue=20` (ms), `&perte=5` (%), `&delai=2` (délai d'entrée, en images) et `&fenetre=150` (rollback au
 * plus, ms). `null` sans `?reseau`.
 */
export function fakeNetFromUrl(params: URLSearchParams): FakeNetConfig | null {
  if (!params.has('reseau')) return null;
  const num = (key: string, fallback: number, min: number, max: number): number => {
    const value = Number.parseFloat(params.get(key) ?? '');
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const ping = num('reseau', 120, 0, 2000);
  const jitter = num('gigue', 0, 0, 1000);
  const loss = num('perte', 0, 0, 90) / 100;
  const delayFrames = Math.round(num('delai', DEFAULT_DELAY_FRAMES, 0, 10));
  const windowMs = num('fenetre', DEFAULT_WINDOW_MS, 20, 1000);
  return {
    conditions: { ping, jitter, loss },
    delayFrames,
    inputDelay: delayFrames * TICKS_PER_FRAME,
    windowMs,
    maxRollback: Math.round(windowMs / 1000 / SIM_DT),
  };
}

/** Première ligne de l'encart : le réseau simulé. */
export function describeFakeNet(config: FakeNetConfig): string {
  const { ping, jitter, loss } = config.conditions;
  return `réseau simulé · ping ${ping} ms${jitter ? ` ±${jitter}` : ''}${loss ? ` · perte ${Math.round(loss * 100)} %` : ''} · délai ${config.delayFrames} im. · fenêtre ${config.windowMs} ms`;
}

/**
 * Événements datés (pas + joueur) déjà joués : après un rollback, la simulation refait les mêmes pas et revoit les
 * mêmes frappes, rebonds et fins de point ; un son ou un effet ne doit partir qu'une fois. Un événement que la
 * correction a déplacé d'un pas compte comme nouveau (il part, en retard : c'est ce qu'on entend en ligne).
 */
export class EventGate {
  private readonly seen = new Map<string, number>();

  /** Vrai la première fois qu'on voit cet événement. */
  fresh(key: string, tick: number): boolean {
    if (this.seen.has(key)) return false;
    this.seen.set(key, tick);
    return true;
  }

  /**
   * Cache, le temps de lancer sons et effets, les événements du pas qui vient d'être calculé déjà vus avant un
   * rollback (frappe, contacts, fin de point). Rend de quoi les remettre : l'état de la partie ne change pas.
   */
  muteSeen(duel: Duel): () => void {
    const tick = duel.tick - 1;
    const { shot, result } = duel;
    const contacts = [...duel.contacts];
    if (shot && !this.fresh(`frappe:${tick}:${shot.player}`, tick)) duel.shot = null;
    const kept = contacts.filter((c, i) => this.fresh(`contact:${tick}:${i}:${c.surface}:${c.wall ?? ''}`, tick));
    duel.contacts.splice(0, duel.contacts.length, ...kept);
    if (result && !this.fresh(`point:${tick}`, tick)) duel.result = null;
    return () => {
      duel.shot = shot;
      duel.result = result;
      duel.contacts.splice(0, duel.contacts.length, ...contacts);
    };
  }

  /** Oublie les événements plus anciens que `tick` (aucun rollback ne remonte si loin). */
  forget(tick: number): void {
    for (const [key, at] of this.seen) if (at < tick) this.seen.delete(key);
  }
}
