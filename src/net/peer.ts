import type { ArcadeCommands } from '../sim/commands';
import { NEUTRAL_ARCADE } from '../sim/commands';
import { COMMAND_BYTES, decodeCommands, encodeCommands, sameCommands } from './codec';
import { RollbackSession, type RollbackGame, type RollbackHooks } from './rollback';

/**
 * Un paquet entre deux machines : pour chaque joueur local, ses commandes encodées depuis le premier pas que
 * l'autre n'a pas confirmé (on renvoie tant qu'il n'a pas accusé réception : un paquet perdu ne perd rien) ; et,
 * pour chaque joueur distant, le dernier pas reçu sans trou (accusé de réception).
 */
export interface InputPacket {
  inputs: { player: number; start: number; data: Uint8Array }[];
  acks: { player: number; tick: number }[];
}

/** Au plus ce nombre de pas renvoyés par joueur et par paquet. */
const MAX_RESEND = 240;

/** Une machine du match : son moteur de rollback, et ce qu'elle envoie et reçoit. */
export class Peer<S> {
  readonly session: RollbackSession<S, ArcadeCommands>;
  /** Dernier pas confirmé par l'autre machine, pour chacun de nos joueurs locaux. */
  private readonly acked = new Map<number, number>();
  /** Commandes locales encodées, gardées jusqu'à l'accusé de réception. */
  private readonly outbox = new Map<number, Map<number, Uint8Array>>();

  constructor(
    state: S,
    game: RollbackGame<S, ArcadeCommands>,
    readonly local: readonly number[],
    options: { players: number; inputDelay: number; remoteInputDelay?: number; maxRollback: number; startTick?: number },
    hooks: RollbackHooks<S> = {},
  ) {
    this.session = new RollbackSession(state, game, { ...options, local, neutral: NEUTRAL_ARCADE, same: sameCommands }, hooks);
    for (const p of local) {
      this.acked.set(p, this.session.confirmedTick(p));
      this.outbox.set(p, new Map());
    }
  }

  /** Commande d'un joueur local pour le prochain pas qui l'attend (`session.localTick`) ; rend ce pas. */
  addLocal(player: number, commands: ArcadeCommands): number {
    const tick = this.session.addLocal(player, commands);
    this.outbox.get(player)!.set(tick, encodeCommands(commands));
    return tick;
  }

  /** Paquet à envoyer maintenant. */
  packet(): InputPacket {
    const inputs: InputPacket['inputs'] = [];
    for (const player of this.local) {
      const start = this.acked.get(player)! + 1;
      const pending = this.outbox.get(player)!;
      let end = start - 1;
      while (end < start + MAX_RESEND - 1 && pending.has(end + 1)) end++;
      if (end < start) continue;
      const data = new Uint8Array((end - start + 1) * COMMAND_BYTES);
      for (let t = start; t <= end; t++) data.set(pending.get(t)!, (t - start) * COMMAND_BYTES);
      inputs.push({ player, start, data });
    }
    const acks: InputPacket['acks'] = [];
    for (let player = 0; player < this.session.options.players; player++) {
      if (!this.local.includes(player)) acks.push({ player, tick: this.session.confirmedTick(player) });
    }
    return { inputs, acks };
  }

  /** Paquet reçu de l'autre machine. */
  receive(packet: InputPacket): void {
    for (const { player, start, data } of packet.inputs) {
      for (let i = 0; i * COMMAND_BYTES < data.length; i++) {
        this.session.addRemote(player, start + i, decodeCommands(data, i * COMMAND_BYTES));
      }
    }
    for (const { player, tick } of packet.acks) {
      const known = this.acked.get(player);
      if (known === undefined || tick <= known) continue;
      this.acked.set(player, tick);
      const pending = this.outbox.get(player)!;
      for (let t = known + 1; t <= tick; t++) pending.delete(t);
    }
  }
}
