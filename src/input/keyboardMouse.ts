import type { PlayerCommands } from '../sim/commands';

export interface InputSource {
  /** Commandes pour le prochain pas de simulation. Consomme les mouvements de souris accumulés. */
  sample(): PlayerCommands;
  /** La souris est capturée : le joueur contrôle le regard. */
  readonly active: boolean;
}

/** Radians de rotation par pixel de souris. */
const MOUSE_SENSITIVITY = 0.0022;

/**
 * Clavier + souris. Les touches sont lues par position physique (`event.code`) :
 * ZQSD sur un clavier AZERTY et WASD sur un QWERTY sont les mêmes touches.
 */
export function createKeyboardMouse(canvas: HTMLCanvasElement): InputSource {
  const held = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  let jump = false;
  let prepare = false;
  let softShot = false;

  const locked = (): boolean => document.pointerLockElement === canvas;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) jump = true;
    }
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    prepare = softShot = false;
  });

  canvas.addEventListener('click', () => {
    if (!locked()) void canvas.requestPointerLock();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('mousemove', (event) => {
    if (!locked()) return;
    yaw += event.movementX * MOUSE_SENSITIVITY;
    pitch -= event.movementY * MOUSE_SENSITIVITY;
  });
  document.addEventListener('mousedown', (event) => {
    if (!locked()) return;
    if (event.button === 0) prepare = true;
    if (event.button === 2) softShot = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) prepare = false;
    if (event.button === 2) softShot = false;
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) prepare = softShot = false;
  });

  const axis = (positive: string[], negative: string[]): number =>
    (positive.some((code) => held.has(code)) ? 1 : 0) - (negative.some((code) => held.has(code)) ? 1 : 0);

  return {
    get active(): boolean {
      return locked();
    },
    sample(): PlayerCommands {
      const commands: PlayerCommands = {
        move: {
          forward: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
          right: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
        },
        look: { yaw, pitch },
        jump,
        prepare,
        softShot,
      };
      yaw = 0;
      pitch = 0;
      jump = false;
      return commands;
    },
  };
}
