import { connectedGamepads } from '../input/gamepad';
import { KEY_LAYOUTS, layoutKeys } from '../input/keyboardArcade';
import { PAD_FAMILY_NAMES, PAD_STYLES } from '../input/padStyle';
import { ASSIST_LEVELS, PREP_MOVES, type AssistLevel, type PrepMove } from '../sim/duel';
import { HANDS, type Hand } from '../sim/shots';
import {
  assignController,
  CONTROLLERS,
  INPUT_DISPLAY_MODES,
  isHuman,
  padOf,
  saveSettings,
  saveSetup,
  type Controller,
  type DuelSettings,
  type InputDisplayMode,
} from './settingsStore';

// Réglages et leur enregistrement : `settingsStore.ts`. Ici, les noms affichés et le menu.
export {
  assignController,
  CONTROLLERS,
  DEFAULT_SETTINGS,
  DEVICES,
  INPUT_DISPLAY_MODES,
  isHuman,
  keyboardOf,
  loadSettings,
  padOf,
  sanitize,
  saveSettings,
  type Controller,
  type Device,
  type DuelSettings,
  type InputDisplayMode,
  type MatchSettings,
} from './settingsStore';

export const INPUT_DISPLAY_LABELS: Record<InputDisplayMode, string> = {
  compact: 'Discret (les sticks, dans le coin)',
  full: 'Détaillé (tests : historique, guide du geste, aide)',
  off: 'Masqué',
};

/** Bouton Start (Menu) : il ouvre et ferme le menu, il n'allume pas de place. */
const START_BUTTON = 9;

export const CONTROLLER_LABELS: Record<Controller, string> = {
  manette1: 'Manette 1',
  manette2: 'Manette 2',
  manette3: 'Manette 3',
  manette4: 'Manette 4',
  clavier1: 'Clavier bleu (ZQSD + I J K L ou souris)',
  clavier2: 'Clavier rouge (flèches + pavé 8 4 5 6)',
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

export const ASSIST_LABELS: Record<AssistLevel, string> = {
  magnet: 'Aimant (derniers pas)',
  full: 'Course assistée complète',
  partial: 'Assistance partielle',
  off: 'Placement manuel',
};

export const HAND_LABELS: Record<Hand, string> = {
  right: 'Droitier',
  left: 'Gaucher',
};

export const PREP_MOVE_LABELS: Record<PrepMove, string> = {
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
    saveSetup(settings);
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
    const handControl = select(HANDS, (h) => HAND_LABELS[h], settings.hands[i], (h) => {
      settings.hands[i] = h;
      changed();
    });
    const handRow = document.createElement('label');
    const handText = document.createElement('span');
    handText.textContent = 'Main';
    handRow.append(handText, handControl);
    card.append(title, who, handRow, assistRow);
    return { card, title, who, handControl, assistControl, assistRow };
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
    cards.forEach(({ who, handControl, assistControl, assistRow }, i) => {
      for (const option of who.options) {
        const controller = option.value as Controller;
        const pad = padOf(controller);
        option.textContent = CONTROLLER_LABELS[controller] + (pad !== null && !pads[pad] ? ' (pas branchée)' : '');
      }
      who.value = settings.players[i]!;
      assistControl.value = settings.assists[i]!;
      handControl.value = settings.hands[i]!;
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
      if (layoutKeys(layout).includes(event.code)) light(k === 0 ? 'clavier1' : 'clavier2');
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
