import { describe, expect, it } from 'vitest';
import { COMMAND_BYTES, decodeCommands, encodeCommands, quantizeCommands, sameCommands } from '../../src/net/codec';
import { hashState } from '../../src/net/hash';
import { deepClone } from '../../src/modes/replay';
import { AI_LEVELS, Bot } from '../../src/sim/bot';
import type { ArcadeCommands, ShotKind, SwingEnd } from '../../src/sim/commands';
import { Duel } from '../../src/sim/duel';
import { Prng } from '../../src/sim/prng';

const SHOTS: (ShotKind | null)[] = [null, 'normal', 'slice', 'lob', 'overhead'];
const ENDS: (SwingEnd | undefined)[] = [undefined, 'straight', 'arc', 'letGo'];

/** Commandes tirées au hasard, tous les champs possibles. */
function randomCommands(rng: Prng): ArcadeCommands {
  const commands: ArcadeCommands = {
    stick: { forward: rng.range(-1.2, 1.2), right: rng.range(-1.2, 1.2) },
    shot: SHOTS[Math.floor(rng.next() * SHOTS.length)]!,
  };
  if (rng.next() < 0.5) {
    const swing: NonNullable<ArcadeCommands['swing']> = { prepared: rng.next() < 0.5 };
    const end = ENDS[Math.floor(rng.next() * ENDS.length)];
    if (end) swing.end = end;
    const wall = rng.next();
    if (wall < 0.33) swing.wall = true;
    else if (wall < 0.66) swing.wall = false;
    commands.swing = swing;
  }
  const call = rng.next();
  if (call < 0.2) commands.call = 'mia';
  else if (call < 0.4) commands.call = 'tuya';
  return commands;
}

describe('commandes arrondies et encodées', () => {
  it('tiennent sur 4 octets et reviennent identiques une fois arrondies', () => {
    const rng = new Prng(7);
    for (let i = 0; i < 5000; i++) {
      const commands = randomCommands(rng);
      const bytes = encodeCommands(commands);
      expect(bytes.length).toBe(COMMAND_BYTES);
      const back = decodeCommands(bytes);
      // Tout sauf le stick revient tel quel ; le stick, arrondi au 1/127 et borné à [-1, 1].
      expect({ ...back, stick: null }).toEqual({ ...commands, stick: null });
      for (const axis of ['forward', 'right'] as const) {
        const want = Math.max(-1, Math.min(1, commands.stick[axis]));
        expect(Math.abs(back.stick[axis] - want)).toBeLessThanOrEqual(0.5 / 127 + 1e-12);
        expect(Number.isInteger(back.stick[axis] * 127)).toBe(true);
      }
      // Arrondir deux fois ne change plus rien : ce qu'une machine calcule, l'autre le reçoit au bit près.
      expect(quantizeCommands(back)).toEqual(back);
      expect(encodeCommands(back)).toEqual(bytes);
      expect(sameCommands(commands, back)).toBe(true);
    }
  });

  it('gardent les extrêmes et le zéro exacts (jamais de -0)', () => {
    const q = quantizeCommands({ stick: { forward: 1, right: -1 }, shot: null });
    expect(q.stick).toEqual({ forward: 1, right: -1 });
    const zero = quantizeCommands({ stick: { forward: -0.001, right: Number.NaN }, shot: null });
    expect(Object.is(zero.stick.forward, 0)).toBe(true);
    expect(Object.is(zero.stick.right, 0)).toBe(true);
  });

  it('les commandes de l’IA arrondies gardent un match jouable', () => {
    const duel = new Duel({ setsToWin: 1, gamesPerSet: 6, goldenPoint: false }, 'double');
    const bots = duel.players.map((_, i) => new Bot(i, 11 + i, AI_LEVELS.normal));
    let shots = 0;
    for (let t = 0; t < 60 / (1 / 240); t++) {
      duel.step(bots.map((bot) => quantizeCommands(bot.commands(duel))));
      if (duel.shot) shots++;
    }
    expect(shots).toBeGreaterThan(20);
  });
});

describe('empreinte de l’état', () => {
  it('est la même pour une copie, différente au moindre bit', () => {
    const duel = new Duel(null, 'double');
    for (let t = 0; t < 300; t++) duel.step();
    const copy = deepClone(duel);
    expect(hashState(copy)).toBe(hashState(duel));
    copy.players[2]!.pos = { ...copy.players[2]!.pos, x: copy.players[2]!.pos.x + Number.EPSILON * 4 };
    expect(hashState(copy)).not.toBe(hashState(duel));
  });

  it("ne dépend pas de l'ordre des champs, distingue 0 et -0, ignore les fonctions", () => {
    expect(hashState({ a: 1, b: [2, 'x'] })).toBe(hashState({ b: [2, 'x'], a: 1, f: () => 3 }));
    expect(hashState({ a: 0 })).not.toBe(hashState({ a: -0 }));
    expect(hashState({ a: null })).not.toBe(hashState({ a: undefined }));
    expect(hashState([1, 2])).not.toBe(hashState([2, 1]));
  });

  it('ne dépend que des valeurs, pas du partage des objets ; un cycle ne boucle pas', () => {
    // Le serveur réutilise la commande précédente d'un joueur en retard ; un navigateur reçoit des objets neufs.
    const stick = { forward: 0, right: 0 };
    const shared = { players: [{ stick }, { stick }] };
    const fresh = { players: [{ stick: { forward: 0, right: 0 } }, { stick: { forward: 0, right: 0 } }] };
    expect(hashState(shared)).toBe(hashState(fresh));
    const cyclic: { self?: unknown; n: number } = { n: 1 };
    cyclic.self = cyclic;
    expect(Number.isInteger(hashState(cyclic))).toBe(true);
  });

  it('deux parties de même graine ont la même empreinte à chaque seconde', () => {
    const play = (): number[] => {
      const duel = new Duel(null, 'double');
      const bots = duel.players.map((_, i) => new Bot(i, 3 + i, AI_LEVELS.normal));
      const hashes: number[] = [];
      for (let t = 1; t <= 240 * 10; t++) {
        duel.step(bots.map((bot) => quantizeCommands(bot.commands(duel))));
        if (t % 240 === 0) hashes.push(hashState(duel));
      }
      return hashes;
    };
    const first = play();
    expect(new Set(first).size).toBe(first.length);
    expect(play()).toEqual(first);
  });
});
