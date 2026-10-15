import type { ShotKind } from '../sim/commands';
import { IDLE_PAD, type PadState } from './gamepad';

/**
 * Deux joueurs sur un clavier, touches lues par position physique (`event.code`) :
 * ZQSD sur AZERTY et WASD sur QWERTY sont les mêmes touches.
 */
interface KeyLayout {
  up: string;
  down: string;
  left: string;
  right: string;
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
    shots: [
      ['KeyJ', 'normal'],
      ['KeyK', 'slice'],
      ['KeyL', 'lob'],
    ],
    assist: 'KeyU',
  },
  {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    shots: [
      ['Numpad1', 'normal'],
      ['Numpad2', 'slice'],
      ['Numpad3', 'lob'],
      // Sans pavé numérique : les trois touches à gauche de Maj droite.
      ['Comma', 'normal'],
      ['Period', 'slice'],
      ['Slash', 'lob'],
    ],
    assist: 'Numpad0',
  },
];

export interface KeyboardPads {
  read(player: 0 | 1): PadState;
}

export function createKeyboardPads(): KeyboardPads {
  const held = new Set<string>();
  window.addEventListener('keydown', (event) => {
    if (event.code.startsWith('Arrow')) event.preventDefault();
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  return {
    read(player: 0 | 1): PadState {
      const layout = KEY_LAYOUTS[player];
      const axis = (positive: string, negative: string): number =>
        (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
      const shot = layout.shots.find(([code]) => held.has(code))?.[1] ?? null;
      const stick = { up: axis(layout.up, layout.down), right: axis(layout.right, layout.left) };
      const assistButton = held.has(layout.assist);
      return stick.up === 0 && stick.right === 0 && !shot && !assistButton ? IDLE_PAD : { stick, shot, assistButton };
    },
  };
}
