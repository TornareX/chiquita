import { describe, expect, it } from 'vitest';
import { decodeCommands } from '../../src/net/codec';
import { Lobby, RATE_KICK, RATE_LIMIT } from '../../src/net/lobby';
import { MAX_AHEAD, MatchServer } from '../../src/net/matchServer';
import { decodeFrame, encodeInputs, type ClientMessage, type MatchConfig, type RoomView, type ServerMessage } from '../../src/net/protocol';

/**
 * Le serveur face à un client modifié (`research/en-ligne/HEBERGEMENT_GRATUIT.md`) : messages absurdes, commandes
 * pour des pas lointains, inondation, erreur dans une salle. Aucun ne doit faire tomber le serveur ni gêner les
 * autres salles.
 */

function member(lobby: Lobby) {
  const received: (ServerMessage | Uint8Array)[] = [];
  let closed = false;
  const id = lobby.connect(
    (message) => received.push(message),
    () => (closed = true),
  );
  const all = <T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] =>
    received.filter((m): m is Extract<ServerMessage, { t: T }> => !(m instanceof Uint8Array) && m.t === t);
  return {
    id,
    received,
    all,
    last: <T extends ServerMessage['t']>(t: T) => all(t).at(-1),
    room: (): RoomView => all('room').at(-1)!.room,
    frames: () => received.filter((m): m is Uint8Array => m instanceof Uint8Array).map((b) => decodeFrame(b)!),
    closed: () => closed,
  };
}

/** Message tel qu'un client modifié peut l'envoyer : n'importe quoi derrière le type. */
const forged = (value: unknown): ClientMessage => value as ClientMessage;

function setup() {
  let now = 0;
  const errors: unknown[] = [];
  // Hasard qui avance (un hasard figé donnerait le même code à chaque salle, et deux salles ne pourraient coexister).
  let draws = 0;
  const lobby = new Lobby(
    () => now,
    () => (draws++ * 0.137) % 1,
    null,
    (_, error) => errors.push(error),
  );
  return { lobby, errors, at: (ms: number) => (now = ms), now: () => now };
}

describe('messages piégés', () => {
  it('des champs absurdes sont ignorés ou remplacés, et le match tourne normalement', () => {
    const { lobby, errors, at } = setup();
    const host = member(lobby);
    for (const junk of [null, 5, 'texte', [], {}, { t: 'inconnu' }, { t: 'ping', at: 'hier' }, { t: 'ping' }, { t: 'join', code: { a: 1 } }]) {
      expect(() => lobby.message(host.id, forged(junk))).not.toThrow();
    }
    expect(host.all('pong')).toHaveLength(0);

    lobby.message(
      host.id,
      // Nom piégé : un caractère nul, une inversion du sens d'écriture (U+202E), un séparateur de ligne (U+2028).
      forged({ t: 'hello', name: `Xa${String.fromCharCode(0)}vi${String.fromCharCode(0x202e)}er${String.fromCharCode(0x2028)}<b>trop long pour un nom</b>`, prefs: { assist: 'triche', prepMove: { x: 1 }, hand: 'left', bonus: 9 }, token: 42 }),
    );
    lobby.message(host.id, { t: 'create' });
    for (const seat of [1.5, '2', -1, 99, NaN, { s: 1 }]) lobby.message(host.id, forged({ t: 'seat', seat }));
    expect(host.room().seats).toEqual([host.id, null, null, null]);
    lobby.message(host.id, forged({ t: 'setup', format: 'triple', level: 'dieu' }));
    expect(host.room()).toMatchObject({ format: 'double', level: 'normal' });

    lobby.message(host.id, { t: 'start' });
    const start = host.last('start')!;
    const seat = start.config.seats[0]!;
    // Le nom reste du texte (le jeu l'affiche comme tel) : sans contrôle ni inversion, 20 caractères au plus.
    expect(seat).toEqual({ kind: 'human', name: 'Xavier<b>trop long p', assist: 'magnet', prepMove: 'libre', hand: 'left' });
    expect(start.config.seats.slice(1).map((s) => s.kind === 'ai' && s.level)).toEqual(['normal', 'normal', 'normal']);

    at(start.startAt + 1000);
    lobby.tick();
    expect(host.frames().reduce((sum, f) => sum + f.count, 0)).toBeGreaterThanOrEqual(240);
    expect(errors).toEqual([]);
  });

  it('un stick à -128 (jamais écrit par le jeu) est lu comme -127', () => {
    const commands = decodeCommands(new Uint8Array([0x80, 0x80, 0, 0]));
    expect(commands.stick).toEqual({ forward: -1, right: -1 });
  });
});

describe('commandes pour des pas lointains', () => {
  it('le serveur ne garde pas de commande au-delà de MAX_AHEAD pas : sa mémoire ne grossit pas', () => {
    const config: MatchConfig = {
      format: 'simple',
      rules: { setsToWin: 1, gamesPerSet: 6, goldenPoint: false },
      seats: [
        { kind: 'human', name: 'A', assist: 'magnet', prepMove: 'libre', hand: 'right' },
        { kind: 'ai', level: 'normal' },
      ],
      seed: 1,
      pressure: 1,
    };
    const match = new MatchServer(config);
    const pending = (match as unknown as { pending: Map<number, unknown>[] }).pending[0]!;
    const steps = (n: number) => new Uint8Array(n * 4);
    match.receive(0, 4_000_000_000, steps(16_000));
    match.receive(0, MAX_AHEAD, steps(10));
    expect(pending.size).toBe(0);
    // À cheval sur la limite : seuls les pas permis sont gardés.
    match.receive(0, MAX_AHEAD - 5, steps(10));
    expect(pending.size).toBe(5);
    match.receive(0, 0, steps(20));
    expect(pending.size).toBe(25);
  });

  it('par le salon aussi : une trame de commandes lointaines ne casse pas le match', () => {
    const { lobby, errors, at } = setup();
    const host = member(lobby);
    lobby.message(host.id, { t: 'create' });
    lobby.message(host.id, { t: 'start' });
    lobby.binary(host.id, encodeInputs(0, 0xffffffff, new Uint8Array(4 * 1000)));
    lobby.binary(host.id, new Uint8Array([1, 2, 3]));
    lobby.binary(host.id, encodeInputs(3, 0, new Uint8Array(4)));
    at(host.last('start')!.startAt + 500);
    lobby.tick();
    expect(host.frames().length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

describe('inondation', () => {
  it(`au-delà de ${RATE_LIMIT} messages par seconde, ignorés ; à ${RATE_KICK}, coupé sans place gardée`, () => {
    const { lobby, at } = setup();
    const flooder = member(lobby);
    const friend = member(lobby);
    lobby.message(flooder.id, { t: 'hello', name: 'Flot', prefs: { assist: 'magnet', prepMove: 'libre', hand: 'right' }, token: 'flot', version: 'x' });
    lobby.message(flooder.id, { t: 'create' });
    lobby.message(friend.id, { t: 'join', code: flooder.room().code });
    lobby.message(flooder.id, { t: 'start' });
    at(1);
    const before = flooder.all('pong').length;
    for (let i = 0; i < RATE_LIMIT + 50; i++) lobby.message(flooder.id, { t: 'ping', at: i });
    expect(flooder.all('pong').length - before).toBeLessThan(RATE_LIMIT);
    expect(flooder.closed()).toBe(false);

    // Une seconde plus tard, le compteur repart : un client normal n'est jamais gêné.
    at(1001);
    lobby.message(flooder.id, { t: 'ping', at: 0 });
    expect(flooder.last('pong')?.at).toBe(0);

    for (let i = 0; i < RATE_KICK; i++) lobby.binary(flooder.id, encodeInputs(0, 0, new Uint8Array(4)));
    expect(flooder.closed()).toBe(true);
    // Sa place passe à l'IA pour de bon : revenir avec son jeton ne la lui rend pas.
    expect(friend.room().seats).toEqual([null, friend.id, null, null]);
    lobby.disconnect(flooder.id);
    const back = member(lobby);
    lobby.message(back.id, { t: 'hello', name: 'Flot', prefs: { assist: 'magnet', prepMove: 'libre', hand: 'right' }, token: 'flot', version: 'x' });
    expect(back.last('resume')).toBeUndefined();
    // Le serveur reste là pour les autres.
    lobby.message(friend.id, { t: 'ping', at: 7 });
    expect(friend.last('pong')?.at).toBe(7);
  });
});

describe('erreur dans une salle', () => {
  it('seule cette salle est fermée, avec un message ; les autres continuent', () => {
    const { lobby, errors, at } = setup();
    const a = member(lobby);
    const b = member(lobby);
    lobby.message(a.id, { t: 'create' });
    lobby.message(b.id, { t: 'create' });
    const codeA = a.room().code;
    lobby.message(a.id, { t: 'start' });
    lobby.message(b.id, { t: 'start' });
    const rooms = (lobby as unknown as { rooms: Map<string, { match: MatchServer }> }).rooms;
    rooms.get(codeA)!.match.advanceTo = () => {
      throw new Error('bogue simulé');
    };

    at(Math.max(a.last('start')!.startAt, b.last('start')!.startAt) + 500);
    expect(() => lobby.tick()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(a.last('error')?.message).toContain('erreur du serveur');
    const bFrames = b.frames().length;
    expect(bFrames).toBeGreaterThan(0);

    // La salle A n'existe plus ; B tourne toujours ; A peut en recréer une.
    const c = member(lobby);
    lobby.message(c.id, { t: 'join', code: codeA });
    expect(c.last('error')?.message).toContain('Aucune salle');
    at(a.last('start')!.startAt + 1000);
    lobby.tick();
    expect(b.frames().length).toBeGreaterThan(bFrames);
    lobby.message(a.id, { t: 'create' });
    expect(a.room().playing).toBe(false);
  });

  it('une erreur pendant un message ferme la salle du joueur, pas le serveur', () => {
    const { lobby, errors, at } = setup();
    const a = member(lobby);
    lobby.message(a.id, { t: 'create' });
    lobby.message(a.id, { t: 'start' });
    at(a.last('start')!.startAt + 100);
    const rooms = (lobby as unknown as { rooms: Map<string, { match: MatchServer }> }).rooms;
    rooms.get(a.room().code)!.match.receive = () => {
      throw new Error('bogue simulé');
    };
    expect(() => lobby.binary(a.id, encodeInputs(0, 0, new Uint8Array(4)))).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(a.last('error')?.message).toContain('erreur du serveur');
  });
});
