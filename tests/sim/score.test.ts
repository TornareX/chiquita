import { describe, expect, it } from 'vitest';
import { Match } from '../../src/sim/score';

/** Fait gagner les points dans l'ordre donné : « 0011 » = deux points au joueur 0, puis deux au 1. */
function play(match: Match, sequence: string): void {
  for (const c of sequence) match.awardPoint(c === '0' ? 0 : 1);
}
const game = (winner: 0 | 1): string => String(winner).repeat(4);

describe('comptage des points', () => {
  it('0, 15, 30, 40, jeu', () => {
    const match = new Match();
    expect(match.pointLabels()).toEqual(['0', '0']);
    play(match, '0');
    expect(match.pointLabels()).toEqual(['15', '0']);
    play(match, '01');
    expect(match.pointLabels()).toEqual(['30', '15']);
    play(match, '0');
    expect(match.pointLabels()).toEqual(['40', '15']);
    expect(match.awardPoint(0)).toEqual({ game: true, set: false, match: false });
    expect(match.games).toEqual([1, 0]);
    expect(match.pointLabels()).toEqual(['0', '0']);
  });

  it('égalité et avantage', () => {
    const match = new Match();
    play(match, '000111');
    expect(match.call()).toBe('Égalité');
    play(match, '1');
    expect(match.pointLabels()).toEqual(['40', 'AV']);
    play(match, '0');
    expect(match.call()).toBe('Égalité');
    play(match, '00');
    expect(match.games).toEqual([1, 0]);
  });

  it('punto de oro : à 40-40, le point suivant gagne le jeu', () => {
    const match = new Match({ setsToWin: 1, gamesPerSet: 6, goldenPoint: true });
    play(match, '000111');
    expect(match.call()).toBe('Punto de oro');
    expect(match.awardPoint(1).game).toBe(true);
    expect(match.games).toEqual([0, 1]);
  });
});

describe('service', () => {
  it('le serveur change à chaque jeu, le côté à chaque point', () => {
    const match = new Match(undefined, 1);
    expect(match.server).toBe(1);
    expect(match.serveSide).toBe('right');
    play(match, '0');
    expect(match.serveSide).toBe('left');
    play(match, '000');
    expect(match.server).toBe(0);
    expect(match.serveSide).toBe('right');
  });

  it('jeu décisif : un point, puis deux chacun', () => {
    const match = new Match();
    for (let i = 0; i < 6; i++) play(match, game(0) + game(1));
    expect(match.tiebreak).toBe(true);
    const servers: number[] = [];
    for (let i = 0; i < 6; i++) {
      servers.push(match.server);
      play(match, i % 2 ? '1' : '0');
    }
    expect(servers).toEqual([0, 1, 1, 0, 0, 1]);
  });
});

describe('sets et match', () => {
  it('6-4 gagne le set, 6-5 non, 7-5 oui', () => {
    const a = new Match({ setsToWin: 2, gamesPerSet: 6, goldenPoint: false });
    for (let i = 0; i < 4; i++) play(a, game(0) + game(1));
    play(a, game(0) + game(0));
    expect(a.sets).toEqual([[6, 4]]);

    const b = new Match({ setsToWin: 2, gamesPerSet: 6, goldenPoint: false });
    for (let i = 0; i < 5; i++) play(b, game(0) + game(1));
    play(b, game(0));
    expect(b.games).toEqual([6, 5]);
    expect(b.sets).toEqual([]);
    play(b, game(0));
    expect(b.sets).toEqual([[7, 5]]);
  });

  it('jeu décisif gagné 7-5 : set 7-6, match gagné en un set', () => {
    const match = new Match();
    for (let i = 0; i < 6; i++) play(match, game(0) + game(1));
    play(match, '0101010101' + '11');
    expect(match.sets).toEqual([[6, 7]]);
    expect(match.winner).toBe(1);
    // Match terminé : plus aucun point compté.
    expect(match.awardPoint(0)).toEqual({ game: false, set: false, match: false });
  });

  it('deux sets gagnants', () => {
    const match = new Match({ setsToWin: 2, gamesPerSet: 6, goldenPoint: false });
    const set = (winner: 0 | 1): void => play(match, game(winner).repeat(6));
    set(0);
    expect(match.winner).toBeNull();
    set(1);
    expect(match.setsWon).toEqual([1, 1]);
    set(0);
    expect(match.winner).toBe(0);
    expect(match.sets).toEqual([
      [6, 0],
      [0, 6],
      [6, 0],
    ]);
  });
});
