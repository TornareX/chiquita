import { describe, expect, it } from 'vitest';
import { assignController, isHuman, keyboardOf, padOf, sanitize, type DuelSettings } from '../../src/ui/duelSettings';

describe('composition des équipes', () => {
  it('une manette ou un clavier ne joue qu’une place : l’ancienne passe à l’IA normale', () => {
    const players: DuelSettings['players'] = ['manette1', 'fort', 'normal', 'normal'];
    // Xavier passe à gauche avec sa manette : la place de droite est libérée.
    assignController(players, 2, 'manette1');
    expect(players).toEqual(['normal', 'fort', 'manette1', 'normal']);
    // Une IA peut jouer plusieurs places.
    assignController(players, 0, 'fort');
    expect(players).toEqual(['fort', 'fort', 'manette1', 'normal']);
  });

  it('les anciens réglages « humain » prennent la manette de leur numéro de place', () => {
    const s = sanitize({ players: ['humain', 'fort', 'humain', 'normal'], version: 2 });
    expect(s.players).toEqual(['manette1', 'fort', 'manette3', 'normal']);
  });

  it('un réglage enregistré ne peut pas donner la même manette à deux places', () => {
    const s = sanitize({ players: ['manette2', 'manette2', 'clavier1', 'clavier1'], version: 2 });
    expect(s.players).toEqual(['normal', 'manette2', 'normal', 'clavier1']);
  });

  it('manette, clavier ou IA', () => {
    expect(padOf('manette3')).toBe(2);
    expect(padOf('clavier1')).toBeNull();
    expect(keyboardOf('clavier2')).toBe(1);
    expect(keyboardOf('manette1')).toBeNull();
    expect(isHuman('clavier1')).toBe(true);
    expect(isHuman('fort')).toBe(false);
  });
});
