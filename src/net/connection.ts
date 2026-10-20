import { decodeFrame, encodeInputs, type ClientMessage, type MatchConfig, type PlayerPrefs, type RoomView, type ServerMessage } from './protocol';
import type { OnlineClient } from './onlineClient';

/** Un ping toutes les ce nombre de ms : l'horloge du serveur reste calée et le ping affiché suit le réseau. */
const PING_EVERY = 500;

/** Adresse du serveur : `?serveur=hote:port` (ou une adresse `ws://…` complète), sinon cette machine, port 2567. */
export function serverUrl(params: URLSearchParams): string {
  const given = params.get('serveur');
  const secure = location.protocol === 'https:';
  if (given?.startsWith('ws://') || given?.startsWith('wss://')) return given;
  return `${secure ? 'wss' : 'ws'}://${given ?? `${location.hostname || 'localhost'}:2567`}`;
}

export interface ConnectionEvents {
  room(room: RoomView): void;
  start(start: { config: MatchConfig; startAt: number; seats: number[] }): void;
  error(message: string): void;
  closed(): void;
}

/**
 * Lien du navigateur avec le serveur de jeu (`server/main.ts`) : messages de salle, pings pour caler l'horloge, puis,
 * une fois le match lancé, commandes envoyées et commandes retenues reçues, données au client en ligne (`OnlineClient`).
 */
export class Connection {
  private readonly socket: WebSocket;
  private client: OnlineClient | null = null;
  private pings: number | null = null;
  /** Messages de match arrivés avant que le client ne soit prêt (rares : juste après le départ). */
  private early: (ServerMessage | Uint8Array)[] = [];
  /** Le match en cours a démarré : ses messages vont au client. */
  private inMatch = false;

  constructor(
    url: string,
    name: string,
    prefs: PlayerPrefs,
    private readonly events: ConnectionEvents,
  ) {
    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.addEventListener('open', () => {
      this.send({ t: 'hello', name, prefs });
      this.pings = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), PING_EVERY);
      this.send({ t: 'ping', at: performance.now() });
    });
    this.socket.addEventListener('message', (event) => this.receive(event.data as ArrayBuffer | string));
    this.socket.addEventListener('close', () => {
      if (this.pings !== null) window.clearInterval(this.pings);
      events.closed();
    });
  }

  get open(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(message: ClientMessage): void {
    if (this.open) this.socket.send(JSON.stringify(message));
  }

  /** Le match a commencé : ses messages vont désormais à `client`. */
  attach(client: OnlineClient): void {
    this.client = client;
    for (const pong of this.prematchPongs.slice(-12)) client.pong(pong.at, pong.server, pong.now);
    const early = this.early;
    this.early = [];
    for (const message of early) this.route(message);
  }

  /** Envoie les commandes locales calculées depuis le dernier appel. */
  flush(): void {
    if (!this.client || !this.open) return;
    for (const input of this.client.takeInputs()) this.socket.send(encodeInputs(input.seat, input.start, input.data));
  }

  close(): void {
    this.socket.close();
  }

  private receive(data: ArrayBuffer | string): void {
    if (typeof data !== 'string') return this.route(new Uint8Array(data));
    const message = JSON.parse(data) as ServerMessage;
    switch (message.t) {
      case 'room':
        return this.events.room(message.room);
      case 'error':
        return this.events.error(message.message);
      case 'start':
        this.inMatch = true;
        return this.events.start(message);
      default:
        return this.route(message);
    }
  }

  /** Message du match (ou ping) : au client en ligne, ou mis de côté s'il n'existe pas encore. */
  private route(message: ServerMessage | Uint8Array): void {
    const client = this.client;
    if (message instanceof Uint8Array) {
      if (!client) {
        if (this.inMatch) this.early.push(message);
        return;
      }
      const frame = decodeFrame(message);
      if (frame?.kind === 'finals') client.receiveFinals(frame.start, frame.players, frame.count, frame.data);
      return;
    }
    if (message.t === 'pong') {
      // Les pongs d'avant le match calent déjà l'horloge : on les garde pour le client.
      if (client) client.pong(message.at, message.server, performance.now());
      else this.prematchPongs.push({ at: message.at, server: message.server, now: performance.now() });
      return;
    }
    if (message.t === 'hash') {
      if (client) client.receiveHash(message.tick, message.hash);
      else if (this.inMatch) this.early.push(message);
    }
  }

  /** Pongs reçus avant le match, rejoués dans le client à sa création. */
  readonly prematchPongs: { at: number; server: number; now: number }[] = [];
}
