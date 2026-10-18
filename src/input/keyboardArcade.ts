import type { ShotKind } from '../sim/commands';
import { buttonsEnabled, IDLE_PAD, type PadState } from './gamepad';
import { KeyStick, MouseStick, strongest } from './virtualStick';

/**
 * Deux joueurs sur un clavier, touches lues par position physique (`event.code`) :
 * ZQSD sur AZERTY et WASD sur QWERTY sont les mêmes touches.
 */
interface KeyLayout {
  up: string;
  down: string;
  left: string;
  right: string;
  /**
   * Stick droit au clavier : les mêmes gestes qu'à la manette (`swingStick.ts`). Plusieurs touches par direction
   * (pavé numérique, ou sans pavé).
   */
  swing: { up: string[]; down: string[]; left: string[]; right: string[] };
  /** Boutons de coup : seulement avec `?boutons=1` (ou `?geste=0`), comme les boutons de la manette. */
  shots: readonly [string, ShotKind][];
  /** Changement d'assistance. */
  assist: string;
}

export const KEY_LAYOUTS: readonly [KeyLayout, KeyLayout] = [
  {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    // I J K L en T inversé, sous la main droite. La souris aussi, bouton gauche tenu (`MouseStick`).
    swing: { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'] },
    shots: [
      ['KeyJ', 'normal'],
      ['KeyK', 'slice'],
      ['KeyL', 'lob'],
      // Au-dessus de J et K : coup au-dessus de la tête.
      ['KeyI', 'overhead'],
    ],
    assist: 'KeyU',
  },
  {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    // Pavé numérique 8 4 5 6 ; sans pavé, le T inversé à gauche de Maj droite (; au-dessus de , . /).
    swing: { up: ['Numpad8', 'Semicolon'], down: ['Numpad5', 'Period'], left: ['Numpad4', 'Comma'], right: ['Numpad6', 'Slash'] },
    shots: [
      ['Numpad1', 'normal'],
      ['Numpad2', 'slice'],
      ['Numpad3', 'lob'],
      ['Numpad4', 'overhead'],
      // Sans pavé numérique : les trois touches à gauche de Maj droite.
      ['Comma', 'normal'],
      ['Period', 'slice'],
      ['Slash', 'lob'],
      // Et celle juste à leur gauche (M en QWERTY, virgule en AZERTY) : au-dessus de la tête.
      ['KeyM', 'overhead'],
    ],
    assist: 'Numpad0',
  },
];

/** Toutes les touches d'un côté du clavier : déplacement, stick droit, coups et assistance. */
export function layoutKeys(layout: KeyLayout): string[] {
  const { swing } = layout;
  return [layout.up, layout.down, layout.left, layout.right, layout.assist, ...swing.up, ...swing.down, ...swing.left, ...swing.right, ...layout.shots.map(([code]) => code)];
}

export interface KeyboardPads {
  /**
   * État d'un côté du clavier. `aim` porte son stick droit (touches, et la souris pour le côté bleu) : le geste se
   * reconnaît ensuite comme pour une manette (`applySwing`). `dt` : durée du pas (s).
   */
  read(player: 0 | 1, dt?: number): PadState;
}

/** `target` : élément où un clic de souris commence un geste (le canevas du jeu) ; sans lui, pas de souris. */
export function createKeyboardPads(target?: HTMLElement): KeyboardPads {
  const held = new Set<string>();
  const sticks = KEY_LAYOUTS.map(() => new KeyStick());
  const mouse = target ? new MouseStick(target) : null;
  window.addEventListener('keydown', (event) => {
    if (event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) sticks.forEach((stick) => stick.press(event.code));
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  return {
    read(player: 0 | 1, dt = 0): PadState {
      const layout = KEY_LAYOUTS[player];
      const axis = (positive: string, negative: string): number =>
        (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
      const shot = buttonsEnabled() ? (layout.shots.find(([code]) => held.has(code))?.[1] ?? null) : null;
      const stick = { up: axis(layout.up, layout.down), right: axis(layout.right, layout.left) };
      const assistButton = held.has(layout.assist);
      const keys = sticks[player]!.update(layout.swing, held, dt);
      const aim = player === 0 && mouse ? strongest(keys, mouse.read()) : keys;
      const idle = stick.up === 0 && stick.right === 0 && !shot && !assistButton && aim.up === 0 && aim.right === 0;
      return idle ? IDLE_PAD : { stick, shot, assistButton, aim };
    },
  };
}
