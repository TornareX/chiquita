import type { Duel } from '../sim/duel';
import { decodeFrame, encodeInputs, type ClientMessage, type MatchConfig, type PlayerPrefs, type RoomView, type ServerMessage } from './protocol';
import type { OnlineClient } from './onlineClient';
import { deserializeState } from './snapshot';
import { gameVersion } from './version';

/** Un ping toutes les ce nombre de ms : l'horloge du serveur reste calée et le ping affiché suit le réseau. */
const PING_EVERY = 500;
/** Liaison coupée pendant un match : nouvel essai toutes les ce nombre de ms. */
const RETRY_EVERY = 1000;
/** Identifiant de cette fenêtre (\`sessionStorage\` : gardé au rechargement, propre à chaque fenêtre). */
const TOKEN_KEY = 'padel.enligne.jeton';

/** Adresse du serveur : `?serveur=hote:port` (ou une adresse `ws://…` complète), sinon cette machine, port 2567. */
export function serverUrl(params: URLSearchParams): string {
  const given = params.get('serveur');
  const secure = location.protocol === 'https:';
  if (given?.startsWith('ws://') || given?.startsWith('wss://')) return given;
  return `${secure ? 'wss' : 'ws'}://${given ?? `${location.hostname || 'localhost'}:2567`}`;
}

/** Identifiant de cette fenêtre, créé à sa première visite. */
function windowToken(): string {
  try {
    const known = sessionStorage.getItem(TOKEN_KEY);
    if (known) return known;
    const token = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return crypto.randomUUID();
  }
}

/** Début (ou reprise) d'un match : `state` est l'état du match quand on reprend après une coupure. */
export interface MatchStart {
  config: MatchConfig;
  startAt: number;
  seats: number[];
  state?: Duel;
}

export interface ConnectionEvents {
  room(room: RoomView): void;
  start(start: MatchStart): void;
  error(message: string): void;
  /** Liaison perdue hors match : c'est fini. */
  closed(): void;
  /** Pendant un match : liaison perdue (on réessaie), puis rétablie (sa place reprise). */
  reconnecting(): void;
  reconnected(): void;
}

/**
 * Lien du navigateur avec le serveur de jeu (`server/main.ts`) : messages de salle, pings pour caler l'horloge, puis,
 * une fois le match lancé, commandes envoyées et commandes retenues reçues, données au client en ligne
 * (`OnlineClient`). Coupée pendant un match, la liaison se rétablit d'elle-même : le serveur a gardé la place et
 * renvoie l'état du match, d'où ce navigateur repart. Un navigateur qui a divergé demande lui aussi l'état.
 */
export class Connection {
  private socket!: WebSocket;
  private client: OnlineClient | null = null;
  private pings: number | null = null;
  /** Messages de match arrivés avant que le client ne soit prêt (rares : juste après le départ). */
  private early: (ServerMessage | Uint8Array)[] = [];
  /** Un match est en cours : ses messages vont au client, une coupure se rattrape. */
  private inMatch = false;
  private readonly token = windowToken();
  /** Pongs reçus avant le match, rejoués dans le client à sa création. */
  private readonly prematchPongs: { at: number; server: number; now: number }[] = [];

  constructor(
    private readonly url: string,
    private name: string,
    private readonly prefs: PlayerPrefs,
    private readonly events: ConnectionEvents,
  ) {
    this.connect();
  }

  private connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => {
      this.hello();
      this.pings = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), PING_EVERY);
      this.send({ t: 'ping', at: performance.now() });
    });
    socket.addEventListener('message', (event) => this.receive(event.data as ArrayBuffer | string));
    socket.addEventListener('close', () => {
      if (this.pings !== null) window.clearInterval(this.pings);
      this.pings = null;
      if (socket !== this.socket) return;
      if (!this.inMatch) {
        this.events.closed();
        return;
      }
      // Pendant un match : on réessaie jusqu'à ce que le serveur réponde ; il nous rendra notre place.
      this.events.reconnecting();
      window.setTimeout(() => this.connect(), RETRY_EVERY);
    });
  }

  /** Se présente (nom, réglages, jeton de la fenêtre, version du jeu). */
  hello(name = this.name): void {
    this.name = name;
    this.send({ t: 'hello', name, prefs: this.prefs, token: this.token, version: gameVersion() });
  }

  get open(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(message: ClientMessage): void {
    if (this.open) this.socket.send(JSON.stringify(message));
  }

  /** Le match a commencé : ses messages vont désormais à `client`, qui peut demander l'état s'il diverge. */
  attach(client: OnlineClient): void {
    this.client = client;
    client.onDesync = () => this.send({ t: 'resync' });
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
      case 'resume': {
        const state = deserializeState<Duel>(message.state);
        // Liaison rétablie en cours de match : on repart de l'état du serveur. Page rechargée : le match recommence ici.
        if (this.client) {
          this.client.resync(state);
          this.events.reconnected();
        } else {
          this.inMatch = true;
          this.events.start({ config: message.config, startAt: message.startAt, seats: message.seats, state });
        }
        return;
      }
      case 'state':
        this.client?.resync(deserializeState<Duel>(message.state));
        return;
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
}
