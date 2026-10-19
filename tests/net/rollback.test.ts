import { describe, expect, it } from 'vitest';
import { NetMatch, withoutTrace } from '../../src/net/duelNet';
import { hashState } from '../../src/net/hash';
import type { LinkConditions } from '../../src/net/link';
import { RollbackSession } from '../../src/net/rollback';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import { NEUTRAL_ARCADE, type ArcadeCommands } from '../../src/sim/commands';
import { Duel } from '../../src/sim/duel';

const RULES = { setsToWin: 1, gamesPerSet: 6, goldenPoint: false };

interface Played {
  net: NetMatch;
  /** Commandes de chaque joueur à chaque pas, telles que leur machine les a données. */
  log: Map<number, ArcadeCommands>[];
}

/**
 * Un match en double à travers le faux réseau : le joueur 0 (une IA qui joue « l'humain ») sur la machine A, les trois
 * autres sur la machine B. Les IA sont interrogées sur la partie de leur machine, comme un vrai joueur qui ne voit que
 * son écran. Après `ticks` pas, plus personne ne joue : on laisse arriver les derniers paquets et on rattrape.
 */
function playOnline(ticks: number, conditions: LinkConditions, inputDelay: number, maxRollback = 36, seed = 5, inputDelayB = inputDelay): Played {
  const duel = new Duel(RULES, 'double');
  const bots = duel.players.map((_, i) => new Bot(i, seed + i, AI_LEVELS.normal));
  const net = new NetMatch(duel, { localA: [0], conditions, inputDelay, inputDelayB, maxRollback, seed });
  const log = duel.players.map(() => new Map<number, ArcadeCommands>());
  const read = (state: Duel, player: number): ArcadeCommands => bots[player]!.commands(state);
  const onLocal = (player: number, tick: number, commands: ArcadeCommands): void => void log[player]!.set(tick, commands);
  let guard = 0;
  while (Math.min(net.a.session.tick, net.b.session.tick) < ticks && guard++ < ticks * 20) net.step(read, read, onLocal);
  drain(net);
  return { net, log };
}

/** Plus de nouveaux pas : les paquets en vol arrivent (renvoyés tant qu'ils se perdent), puis chacun rattrape. */
function drain(net: NetMatch): void {
  for (let i = 0; i < 20000; i++) {
    net.now += 1000 / 240;
    for (const packet of net.linkBA.receive(net.now)) net.a.receive(packet);
    for (const packet of net.linkAB.receive(net.now)) net.b.receive(packet);
    net.linkAB.send(net.now, net.a.packet());
    net.linkBA.send(net.now, net.b.packet());
    const done = [net.a, net.b].every((peer) =>
      [0, 1, 2, 3].every((p) => peer.session.confirmedTick(p) >= peer.session.tick - 1),
    );
    if (done && i > 200) break;
  }
  net.a.session.rollback();
  net.b.session.rollback();
}

/** La même partie sans réseau : les commandes de chacun, pas après pas. */
function playOffline(log: Map<number, ArcadeCommands>[], until: number): Duel {
  const duel = new Duel(RULES, 'double');
  while (duel.tick < until) duel.step(log.map((inputs) => inputs.get(duel.tick) ?? NEUTRAL_ARCADE));
  return duel;
}

describe('rollback à travers un faux réseau', () => {
  const cases: [string, LinkConditions, number][] = [
    ['ping 120 ms, délai 2 images', { ping: 120, jitter: 0, loss: 0 }, 8],
    ['ping 120 ms, gigue 20, perte 5 %', { ping: 120, jitter: 20, loss: 0.05 }, 8],
    ['ping 80 ms, gigue 40, perte 30 %, sans délai', { ping: 80, jitter: 40, loss: 0.3 }, 0],
  ];
  for (const [name, conditions, delay] of cases) {
    it(`${name} : même match, au bit près, que sans réseau`, () => {
      const { net, log } = playOnline(240 * 12, conditions, delay);
      const a = net.a.session;
      const b = net.b.session;
      // Il y a eu des corrections, et beaucoup de pas rejoués.
      expect(a.stats.rollbacks).toBeGreaterThan(50);
      expect(b.stats.rollbacks).toBeGreaterThan(50);
      expect(a.stats.longest).toBeLessThanOrEqual(36);
      const offlineA = playOffline(log, a.tick);
      expect(hashState(a.state)).toBe(hashState(offlineA));
      const offlineB = playOffline(log, b.tick);
      expect(hashState(b.state)).toBe(hashState(offlineB));
      // Et le match a vraiment été joué.
      expect(offlineA.players.some((p) => Number.isFinite(p.lastHitTick))).toBe(true);
    });
  }

  it('délais différents (humain 2 images, IA sans délai) : même match que sans réseau', () => {
    const { net, log } = playOnline(240 * 8, { ping: 120, jitter: 20, loss: 0.05 }, 8, 36, 7, 0);
    expect(net.a.session.stats.rollbacks).toBeGreaterThan(50);
    expect(hashState(net.a.session.state)).toBe(hashState(playOffline(log, net.a.session.tick)));
    expect(hashState(net.b.session.state)).toBe(hashState(playOffline(log, net.b.session.tick)));
  });

  it('au-delà de la fenêtre de rollback, la machine attend et le match reste juste', () => {
    const { net, log } = playOnline(240 * 4, { ping: 400, jitter: 0, loss: 0 }, 2, 36);
    expect(net.a.session.stats.stalls).toBeGreaterThan(100);
    expect(net.a.session.stats.longest).toBeLessThanOrEqual(36);
    expect(hashState(net.a.session.state)).toBe(hashState(playOffline(log, net.a.session.tick)));
  });

  it('demander quelque chose à la partie hors du pas ne laisse aucune trace', () => {
    const duel = new Duel(RULES, 'double');
    const bots = duel.players.map((_, i) => new Bot(i, 9 + i, AI_LEVELS.normal));
    for (let t = 0; t < 240 * 8; t++) {
      const before = hashState(duel);
      const commands = bots.map((bot) => withoutTrace(duel, () => bot.commands(duel)));
      withoutTrace(duel, () => duel.players.forEach((_, i) => duel.counterWallReady(i)));
      expect(hashState(duel)).toBe(before);
      duel.step(commands);
    }
  });
});

describe('moteur de rollback générique', () => {
  /** Jeu jouet : un total, chaque pas ajoute les commandes de chacun multipliées par le numéro du pas. */
  const toy = {
    save: (s: { total: number; tick: number }) => ({ ...s }),
    load: (s: { total: number; tick: number }, snap: { total: number; tick: number }) => void Object.assign(s, snap),
    step: (s: { total: number; tick: number }, commands: readonly number[]) => {
      s.total = (s.total * 31 + commands.reduce((sum, c, i) => sum + c * (i + 1) * (s.tick + 1), 0)) % 1000003;
      s.tick++;
    },
  };
  const options = { players: 2, inputDelay: 0, maxRollback: 10, neutral: 0, same: (a: number, b: number) => a === b };

  it('rejoue depuis le pas mal prédit et retrouve le bon total', () => {
    const state = { total: 0, tick: 0 };
    const replays: number[] = [];
    const session = new RollbackSession(state, toy, { ...options, local: [0] }, { onStep: (_, tick, replayed) => replayed && replays.push(tick) });
    const remote = [3, 3, 3, 5, 5, 1, 1, 1];
    for (let t = 0; t < remote.length; t++) {
      session.addLocal(0, t % 3);
      expect(session.advance()).toBe(true);
    }
    // Rien reçu du joueur 1 : prédit à 0. Tout arrive, dans le désordre.
    for (const t of [5, 0, 7, 2, 1, 3, 4, 6]) session.addRemote(1, t, remote[t]!);
    session.rollback();
    expect(replays).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const reference = { total: 0, tick: 0 };
    for (let t = 0; t < remote.length; t++) toy.step(reference, [t % 3, remote[t]!]);
    expect(state).toEqual(reference);
  });

  it("n'avance pas sans la commande locale ni au-delà de la fenêtre", () => {
    const session = new RollbackSession({ total: 0, tick: 0 }, toy, { ...options, local: [0] });
    expect(session.advance()).toBe(false);
    for (let t = 0; t < 10; t++) {
      session.addLocal(0, 1);
      expect(session.advance()).toBe(true);
    }
    session.addLocal(0, 1);
    expect(session.advance()).toBe(false);
    session.addRemote(1, 0, 0);
    expect(session.advance()).toBe(true);
  });
});
