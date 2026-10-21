import { AI_LEVELS, Bot, type AiLevel } from '../sim/bot';
import { Duel, type AssistLevel, type DuelFormat, type PrepMove } from '../sim/duel';
import type { MatchRules } from '../sim/score';
import type { Hand } from '../sim/shots';
import { COMMAND_BYTES } from './codec';

/**
 * Ce que se disent le serveur de jeu (`server/main.ts`, `matchServer.ts`) et les navigateurs (`onlineClient.ts`) :
 * messages de salle en JSON, commandes en binaire (4 octets par joueur et par pas, `codec.ts`).
 */

/** Une place du match : un humain (avec ses réglages, que tout le monde doit connaître) ou une IA. */
export type SeatConfig =
  | { kind: 'human'; name: string; assist: AssistLevel; prepMove: PrepMove; hand: Hand }
  | { kind: 'ai'; level: AiLevel };

/** Tout ce qu'il faut pour que chaque machine parte exactement du même match. */
export interface MatchConfig {
  format: DuelFormat;
  rules: MatchRules | null;
  seats: SeatConfig[];
  /** Graine des IA (sur le serveur). */
  seed: number;
  /** Pression (voir `?pression`), 1 par défaut. */
  pressure: number;
}

/** Réglages qu'un joueur apporte à sa place. */
export interface PlayerPrefs {
  assist: AssistLevel;
  prepMove: PrepMove;
  hand: Hand;
}

/** La partie de départ, identique sur le serveur et chez chaque joueur. */
export function createMatchDuel(config: MatchConfig): Duel {
  const duel = new Duel(config.rules, config.format);
  duel.players.forEach((player, i) => {
    const seat = config.seats[i];
    if (seat?.kind === 'human') {
      player.assist = seat.assist;
      player.prepMove = seat.prepMove;
      player.hand = seat.hand;
    } else {
      // Comme hors ligne : une IA court avec l'aimant et garde le stick libre.
      player.assist = 'magnet';
      player.prepMove = 'libre';
      player.hand = 'right';
    }
  });
  duel.profile.rally.pressure.scale = config.pressure;
  return duel;
}

/** Les IA des places vides, jouées par le serveur (`null` pour un humain). */
export function createBots(config: MatchConfig, duel: Duel): (Bot | null)[] {
  return duel.players.map((_, i) => {
    const seat = config.seats[i];
    if (!seat || seat.kind === 'human') return null;
    const partner = duel.partnerOf(i);
    const followPartner = partner !== null && config.seats[partner]?.kind === 'human';
    return new Bot(i, config.seed + i, { ...AI_LEVELS[seat.level], followPartner });
  });
}

/** Messages du navigateur vers le serveur. */
export type ClientMessage =
  /**
   * `token` : identifiant de cette fenêtre, gardé au rechargement (reprendre sa place après une coupure) ; `version` :
   * celle du jeu (`version.ts`), refusée si elle diffère de celle du serveur.
   */
  | { t: 'hello'; name: string; prefs: PlayerPrefs; token: string; version: string }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'seat'; seat: number | null }
  | { t: 'setup'; format: DuelFormat; level: AiLevel }
  | { t: 'start' }
  | { t: 'ping'; at: number }
  /** Ce navigateur a divergé du serveur : il demande l'état du match. */
  | { t: 'resync' };

/** Une salle vue par un joueur. */
export interface RoomView {
  code: string;
  /** Son identifiant, et celui de l'hôte (qui règle et lance). */
  you: number;
  host: number;
  members: { id: number; name: string }[];
  /** Qui tient chaque place (identifiant), `null` : une IA. */
  seats: (number | null)[];
  format: DuelFormat;
  level: AiLevel;
  playing: boolean;
}

/** Messages du serveur vers le navigateur. */
export type ServerMessage =
  | { t: 'room'; room: RoomView }
  | { t: 'error'; message: string }
  | { t: 'pong'; at: number; server: number }
  /** Le match commence : `startAt` en temps du serveur (ms), pas 0 du match ; `seats` : les places de ce joueur. */
  | { t: 'start'; config: MatchConfig; startAt: number; seats: number[] }
  /** Empreinte de l'état du serveur après le pas `tick - 1` (c'est-à-dire quand `duel.tick === tick`). */
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'end'; reason: string }
  /**
   * Reprise après une coupure : comme `start`, plus l'état du match (`snapshot.ts`) au pas `tick` ; les commandes
   * retenues suivantes commencent à ce pas.
   */
  | { t: 'resume'; config: MatchConfig; startAt: number; seats: number[]; tick: number; state: string }
  /** Réponse à `resync` : l'état du match au pas `tick`. */
  | { t: 'state'; tick: number; state: string };

/** Frames binaires : commandes d'un joueur (navigateur → serveur), commandes retenues de tous (serveur → navigateurs). */
const INPUTS = 1;
const FINALS = 2;
const HEADER = 8;

/** `count` commandes encodées de la place `seat`, à partir du pas `start`. */
export function encodeInputs(seat: number, start: number, commands: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(HEADER + commands.length);
  const view = new DataView(out.buffer);
  out[0] = INPUTS;
  out[1] = seat;
  view.setUint32(2, start, true);
  view.setUint16(6, commands.length / COMMAND_BYTES, true);
  out.set(commands, HEADER);
  return out;
}

/** Commandes retenues par le serveur pour `count` pas à partir de `start`, `players` commandes par pas. */
export function encodeFinals(start: number, players: number, frames: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(HEADER + frames.length);
  const view = new DataView(out.buffer);
  out[0] = FINALS;
  out[1] = players;
  view.setUint32(2, start, true);
  view.setUint16(6, frames.length / (players * COMMAND_BYTES), true);
  out.set(frames, HEADER);
  return out;
}

export type BinaryFrame =
  | { kind: 'inputs'; seat: number; start: number; count: number; data: Uint8Array }
  | { kind: 'finals'; players: number; start: number; count: number; data: Uint8Array };

export function decodeFrame(bytes: Uint8Array): BinaryFrame | null {
  if (bytes.length < HEADER) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = view.getUint32(2, true);
  const count = view.getUint16(6, true);
  const data = bytes.subarray(HEADER);
  if (bytes[0] === INPUTS) {
    if (data.length !== count * COMMAND_BYTES) return null;
    return { kind: 'inputs', seat: bytes[1]!, start, count, data };
  }
  if (bytes[0] === FINALS) {
    const players = bytes[1]!;
    if (data.length !== count * players * COMMAND_BYTES) return null;
    return { kind: 'finals', players, start, count, data };
  }
  return null;
}
