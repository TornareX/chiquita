import { describe, expect, it } from 'vitest';
import { deepClone } from '../../src/modes/replay';
import { withoutTrace } from '../../src/net/duelNet';
import { hashState } from '../../src/net/hash';
import { Lobby } from '../../src/net/lobby';
import { OnlineClient } from '../../src/net/onlineClient';
import { createMatchDuel, decodeFrame, encodeInputs, type ServerMessage } from '../../src/net/protocol';
import { deserializeState, serializeState } from '../../src/net/snapshot';
import { gameVersion } from '../../src/net/version';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { SIM_DT } from '../../src/sim/constants';
import type { Duel } from '../../src/sim/duel';

const TICK_MS = SIM_DT * 1000;

describe('état transmis', () => {
  it('relu à l’identique : même empreinte, même suite du match', () => {
    const duel = createMatchDuel({
      format: 'double',
      rules: { setsToWin: 1, gamesPerSet: 6, goldenPoint: false },
      seats: [0, 1, 2, 3].map(() => ({ kind: 'ai' as const, level: 'normal' as const })),
      seed: 3,
      pressure: 1,
    });
    const bots = duel.players.map((_, i) => new Bot(i, 40 + i, AI_LEVELS.normal));
    for (let t = 0; t < 240 * 20; t++) duel.step(bots.map((b) => b.commands(duel)));
    const text = serializeState(duel);
    const copy = deserializeState<Duel>(text);
    expect(hashState(copy)).toBe(hashState(duel));
    expect(text.length).toBeLessThan(60_000);
    // La suite, avec les mêmes commandes, reste identique.
    const reference = deepClone(duel);
    for (let t = 0; t < 240 * 10; t++) {
      // Les IA lisent la partie sans y laisser de trace (sinon leurs caches changeraient l'empreinte).
      const commands = bots.map((b) => withoutTrace(reference, () => b.commands(reference)));
      reference.step(commands);
      copy.step(commands);
    }
    expect(hashState(copy)).toBe(hashState(reference));
  });
});

/** Un navigateur relié au salon sans réseau (messages livrés aussitôt), qui joue sa place avec une IA. */
class Browser {
  id = 0;
  inbox: (ServerMessage | Uint8Array)[] = [];
  client: OnlineClient | null = null;
  errors: string[] = [];
  private readonly bot: Bot;

  constructor(
    private readonly lobby: Lobby,
    readonly token: string,
    readonly name: string,
    seed: number,
  ) {
    this.bot = new Bot(0, seed, AI_LEVELS.normal);
  }

  /** Connexion (ou reconnexion) : comme une page qu'on charge, sans client tant que le match n'a pas repris. */
  connect(version: string): void {
    this.client = null;
    this.inbox = [];
    this.id = this.lobby.connect((message) => this.inbox.push(message));
    this.lobby.message(this.id, { t: 'hello', name: this.name, prefs: { assist: 'magnet', prepMove: 'libre', hand: 'right' }, token: this.token, version });
  }

  /** Un pas de la boucle du jeu : messages reçus, ping, calcul, commandes envoyées. */
  frame(now: number): void {
    const inbox = this.inbox;
    this.inbox = [];
    for (const message of inbox) {
      if (message instanceof Uint8Array) {
        const frame = decodeFrame(message);
        if (frame?.kind === 'finals') this.client?.receiveFinals(frame.start, frame.players, frame.count, frame.data);
        continue;
      }
      if (message.t === 'error') this.errors.push(message.message);
      if (message.t === 'start' || message.t === 'resume') {
        const duel = message.t === 'resume' ? deserializeState<Duel>(message.state) : createMatchDuel(message.config);
        this.client = new OnlineClient(duel, { seats: message.seats, startAt: message.startAt, inputDelay: 4, maxRollback: 60 });
        this.client.onDesync = () => this.lobby.message(this.id, { t: 'resync' });
      }
      if (message.t === 'state') this.client?.resync(deserializeState<Duel>(message.state));
      if (message.t === 'hash') this.client?.receiveHash(message.tick, message.hash);
      if (message.t === 'pong') this.client?.pong(message.at, message.server, now);
    }
    if (Math.floor(now / 250) !== Math.floor((now - TICK_MS) / 250)) this.lobby.message(this.id, { t: 'ping', at: now });
    if (!this.client?.ready) return;
    const seat = this.client.options.seats[0]!;
    // L'IA de cette place joue pour ce navigateur ; elle connaît sa place une fois le match commencé.
    (this.bot as unknown as { index: number }).index = seat;
    this.client.step((state) => this.bot.commands(state), now);
    for (const input of this.client.takeInputs()) this.lobby.binary(this.id, encodeInputs(input.seat, input.start, input.data));
  }
}

describe('jeu en ligne robuste', () => {
  it('coupé 2 s puis revenu (page rechargée) : il reprend sa place ; divergé : il repart de l’état du serveur', () => {
    let now = 0;
    const version = gameVersion();
    const lobby = new Lobby(() => now, () => 0.3, version);
    const host = new Browser(lobby, 'jeton-hote', 'Xavier', 61);
    const guest = new Browser(lobby, 'jeton-invite', 'Ami', 62);
    const run = (seconds: number, playing: Browser[]): void => {
      for (const end = now + seconds * 1000; now < end; now += TICK_MS) {
        lobby.tick();
        for (const browser of playing) browser.frame(now);
      }
    };
    host.connect(version);
    guest.connect(version);
    lobby.message(host.id, { t: 'create' });
    // Le code de la salle : dans le message « room » que l'hôte vient de recevoir.
    const room = host.inbox.flatMap((m) => (!(m instanceof Uint8Array) && m.t === 'room' ? [m.room.code] : [])).at(-1)!;
    expect(room).toMatch(/^[A-Z]{4}$/);
    lobby.message(guest.id, { t: 'join', code: room });
    lobby.message(host.id, { t: 'start' });
    run(6, [host, guest]);
    expect(guest.client!.stats.checked).toBeGreaterThanOrEqual(4);

    // Coupé : sa place est gardée, l'IA la tient ; l'hôte continue.
    lobby.disconnect(guest.id);
    run(2, [host]);
    // Revenu (page rechargée : un nouveau client, construit sur l'état du serveur).
    guest.connect(version);
    run(6, [host, guest]);
    expect(guest.client!.stats.checked).toBeGreaterThanOrEqual(4);
    expect(guest.client!.stats.desyncs).toBe(0);
    expect(host.client!.stats.desyncs).toBe(0);
    // Il joue de nouveau sa place (le serveur reçoit ses commandes).
    const server = (lobby as unknown as { rooms: Map<string, { match: { missing: number[] } }> }).rooms.get(room)!.match;
    const missingBefore = server.missing[1]!;
    run(2, [host, guest]);
    expect(server.missing[1]! - missingBefore).toBeLessThan(20);

    // Divergence provoquée : il la voit, demande l'état, repart de là, et redevient identique au serveur. Écrite aussi
    // dans les instantanés du rollback (sinon le prochain retour en arrière l'effacerait), comme le serait un vrai écart.
    const corrupt = (duel: Duel): void => {
      duel.players[3]!.pos = { ...duel.players[3]!.pos, x: duel.players[3]!.pos.x + 0.4 };
    };
    corrupt(guest.client!.duel);
    (guest.client!.session as unknown as { snapshots: Map<number, Duel> }).snapshots.forEach(corrupt);
    run(3, [host, guest]);
    const stats = guest.client!.stats;
    expect(stats.desyncs).toBeGreaterThanOrEqual(1);
    expect(stats.resyncs).toBe(1);
    const checkedAfter = stats.checked;
    const desyncsAfter = stats.desyncs;
    run(4, [host, guest]);
    expect(stats.checked - checkedAfter).toBeGreaterThanOrEqual(3);
    expect(stats.desyncs).toBe(desyncsAfter);
    expect(host.client!.stats.desyncs).toBe(0);
  });

  it('une autre version du jeu est refusée', () => {
    const lobby = new Lobby(() => 0, Math.random, 'v1');
    const browser = new Browser(lobby, 'jeton', 'Vieux', 1);
    browser.connect('v0');
    browser.frame(0);
    expect(browser.errors[0]).toContain('version');
    lobby.message(browser.id, { t: 'create' });
    expect(browser.inbox).toEqual([]);
  });
});
