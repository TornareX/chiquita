import { connectedGamepads } from '../input/gamepad';
import { KEY_LAYOUTS } from '../input/keyboardArcade';
import { PAD_FAMILY_NAMES, PAD_STYLES, type PadStyle } from '../input/padStyle';
import { AI_LEVEL_NAMES, type AiLevel } from '../sim/bot';
import { ASSIST_LEVELS, PREP_MOVES, type AssistLevel, type PrepMove } from '../sim/duel';
import { DEFAULT_RULES } from '../sim/score';

/** Retour des entrées : masqué, discret (match) ou détaillé (tests). */
export type InputDisplayMode = 'off' | 'compact' | 'full';
export const INPUT_DISPLAY_MODES: readonly InputDisplayMode[] = ['compact', 'full', 'off'];
const INPUT_DISPLAY_LABELS: Record<InputDisplayMode, string> = {
  compact: 'Discret (les sticks, dans le coin)',
  full: 'Détaillé (tests : historique, guide du geste, aide)',
  off: 'Masqué',
};

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

/**
 * Donne la place `index` à `controller`. Une manette ou un clavier ne joue qu'une place : s'il en tenait déjà une
 * autre, celle-ci passe à l'IA normale.
 */
export function assignController(players: DuelSettings['players'], index: number, controller: Controller): void {
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

/** Réglages du mode match, modifiables dans le menu (Échap ou Start) et mémorisés dans le navigateur. */
export interface DuelSettings {
  /**
   * Qui joue chaque place : Bleu, Rouge, puis en double Bleu 2 et Rouge 2 (`playerName`). En double, les places 0
   * et 1 sont à droite, 2 et 3 à gauche.
   */
  players: [Controller, Controller, Controller, Controller];
  assists: [AssistLevel, AssistLevel, AssistLevel, AssistLevel];
  /** Pression des balles (vertes, jaunes, rouges) : 0 = sans, 1 = normale, 1,5 = forte. */
  pressure: number;
  /** Stick gauche pendant la préparation, pour les joueurs humains (`PrepMove`). */
  prepMove: PrepMove;
  sound: boolean;
  /** Le joueur d'en face voit les directions de son côté plutôt que celles de l'écran. */
  farOwnView: boolean;
  /** Symboles des boutons : détectés sur la manette, ou imposés (manette mal reconnue). */
  padStyle: PadStyle;
  /**
   * Retour des entrées de chaque joueur humain : discret (les sticks, petits, dans le coin), détaillé (pour les
   * tests : historique des frappes, guide du geste, aide aux coups et retour sur chaque frappe), ou masqué.
   */
  inputDisplay: InputDisplayMode;
  match: MatchSettings;
}

export const DEFAULT_SETTINGS: DuelSettings = {
  // En double, les partenaires sont des IA tant qu'on ne choisit pas d'autres manettes.
  players: ['manette1', 'manette2', 'normal', 'normal'],
  // Comme Xavier aime jouer : placement manuel, immobile pendant la préparation (le stick gauche vise). Les IA
  // gardent l'aimant (voir `src/modes/duel.ts`).
  assists: ['off', 'off', 'off', 'off'],
  pressure: 1,
  prepMove: 'bloque',
  sound: true,
  farOwnView: false,
  padStyle: 'auto',
  inputDisplay: 'compact',
  match: { free: false, doubles: false, ...DEFAULT_RULES },
};

const STORAGE_KEY = 'padel-smash.reglages';
/** Bouton Start (Menu) : il ouvre et ferme le menu, il n'allume pas de place. */
const START_BUTTON = 9;
/**
 * Version des réglages par défaut. On l'augmente quand un défaut change : les réglages enregistrés avant
 * reprennent alors le nouveau défaut au lieu de le masquer. 2 : placement manuel et préparation bloquée.
 */
const DEFAULTS_VERSION = 2;

export const CONTROLLER_LABELS: Record<Controller, string> = {
  manette1: 'Manette 1',
  manette2: 'Manette 2',
  manette3: 'Manette 3',
  manette4: 'Manette 4',
  clavier1: 'Clavier bleu (ZQSD + J K L I)',
  clavier2: 'Clavier rouge (flèches + pavé)',
  facile: 'IA facile',
  normal: 'IA normale',
  fort: 'IA forte',
};

/** Nom court, pour l'affichage pendant le match. */
export const CONTROLLER_SHORT: Record<Controller, string> = {
  ...CONTROLLER_LABELS,
  clavier1: 'Clavier bleu',
  clavier2: 'Clavier rouge',
};

const ASSIST_LABELS: Record<AssistLevel, string> = {
  magnet: 'Aimant (derniers pas)',
  full: 'Course assistée complète',
  partial: 'Assistance partielle',
  off: 'Placement manuel',
};

const PREP_MOVE_LABELS: Record<PrepMove, string> = {
  libre: 'Libre (le stick déplace)',
  ralenti: 'Ralenti (petits pas, vise)',
  bloque: 'Bloqué (le stick vise)',
  tard: 'Bloqué au dernier moment (on se place, puis le stick vise)',
};

/**
 * Nom de chaque joueur. En simple : Bleu et Rouge. En double : les joueurs 0 et 1 jouent à droite (drive),
 * les 2 et 3 à gauche (revés), dans l'équipe bleue (0, 2) ou rouge (1, 3).
 */
export function playerName(index: number, doubles: boolean, long = false): string {
  const team = index % 2 === 0 ? 'Bleu' : 'Rouge';
  if (!doubles) return team;
  const number = index < 2 ? 1 : 2;
  return long ? `${team} ${number} (${index < 2 ? 'droite' : 'gauche'})` : `${team} ${number}`;
}

/** Copie sûre des réglages enregistrés : toute valeur inconnue est remplacée par la valeur par défaut. */
export function sanitize(raw: unknown): DuelSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<DuelSettings> & { version?: number };
  // Enregistrés avant le dernier changement de défaut : aide à la course et préparation reprennent le défaut.
  const current = r.version === DEFAULTS_VERSION;
  // Avant le choix des manettes, « humain » jouait avec la manette de son numéro de place.
  r.players?.forEach((c: string, i) => {
    const controller = (c === 'humain' ? `manette${i + 1}` : c) as Controller;
    if (i < 4 && CONTROLLERS.includes(controller)) assignController(s.players, i, controller);
  });
  if (current) {
    r.assists?.forEach((a, i) => {
      if (i < 4 && ASSIST_LEVELS.includes(a)) s.assists[i] = a;
    });
  }
  if (typeof r.pressure === 'number' && r.pressure >= 0 && r.pressure <= 2) s.pressure = r.pressure;
  if (current && PREP_MOVES.includes(r.prepMove as PrepMove)) s.prepMove = r.prepMove as PrepMove;
  if (typeof r.sound === 'boolean') s.sound = r.sound;
  if (typeof r.farOwnView === 'boolean') s.farOwnView = r.farOwnView;
  if (PAD_STYLES.includes(r.padStyle as PadStyle)) s.padStyle = r.padStyle as PadStyle;
  // Avant les trois niveaux, c'était oui ou non : « oui » devient discret.
  const shown: unknown = r.inputDisplay;
  if (typeof shown === 'boolean') s.inputDisplay = shown ? 'compact' : 'off';
  else if (INPUT_DISPLAY_MODES.includes(shown as InputDisplayMode)) s.inputDisplay = shown as InputDisplayMode;
  const m = r.match;
  if (m && typeof m === 'object') {
    if (typeof m.free === 'boolean') s.match.free = m.free;
    if (typeof m.doubles === 'boolean') s.match.doubles = m.doubles;
    if (m.setsToWin === 1 || m.setsToWin === 2) s.match.setsToWin = m.setsToWin;
    if (Number.isInteger(m.gamesPerSet) && m.gamesPerSet >= 1 && m.gamesPerSet <= 6) s.match.gamesPerSet = m.gamesPerSet;
    if (typeof m.goldenPoint === 'boolean') s.match.goldenPoint = m.goldenPoint;
  }
  return s;
}

/**
 * Réglages au lancement : ceux mémorisés, puis les paramètres d'URL s'il y en a (raccourcis de test,
 * voir `src/modes/duel.ts`). Le stockage du navigateur peut être indisponible : on joue alors avec les défauts.
 */
export function loadSettings(params: URLSearchParams): DuelSettings {
  let stored: unknown = null;
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    stored = text ? JSON.parse(text) : null;
  } catch {
    stored = null;
  }
  const s = sanitize(stored);
  const ai = params.get('ai');
  const level = AI_LEVEL_NAMES.includes(ai as AiLevel) ? (ai as AiLevel) : null;
  const bot = params.get('bot') ?? (level ? '2' : null);
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
  if (params.has('free')) s.match.free = true;
  const positive = (name: string): number | null => {
    const value = Number(params.get(name));
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  s.match.setsToWin = positive('sets') ?? s.match.setsToWin;
  s.match.gamesPerSet = positive('games') ?? s.match.gamesPerSet;
  if (params.has('gold')) s.match.goldenPoint = params.get('gold') === '1';
  return s;
}

export function saveSettings(settings: DuelSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, version: DEFAULTS_VERSION }));
  } catch {
    // Stockage indisponible (navigation privée…) : les réglages valent pour cette partie seulement.
  }
}

export interface SettingsMenu {
  readonly isOpen: boolean;
  toggle(): void;
}

/**
 * Menu de réglages du match. `onChange` reçoit les réglages à chaque modification ; `restart` est vrai
 * quand il faut relancer une partie (règles du match changées).
 */
export function createSettingsMenu(
  settings: DuelSettings,
  onChange: (settings: DuelSettings, restart: boolean) => void,
  /** Ouvre l'écran « Teste ta manette » (le menu se ferme). */
  onTestPad?: () => void,
): SettingsMenu {
  const changed = (restart = false): void => {
    saveSettings(settings);
    onChange(settings, restart);
  };

  const gear = document.createElement('button');
  gear.id = 'settings-button';
  gear.type = 'button';
  gear.textContent = '⚙ Réglages (Échap)';

  const overlay = document.createElement('div');
  overlay.id = 'settings';
  overlay.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  overlay.append(panel);

  const title = document.createElement('h1');
  title.textContent = 'Réglages';
  const paused = document.createElement('p');
  paused.className = 'hint';
  paused.textContent = 'Partie en pause. Échap, Start ou « Reprendre » pour continuer.';
  panel.append(title, paused);

  const section = (name: string): HTMLElement => {
    const element = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = name;
    element.append(heading);
    panel.append(element);
    return element;
  };
  const row = (parent: HTMLElement, label: string, control: HTMLElement): HTMLElement => {
    const element = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = label;
    element.append(text, control);
    parent.append(element);
    return element;
  };
  const select = <T extends string | number>(
    options: readonly T[],
    labels: (value: T) => string,
    value: T,
    set: (value: T) => void,
  ): HTMLSelectElement => {
    const element = document.createElement('select');
    for (const option of options) {
      const item = document.createElement('option');
      item.value = String(option);
      item.textContent = labels(option);
      element.append(item);
    }
    element.value = String(value);
    element.addEventListener('change', () => set(options.find((o) => String(o) === element.value)!));
    return element;
  };
  const check = (value: boolean, set: (value: boolean) => void): HTMLInputElement => {
    const element = document.createElement('input');
    element.type = 'checkbox';
    element.checked = value;
    element.addEventListener('change', () => set(element.checked));
    return element;
  };

  const teams = section('Équipes');
  const teamsHint = document.createElement('p');
  teamsHint.className = 'hint';
  teamsHint.textContent =
    "Comme à l'écran : Bleu en bas, de dos ; Rouge en haut, face à toi. Appuie sur un bouton d'une manette (ou une touche) : sa place s'allume.";
  const court = document.createElement('div');
  court.className = 'teams-court';
  const net = document.createElement('div');
  net.className = 'net';
  net.textContent = 'filet';
  const padList = document.createElement('p');
  padList.className = 'hint pads';
  teams.append(teamsHint, court, padList);

  /** Une carte par place : qui la joue, et sa course assistée (pour un humain). */
  const cards = ([0, 1, 2, 3] as const).map((i) => {
    const card = document.createElement('div');
    card.className = `place ${i % 2 === 0 ? 'blue' : 'red'}`;
    card.dataset.place = String(i);
    const title = document.createElement('div');
    title.className = 'place-name';
    const who = select(CONTROLLERS, (c) => CONTROLLER_LABELS[c], settings.players[i], (c) => {
      assignController(settings.players, i, c);
      refreshCards();
      changed();
    });
    who.setAttribute('aria-label', 'Qui joue cette place');
    const assistControl = select(ASSIST_LEVELS, (a) => ASSIST_LABELS[a], settings.assists[i], (a) => {
      settings.assists[i] = a;
      changed();
    });
    assistControl.setAttribute('aria-label', 'Course');
    const assistRow = document.createElement('label');
    const assistText = document.createElement('span');
    assistText.textContent = 'Course';
    assistRow.append(assistText, assistControl);
    card.append(title, who, assistRow);
    return { card, title, who, assistControl, assistRow };
  });

  /**
   * Place des cartes : vue de la caméra, derrière Bleu. La droite de Bleu est à droite de l'écran, celle de Rouge
   * (qui regarde vers nous) à gauche. En simple, une carte par équipe.
   */
  let shownDoubles = settings.match.doubles;
  const showFormat = (doubles: boolean): void => {
    shownDoubles = doubles;
    court.classList.toggle('doubles', doubles);
    const order = doubles ? [1, 3, -1, 2, 0] : [1, -1, 0];
    court.replaceChildren(...order.map((i) => (i < 0 ? net : cards[i]!.card)));
    cards.forEach(({ title }, i) => {
      title.textContent = doubles ? `${playerName(i, true)} · ${i < 2 ? 'droite (drive)' : 'gauche (revés)'}` : playerName(i, false);
    });
  };
  /** Manettes branchées, dans l'ordre : leurs numéros dans les choix, et la liste sous le terrain. */
  const refreshCards = (): void => {
    const pads = connectedGamepads();
    cards.forEach(({ who, assistControl, assistRow }, i) => {
      for (const option of who.options) {
        const controller = option.value as Controller;
        const pad = padOf(controller);
        option.textContent = CONTROLLER_LABELS[controller] + (pad !== null && !pads[pad] ? ' (pas branchée)' : '');
      }
      who.value = settings.players[i]!;
      assistControl.value = settings.assists[i]!;
      assistRow.hidden = !isHuman(settings.players[i]!);
    });
    padList.textContent = pads.length
      ? pads.map((pad, n) => `Manette ${n + 1} : ${pad.id.replace(/\s*\(.*$/, '')}`).join(' · ')
      : 'Aucune manette détectée : appuie sur un de ses boutons pour la réveiller.';
  };
  showFormat(settings.match.doubles);
  refreshCards();
  window.addEventListener('gamepadconnected', () => refreshCards());
  window.addEventListener('gamepaddisconnected', () => refreshCards());

  /** Allume un instant les places jouées par ce contrôleur. */
  const light = (controller: Controller): void => {
    cards.forEach(({ card }, i) => {
      if (settings.players[i] !== controller || (i >= 2 && !shownDoubles)) return;
      card.classList.remove('lit');
      void card.offsetWidth;
      card.classList.add('lit');
    });
  };
  window.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    KEY_LAYOUTS.forEach((layout, k) => {
      const keys = [layout.up, layout.down, layout.left, layout.right, layout.assist, ...layout.shots.map(([code]) => code)];
      if (keys.includes(event.code)) light(k === 0 ? 'clavier1' : 'clavier2');
    });
  });
  /** Boutons tenus au dernier passage, par manette : on allume à l'appui. */
  let padsHeld: boolean[] = [];
  const watchPads = (): void => {
    if (overlay.hidden) return;
    const pads = connectedGamepads();
    // Une manette se réveille à son premier bouton : la liste et les choix suivent.
    if (pads.length !== padsHeld.length) refreshCards();
    const held = pads.map((pad) => pad.buttons.some((b, n) => n !== START_BUTTON && b.pressed));
    held.forEach((now, n) => {
      if (now && !padsHeld[n]) light(`manette${n + 1}` as Controller);
    });
    padsHeld = held;
    requestAnimationFrame(watchPads);
  };

  const game = section('Jeu');
  const pressure = document.createElement('input');
  pressure.type = 'range';
  pressure.min = '0';
  pressure.max = '1.5';
  pressure.step = '0.25';
  pressure.value = String(settings.pressure);
  const pressureLabel = (): string =>
    settings.pressure === 0 ? 'aucune' : settings.pressure < 1 ? 'légère' : settings.pressure === 1 ? 'normale' : 'forte';
  const pressureValue = document.createElement('span');
  pressureValue.className = 'value';
  pressureValue.textContent = pressureLabel();
  pressure.addEventListener('input', () => {
    settings.pressure = Number(pressure.value);
    pressureValue.textContent = pressureLabel();
    changed();
  });
  const pressureRow = document.createElement('div');
  pressureRow.className = 'slider';
  pressureRow.append(pressure, pressureValue);
  row(game, 'Pression des balles (vertes, jaunes, rouges)', pressureRow);
  row(
    game,
    'Stick gauche pendant la préparation',
    select(PREP_MOVES, (m) => PREP_MOVE_LABELS[m], settings.prepMove, (m) => {
      settings.prepMove = m;
      changed();
    }),
  );
  row(
    game,
    'Son',
    check(settings.sound, (on) => {
      settings.sound = on;
      changed();
    }),
  );
  row(
    game,
    "L'équipe d'en face voit les directions de son côté",
    check(settings.farOwnView, (on) => {
      settings.farOwnView = on;
      changed();
    }),
  );

  const controls = section('Manette');
  const padSelect = select(PAD_STYLES, (p) => (p === 'auto' ? 'Détectés sur la manette' : `Manette ${PAD_FAMILY_NAMES[p]}`), settings.padStyle, (p) => {
      settings.padStyle = p;
      changed();
    },
  );
  row(controls, 'Symboles des boutons', padSelect);
  row(
    controls,
    'Retour des entrées',
    select(INPUT_DISPLAY_MODES, (m) => INPUT_DISPLAY_LABELS[m], settings.inputDisplay, (m) => {
      settings.inputDisplay = m;
      changed();
    }),
  );

  const match = section('Match (appliqué à la prochaine partie)');
  const draft = structuredClone(settings.match);
  row(
    match,
    '2 contre 2 (choisis les places dans « Équipes »)',
    check(draft.doubles, (on) => {
      draft.doubles = on;
      showFormat(on);
    }),
  );
  row(match, 'Échange libre, sans score', check(draft.free, (on) => (draft.free = on)));
  row(match, 'Sets', select([1, 2] as const, (n) => (n === 1 ? 'Un set' : 'Deux sets gagnants'), draft.setsToWin as 1 | 2, (n) => (draft.setsToWin = n)));
  const games = [...new Set([2, 4, 6, draft.gamesPerSet])].sort((a, b) => a - b);
  row(match, 'Jeux par set', select(games, (n) => `${n}`, draft.gamesPerSet, (n) => (draft.gamesPerSet = n)));
  row(match, 'Punto de oro (point décisif à 40-40)', check(draft.goldenPoint, (on) => (draft.goldenPoint = on)));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.textContent = 'Reprendre';
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.textContent = 'Nouvelle partie';
  const labo = document.createElement('button');
  labo.type = 'button';
  labo.textContent = 'Labo de sensations';
  labo.title = 'Rejouer une situation de match en boucle et régler la physique';
  labo.addEventListener('click', () => (location.search = '?mode=labo'));
  const testPad = document.createElement('button');
  testPad.type = 'button';
  testPad.textContent = 'Tester ma manette';
  testPad.title = 'Vérifier quel bouton est lequel sur ta manette, et le stick';
  testPad.hidden = !onTestPad;
  const tutorial = document.createElement('button');
  tutorial.type = 'button';
  tutorial.textContent = 'Tutoriel';
  tutorial.title = 'Une leçon par coup : quand le jouer, quels boutons, comment le réussir';
  tutorial.addEventListener('click', () => (location.search = '?mode=tutoriel'));
  actions.append(tutorial, testPad, labo, resume, restart);
  panel.append(actions);

  document.body.append(gear, overlay);

  const menu = {
    get isOpen(): boolean {
      return !overlay.hidden;
    },
    toggle(): void {
      overlay.hidden = !overlay.hidden;
      // Les symboles peuvent avoir été changés dans « Teste ta manette ».
      if (!overlay.hidden) {
        padSelect.value = settings.padStyle;
        // L'assistance a pu changer en jeu (bouton d'assistance), et des manettes être branchées.
        refreshCards();
        padsHeld = connectedGamepads().map(() => true);
        requestAnimationFrame(watchPads);
      }
      gear.hidden = !overlay.hidden;
      // Le menu ne doit pas garder le focus : les touches de jeu repartent vers la partie.
      if (overlay.hidden && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
  };
  gear.addEventListener('click', () => menu.toggle());
  resume.addEventListener('click', () => menu.toggle());
  testPad.addEventListener('click', () => {
    menu.toggle();
    onTestPad?.();
  });
  restart.addEventListener('click', () => {
    settings.match = structuredClone(draft);
    showFormat(settings.match.doubles);
    changed(true);
    menu.toggle();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    menu.toggle();
  });
  return menu;
}
