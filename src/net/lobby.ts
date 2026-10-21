import type { AiLevel } from '../sim/bot';
import { SIM_DT } from '../sim/constants';
import type { DuelFormat } from '../sim/duel';
import { MatchServer } from './matchServer';
import { encodeFinals, decodeFrame, type ClientMessage, type MatchConfig, type PlayerPrefs, type RoomView, type ServerMessage } from './protocol';
import { serializeState } from './snapshot';

const TICK_MS = SIM_DT * 1000;
/** Le match commence ce temps après « Lancer » : chacun a le temps de recevoir la configuration (ms). */
const START_LEAD = 800;
/** Lettres des codes de salle : sans I, O, 0, 1, faciles à dicter. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RULES = { setsToWin: 1, gamesPerSet: 6, goldenPoint: false };
/** Place gardée à un joueur coupé pendant un match (ms) : l'IA la tient, il la reprend s'il revient à temps. */
export const HOLD_MS = 60_000;

/** Un navigateur connecté : ce qu'on sait de lui, et comment lui écrire. */
interface Member {
  id: number;
  /** Identifiant de sa fenêtre, gardé d'une connexion à l'autre (`hello`). */
  token: string;
  /** Version différente de celle du serveur : on ne l'écoute plus. */
  refused: boolean;
  name: string;
  prefs: PlayerPrefs;
  room: Room | null;
  send(message: ServerMessage | Uint8Array): void;
}

interface Room {
  code: string;
  host: number;
  members: Member[];
  seats: (number | null)[];
  format: DuelFormat;
  level: AiLevel;
  match: MatchServer | null;
  startAt: number;
  /** Places de joueurs coupés pendant le match, par jeton : la place, et jusqu'à quand elle est gardée. */
  held: Map<string, { seat: number; until: number }>;
}

const DEFAULT_PREFS: PlayerPrefs = { assist: 'magnet', prepMove: 'libre', hand: 'right' };

/**
 * Les salles privées (phase 1 du plan) : un joueur crée une salle et reçoit un code à 4 lettres, ses amis le tapent
 * pour la rejoindre, chacun prend une place (les places libres sont jouées par l'IA), l'hôte choisit simple ou double
 * et le niveau de l'IA, puis lance. Un joueur qui part pendant le match est remplacé par une IA. Rien ici ne parle au
 * réseau : `server/main.ts` donne les messages et l'heure (`now`, ms).
 */
export class Lobby {
  private readonly rooms = new Map<string, Room>();
  private readonly members = new Map<number, Member>();
  private nextId = 1;

  constructor(
    private readonly now: () => number,
    private readonly random: () => number = Math.random,
    /** Version du jeu attendue (`version.ts`) ; `null` : tout le monde est accepté (tests). */
    private readonly version: string | null = null,
  ) {}

  /** Un navigateur se connecte ; rend son identifiant. */
  connect(send: Member['send']): number {
    const id = this.nextId++;
    this.members.set(id, { id, token: `anonyme-${id}`, refused: false, name: `Joueur ${id}`, prefs: DEFAULT_PREFS, room: null, send });
    return id;
  }

  disconnect(id: number): void {
    const member = this.members.get(id);
    if (!member) return;
    // Coupé pendant un match : sa place lui est gardée un moment (l'IA la tient en attendant).
    this.leave(member, true);
    this.members.delete(id);
  }

  /** Message texte (JSON) d'un navigateur. */
  message(id: number, message: ClientMessage): void {
    const member = this.members.get(id);
    if (!member || member.refused) return;
    const room = member.room;
    switch (message.t) {
      case 'ping':
        member.send({ t: 'pong', at: message.at, server: this.now() });
        return;
      case 'hello': {
        if (this.version !== null && message.version !== this.version) {
          member.refused = true;
          member.send({ t: 'error', message: 'Ta version du jeu n’est pas celle du serveur : recharge la page (Ctrl+F5).' });
          return;
        }
        member.name = String(message.name).slice(0, 20) || member.name;
        member.prefs = { ...DEFAULT_PREFS, ...message.prefs };
        if (message.token) member.token = String(message.token).slice(0, 64);
        // Revenu après une coupure pendant un match : il reprend sa place.
        for (const held of this.rooms.values()) {
          const seat = held.held.get(member.token);
          if (seat && held.match && !member.room) this.resume(member, held, seat.seat);
        }
        return;
      }
      case 'resync':
        if (!room?.match || this.now() < room.startAt) return;
        this.flush(room);
        member.send({ t: 'state', tick: room.match.tick, state: serializeState(room.match.duel) });
        return;
      case 'leave':
        this.leave(member);
        return;
      case 'create':
        this.leave(member);
        this.join(member, this.createRoom(member.id));
        return;
      case 'join': {
        const target = this.rooms.get(String(message.code).toUpperCase());
        if (!target) return member.send({ t: 'error', message: 'Aucune salle avec ce code : vérifie les 4 lettres avec tes amis.' });
        if (target.match) return member.send({ t: 'error', message: 'Le match de cette salle a déjà commencé : crée ta salle, ou demande un autre code.' });
        this.leave(member);
        this.join(member, target);
        return;
      }
      case 'seat': {
        if (!room || room.match) return;
        const seat = message.seat;
        const count = room.format === 'double' ? 4 : 2;
        room.seats = room.seats.map((holder) => (holder === member.id ? null : holder));
        if (seat !== null && seat >= 0 && seat < count && room.seats[seat] === null) room.seats[seat] = member.id;
        this.broadcastRoom(room);
        return;
      }
      case 'setup':
        if (!room || room.match || room.host !== member.id) return;
        room.format = message.format === 'simple' ? 'simple' : 'double';
        room.level = message.level;
        // En simple, les places 3 et 4 n'existent pas.
        if (room.format === 'simple') room.seats = room.seats.map((holder, i) => (i < 2 ? holder : null));
        this.broadcastRoom(room);
        return;
      case 'start':
        if (!room || room.match || room.host !== member.id) return;
        this.start(room);
        return;
    }
  }

  /** Message binaire (commandes d'une place). */
  binary(id: number, bytes: Uint8Array): void {
    const member = this.members.get(id);
    const room = member?.room;
    if (!member || !room?.match) return;
    const frame = decodeFrame(bytes);
    // On ne joue que pour sa place.
    if (frame?.kind !== 'inputs' || room.seats[frame.seat] !== member.id) return;
    room.match.receive(frame.seat, frame.start, frame.data);
  }

  /** Fait avancer les matchs jusqu'à maintenant et envoie à chacun les commandes retenues et les empreintes. */
  tick(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      // Places gardées trop longtemps : elles restent à l'IA ; salle vide sans place gardée : fermée.
      for (const [token, held] of room.held) if (held.until < now) room.held.delete(token);
      if (room.members.length === 0 && room.held.size === 0) {
        this.rooms.delete(room.code);
        continue;
      }
      const match = room.match;
      if (!match || now < room.startAt) continue;
      match.advanceTo(Math.floor((now - room.startAt) / TICK_MS) + 1);
      this.flush(room);
    }
  }

  /** Envoie à chacun les commandes retenues et les empreintes pas encore envoyées. */
  private flush(room: Room): void {
    const match = room.match;
    if (!match) return;
    const finals = match.takeFinals();
    const hashes = match.takeHashes();
    const bytes = finals ? encodeFinals(finals.start, match.players, finals.data) : null;
    for (const member of room.members) {
      if (bytes) member.send(bytes);
      for (const h of hashes) member.send({ t: 'hash', ...h });
    }
  }

  /** Rend sa place à un joueur revenu : il reçoit l'état du match, les commandes suivantes partent de ce pas. */
  private resume(member: Member, room: Room, seat: number): void {
    const match = room.match!;
    room.held.delete(member.token);
    // Les autres reçoivent d'abord tout ce qui précède : l'état envoyé est celui du pas où reprend l'envoi.
    if (this.now() >= room.startAt) {
      match.advanceTo(Math.floor((this.now() - room.startAt) / TICK_MS) + 1);
      this.flush(room);
    }
    member.room = room;
    room.members.push(member);
    room.seats[seat] = member.id;
    match.restoreHuman(seat);
    member.send({ t: 'resume', config: match.config, startAt: room.startAt, seats: [seat], tick: match.tick, state: serializeState(match.duel) });
    this.broadcastRoom(room);
  }

  /** Salles ouvertes (pour le journal du serveur). */
  get roomCount(): number {
    return this.rooms.size;
  }

  private createRoom(host: number): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = { code, host, members: [], seats: [null, null, null, null], format: 'double', level: 'normal', match: null, startAt: 0, held: new Map() };
    this.rooms.set(code, room);
    return room;
  }

  private join(member: Member, room: Room): void {
    member.room = room;
    room.members.push(member);
    // Première place libre, s'il y en a une.
    const count = room.format === 'double' ? 4 : 2;
    const free = room.seats.findIndex((holder, i) => holder === null && i < count);
    if (free >= 0) room.seats[free] = member.id;
    this.broadcastRoom(room);
  }

  /** `hold` : coupé (pas parti exprès) ; pendant un match, sa place lui est gardée `HOLD_MS`. */
  private leave(member: Member, hold = false): void {
    const room = member.room;
    if (!room) return;
    member.room = null;
    room.members = room.members.filter((m) => m !== member);
    const seat = room.seats.indexOf(member.id);
    if (seat >= 0) {
      room.seats[seat] = null;
      room.match?.replaceWithBot(seat, room.level);
      if (hold && room.match) room.held.set(member.token, { seat, until: this.now() + HOLD_MS });
    }
    if (room.members.length === 0) {
      // Plus personne, mais une place gardée : la salle attend (`tick` la ferme à l'échéance).
      if (room.held.size === 0) this.rooms.delete(room.code);
      return;
    }
    if (room.host === member.id) room.host = room.members[0]!.id;
    this.broadcastRoom(room);
  }

  private start(room: Room): void {
    const count = room.format === 'double' ? 4 : 2;
    const config: MatchConfig = {
      format: room.format,
      rules: RULES,
      seats: Array.from({ length: count }, (_, i) => {
        const member = room.members.find((m) => m.id === room.seats[i]);
        return member ? { kind: 'human' as const, name: member.name, ...member.prefs } : { kind: 'ai' as const, level: room.level };
      }),
      seed: Math.floor(this.random() * 1e9),
      pressure: 1,
    };
    room.match = new MatchServer(config);
    room.startAt = this.now() + START_LEAD;
    for (const member of room.members) {
      const seats = room.seats.flatMap((holder, i) => (holder === member.id && i < count ? [i] : []));
      member.send({ t: 'start', config, startAt: room.startAt, seats });
    }
    this.broadcastRoom(room);
  }

  private broadcastRoom(room: Room): void {
    for (const member of room.members) {
      const view: RoomView = {
        code: room.code,
        you: member.id,
        host: room.host,
        members: room.members.map((m) => ({ id: m.id, name: m.name })),
        seats: room.seats.slice(0, room.format === 'double' ? 4 : 2),
        format: room.format,
        level: room.level,
        playing: room.match !== null,
      };
      member.send({ t: 'room', room: view });
    }
  }
}
