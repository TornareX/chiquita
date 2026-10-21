import { connectedGamepads } from '../input/gamepad';
import './theme.css';
import './menu.css';

/**
 * Menus du jeu (`research/MENUS_PLAN.md` §4) : chaque écran est décrit par des données (ses entrées, leurs choix,
 * leurs actions) ; ce composant les affiche et gère la navigation, à la manette (stick ou croix pour se déplacer, A
 * pour valider, B pour revenir), au clavier (flèches, Entrée, Échap) et à la souris. Aucun style ici : toute
 * l'apparence est dans `menu.css`, par des classes stables (`menu`, `menu-item`, `is-focused`…).
 */

/** Une valeur proposée par un choix. */
export interface MenuOption<T> {
  value: T;
  label: string;
}

interface ItemBase {
  /** Identifiant stable (`data-item`), pour garder le focus d'un rafraîchissement à l'autre et pour les tests. */
  id: string;
  label: string;
  /** Petite explication sous l'entrée. */
  hint?: string;
  disabled?: boolean;
  /** Classes en plus (par exemple l'équipe d'une place : `blue`, `red`), pour la feuille de style. */
  tags?: string[];
  /** Groupe (`data-group`) : les entrées d'un même groupe sont rangées ensemble, pour la feuille de style. */
  group?: string;
}

/** Une action : valider la lance. */
export interface ActionItem extends ItemBase {
  kind: 'action';
  run(): void;
  /** Mise en avant (l'action principale de l'écran). */
  primary?: boolean;
}

/** Un choix parmi des valeurs : gauche et droite (ou un clic) passent à la précédente ou à la suivante. */
export interface ChoiceItem<T = unknown> extends ItemBase {
  kind: 'choice';
  options: readonly MenuOption<T>[];
  value: T;
  set(value: T): void;
}

/** Oui ou non. */
export interface ToggleItem extends ItemBase {
  kind: 'toggle';
  value: boolean;
  set(value: boolean): void;
}

/**
 * Un texte (nom, code de salle). Au clavier, on tape directement. À la manette, A ouvre l'édition : haut et bas
 * changent la lettre, gauche et droite passent à la lettre voisine, A ou B termine.
 */
export interface TextItem extends ItemBase {
  kind: 'text';
  value: string;
  set(value: string): void;
  maxLength: number;
  /** Caractères proposés à la manette, dans l'ordre. */
  charset: string;
  placeholder?: string;
  /** Entrée validée au clavier (touche Entrée) : par exemple « Rejoindre ». */
  submit?(): void;
}

/** Un texte seul, qu'on ne sélectionne pas (explication, code de la salle, message). */
export interface InfoItem {
  kind: 'info';
  id: string;
  text: string;
  tags?: string[];
  group?: string;
}

/** Un titre de groupe. */
export interface HeadingItem {
  kind: 'heading';
  id: string;
  text: string;
  tags?: string[];
  group?: string;
}

export type MenuItem = ActionItem | ChoiceItem<any> | ToggleItem | TextItem | InfoItem | HeadingItem; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface MenuScreen {
  /** Identifiant de l'écran (`data-screen`), pour la feuille de style et les tests. */
  id: string;
  title: string;
  hint?: string;
  /**
   * Disposition des entrées (`data-layout`) : en liste (par défaut) ; en tuiles côte à côte (accueil), où gauche et
   * droite passent aussi d'une entrée à l'autre ; ou en colonnes (Jouer), où la croix suit l'écran : haut et bas
   * restent dans la colonne, gauche et droite changent la valeur d'un choix et, ailleurs, passent à la colonne
   * voisine, comme LB/RB (Tab au clavier) depuis n'importe quelle entrée.
   */
  layout?: 'list' | 'tiles' | 'columns';
  /** Les entrées, relues à chaque rafraîchissement (`Menu.refresh`). */
  items(): MenuItem[];
  /** B, Échap : revenir. Sans `back`, l'écran précédent de la pile ; à la racine, rien. */
  back?(): void;
  /** Appelé à chaque image tant que l'écran est affiché (manettes branchées, places allumées…). */
  tick?(): void;
}

export interface Menu {
  readonly isOpen: boolean;
  readonly screen: MenuScreen | null;
  /** Affiche cet écran seul (la pile repart de lui). */
  show(screen: MenuScreen): void;
  /** Ouvre un écran par-dessus le courant ; B y revient. */
  push(screen: MenuScreen): void;
  /** Revient à l'écran précédent (ou ferme, à la racine, si `closeAtRoot`). */
  pop(): void;
  /** Relit les entrées de l'écran courant (après un changement venu d'ailleurs). */
  refresh(): void;
  /** Message sous les entrées (erreur, attente) ; chaîne vide pour l'effacer. */
  message(text: string): void;
  /** Allume un instant une entrée (une place quand on appuie sur la manette qui la joue). */
  flash(id: string): void;
  hide(): void;
  /** Réaffiche le menu caché, sur le même écran (après « Teste ta manette », par exemple). */
  reopen(): void;
}

export interface MenuOptions {
  /** Identifiant de l'élément racine (`#menu` par défaut). */
  id?: string;
  /** Fond qui assombrit la partie derrière (pause), ou fond plein (accueil). */
  overlay?: 'dim' | 'opaque';
  /** B ou Échap à la racine : par exemple reprendre la partie. */
  onRootBack?(): void;
}

/** Boutons de la disposition standard. */
const PAD = { a: 0, b: 1, lb: 4, rb: 5, up: 12, down: 13, left: 14, right: 15 } as const;
/** Stick poussé au-delà : une direction. */
const STICK_THRESHOLD = 0.55;
/** Répétition d'une direction tenue : premier délai, puis cadence (ms). */
const REPEAT_DELAY = 380;
const REPEAT_EVERY = 110;

type Direction = 'up' | 'down' | 'left' | 'right';
interface PadSnapshot {
  a: boolean;
  b: boolean;
  lb: boolean;
  rb: boolean;
  dir: Direction | null;
}

function readPad(pad: Gamepad): PadSnapshot {
  const pressed = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
  const [x = 0, y = 0] = pad.axes;
  let dir: Direction | null = null;
  if (pressed(PAD.up) || y < -STICK_THRESHOLD) dir = 'up';
  else if (pressed(PAD.down) || y > STICK_THRESHOLD) dir = 'down';
  else if (pressed(PAD.left) || x < -STICK_THRESHOLD) dir = 'left';
  else if (pressed(PAD.right) || x > STICK_THRESHOLD) dir = 'right';
  return { a: pressed(PAD.a), b: pressed(PAD.b), lb: pressed(PAD.lb), rb: pressed(PAD.rb), dir };
}

const focusable = (item: MenuItem): item is Exclude<MenuItem, InfoItem | HeadingItem> =>
  item.kind !== 'info' && item.kind !== 'heading' && !item.disabled;

export function createMenu(options: MenuOptions = {}): Menu {
  const root = document.createElement('div');
  root.id = options.id ?? 'menu';
  root.className = `menu menu-${options.overlay ?? 'dim'}`;
  root.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  // Aides manette en bas d'écran : ce que font A et B (B disparaît quand il ne fait rien).
  const hints = document.createElement('div');
  hints.className = 'menu-pad-hints';
  hints.setAttribute('aria-hidden', 'true');
  for (const [key, text, extra] of [
    ['A', 'Valider', ''],
    ['B', 'Retour', ' is-back'],
    ['LB RB', 'Colonne', ' is-jump'],
  ] as const) {
    const hint = document.createElement('span');
    hint.className = `menu-pad-hint${extra}`;
    const glyph = document.createElement('span');
    glyph.className = 'menu-pad-key';
    glyph.textContent = key;
    hint.append(glyph, text);
    hints.append(hint);
  }
  // Repères des manettes branchées : un losange par manette, plein quand elle est là.
  const padRow = document.createElement('span');
  padRow.className = 'menu-pads';
  // Le navigateur ne voit une manette qu'après un premier appui : sans manette, on le dit.
  const padLabel = document.createElement('span');
  padLabel.className = 'menu-pads-label';
  padRow.append(padLabel);
  const padMarks = Array.from({ length: 4 }, () => {
    const mark = document.createElement('span');
    mark.className = 'menu-pad';
    padRow.append(mark);
    return mark;
  });
  hints.append(padRow);
  let padCount = -1;
  const showPads = (count: number): void => {
    if (count === padCount) return;
    padCount = count;
    padMarks.forEach((mark, i) => mark.classList.toggle('is-on', i < count));
    padRow.dataset.count = String(count);
    padLabel.textContent = count === 0 ? 'Aucune manette : appuie sur un bouton' : `${count} manette${count > 1 ? 's' : ''}`;
  };
  root.append(panel, hints);
  document.body.append(root);

  let stack: MenuScreen[] = [];
  let items: MenuItem[] = [];
  let elements = new Map<string, HTMLElement>();
  let focusedId: string | null = null;
  let messageText = '';
  /** Texte en cours d'édition à la manette : l'entrée et la position de la lettre. */
  let editing: { id: string; at: number } | null = null;

  const current = (): MenuScreen | null => stack[stack.length - 1] ?? null;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /** Valeur voisine d'un choix (`step` = ±1), en boucle. */
  const cycle = (item: ChoiceItem, step: number): void => {
    const index = item.options.findIndex((o) => Object.is(o.value, item.value));
    const next = item.options[(index + step + item.options.length) % item.options.length];
    if (next) item.set(next.value);
    render();
  };

  const activate = (item: MenuItem): void => {
    if (!focusable(item)) return;
    if (item.kind === 'action') item.run();
    else if (item.kind === 'toggle') {
      item.set(!item.value);
      render();
    } else if (item.kind === 'choice') cycle(item, 1);
    else if (item.kind === 'text') {
      editing = editing?.id === item.id ? null : { id: item.id, at: Math.min(item.value.length, item.maxLength - 1) };
      render();
    }
  };

  const renderItem = (item: MenuItem): HTMLElement => {
    if (item.kind === 'heading') return el('h2', ['menu-heading', ...(item.tags ?? [])].join(' '), item.text);
    if (item.kind === 'info') {
      const info = el('p', ['menu-info', ...(item.tags ?? [])].join(' '), item.text);
      info.dataset.item = item.id;
      return info;
    }
    const row = el('div', ['menu-item', `menu-${item.kind}`, ...(item.tags ?? [])].join(' '));
    row.dataset.item = item.id;
    if (item.disabled) row.classList.add('is-disabled');
    if (item.kind === 'action' && item.primary) row.classList.add('is-primary');
    if (item.kind === 'action') {
      const button = el('button', 'menu-button', item.label);
      button.type = 'button';
      button.disabled = item.disabled ?? false;
      button.addEventListener('click', () => {
        focus(item.id);
        activate(item);
      });
      row.append(button);
      // Toute la carte se clique, ligne d'aide comprise, pas seulement le bouton.
      row.addEventListener('click', (event) => {
        if (!(event.target as Element).closest('.menu-button')) button.click();
      });
    } else {
      const label = el('span', 'menu-label', item.label);
      row.append(label);
      if (item.kind === 'choice') {
        const prev = el('button', 'menu-arrow menu-prev', '‹');
        const next = el('button', 'menu-arrow menu-next', '›');
        prev.type = next.type = 'button';
        prev.tabIndex = next.tabIndex = -1;
        prev.setAttribute('aria-label', 'Précédent');
        next.setAttribute('aria-label', 'Suivant');
        const value = el('span', 'menu-value', item.options.find((o) => Object.is(o.value, item.value))?.label ?? String(item.value));
        prev.addEventListener('click', () => {
          focus(item.id);
          cycle(item, -1);
        });
        next.addEventListener('click', () => {
          focus(item.id);
          cycle(item, 1);
        });
        const control = el('span', 'menu-control');
        control.append(prev, value, next);
        row.append(control);
        row.setAttribute('role', 'spinbutton');
        row.setAttribute('aria-valuetext', value.textContent ?? '');
      } else if (item.kind === 'toggle') {
        const value = el('span', 'menu-value', item.value ? 'Oui' : 'Non');
        row.classList.toggle('is-on', item.value);
        row.append(value);
        row.setAttribute('role', 'switch');
        row.setAttribute('aria-checked', String(item.value));
        row.addEventListener('click', () => {
          focus(item.id);
          activate(item);
        });
      } else {
        const input = el('input', 'menu-input');
        input.value = item.value;
        input.maxLength = item.maxLength;
        input.placeholder = item.placeholder ?? '';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.addEventListener('input', () => item.set(input.value));
        input.addEventListener('focus', () => setFocus(item.id, false));
        row.append(input);
        row.addEventListener('click', (event) => {
          if (event.target !== input) input.focus();
        });
        if (editing?.id === item.id) {
          row.classList.add('is-editing');
          // Lettre en cours d'édition à la manette.
          const letters = el('span', 'menu-letters');
          for (let i = 0; i < item.maxLength; i++) {
            const letter = el('span', `menu-letter${i === editing.at ? ' is-current' : ''}`, item.value[i] ?? '·');
            letters.append(letter);
          }
          row.append(letters);
        }
      }
      if (item.kind !== 'text') {
        row.tabIndex = -1;
        row.addEventListener('click', (event) => {
          if (item.kind === 'choice' && !(event.target as Element).closest('.menu-arrow')) cycle(item, 1);
        });
      }
    }
    if (item.hint) row.append(el('p', 'menu-hint', item.hint));
    row.addEventListener('mousemove', () => {
      if (focusedId !== item.id && focusable(item)) setFocus(item.id, false);
    });
    return row;
  };

  /** Le focus visible (`is-focused`), et le focus du navigateur sur l'élément (texte : son champ). */
  const setFocus = (id: string | null, moveDom = true): void => {
    if (id !== focusedId) returnTo = null;
    focusedId = id;
    for (const [itemId, element] of elements) element.classList.toggle('is-focused', itemId === id);
    if (!moveDom || id === null) return;
    const element = elements.get(id);
    const target = element?.querySelector<HTMLElement>('input, button') ?? element;
    target?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: 'nearest' });
  };
  const focus = (id: string): void => setFocus(id);

  const render = (): void => {
    const screen = current();
    if (!screen) return;
    items = screen.items();
    elements = new Map();
    const title = el('h1', 'menu-title', screen.title);
    const children: HTMLElement[] = [title];
    if (screen.hint) children.push(el('p', 'menu-screen-hint', screen.hint));
    const list = el('div', 'menu-items');
    const groups = new Map<string, HTMLElement>();
    for (const item of items) {
      const node = renderItem(item);
      if (focusable(item)) elements.set(item.id, node);
      let parent: HTMLElement = list;
      if (item.group) {
        parent = groups.get(item.group) ?? list.appendChild(el('div', 'menu-group'));
        parent.dataset.group = item.group;
        groups.set(item.group, parent);
      }
      parent.append(node);
    }
    children.push(list);
    const message = el('p', 'menu-message', messageText);
    message.setAttribute('role', 'status');
    children.push(message);
    // Le champ en cours de saisie au clavier garde le focus : on ne remplace pas la page sous les doigts.
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement && panel.contains(active) ? (active.closest<HTMLElement>('[data-item]')?.dataset.item ?? null) : null;
    panel.replaceChildren(...children);
    panel.dataset.screen = screen.id;
    root.dataset.screen = screen.id;
    root.dataset.layout = screen.layout ?? 'list';
    root.dataset.back = editing || screen.back || stack.length > 1 || options.onRootBack ? 'oui' : 'non';
    if (focusedId === null || !elements.has(focusedId)) focusedId = items.find(focusable)?.id ?? null;
    if (editing && !elements.has(editing.id)) editing = null;
    setFocus(focusedId, !root.hidden);
    if (typing && typing === focusedId) {
      const input = elements.get(typing)?.querySelector('input');
      if (input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  };

  /** Entrée voisine sélectionnable (`step` = ±1), en boucle. */
  const move = (step: number): void => {
    const ids = items.filter(focusable).map((i) => i.id);
    if (ids.length === 0) return;
    const index = focusedId === null ? -1 : ids.indexOf(focusedId);
    setFocus(ids[(index + step + ids.length) % ids.length]!);
  };

  const focusedItem = (): MenuItem | undefined => items.find((i) => i.id === focusedId);

  /*
   * En colonnes, la navigation suit l'écran. Haut et bas restent dans la colonne (l'entrée suivante qui la chevauche) ;
   * au bout, ils vont à l'entrée la plus proche dans ce sens (bas : la rangée de « Lancer »). Gauche et droite, hors
   * des choix et interrupteurs (qui gardent leur valeur), comme LB/RB et Tab, passent à la colonne voisine, sur
   * l'entrée la plus proche en hauteur. Revenir en arrière après avoir quitté un groupe ramène à l'entrée quittée,
   * même après s'être déplacé dans le nouveau groupe (de « Retour » à « Lancer », haut ramène à la colonne d'origine).
   */
  let returnTo: { id: string; dir: Direction; group: string | undefined } | null = null;
  const groupOf = (id: string | null): string | undefined => items.find((i) => i.id === id)?.group;
  const rects = (): { id: string; r: DOMRect }[] => [...elements].map(([id, element]) => ({ id, r: element.getBoundingClientRect() }));
  const centerX = (r: DOMRect): number => r.left + r.width / 2;
  const centerY = (r: DOMRect): number => r.top + r.height / 2;

  /** Focus déplacé par la navigation en colonnes ; le retour éventuel n'est gardé que s'il vaut pour le groupe atteint. */
  const goTo = (id: string, keep: typeof returnTo): void => {
    setFocus(id);
    returnTo = keep && keep.group === groupOf(id) ? keep : null;
  };

  /** Colonne voisine (`step` = -1 à gauche, 1 à droite) ; sans colonne de ce côté, celle de l'autre côté. */
  const jump = (step: number): void => {
    if (current()?.layout !== 'columns' || focusedId === null) return;
    const from = elements.get(focusedId)?.getBoundingClientRect();
    if (!from) return;
    const others = rects().filter((o) => o.id !== focusedId);
    const side = (s: number) => others.filter((o) => (centerX(o.r) - centerX(from)) * s > from.width / 2);
    const candidates = side(step).length ? side(step) : side(-step);
    const best = candidates.sort(
      (a, b) => Math.abs(centerY(a.r) - centerY(from)) - Math.abs(centerY(b.r) - centerY(from)) || Math.abs(centerX(a.r) - centerX(from)) - Math.abs(centerX(b.r) - centerX(from)),
    )[0];
    if (best) goTo(best.id, returnTo);
  };

  /** Haut ou bas, en colonnes. */
  const vertical = (dir: 'up' | 'down'): void => {
    if (focusedId === null) return;
    if (returnTo && returnTo.dir === dir && returnTo.group === groupOf(focusedId) && elements.has(returnTo.id)) return goTo(returnTo.id, null);
    const from = elements.get(focusedId)?.getBoundingClientRect();
    if (!from) return;
    const s = dir === 'down' ? 1 : -1;
    const ahead = rects().filter((o) => (centerY(o.r) - centerY(from)) * s > from.height / 2);
    const inColumn = ahead.filter((o) => Math.min(o.r.right, from.right) > Math.max(o.r.left, from.left));
    const gap = (r: DOMRect): number => (s > 0 ? r.top - from.bottom : from.top - r.bottom);
    const best = (inColumn.length ? inColumn : ahead).sort((a, b) => gap(a.r) - gap(b.r) || Math.abs(centerX(a.r) - centerX(from)) - Math.abs(centerX(b.r) - centerX(from)))[0];
    if (!best) return;
    const left = focusedId;
    const leaving = groupOf(best.id) !== groupOf(left);
    goTo(best.id, leaving ? { id: left, dir: dir === 'down' ? 'up' : 'down', group: groupOf(best.id) } : null);
  };

  /** Édition d'un texte à la manette. */
  const editText = (item: TextItem, dir: Direction): void => {
    if (!editing) return;
    if (dir === 'left' || dir === 'right') {
      editing.at = Math.max(0, Math.min(item.maxLength - 1, Math.min(item.value.length, editing.at + (dir === 'right' ? 1 : -1))));
    } else {
      const chars = item.charset;
      const value = item.value.padEnd(editing.at + 1, ' ').slice(0, item.maxLength);
      const current = value[editing.at] ?? ' ';
      const index = chars.indexOf(current);
      const next = index < 0 ? chars[0]! : chars[(index + (dir === 'up' ? 1 : -1) + chars.length) % chars.length]!;
      item.set((value.slice(0, editing.at) + next + value.slice(editing.at + 1)).trimEnd());
    }
    render();
  };

  const direction = (dir: Direction): void => {
    const item = focusedItem();
    if (item?.kind === 'text' && editing?.id === item.id) return editText(item, dir);
    if (current()?.layout === 'columns') {
      if (dir === 'up' || dir === 'down') return vertical(dir);
      if (item?.kind !== 'choice' && item?.kind !== 'toggle') return jump(dir === 'left' ? -1 : 1);
    }
    if (dir === 'up') move(-1);
    else if (dir === 'down') move(1);
    else if (current()?.layout === 'tiles') move(dir === 'left' ? -1 : 1);
    else if (item?.kind === 'choice') cycle(item, dir === 'left' ? -1 : 1);
    else if (item?.kind === 'toggle') {
      item.set(dir === 'right');
      render();
    }
  };

  const back = (): void => {
    if (editing) {
      editing = null;
      return render();
    }
    const screen = current();
    if (!screen) return;
    if (screen.back) return screen.back();
    if (stack.length > 1) return menu.pop();
    options.onRootBack?.();
  };

  // Clavier : flèches, Entrée, Échap. Dans un champ de texte, gauche et droite restent à la saisie.
  window.addEventListener(
    'keydown',
    (event) => {
      if (root.hidden) return;
      const inInput = event.target instanceof HTMLInputElement;
      const item = focusedItem();
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (inInput) (event.target as HTMLInputElement).blur();
        return back();
      }
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return direction(event.code === 'ArrowUp' ? 'up' : 'down');
      }
      if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && !inInput) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return direction(event.code === 'ArrowLeft' ? 'left' : 'right');
      }
      if (event.code === 'Tab' && current()?.layout === 'columns') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return jump(event.shiftKey ? -1 : 1);
      }
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || (event.code === 'Space' && !inInput)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        if (item?.kind === 'text') return item.submit?.();
        if (item) activate(item);
      }
    },
    // Avant les autres écouteurs : une touche du menu ne part pas aussi vers la partie.
    { capture: true },
  );

  // Manettes : état de chaque manette à l'image précédente. A valide et B revient au relâcher : la partie qui reprend
  // ne voit donc jamais le bouton tenu.
  let previous = new Map<number, PadSnapshot>();
  /** A ou B enfoncé pendant que le menu était ouvert, par manette : seul ce relâcher compte. */
  const armed = new Set<number>();
  const armedBack = new Set<number>();
  let held: { dir: Direction; since: number; last: number } | null = null;
  const snapshotPads = (): void => {
    previous = new Map(connectedGamepads().map((pad) => [pad.index, readPad(pad)]));
    armed.clear();
    armedBack.clear();
    held = null;
  };
  /** Boucle de lecture des manettes en cours : une seule à la fois, même si le menu se ferme et rouvre dans l'image. */
  let pollLoop = 0;
  const poll = (now: number, loop: number): void => {
    if (root.hidden || loop !== pollLoop) return;
    const pads = connectedGamepads();
    showPads(pads.length);
    let dir: Direction | null = null;
    for (const pad of pads) {
      const state = readPad(pad);
      // Une manette qui apparaît se réveille sur un appui : elle part de « rien de tenu ».
      const before = previous.get(pad.index) ?? { a: false, b: false, lb: false, rb: false, dir: null };
      previous.set(pad.index, state);
      if (state.b && !before.b) armedBack.add(pad.index);
      if (!state.b && before.b && armedBack.delete(pad.index)) back();
      if (state.lb && !before.lb) jump(-1);
      if (state.rb && !before.rb) jump(1);
      if (state.a && !before.a) armed.add(pad.index);
      if (!state.a && before.a && armed.delete(pad.index)) {
        const item = focusedItem();
        if (item) activate(item);
      }
      dir ??= state.dir;
      if (root.hidden) return;
    }
    if (!dir) held = null;
    else if (!held || held.dir !== dir) {
      held = { dir, since: now, last: now };
      direction(dir);
    } else if (now - held.since >= REPEAT_DELAY && now - held.last >= REPEAT_EVERY) {
      held.last = now;
      direction(dir);
    }
    current()?.tick?.();
    requestAnimationFrame((t) => poll(t, loop));
  };

  const open = (): void => {
    const wasHidden = root.hidden;
    root.hidden = false;
    render();
    showPads(connectedGamepads().length);
    if (wasHidden) {
      snapshotPads();
      const loop = ++pollLoop;
      requestAnimationFrame((t) => poll(t, loop));
    }
  };

  const menu: Menu = {
    get isOpen(): boolean {
      return !root.hidden;
    },
    get screen(): MenuScreen | null {
      return root.hidden ? null : current();
    },
    show(screen): void {
      stack = [screen];
      focusedId = null;
      editing = null;
      messageText = '';
      open();
    },
    push(screen): void {
      stack.push(screen);
      focusedId = null;
      editing = null;
      messageText = '';
      open();
    },
    pop(): void {
      if (stack.length <= 1) return;
      const left = stack.pop()!;
      editing = null;
      messageText = '';
      // On revient sur l'entrée qui avait ouvert l'écran, si elle porte son nom.
      focusedId = left.id;
      render();
    },
    refresh(): void {
      if (!root.hidden) render();
    },
    message(text): void {
      messageText = text;
      const line = panel.querySelector('.menu-message');
      if (line) line.textContent = text;
    },
    flash(id): void {
      const element = panel.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`);
      if (!element) return;
      element.classList.remove('is-lit');
      void element.offsetWidth;
      element.classList.add('is-lit');
    },
    reopen(): void {
      if (current()) open();
    },
    hide(): void {
      root.hidden = true;
      editing = null;
      // Le menu ne garde pas le focus : les touches de jeu repartent vers la partie.
      if (document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) document.activeElement.blur();
    },
  };
  return menu;
}
