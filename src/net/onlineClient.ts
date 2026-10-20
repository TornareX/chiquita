import { NEUTRAL_ARCADE, type ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import type { Duel } from '../sim/duel';
import { COMMAND_BYTES, decodeCommands, encodeCommands, quantizeCommands, sameCommands } from './codec';
import { DUEL_GAME, withoutTrace, type ReadCommands } from './duelNet';
import { hashState } from './hash';
import { HASH_EVERY } from './matchServer';
import { RollbackSession, type RollbackHooks } from './rollback';

const TICK_MS = SIM_DT * 1000;
/** Avance sur l'horloge du serveur, en plus de la moitié du ping : de quoi absorber la gigue (ms). [à régler] */
const MARGIN_MS = 25;
/** Écart toléré avec le pas visé avant d'attendre ou de rattraper (pas), et rattrapage au plus par appel. */
const SLACK = 3;
const MAX_CATCH_UP = 60;
/** Mesures du ping gardées pour caler l'horloge (la plus rapide fait foi). */
const CLOCK_SAMPLES = 12;

export interface OnlineClientOptions {
  /** Places tenues par ce navigateur. */
  seats: readonly number[];
  /** Début du match, en temps du serveur (ms). */
  startAt: number;
  inputDelay: number;
  maxRollback: number;
  hooks?: RollbackHooks<Duel>;
}

/** Ce que l'encart en ligne affiche. */
export interface OnlineStats {
  /** Ping mesuré (ms), et avance de ce navigateur sur le serveur (pas). */
  ping: number;
  ahead: number;
  /** Commandes locales que le serveur a remplacées (arrivées trop tard). */
  overridden: number;
  /** Empreintes comparées avec le serveur, et différentes (le match a divergé). */
  checked: number;
  desyncs: number;
  firstDesync: number | null;
}

/**
 * Un joueur en ligne (`research/en-ligne/PLAN_EN_LIGNE.md`, modèle C) : sa copie du match avance un peu en avance sur
 * l'horloge du serveur (la moitié du ping, plus une marge), pour que ses commandes y arrivent à temps. Ses commandes
 * jouent tout de suite, celles des autres sont prédites ; les commandes retenues par le serveur (`MatchServer`)
 * confirment tout le monde, lui compris, et un rollback corrige. Chaque seconde, son empreinte est comparée à celle du
 * serveur. Sans réseau ni horloge : on lui donne l'heure (`now`, ms) et les messages, il rend ses commandes à envoyer.
 */
export class OnlineClient {
  readonly session: RollbackSession<Duel, ArcadeCommands>;
  readonly stats: OnlineStats = { ping: 0, ahead: 0, overridden: 0, checked: 0, desyncs: 0, firstDesync: null };
  /** Écart entre l'horloge locale et celle du serveur (ms), et les mesures qui l'ont donné. */
  private offset: number | null = null;
  private samples: { rtt: number; offset: number }[] = [];
  /** Commandes locales à envoyer, par place : premier pas et commandes encodées. */
  private outbox = new Map<number, { start: number; data: number[] }>();
  /** Empreintes de ce navigateur et du serveur, par pas (état quand `duel.tick === tick`). */
  private readonly localHashes = new Map<number, number>();
  private readonly serverHashes = new Map<number, number>();
  private confirmedAll = -1;
  private readonly outside: Record<string, unknown> = {};

  constructor(
    readonly duel: Duel,
    readonly options: OnlineClientOptions,
  ) {
    const hooks = options.hooks ?? {};
    this.session = new RollbackSession(
      duel,
      DUEL_GAME,
      {
        players: duel.players.length,
        local: options.seats,
        inputDelay: options.inputDelay,
        maxRollback: options.maxRollback,
        neutral: NEUTRAL_ARCADE,
        same: sameCommands,
        startTick: duel.tick,
        serverConfirms: true,
      },
      {
        onStep: (state, tick, replayed) => {
          this.record(state, tick);
          hooks.onStep?.(state, tick, replayed);
        },
        beforeRollback: hooks.beforeRollback,
        afterRollback: hooks.afterRollback,
      },
    );
  }

  /** Réponse à un `ping` envoyé à `at` (ms, horloge locale) ; `server` : l'heure du serveur à la réponse. */
  pong(at: number, server: number, now: number): void {
    const rtt = Math.max(0, now - at);
    this.samples.push({ rtt, offset: now - rtt / 2 - server });
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.offset;
    this.stats.ping = Math.round(this.samples.reduce((sum, s) => sum + s.rtt, 0) / this.samples.length);
  }

  /** Horloge calée : on sait où en est le serveur. */
  get ready(): boolean {
    return this.offset !== null;
  }

  /** Pas où en est le serveur maintenant (fractionnaire). */
  serverTick(now: number): number {
    if (this.offset === null) return -Infinity;
    return (now - this.offset - this.options.startAt) / TICK_MS;
  }

  /** Pas que ce navigateur devrait calculer maintenant : celui du serveur, plus la moitié du ping et la marge. */
  targetTick(now: number): number {
    const ahead = (this.stats.ping / 2 + MARGIN_MS) / TICK_MS;
    return Math.floor(this.serverTick(now) + ahead) - this.options.inputDelay;
  }

  /**
   * Avance jusqu'au pas visé : un pas d'habitude, aucun en avance, plusieurs en retard (onglet ralenti). Lit les places
   * locales pour leur prochain pas. Rend le nombre de pas calculés.
   */
  step(read: ReadCommands, now: number): number {
    const target = this.targetTick(now);
    const { session } = this;
    this.stats.ahead = Math.round(session.tick - this.serverTick(now));
    if (session.tick > target + SLACK) return 0;
    const count = session.tick < target - SLACK ? Math.min(MAX_CATCH_UP, target - session.tick) : 1;
    let done = 0;
    for (let i = 0; i < count; i++) {
      session.rollback();
      const tick = session.localTick;
      for (const seat of this.options.seats) {
        if (session.hasLocal(seat, tick)) continue;
        const commands = quantizeCommands(withoutTrace(session.state, () => read(session.state, seat), this.outside));
        session.addLocal(seat, commands);
        this.queue(seat, tick, commands);
      }
      if (!session.advance()) break;
      done++;
    }
    return done;
  }

  private queue(seat: number, tick: number, commands: ArcadeCommands): void {
    let box = this.outbox.get(seat);
    if (!box || box.start + box.data.length / COMMAND_BYTES !== tick) {
      box = { start: tick, data: [] };
      this.outbox.set(seat, box);
    }
    box.data.push(...encodeCommands(commands));
  }

  /** Commandes locales à envoyer au serveur depuis le dernier appel. */
  takeInputs(): { seat: number; start: number; data: Uint8Array }[] {
    const out = [...this.outbox].map(([seat, box]) => ({ seat, start: box.start, data: Uint8Array.from(box.data) }));
    this.outbox.clear();
    return out;
  }

  /** Commandes retenues par le serveur pour `count` pas à partir de `start`. */
  receiveFinals(start: number, players: number, count: number, data: Uint8Array): void {
    const { session } = this;
    for (let i = 0; i < count; i++) {
      for (let p = 0; p < players; p++) {
        const offset = (i * players + p) * COMMAND_BYTES;
        const final = decodeCommands(data, offset);
        // Sa propre commande remplacée par le serveur (arrivée trop tard) : on le saura en la comparant.
        if (this.options.seats.includes(p) && session.hasLocal(p, start + i) && session.commandAt(p, start + i) === undefined) {
          const mine = session.provisionalAt(p, start + i);
          if (mine && !sameCommands(mine, final)) this.stats.overridden++;
        }
        session.addRemote(p, start + i, final);
      }
    }
    // Une seconde de plus entièrement confirmée : on recalcule ce pas pour comparer l'empreinte avec le serveur.
    const confirmedAll = Math.min(...Array.from({ length: players }, (_, p) => session.confirmedTick(p)));
    for (let check = (Math.floor((this.confirmedAll + 1) / HASH_EVERY) + 1) * HASH_EVERY; check - 1 <= confirmedAll; check += HASH_EVERY) {
      if (!this.localHashes.has(check)) session.invalidate(check - 1);
    }
    this.confirmedAll = Math.max(this.confirmedAll, confirmedAll);
  }

  /** Empreinte du serveur. */
  receiveHash(tick: number, hash: number): void {
    this.serverHashes.set(tick, hash);
    this.compare(tick);
  }

  /** Après le pas `tick` : si tout y est confirmé et que c'est une seconde ronde, l'empreinte. */
  private record(state: Duel, tick: number): void {
    const after = tick + 1;
    if (after % HASH_EVERY !== 0 || !this.session.confirmedThrough(tick)) return;
    this.localHashes.set(after, hashState(state));
    this.compare(after);
  }

  private compare(tick: number): void {
    const mine = this.localHashes.get(tick);
    const theirs = this.serverHashes.get(tick);
    if (mine === undefined || theirs === undefined) return;
    this.localHashes.delete(tick);
    this.serverHashes.delete(tick);
    this.stats.checked++;
    if (mine !== theirs) {
      this.stats.desyncs++;
      this.stats.firstDesync ??= tick;
    }
  }
}
