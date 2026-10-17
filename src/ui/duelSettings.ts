import { AI_LEVEL_NAMES, type AiLevel } from '../sim/bot';
import { ASSIST_LEVELS, type AssistLevel } from '../sim/duel';
import { DEFAULT_RULES } from '../sim/score';

/** Qui joue un côté : un humain (manette ou clavier), ou l'IA à un niveau. */
export type Controller = 'humain' | AiLevel;

export interface MatchSettings {
  /** Échange libre, sans score. */
  free: boolean;
  setsToWin: number;
  gamesPerSet: number;
  goldenPoint: boolean;
}

/** Réglages du mode match, modifiables dans le menu (Échap ou Start) et mémorisés dans le navigateur. */
export interface DuelSettings {
  players: [Controller, Controller];
  assists: [AssistLevel, AssistLevel];
  /** Pression des balles (vertes, jaunes, rouges) : 0 = sans, 1 = normale, 1,5 = forte. */
  pressure: number;
  sound: boolean;
  /** Le joueur d'en face voit les directions de son côté plutôt que celles de l'écran. */
  farOwnView: boolean;
  match: MatchSettings;
}

export const DEFAULT_SETTINGS: DuelSettings = {
  players: ['humain', 'humain'],
  assists: ['magnet', 'magnet'],
  pressure: 1,
  sound: true,
  farOwnView: false,
  match: { free: false, ...DEFAULT_RULES },
};

const STORAGE_KEY = 'padel-smash.reglages';

const CONTROLLER_LABELS: Record<Controller, string> = {
  humain: 'Humain (manette ou clavier)',
  facile: 'IA facile',
  normal: 'IA normale',
  fort: 'IA forte',
};

const ASSIST_LABELS: Record<AssistLevel, string> = {
  magnet: 'Aimant (derniers pas)',
  full: 'Course assistée complète',
  partial: 'Assistance partielle',
  off: 'Placement manuel',
};

const CONTROLLERS: readonly Controller[] = ['humain', ...AI_LEVEL_NAMES];
const NAMES = ['Bleu', 'Rouge'] as const;

/** Copie sûre des réglages enregistrés : toute valeur inconnue est remplacée par la valeur par défaut. */
function sanitize(raw: unknown): DuelSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<DuelSettings>;
  r.players?.forEach((c, i) => {
    if (i < 2 && CONTROLLERS.includes(c)) s.players[i] = c;
  });
  r.assists?.forEach((a, i) => {
    if (i < 2 && ASSIST_LEVELS.includes(a)) s.assists[i] = a;
  });
  if (typeof r.pressure === 'number' && r.pressure >= 0 && r.pressure <= 2) s.pressure = r.pressure;
  if (typeof r.sound === 'boolean') s.sound = r.sound;
  if (typeof r.farOwnView === 'boolean') s.farOwnView = r.farOwnView;
  const m = r.match;
  if (m && typeof m === 'object') {
    if (typeof m.free === 'boolean') s.match.free = m.free;
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
  if (bot) {
    s.players = ['humain', 'humain'];
    if (bot === '1' || bot === 'both') s.players[0] = level ?? 'normal';
    if (bot === '2' || bot === 'both') s.players[1] = level ?? 'normal';
  }
  const assists = params.get('assist')?.split(',');
  assists?.forEach((a, i) => {
    if (i < 2 && ASSIST_LEVELS.includes(a as AssistLevel)) s.assists[i] = a as AssistLevel;
  });
  if (assists?.length === 1 && ASSIST_LEVELS.includes(assists[0] as AssistLevel)) s.assists[1] = assists[0] as AssistLevel;
  const pressure = Number(params.get('pression'));
  if (params.has('pression') && Number.isFinite(pressure) && pressure >= 0) s.pressure = pressure;
  if (params.get('far') === 'own') s.farOwnView = true;
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

function saveSettings(settings: DuelSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
export function createSettingsMenu(settings: DuelSettings, onChange: (settings: DuelSettings, restart: boolean) => void): SettingsMenu {
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
  const row = (parent: HTMLElement, label: string, control: HTMLElement): void => {
    const element = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = label;
    element.append(text, control);
    parent.append(element);
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

  const players = section('Joueurs');
  ([0, 1] as const).forEach((i) => {
    row(
      players,
      NAMES[i],
      select(CONTROLLERS, (c) => CONTROLLER_LABELS[c], settings.players[i], (c) => {
        settings.players[i] = c;
        changed();
      }),
    );
  });

  const assist = section('Assistance de course');
  ([0, 1] as const).forEach((i) => {
    row(
      assist,
      NAMES[i],
      select(ASSIST_LEVELS, (a) => ASSIST_LABELS[a], settings.assists[i], (a) => {
        settings.assists[i] = a;
        changed();
      }),
    );
  });

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
    'Son',
    check(settings.sound, (on) => {
      settings.sound = on;
      changed();
    }),
  );
  row(
    game,
    'Rouge voit les directions de son côté',
    check(settings.farOwnView, (on) => {
      settings.farOwnView = on;
      changed();
    }),
  );

  const match = section('Match (appliqué à la prochaine partie)');
  const draft = structuredClone(settings.match);
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
  actions.append(resume, restart);
  panel.append(actions);

  document.body.append(gear, overlay);

  const menu = {
    get isOpen(): boolean {
      return !overlay.hidden;
    },
    toggle(): void {
      overlay.hidden = !overlay.hidden;
      gear.hidden = !overlay.hidden;
      // Le menu ne doit pas garder le focus : les touches de jeu repartent vers la partie.
      if (overlay.hidden && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
  };
  gear.addEventListener('click', () => menu.toggle());
  resume.addEventListener('click', () => menu.toggle());
  restart.addEventListener('click', () => {
    settings.match = structuredClone(draft);
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
