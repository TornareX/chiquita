import { deepClone } from '../modes/replay';
import type { ArcadeCommands } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import type { Duel } from '../sim/duel';
import { quantizeCommands } from './codec';
import { FakeLink, type LinkConditions } from './link';
import { Peer, type InputPacket } from './peer';
import type { RollbackGame, RollbackHooks } from './rollback';

/** Le match de padel vu par le moteur de rollback : copie profonde, retour sur place, un pas. */
export const DUEL_GAME: RollbackGame<Duel, ArcadeCommands> = {
  save: (duel) => deepClone(duel),
  // Sur place : le rendu, le HUD et l'entrée gardent le même objet.
  load: (duel, snapshot) => void Object.assign(duel, deepClone(snapshot)),
  step: (duel, commands) => duel.step(commands),
};

/**
 * Appelle `read` (une IA, ou la lecture d'une manette qui interroge la partie) sans laisser de trace dans l'état :
 * certaines questions posées à la partie remplissent des caches internes (`ownerCache`, `bounceCache`) que la
 * simulation relit ensuite. Une machine qui a posé la question et une autre qui ne l'a pas posée calculeraient
 * alors un match différent. Les champs dont le nom finit par `Cache` sont échangés le temps de la lecture avec
 * ceux de `outside` (les caches propres à ceux qui lisent, gardés d'une lecture à l'autre pour ne pas tout
 * recalculer), puis remis comme avant.
 */
export function withoutTrace<T>(duel: Duel, read: () => T, outside: Record<string, unknown> = {}): T {
  const record = duel as unknown as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => key.endsWith('Cache'));
  const copy = (value: unknown): unknown => (Array.isArray(value) ? [...(value as unknown[])] : value);
  const put = (key: string, value: unknown): void => {
    const current = record[key];
    if (Array.isArray(current) && Array.isArray(value)) current.splice(0, current.length, ...(value as unknown[]));
    else record[key] = value;
  };
  const inside = keys.map((key) => copy(record[key]));
  keys.forEach((key) => {
    if (key in outside) put(key, outside[key]);
  });
  try {
    return read();
  } finally {
    keys.forEach((key, i) => {
      outside[key] = copy(record[key]);
      put(key, inside[i]);
    });
  }
}

export interface NetMatchOptions {
  /** Joueurs tenus par la machine A (le joueur devant l'écran) ; les autres sont sur la machine B. */
  localA: readonly number[];
  /** Conditions de la liaison, les mêmes dans les deux sens. */
  conditions: LinkConditions;
  /** Délai d'entrée (pas de simulation) de la machine A. */
  inputDelay: number;
  /**
   * Délai d'entrée de la machine B (pas), par défaut le même. Pour les IA : 0. Elles décident en lisant leur propre
   * état (bouton tenu, `heldShot`) ; avec un délai, elles le voient en retard sur leurs commandes et relâchent puis
   * réappuient sans cesse (une IA qui remplace un joueur sur le serveur n'aura pas de délai non plus).
   */
  inputDelayB?: number;
  /** Prédiction au plus (pas) avant d'attendre. */
  maxRollback: number;
  seed?: number;
}

/** Lecture des commandes d'un joueur local, pour la partie telle que sa machine la voit. */
export type ReadCommands = (duel: Duel, player: number) => ArcadeCommands;

/**
 * Faux match en ligne à deux machines dans le même programme : A (le joueur devant l'écran, la partie dessinée)
 * et B (les autres, des IA), chacune avec sa copie du match et son moteur de rollback, reliées par deux fausses
 * liaisons. Comme en vrai, chacune ne voit les commandes de l'autre qu'avec la latence, et corrige.
 */
export class NetMatch {
  readonly a: Peer<Duel>;
  readonly b: Peer<Duel>;
  readonly linkAB: FakeLink<InputPacket>;
  readonly linkBA: FakeLink<InputPacket>;
  /** Temps de la fausse liaison (ms) : avance d'un pas de simulation à chaque `step`. */
  now = 0;
  /** Caches de ceux qui lisent la partie sur chaque machine (voir `withoutTrace`). */
  readonly outsideA: Record<string, unknown> = {};
  private readonly outsideB: Record<string, unknown> = {};

  constructor(
    /** Partie de la machine A (celle qu'on dessine) ; B part d'une copie. */
    readonly duel: Duel,
    readonly options: NetMatchOptions,
    hooksA: RollbackHooks<Duel> = {},
  ) {
    const players = duel.players.length;
    const localB = Array.from({ length: players }, (_, i) => i).filter((i) => !options.localA.includes(i));
    const delayA = options.inputDelay;
    const delayB = options.inputDelayB ?? delayA;
    const common = { players, maxRollback: options.maxRollback, startTick: duel.tick };
    this.a = new Peer(duel, DUEL_GAME, options.localA, { ...common, inputDelay: delayA, remoteInputDelay: delayB }, hooksA);
    this.b = new Peer(deepClone(duel), DUEL_GAME, localB, { ...common, inputDelay: delayB, remoteInputDelay: delayA });
    const seed = options.seed ?? 1;
    this.linkAB = new FakeLink(options.conditions, seed * 2 + 1);
    this.linkBA = new FakeLink(options.conditions, seed * 2 + 2);
  }

  /** Change les conditions de la liaison en cours de match. */
  setConditions(conditions: LinkConditions): void {
    this.linkAB.conditions = this.linkBA.conditions = conditions;
  }

  /**
   * Un pas de temps : livre les paquets arrivés, fait avancer chaque machine d'un pas si elle le peut (en lisant ses
   * joueurs locaux), puis envoie. Rend `true` si la machine A a avancé.
   */
  step(readA: ReadCommands, readB: ReadCommands, onLocal?: (player: number, tick: number, commands: ArcadeCommands) => void): boolean {
    this.now += SIM_DT * 1000;
    for (const packet of this.linkBA.receive(this.now)) this.a.receive(packet);
    for (const packet of this.linkAB.receive(this.now)) this.b.receive(packet);
    const moved = advance(this.a, readA, this.outsideA, onLocal);
    advance(this.b, readB, this.outsideB, onLocal);
    this.linkAB.send(this.now, this.a.packet());
    this.linkBA.send(this.now, this.b.packet());
    return moved;
  }
}

/** Rattrape les corrections, lit les joueurs locaux pour leur prochain pas (une fois par pas), puis avance. */
function advance(
  peer: Peer<Duel>,
  read: ReadCommands,
  outside: Record<string, unknown>,
  onLocal?: (player: number, tick: number, commands: ArcadeCommands) => void,
): boolean {
  const { session } = peer;
  session.rollback();
  const tick = session.localTick;
  for (const player of peer.local) {
    if (session.hasLocal(player, tick)) continue;
    // Arrondies avant d'entrer dans la simulation : les deux machines calculent avec les mêmes valeurs.
    const commands = quantizeCommands(withoutTrace(session.state, () => read(session.state, player), outside));
    peer.addLocal(player, commands);
    onLocal?.(player, tick, commands);
  }
  return session.advance();
}
