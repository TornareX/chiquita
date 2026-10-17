import type { ArcadeCommands, ShotKind } from '../sim/commands';

/** Stick et boutons d'un joueur, dans le repère de l'écran : `up` vers le haut de l'écran. */
export interface PadState {
  stick: { up: number; right: number };
  shot: ShotKind | null;
  /** Bouton de changement d'assistance maintenu (Affichage / Select sur la manette). */
  assistButton: boolean;
}

export const IDLE_PAD: PadState = { stick: { up: 0, right: 0 }, shot: null, assistButton: false };

/** Zone morte radiale du stick. [à calibrer] */
const DEAD_ZONE = 0.22;

/** Boutons de la disposition standard (Xbox) : A = 0, B = 1, X = 2, Y = 3. */
const SHOT_BUTTONS: readonly [number, ShotKind][] = [
  [0, 'normal'],
  [1, 'overhead'],
  [2, 'slice'],
  [3, 'lob'],
];

/** Lit une manette (Gamepad API, disposition standard). */
export function readGamepad(pad: Gamepad): PadState {
  let x = pad.axes[0] ?? 0;
  // L'axe vertical de la Gamepad API est positif vers le bas.
  let y = -(pad.axes[1] ?? 0);
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude < DEAD_ZONE) {
    x = y = 0;
  } else {
    // Remise à l'échelle après la zone morte : pas de saut à la sortie de la zone.
    const k = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE)) / magnitude;
    x *= k;
    y *= k;
  }
  // Croix directionnelle en secours (12 à 15 : haut, bas, gauche, droite).
  const button = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
  if (button(12)) y = 1;
  if (button(13)) y = -1;
  if (button(14)) x = -1;
  if (button(15)) x = 1;
  const shot = SHOT_BUTTONS.find(([i]) => button(i))?.[1] ?? null;
  return { stick: { up: y, right: x }, shot, assistButton: button(8) };
}

/** Manettes branchées, dans l'ordre de leur index. */
export function connectedGamepads(): Gamepad[] {
  const pads = navigator.getGamepads?.() ?? [];
  return pads.filter((pad): pad is Gamepad => pad !== null && pad.connected);
}

/**
 * Convertit l'écran en repère du joueur. La caméra est derrière le joueur du camp Z négatif :
 * pour lui, haut de l'écran = vers le filet. Pour celui d'en face, les directions de l'écran sont
 * gardées (haut = vers son fond), comme en multijoueur dans Virtua Tennis, sauf `ownView`.
 */
export function toCommands(state: PadState, nearSide: boolean, ownView = false): ArcadeCommands {
  const flip = nearSide || ownView ? 1 : -1;
  return { stick: { forward: state.stick.up * flip, right: state.stick.right * flip }, shot: state.shot };
}

/** Fusionne deux sources (manette et clavier) : le stick le plus poussé, le premier bouton. */
export function mergePads(a: PadState, b: PadState): PadState {
  const strength = (s: PadState): number => Math.abs(s.stick.up) + Math.abs(s.stick.right);
  return {
    stick: strength(a) >= strength(b) ? a.stick : b.stick,
    shot: a.shot ?? b.shot,
    assistButton: a.assistButton || b.assistButton,
  };
}
