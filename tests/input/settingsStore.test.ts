import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_SETUP,
  initialSetup,
  loadPreferences,
  loadSettings,
  loadSetup,
  savePreferences,
  saveSettings,
  saveSetup,
  setupQuery,
  type MatchSetup,
} from '../../src/ui/settingsStore';

/** Stockage du navigateur, en mémoire (Node n'en a pas). */
function fakeStorage(): Map<string, string> {
  const items = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  return items;
}

let items: Map<string, string>;
beforeEach(() => {
  items = fakeStorage();
});

/** L'ancien objet unique, tel qu'enregistré avant la séparation (version 2 des défauts). */
const LEGACY = {
  players: ['fort', 'manette2', 'normal', 'clavier1'],
  assists: ['magnet', 'partial', 'full', 'off'],
  hands: ['right', 'left', 'right', 'right'],
  pressure: 1.5,
  prepMove: 'ralenti',
  sound: false,
  farOwnView: true,
  padStyle: 'playstation',
  inputDisplay: 'full',
  match: { free: false, doubles: true, setsToWin: 2, gamesPerSet: 4, goldenPoint: true },
  version: 2,
};

describe('préférences de joueur et configuration de match', () => {
  it('sans rien d’enregistré : les défauts', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(loadSetup()).toEqual(DEFAULT_SETUP);
  });

  it('reprend les anciens réglages sans perte : la configuration du match…', () => {
    items.set('padel-smash.reglages', JSON.stringify(LEGACY));
    expect(loadSetup()).toEqual({
      players: ['fort', 'manette2', 'normal', 'clavier1'],
      assists: ['magnet', 'partial', 'full', 'off'],
      hands: ['right', 'left', 'right', 'right'],
      pressure: 1.5,
      match: { free: false, doubles: true, setsToWin: 2, gamesPerSet: 4, goldenPoint: true, fast: false },
    });
  });

  it('… et les préférences, avec l’assistance, la main et la manette de la première place humaine', () => {
    items.set('padel-smash.reglages', JSON.stringify(LEGACY));
    expect(loadPreferences()).toEqual({
      sound: false,
      inputDisplay: 'full',
      padStyle: 'playstation',
      assist: 'partial',
      hand: 'left',
      prepMove: 'ralenti',
      device: 'manette2',
      farOwnView: true,
    });
  });

  it('anciens réglages d’avant les défauts actuels : l’assistance et la préparation reprennent le défaut', () => {
    items.set('padel-smash.reglages', JSON.stringify({ ...LEGACY, version: undefined }));
    expect(loadSetup().assists).toEqual(DEFAULT_SETUP.assists);
    expect(loadPreferences().assist).toBe(DEFAULT_PREFERENCES.assist);
    expect(loadPreferences().prepMove).toBe(DEFAULT_PREFERENCES.prepMove);
    expect(loadPreferences().sound).toBe(false);
  });

  it('une fois séparés, les nouveaux réglages passent avant les anciens, qui restent en place', () => {
    items.set('padel-smash.reglages', JSON.stringify(LEGACY));
    savePreferences({ ...loadPreferences(), sound: true });
    saveSetup({ ...loadSetup(), pressure: 0 });
    expect(loadPreferences().sound).toBe(true);
    expect(loadPreferences().device).toBe('manette2');
    expect(loadSetup().pressure).toBe(0);
    expect(items.has('padel-smash.reglages')).toBe(true);
  });

  it('valeurs inconnues ou stockage abîmé : les défauts', () => {
    items.set('padel-smash.preferences', JSON.stringify({ sound: 'oui', device: 'joystick', assist: 'magnet', hand: 'left' }));
    items.set('padel-smash.match', '{pas du json');
    expect(loadPreferences()).toEqual({ ...DEFAULT_PREFERENCES, assist: 'magnet', hand: 'left' });
    expect(loadSetup()).toEqual(DEFAULT_SETUP);
  });

  it('une partie réunit la configuration et les préférences ; l’adresse passe avant les deux', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, sound: false, padStyle: 'xbox' });
    saveSetup({ ...DEFAULT_SETUP, pressure: 0.5 });
    const s = loadSettings(new URLSearchParams('places=clavier1,fort,manette1,facile&double=1&free=0&pression=1.5'));
    expect(s.sound).toBe(false);
    expect(s.padStyle).toBe('xbox');
    expect(s.players).toEqual(['clavier1', 'fort', 'manette1', 'facile']);
    expect(s.match.doubles).toBe(true);
    expect(s.match.free).toBe(false);
    expect(s.pressure).toBe(1.5);
  });

  it('une partie lancée par l’adresse n’enregistre que les préférences, pas sa configuration', () => {
    const s = loadSettings(new URLSearchParams('bot=both&double=1'));
    s.sound = false;
    saveSettings(s);
    expect(loadPreferences().sound).toBe(false);
    expect(loadSetup()).toEqual(DEFAULT_SETUP);
  });

  it('par défaut, un set court ; un set classique de 6 jeux resté au défaut d’avant y passe aussi', () => {
    expect(DEFAULT_SETUP.match).toMatchObject({ setsToWin: 1, gamesPerSet: 4, goldenPoint: true, fast: true });
    const old = { ...DEFAULT_SETUP, match: { free: false, doubles: false, setsToWin: 1, gamesPerSet: 6, goldenPoint: false } };
    items.set('padel-smash.match', JSON.stringify({ ...old, version: 1 }));
    expect(loadSetup().match).toMatchObject({ gamesPerSet: 4, goldenPoint: true, fast: true });
    // Un format choisi exprès reste le sien.
    items.set('padel-smash.match', JSON.stringify({ ...old, match: { ...old.match, gamesPerSet: 2 }, version: 1 }));
    expect(loadSetup().match).toMatchObject({ gamesPerSet: 2, goldenPoint: false, fast: false });
    // Enregistré depuis : plus de conversion.
    items.set('padel-smash.match', JSON.stringify({ ...old, match: { ...old.match, fast: false }, version: 2 }));
    expect(loadSetup().match).toMatchObject({ gamesPerSet: 6, fast: false });
  });

  it('l’adresse d’un match (écran « Jouer ») redonne exactement sa configuration', () => {
    // Des réglages enregistrés différents ne doivent pas s'y glisser.
    saveSetup({ ...DEFAULT_SETUP, pressure: 0, match: { ...DEFAULT_SETUP.match, free: true, goldenPoint: true } });
    const setup: MatchSetup = {
      players: ['clavier2', 'fort', 'manette3', 'facile'],
      assists: ['partial', 'magnet', 'off', 'full'],
      hands: ['left', 'right', 'right', 'left'],
      pressure: 0.5,
      match: { free: false, doubles: true, setsToWin: 1, gamesPerSet: 4, goldenPoint: false, fast: false },
    };
    const query = setupQuery(setup);
    expect(query).toContain('places=clavier2,fort,manette3,facile');
    const s = loadSettings(new URLSearchParams(query));
    const { players, assists, hands, pressure, match } = s;
    expect({ players, assists, hands, pressure, match }).toEqual(setup);
    expect(loadSettings(new URLSearchParams(setupQuery({ ...setup, hands: ['right', 'right', 'right', 'right'] }))).hands).toEqual([
      'right',
      'right',
      'right',
      'right',
    ]);
  });

  it('première fois dans « Jouer » : soi, avec son périphérique, contre l’IA', () => {
    const setup = initialSetup({ ...DEFAULT_PREFERENCES, device: 'clavier1', assist: 'magnet', hand: 'left' });
    expect(setup.players).toEqual(['clavier1', 'normal', 'normal', 'normal']);
    expect(setup.assists[0]).toBe('magnet');
    expect(setup.hands[0]).toBe('left');
    saveSetup({ ...DEFAULT_SETUP, pressure: 0.5 });
    expect(initialSetup(DEFAULT_PREFERENCES).pressure).toBe(0.5);
  });
});
