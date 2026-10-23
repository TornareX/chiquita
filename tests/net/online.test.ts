import { describe, expect, it } from 'vitest';
import { FakeLink, type LinkConditions } from '../../src/net/link';
import { MatchServer } from '../../src/net/matchServer';
import { OnlineClient } from '../../src/net/onlineClient';
import { createMatchDuel, decodeFrame, encodeFinals, encodeInputs, type MatchConfig } from '../../src/net/protocol';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { SIM_DT } from '../../src/sim/constants';
import type { Duel } from '../../src/sim/duel';

const TICK_MS = SIM_DT * 1000;

const CONFIG: MatchConfig = {
  format: 'double',
  rules: { setsToWin: 1, gamesPerSet: 6, goldenPoint: false },
  seats: [
    { kind: 'human', name: 'Xavier', assist: 'magnet', prepMove: 'libre', hand: 'right' },
    { kind: 'human', name: 'Ami', assist: 'magnet', prepMove: 'libre', hand: 'left' },
    { kind: 'ai', level: 'normal' },
    { kind: 'ai', level: 'normal' },
  ],
  seed: 77,
  pressure: 1,
};

type ToServer = { kind: 'bytes'; bytes: Uint8Array } | { kind: 'ping'; at: number };
type ToClient = { kind: 'bytes'; bytes: Uint8Array } | { kind: 'pong'; at: number; server: number } | { kind: 'hash'; tick: number; hash: number };

interface Player {
  client: OnlineClient;
  up: FakeLink<ToServer>;
  down: FakeLink<ToClient>;
  /** Décalage de son horloge sur celle du serveur (ms). */
  skew: number;
  bot: Bot;
  steps: number;
}

/**
 * Un match en ligne complet sans réseau réel : le serveur (`MatchServer`) et deux navigateurs (`OnlineClient`), reliés
 * par de fausses liaisons. Chaque « humain » est une IA qui ne voit que la partie de son navigateur. Le temps avance
 * d'un pas de simulation à chaque tour, comme la boucle du jeu.
 */
function playOnline(seconds: number, links: LinkConditions[], inputDelay: number): { server: MatchServer; players: Player[] } {
  const server = new MatchServer(CONFIG);
  const startAt = 400;
  const players: Player[] = links.map((conditions, seat) => {
    const duel: Duel = createMatchDuel(CONFIG);
    return {
      client: new OnlineClient(duel, { seats: [seat], startAt, inputDelay, maxRollback: 60 }),
      up: new FakeLink<ToServer>(conditions, 10 + seat),
      down: new FakeLink<ToClient>(conditions, 20 + seat),
      skew: seat === 1 ? 12_345 : 0,
      bot: new Bot(seat, 500 + seat, AI_LEVELS.normal),
      steps: 0,
    };
  });
  for (let now = 0; now < startAt + seconds * 1000; now += TICK_MS) {
    // Serveur : commandes et pings reçus, pas retenus jusqu'à maintenant, envoi à tous.
    players.forEach((player, seat) => {
      for (const message of player.up.receive(now)) {
        if (message.kind === 'ping') player.down.send(now, { kind: 'pong', at: message.at, server: now });
        else {
          const frame = decodeFrame(message.bytes);
          if (frame?.kind === 'inputs' && frame.seat === seat) server.receive(seat, frame.start, frame.data);
        }
      }
    });
    if (now >= startAt) server.advanceTo(Math.floor((now - startAt) / TICK_MS) + 1);
    const finals = server.takeFinals();
    const hashes = server.takeHashes();
    for (const player of players) {
      if (finals) player.down.send(now, { kind: 'bytes', bytes: encodeFinals(finals.start, server.players, finals.data) });
      for (const h of hashes) player.down.send(now, { kind: 'hash', ...h });
    }
    // Navigateurs : chacun avec son horloge à lui.
    for (const player of players) {
      const local = now + player.skew;
      for (const message of player.down.receive(now)) {
        if (message.kind === 'pong') player.client.pong(message.at, message.server, local);
        else if (message.kind === 'hash') player.client.receiveHash(message.tick, message.hash);
        else {
          const frame = decodeFrame(message.bytes);
          if (frame?.kind === 'finals') player.client.receiveFinals(frame.start, frame.players, frame.count, frame.data);
        }
      }
      if (Math.floor(now / 250) !== Math.floor((now - TICK_MS) / 250)) player.up.send(now, { kind: 'ping', at: local });
      if (!player.client.ready) continue;
      player.steps += player.client.step((state) => player.bot.commands(state), local);
      for (const input of player.client.takeInputs()) player.up.send(now, { kind: 'bytes', bytes: encodeInputs(input.seat, input.start, input.data) });
    }
  }
  return { server, players };
}

describe('jeu en ligne : serveur de référence et navigateurs', () => {
  it('deux joueurs (80 et 40 ms de ping, gigue) calculent le même match que le serveur, seconde après seconde', () => {
    const { server, players } = playOnline(20, [{ ping: 80, jitter: 10, loss: 0 }, { ping: 40, jitter: 5, loss: 0 }], 4);
    for (const { client } of players) {
      expect(client.stats.checked).toBeGreaterThanOrEqual(17);
      expect(client.stats.desyncs).toBe(0);
      // Il a suivi le serveur : en avance d'à peu près la moitié du ping et de la marge, pas plus.
      expect(client.stats.ahead).toBeGreaterThan(0);
      expect(client.stats.ahead).toBeLessThan(40);
      expect(client.session.stats.rollbacks).toBeGreaterThan(100);
    }
    // Le match a vraiment été joué, et les commandes sont arrivées à temps (sauf le tout début).
    expect(server.duel.players.every((p) => Number.isFinite(p.lastHitTick))).toBe(true);
    expect(server.missing[0]! + server.missing[1]!).toBeLessThan(60);
    expect(server.late[0]! + server.late[1]!).toBe(0);
  });

  it('un joueur à la connexion instable : le serveur remplace ses commandes en retard, tout le monde reste juste', () => {
    const { server, players } = playOnline(15, [{ ping: 60, jitter: 5, loss: 0 }, { ping: 90, jitter: 70, loss: 0 }], 0);
    expect(server.late[1]!).toBeGreaterThan(0);
    expect(players[1]!.client.stats.overridden).toBeGreaterThan(0);
    for (const { client } of players) {
      // Seules les secondes déjà confirmées se comparent : avec 70 ms de gigue, leur nombre dépend du déroulé du match
      // (11 depuis que l'IA ne sert plus en lob, 23/10). Ce qui compte : aucune désynchronisation.
      expect(client.stats.checked).toBeGreaterThanOrEqual(10);
      expect(client.stats.desyncs).toBe(0);
    }
  });
});
