import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import type { Duel } from '../sim/duel';
import { crowdReaction } from '../audio/recipes';

/**
 * Ralenti du coup gagnant (étape V7, `research/rendu/POLISH_VISUEL.md` §3.9), entre deux points. La simulation est
 * déterministe : on garde une copie de la partie toutes les `SNAPSHOT_EVERY` pas et les commandes de chaque pas ; pour
 * rejouer, on repart de la copie juste avant le coup gagnant et on refait les mêmes pas, au ralenti, dans une partie à
 * part. La partie en cours n'est jamais touchée : elle attend, en pause, la fin du ralenti.
 */

/** Une copie de la partie tous les ce nombre de pas, et l'historique gardé (s). */
const SNAPSHOT_EVERY = 30;
const HISTORY = 6;
/** Le ralenti commence ce temps avant le coup gagnant, et dure au plus `MAX_SPAN` s de jeu après son début (s). */
const LEAD = 0.45;
const MAX_SPAN = 2;
/** Le ralenti se poursuit ce temps après la fin du point (s). */
const TAIL = 0.35;
/** Vitesse du ralenti : très lent autour de la frappe (jusqu'à `SLOW_AFTER` s après), puis moins. [à calibrer] */
const SLOW = 0.28;
const SLOW_AFTER = 0.35;
const FAST = 0.6;
/** Le ralenti démarre ce temps (de jeu) après la fin du point : on entend d'abord le public. */
export const REPLAY_DELAY = 0.5;

/**
 * Copie profonde d'un objet de la simulation : mêmes classes (prototypes gardés), mêmes partages (un objet référencé
 * deux fois reste un seul objet), tableaux et `Map` compris. Les fonctions sont partagées.
 */
export function deepClone<T>(value: T, seen = new Map<unknown, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  const known = seen.get(value);
  if (known !== undefined) return known as T;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(deepClone(item, seen));
    return copy as T;
  }
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [k, v] of value) copy.set(deepClone(k, seen), deepClone(v, seen));
    return copy as T;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const v of value) copy.add(deepClone(v, seen));
    return copy as T;
  }
  const copy = Object.create(Object.getPrototypeOf(value) as object) as Record<string, unknown>;
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    const field = (value as Record<string, unknown>)[key];
    // Une fonction posée sur l'objet lui-même (méthode remplacée, liée à l'original) n'est pas copiée : la copie garde
    // celle de sa classe, sinon elle ferait avancer l'original.
    if (typeof field === 'function' && Object.getPrototypeOf(value) !== Object.prototype) continue;
    copy[key] = deepClone(field, seen);
  }
  return copy as T;
}

/** Le point mérite un ralenti : por tres, smash gagnant, long échange (`crowdReaction` au moins 0,6), ou tout coup gagnant. */
export function replayWorthy(duel: Duel, mode: 'big' | 'all'): boolean {
  const { result } = duel;
  if (!result) return false;
  const winners = duel.teamPlayers(result.winner).map((i) => duel.players[i]!);
  const shooter = winners.reduce((a, b) => (b.lastHitTick > a.lastHitTick ? b : a));
  if (!Number.isFinite(shooter.lastHitTick) || shooter.lastHit?.serve) return false;
  const winner = result.reason === 'second-bounce' || result.reason === 'not-returned' || result.reason === 'por-tres' || result.reason === 'por-cuatro';
  if (mode === 'all') return winner;
  return (crowdReaction(result, shooter.lastHit)?.intensity ?? 0) >= 0.6;
}

export interface Replay {
  /** Partie rejouée, à dessiner à la place de la partie en cours. */
  readonly duel: Duel;
  /** Avance le ralenti de `frameTime` s de temps réel ; `step` est appelé après chaque pas rejoué. Retourne l'interpolation. */
  advance(frameTime: number, step: () => void): number;
  /** Ralenti terminé. */
  readonly done: boolean;
  /** Vitesse du moment (part du temps réel), pour faire vieillir les effets au même rythme. */
  readonly speed: number;
}

export class ReplayRecorder {
  private readonly snapshots: { tick: number; duel: Duel }[] = [];
  private readonly commands = new Map<number, readonly ArcadeCommands[]>();

  /** À appeler juste avant `duel.step(commands)`. */
  record(duel: Duel, commands: readonly ArcadeCommands[]): void {
    if (duel.tick % SNAPSHOT_EVERY === 0) this.snapshots.push({ tick: duel.tick, duel: deepClone(duel) });
    this.commands.set(duel.tick, deepClone(commands));
    const oldest = duel.tick - Math.round(HISTORY / SIM_DT);
    while (this.snapshots.length > 1 && this.snapshots[1]!.tick <= oldest) this.snapshots.shift();
    this.commands.delete(oldest - 1);
  }

  /** Oublie tout (nouvelle partie). */
  clear(): void {
    this.snapshots.length = 0;
    this.commands.clear();
  }

  /** Ralenti du dernier point de `duel` (qui vient de se terminer), ou `null` si l'historique ne le couvre pas. */
  replay(duel: Duel): Replay | null {
    const { lastResult } = duel;
    if (!lastResult) return null;
    const winners = duel.teamPlayers(lastResult.winner).map((i) => duel.players[i]!);
    const hitTick = Math.max(...winners.map((p) => p.lastHitTick));
    const endTick = duel.phaseTick;
    const wanted = Math.max(hitTick - Math.round(LEAD / SIM_DT), endTick - Math.round(MAX_SPAN / SIM_DT));
    const base = [...this.snapshots].reverse().find((s) => s.tick <= wanted);
    if (!base) return null;
    const copy = deepClone(base.duel);
    const commandsAt = (tick: number): readonly ArcadeCommands[] => this.commands.get(tick) ?? [];
    // Avance sans rien montrer jusqu'au début du ralenti.
    while (copy.tick < wanted) {
      const before = copy.tick;
      copy.step(commandsAt(copy.tick));
      if (copy.tick === before) return null;
    }
    const stopTick = endTick + Math.round(TAIL / SIM_DT);
    const slowUntil = hitTick + Math.round(SLOW_AFTER / SIM_DT);
    let accumulator = 0;
    return {
      duel: copy,
      get done() {
        return copy.tick >= stopTick;
      },
      get speed() {
        return copy.tick < slowUntil ? SLOW : FAST;
      },
      advance(frameTime: number, step: () => void): number {
        accumulator += Math.min(0.25, Math.max(0, frameTime)) * this.speed;
        while (accumulator >= SIM_DT && copy.tick < stopTick) {
          copy.step(commandsAt(copy.tick));
          step();
          accumulator -= SIM_DT;
        }
        return Math.min(1, accumulator / SIM_DT);
      },
    };
  }
}

/** Bandeau « RALENTI » en haut de l'écran pendant le ralenti. */
export function createReplayBadge(): { show(on: boolean): void } {
  const badge = document.createElement('div');
  badge.id = 'replay-badge';
  badge.textContent = 'RALENTI';
  // Apparence dans `ui/hud.css` (chargée par le HUD du match). Ce module reste sans CSS : le serveur le compile aussi.
  badge.style.display = 'none';
  document.body.append(badge);
  return {
    show(on: boolean): void {
      badge.style.display = on ? 'block' : 'none';
    },
  };
}
