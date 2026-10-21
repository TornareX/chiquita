import { PAD_STYLES, type PadStyle } from '../input/padStyle';
import { AI_LEVEL_NAMES, type AiLevel } from '../sim/bot';
import { ASSIST_LEVELS, PREP_MOVES, type AssistLevel, type PrepMove } from '../sim/duel';
import { DEFAULT_RULES } from '../sim/score';
import { HANDS, type Hand } from '../sim/shots';

/**
 * Deux sortes de réglages (`research/MENUS_PLAN.md` §3), enregistrés à part dans le navigateur :
 * - les **préférences de joueur** (`Preferences`) : à soi, pour toutes les parties (son, affichage, symboles des
 *   boutons, assistance, préparation, main, « je joue avec ») ;
 * - la **configuration d'un match local** (`MatchSetup`) : choisie avant de lancer (places, IA, règles, pression),
 *   la dernière est retenue pour pré-remplir l'écran « Jouer ».
 * `DuelSettings` réunit les deux pour une partie en cours ; l'adresse peut tout remplacer (`loadSettings`).
 */

/** Retour des entrées : masqué, discret (match) ou détaillé (tests). */
export type InputDisplayMode = 'off' | 'compact' | 'full';
export const INPUT_DISPLAY_MODES: readonly InputDisplayMode[] = ['compact', 'full', 'off'];

/** Ce que tient un humain : la manette n° 1 à 4 (dans l'ordre où elles sont branchées), ou un des deux claviers. */
export type Device = 'manette1' | 'manette2' | 'manette3' | 'manette4' | 'clavier1' | 'clavier2';
export const DEVICES: readonly Device[] = ['manette1', 'manette2', 'manette3', 'manette4', 'clavier1', 'clavier2'];

/** Qui joue une place : un humain avec sa manette ou son clavier, ou l'IA à un niveau. */
export type Controller = Device | AiLevel;
export const CONTROLLERS: readonly Controller[] = [...DEVICES, ...AI_LEVEL_NAMES];

export function isHuman(controller: Controller): controller is Device {
  return DEVICES.includes(controller as Device);
}

/** Manette n° 0 à 3 tenue par ce contrôleur, ou `null`. */
export function padOf(controller: Controller): number | null {
  return controller.startsWith('manette') ? Number(controller.slice(7)) - 1 : null;
}

/** Clavier tenu par ce contrôleur (0 : bleu, ZQSD ; 1 : rouge, flèches), ou `null`. */
export function keyboardOf(controller: Controller): 0 | 1 | null {
  return controller === 'clavier1' ? 0 : controller === 'clavier2' ? 1 : null;
}

type Places<T> = [T, T, T, T];

/**
 * Donne la place `index` à `controller`. Une manette ou un clavier ne joue qu'une place : s'il en tenait déjà une
 * autre, celle-ci passe à l'IA normale.
 */
export function assignController(players: Places<Controller>, index: number, controller: Controller): void {
  if (isHuman(controller)) {
    players.forEach((c, i) => {
      if (i !== index && c === controller) players[i] = 'normal';
    });
  }
  players[index] = controller;
}

export interface MatchSettings {
  /** Échange libre, sans score. */
  free: boolean;
  /** 2 contre 2 (étape C) ; sinon 1 contre 1. */
  doubles: boolean;
  setsToWin: number;
  gamesPerSet: number;
  goldenPoint: boolean;
}

/** Préférences de joueur : à soi, pour toutes les parties. */
export interface Preferences {
  sound: boolean;
  /**
   * Retour des entrées de chaque joueur humain : discret (les sticks, petits, dans le coin), détaillé (pour les
   * tests : historique des frappes, guide du geste, aide aux coups et retour sur chaque frappe), ou masqué.
   */
  inputDisplay: InputDisplayMode;
  /** Symboles des boutons : détectés sur la manette, ou imposés (manette mal reconnue). */
  padStyle: PadStyle;
  /** Course assistée et main : celles de ses places en local (pré-remplies), de sa place en ligne, du tutoriel. */
  assist: AssistLevel;
  hand: Hand;
  /** Stick gauche pendant la préparation, pour les joueurs humains (`PrepMove`). */
  prepMove: PrepMove;
  /** « Je joue avec » par défaut : la place qu'on prend dans « Jouer », et en ligne. */
  device: Device;
  /** Le joueur d'en face voit les directions de son côté plutôt que celles de l'écran (jeu à deux sur un écran). */
  farOwnView: boolean;
}

/** Configuration d'un match local, choisie avant de lancer. */
export interface MatchSetup {
  /**
   * Qui joue chaque place : Bleu, Rouge, puis en double Bleu 2 et Rouge 2 (`playerName`). En double, les places 0
   * et 1 sont à droite, 2 et 3 à gauche.
   */
  players: Places<Controller>;
  /** Course assistée et main de chaque place : chaque humain garde les siennes (pré-remplies par ses préférences). */
  assists: Places<AssistLevel>;
  hands: Places<Hand>;
  /** Pression des balles (vertes, jaunes, rouges) : 0 = sans, 1 = normale, 1,5 = forte. */
  pressure: number;
  match: MatchSettings;
}

/** Réglages d'une partie : la configuration du match, et les préférences qui la touchent. */
export interface DuelSettings extends MatchSetup {
  prepMove: PrepMove;
  sound: boolean;
  farOwnView: boolean;
  padStyle: PadStyle;
  inputDisplay: InputDisplayMode;
}

export const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  inputDisplay: 'compact',
  padStyle: 'auto',
  // Comme Xavier aime jouer : placement manuel, immobile pendant la préparation (le stick gauche vise). Les IA
  // gardent l'aimant (voir `src/modes/duel.ts`).
  assist: 'off',
  hand: 'right',
  prepMove: 'bloque',
  device: 'manette1',
  farOwnView: false,
};

export const DEFAULT_SETUP: MatchSetup = {
  // En double, les partenaires sont des IA tant qu'on ne choisit pas d'autres manettes.
  players: ['manette1', 'manette2', 'normal', 'normal'],
  assists: ['off', 'off', 'off', 'off'],
  hands: ['right', 'right', 'right', 'right'],
  pressure: 1,
  match: { free: false, doubles: false, ...DEFAULT_RULES },
};

export const DEFAULT_SETTINGS: DuelSettings = merge(DEFAULT_PREFERENCES, DEFAULT_SETUP);

/** Une partie : la configuration du match avec les préférences de l'écran. */
export function merge(prefs: Preferences, setup: MatchSetup): DuelSettings {
  const { prepMove, sound, farOwnView, padStyle, inputDisplay } = prefs;
  return { ...structuredClone(setup), prepMove, sound, farOwnView, padStyle, inputDisplay };
}

/** Clés du navigateur. `LEGACY_KEY` : l'ancien objet unique, relu une fois pour reprendre les réglages. */
const PREFS_KEY = 'padel-smash.preferences';
const SETUP_KEY = 'padel-smash.match';
const LEGACY_KEY = 'padel-smash.reglages';
/**
 * Version des défauts de l'ancien objet unique : enregistrés avant la 2 (placement manuel et préparation bloquée),
 * l'aide à la course et la préparation reprennent le défaut au lieu de le masquer.
 */
const LEGACY_DEFAULTS_VERSION = 2;
/** Version des réglages séparés. On l'augmente quand un défaut change (voir `LEGACY_DEFAULTS_VERSION`). */
const VERSION = 1;

type Raw = Record<string, unknown> & { version?: unknown };

/** Les réglages de l'ancien objet unique dont on garde l'assistance et la préparation (voir `LEGACY_DEFAULTS_VERSION`). */
function legacyCurrent(raw: Raw): boolean {
  return raw.version === LEGACY_DEFAULTS_VERSION;
}

/** Copie sûre d'une configuration enregistrée (nouvelle ou ancienne forme) : toute valeur inconnue prend le défaut. */
export function sanitizeSetup(raw: unknown, legacy = false): MatchSetup {
  const s = structuredClone(DEFAULT_SETUP);
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Raw;
  const keepAssists = !legacy || legacyCurrent(r);
  // Avant le choix des manettes, « humain » jouait avec la manette de son numéro de place.
  if (Array.isArray(r.players)) {
    r.players.forEach((c: unknown, i) => {
      const controller = (c === 'humain' ? `manette${i + 1}` : c) as Controller;
      if (i < 4 && CONTROLLERS.includes(controller)) assignController(s.players, i, controller);
    });
  }
  if (keepAssists && Array.isArray(r.assists)) {
    r.assists.forEach((a: unknown, i) => {
      if (i < 4 && ASSIST_LEVELS.includes(a as AssistLevel)) s.assists[i] = a as AssistLevel;
    });
  }
  if (Array.isArray(r.hands)) {
    r.hands.forEach((h: unknown, i) => {
      if (i < 4 && HANDS.includes(h as Hand)) s.hands[i] = h as Hand;
    });
  }
  if (typeof r.pressure === 'number' && r.pressure >= 0 && r.pressure <= 2) s.pressure = r.pressure;
  const m = r.match as Partial<MatchSettings> | undefined;
  if (m && typeof m === 'object') {
    if (typeof m.free === 'boolean') s.match.free = m.free;
    if (typeof m.doubles === 'boolean') s.match.doubles = m.doubles;
    if (m.setsToWin === 1 || m.setsToWin === 2) s.match.setsToWin = m.setsToWin;
    if (Number.isInteger(m.gamesPerSet) && m.gamesPerSet! >= 1 && m.gamesPerSet! <= 6) s.match.gamesPerSet = m.gamesPerSet!;
    if (typeof m.goldenPoint === 'boolean') s.match.goldenPoint = m.goldenPoint;
  }
  return s;
}

/**
 * Copie sûre des préférences enregistrées : toute valeur inconnue prend le défaut. `legacy` : l'ancien objet unique,
 * dont on tire aussi l'assistance, la main et le périphérique de la première place humaine.
 */
export function sanitizePreferences(raw: unknown, legacy = false): Preferences {
  const p = structuredClone(DEFAULT_PREFERENCES);
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Raw;
  const keepAssist = !legacy || legacyCurrent(r);
  if (typeof r.sound === 'boolean') p.sound = r.sound;
  if (typeof r.farOwnView === 'boolean') p.farOwnView = r.farOwnView;
  if (PAD_STYLES.includes(r.padStyle as PadStyle)) p.padStyle = r.padStyle as PadStyle;
  // Avant les trois niveaux, c'était oui ou non : « oui » devient discret.
  const shown = r.inputDisplay;
  if (typeof shown === 'boolean') p.inputDisplay = shown ? 'compact' : 'off';
  else if (INPUT_DISPLAY_MODES.includes(shown as InputDisplayMode)) p.inputDisplay = shown as InputDisplayMode;
  if (keepAssist && PREP_MOVES.includes(r.prepMove as PrepMove)) p.prepMove = r.prepMove as PrepMove;
  if (legacy) {
    // L'ancien objet n'avait pas de préférences par joueur : celles de la première place humaine.
    const setup = sanitizeSetup(r, true);
    const first = setup.players.findIndex(isHuman);
    if (first >= 0) {
      p.device = setup.players[first] as Device;
      p.assist = setup.assists[first]!;
      p.hand = setup.hands[first]!;
    }
    return p;
  }
  if (keepAssist && ASSIST_LEVELS.includes(r.assist as AssistLevel)) p.assist = r.assist as AssistLevel;
  if (HANDS.includes(r.hand as Hand)) p.hand = r.hand as Hand;
  if (DEVICES.includes(r.device as Device)) p.device = r.device as Device;
  return p;
}

/**
 * Ancienne forme, un seul objet (gardée pour les tests et pour relire un réglage) : les deux parties réunies.
 * `version` de l'ancien objet : voir `LEGACY_DEFAULTS_VERSION`.
 */
export function sanitize(raw: unknown): DuelSettings {
  return merge(sanitizePreferences(raw, true), sanitizeSetup(raw, true));
}

/** Lit une clé du navigateur ; le stockage peut être indisponible (navigation privée…). */
function read(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, version: VERSION }));
  } catch {
    // Stockage indisponible : les réglages valent pour cette partie seulement.
  }
}

/** Préférences enregistrées ; à défaut, celles tirées de l'ancien objet unique ; à défaut, les défauts. */
export function loadPreferences(): Preferences {
  const stored = read(PREFS_KEY);
  return stored ? sanitizePreferences(stored) : sanitizePreferences(read(LEGACY_KEY), true);
}

export function savePreferences(prefs: Preferences): void {
  write(PREFS_KEY, prefs);
}

/** Dernière configuration de match ; à défaut, celle de l'ancien objet unique ; à défaut, les défauts. */
export function loadSetup(): MatchSetup {
  const stored = read(SETUP_KEY);
  return stored ? sanitizeSetup(stored) : sanitizeSetup(read(LEGACY_KEY), true);
}

export function saveSetup(setup: MatchSetup): void {
  const { players, assists, hands, pressure, match } = setup;
  write(SETUP_KEY, { players, assists, hands, pressure, match });
}

/**
 * Réglages au lancement : la dernière configuration et les préférences, puis les paramètres d'URL s'il y en a
 * (raccourcis de test, et adresse fabriquée par l'écran « Jouer » ; voir `src/modes/duel.ts`).
 */
export function loadSettings(params: URLSearchParams): DuelSettings {
  const s = merge(loadPreferences(), loadSetup());
  // `?places=manette1,fort,clavier1,normal` : qui joue chaque place, dans l'ordre (écran « Jouer »).
  const places = params.get('places')?.split(',');
  if (places) {
    const players: Places<Controller> = ['normal', 'normal', 'normal', 'normal'];
    places.forEach((c, i) => {
      if (i < 4 && CONTROLLERS.includes(c as Controller)) assignController(players, i, c as Controller);
    });
    s.players = players;
  }
  const ai = params.get('ai');
  const level = AI_LEVEL_NAMES.includes(ai as AiLevel) ? (ai as AiLevel) : null;
  const bot = params.get('bot') ?? (level && !places ? '2' : null);
  if (params.has('double')) s.match.doubles = params.get('double') !== '0';
  if (bot) {
    // `?bot=1`, `2`, `both` (tout le monde), `none` (personne), ou une liste de numéros de joueurs à partir de 1 : `?bot=2,3,4`.
    const ai = level ?? 'normal';
    const listed = bot === 'both' ? [1, 2, 3, 4] : bot.split(',').map(Number);
    s.players = ['manette1', 'manette2', 'manette3', 'manette4'];
    for (const n of listed) if (n >= 1 && n <= 4) s.players[n - 1] = ai;
    // Un seul côté donné : en double, son partenaire aussi.
    if (bot === '1') s.players[2] = ai;
    if (bot === '2') s.players[3] = ai;
  }
  const assists = params.get('assist')?.split(',');
  assists?.forEach((a, i) => {
    if (i < 4 && ASSIST_LEVELS.includes(a as AssistLevel)) s.assists[i] = a as AssistLevel;
  });
  if (assists?.length === 1 && ASSIST_LEVELS.includes(assists[0] as AssistLevel)) s.assists.fill(assists[0] as AssistLevel);
  // `?gaucher=1,3` : places (à partir de 1) jouées par un gaucher, les autres droitières ; `?gaucher=0` : aucun.
  const lefties = params.get('gaucher');
  if (lefties !== null) {
    const listed = lefties.split(',').map(Number);
    s.hands = s.hands.map((_, i) => (listed.includes(i + 1) ? 'left' : 'right')) as DuelSettings['hands'];
  }
  const pressure = Number(params.get('pression'));
  if (params.has('pression') && Number.isFinite(pressure) && pressure >= 0) s.pressure = pressure;
  if (params.get('far') === 'own') s.farOwnView = true;
  const prep = params.get('prepa');
  if (PREP_MOVES.includes(prep as PrepMove)) s.prepMove = prep as PrepMove;
  const style = params.get('manette');
  if (PAD_STYLES.includes(style as PadStyle)) s.padStyle = style as PadStyle;
  // `?entrees=0` (masqué), `1` (discret) ou `detaille`.
  const entrees = params.get('entrees');
  if (entrees !== null) s.inputDisplay = entrees === '0' ? 'off' : entrees === 'detaille' ? 'full' : 'compact';
  // `?free` ou `?free=1` : échange libre ; `?free=0` : match compté.
  if (params.has('free')) s.match.free = params.get('free') !== '0';
  const positive = (name: string): number | null => {
    const value = Number(params.get(name));
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  s.match.setsToWin = positive('sets') ?? s.match.setsToWin;
  s.match.gamesPerSet = positive('games') ?? s.match.gamesPerSet;
  if (params.has('gold')) s.match.goldenPoint = params.get('gold') === '1';
  return s;
}

/**
 * Enregistre les préférences que porte une partie (son, affichage, symboles…), sans toucher aux autres ni à la
 * configuration du match : une partie lancée par un raccourci d'adresse ne remplace pas celle de l'écran « Jouer ».
 */
export function saveSettings(settings: DuelSettings): void {
  const { prepMove, sound, farOwnView, padStyle, inputDisplay } = settings;
  savePreferences({ ...loadPreferences(), prepMove, sound, farOwnView, padStyle, inputDisplay });
}

/**
 * Configuration qui pré-remplit l'écran « Jouer » : la dernière lancée (ou celle des anciens réglages) ; la toute
 * première fois, soi (« je joue avec ») contre l'IA normale.
 */
export function initialSetup(prefs: Preferences): MatchSetup {
  if (read(SETUP_KEY) || read(LEGACY_KEY)) return loadSetup();
  const setup = structuredClone(DEFAULT_SETUP);
  setup.players = [prefs.device, 'normal', 'normal', 'normal'];
  setup.assists[0] = prefs.assist;
  setup.hands[0] = prefs.hand;
  return setup;
}

/**
 * Adresse d'un match local (sans le `?`) : l'écran « Jouer » recharge la page avec elle, l'adresse reste la seule
 * source de vérité (`research/MENUS_PLAN.md` §4) et `loadSettings` la relit à l'identique.
 */
export function setupQuery(setup: MatchSetup): string {
  const { match } = setup;
  const lefties = setup.hands.flatMap((h, i) => (h === 'left' ? [i + 1] : []));
  const params = new URLSearchParams({
    places: setup.players.join(','),
    double: match.doubles ? '1' : '0',
    assist: setup.assists.join(','),
    gaucher: lefties.length ? lefties.join(',') : '0',
    pression: String(setup.pressure),
    free: match.free ? '1' : '0',
    sets: String(match.setsToWin),
    games: String(match.gamesPerSet),
    gold: match.goldenPoint ? '1' : '0',
  });
  return params.toString().replaceAll('%2C', ',');
}
