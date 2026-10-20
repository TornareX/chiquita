import { AI_LEVELS, Bot, type AiLevel } from '../sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands } from '../sim/commands';
import type { Duel } from '../sim/duel';
import { COMMAND_BYTES, decodeCommands, encodeCommands, quantizeCommands } from './codec';
import { withoutTrace } from './duelNet';
import { hashState } from './hash';
import { createBots, createMatchDuel, type MatchConfig } from './protocol';

/** Une empreinte de l'état toutes les ce nombre de pas (1 s), pour vérifier que chaque joueur calcule le même match. */
export const HASH_EVERY = 240;

/**
 * Le match tel que le serveur le tient (`research/en-ligne/PLAN_EN_LIGNE.md`, modèle C) : il reçoit les commandes des
 * joueurs, **retient** celle de chacun à chaque pas (une commande arrivée trop tard est remplacée par la précédente :
 * un joueur lent ne bloque personne), fait jouer les IA des places vides sans délai, calcule le match lui-même (c'est
 * son score qui compte) et donne à tous les commandes retenues et, chaque seconde, son empreinte. Rien ici ne parle au
 * réseau ni ne lit l'heure : `server/main.ts` s'en charge.
 */
export class MatchServer {
  readonly duel: Duel;
  /** Prochain pas à retenir. */
  tick = 0;
  /** Commandes arrivées trop tard (pas déjà retenu), et pas retenus sans commande reçue, par place. */
  readonly late: number[];
  readonly missing: number[];
  private readonly bots: (Bot | null)[];
  private readonly pending: Map<number, ArcadeCommands>[];
  private readonly last: ArcadeCommands[];
  /** Caches de ceux qui lisent la partie hors du pas (les IA, voir `withoutTrace`). */
  private readonly outside: Record<string, unknown> = {};
  /** Commandes retenues pas encore envoyées, à partir du pas `outStart`. */
  private out: Uint8Array[] = [];
  private outStart = 0;
  private hashes: { tick: number; hash: number }[] = [];

  constructor(readonly config: MatchConfig) {
    this.duel = createMatchDuel(config);
    this.bots = createBots(config, this.duel);
    const players = this.duel.players.length;
    this.pending = Array.from({ length: players }, () => new Map());
    this.last = Array.from({ length: players }, () => NEUTRAL_ARCADE);
    this.late = Array.from({ length: players }, () => 0);
    this.missing = Array.from({ length: players }, () => 0);
  }

  get players(): number {
    return this.duel.players.length;
  }

  /** Commandes encodées de la place `seat` à partir du pas `start`. */
  receive(seat: number, start: number, data: Uint8Array): void {
    if (seat >= this.players || this.bots[seat]) return;
    for (let i = 0; i * COMMAND_BYTES < data.length; i++) {
      const tick = start + i;
      if (tick < this.tick) {
        this.late[seat]!++;
        continue;
      }
      this.pending[seat]!.set(tick, decodeCommands(data, i * COMMAND_BYTES));
    }
  }

  /** Un joueur est parti : une IA prend sa place, à partir du pas suivant. */
  replaceWithBot(seat: number, level: AiLevel): void {
    if (seat >= this.players || this.bots[seat]) return;
    const partner = this.duel.partnerOf(seat);
    const followPartner = partner !== null && !this.bots[partner];
    this.bots[seat] = new Bot(seat, this.config.seed + seat + 1000, { ...AI_LEVELS[level], followPartner });
    this.pending[seat]!.clear();
  }

  /** Retient et calcule tous les pas jusqu'à `target` (exclu). */
  advanceTo(target: number): void {
    while (this.tick < target) this.finalize();
  }

  private finalize(): void {
    const tick = this.tick;
    if (this.out.length === 0) this.outStart = tick;
    const frame = new Uint8Array(this.players * COMMAND_BYTES);
    const commands = this.duel.players.map((_, seat): ArcadeCommands => {
      const bot = this.bots[seat];
      let chosen: ArcadeCommands;
      if (bot) chosen = quantizeCommands(withoutTrace(this.duel, () => bot.commands(this.duel), this.outside));
      else {
        const received = this.pending[seat]!.get(tick);
        if (received === undefined) this.missing[seat]!++;
        else this.pending[seat]!.delete(tick);
        // Pas de commande à temps : la précédente, comme le prédisent les joueurs.
        chosen = received ?? this.last[seat]!;
      }
      this.last[seat] = chosen;
      encodeCommands(chosen, frame, seat * COMMAND_BYTES);
      return chosen;
    });
    this.duel.step(commands);
    this.tick++;
    this.out.push(frame);
    if (this.duel.tick % HASH_EVERY === 0) this.hashes.push({ tick: this.duel.tick, hash: hashState(this.duel) });
  }

  /** Commandes retenues depuis le dernier envoi (tous les joueurs, pas après pas), ou `null`. */
  takeFinals(): { start: number; data: Uint8Array } | null {
    if (this.out.length === 0) return null;
    const data = new Uint8Array(this.out.length * this.players * COMMAND_BYTES);
    this.out.forEach((frame, i) => data.set(frame, i * frame.length));
    const start = this.outStart;
    this.out = [];
    return { start, data };
  }

  /** Empreintes calculées depuis le dernier envoi. */
  takeHashes(): { tick: number; hash: number }[] {
    const hashes = this.hashes;
    this.hashes = [];
    return hashes;
  }
}
