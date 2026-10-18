import type { ArcadeCommands, ShotKind } from '../sim/commands';
import { rightStickAxes, type SwingStick } from './swingStick';
import { strongest } from './virtualStick';

/** Stick et boutons d'un joueur, dans le repère de l'écran : `up` vers le haut de l'écran. */
export interface PadState {
  stick: { up: number; right: number };
  shot: ShotKind | null;
  /** Bouton de changement d'assistance maintenu (Affichage / Select sur la manette). */
  assistButton: boolean;
  /** Geste du stick droit : préparation et fin du geste, pour la simulation (`ArcadeCommands.swing`). */
  gesture?: ArcadeCommands['swing'];
  /** Stick droit (frappe au geste, `swingStick.ts`), et le coup qu'il tient : pour l'affichage. */
  swing?: { right: number; up: number; shot: ShotKind | null };
  /**
   * Bouton de face pressé, même quand les boutons ne frappent pas (`?boutons=1` pour qu'ils frappent) : sert à
   * valider dans les menus.
   */
  face?: ShotKind | null;
  /**
   * Stick droit lu, avant la reconnaissance du geste (`applySwing`) : celui de la manette, ou le stick virtuel du
   * clavier et de la souris (`virtualStick.ts`). Repère de l'écran.
   */
  aim?: { right: number; up: number };
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

/**
 * Lit une manette (Gamepad API, disposition standard). Avec `swing`, le stick droit frappe au geste
 * (`swingStick.ts`) : un pas de `dt` s. Les boutons de face ne frappent qu'avec `?boutons=1` (ils gardent
 * alors la priorité) ; sinon ils ne servent qu'aux menus.
 */
export function readGamepad(pad: Gamepad, swing?: SwingStick, dt = 0): PadState {
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
  const face = SHOT_BUTTONS.find(([i]) => button(i))?.[1] ?? null;
  const shot = buttonsEnabled() ? face : null;
  const aim = rightStickAxes(pad.axes[2] ?? 0, -(pad.axes[3] ?? 0));
  return applySwing({ stick: { up: y, right: x }, shot, assistButton: button(8), face, aim }, swing, dt);
}

/**
 * Reconnaît le geste du stick droit (`state.aim`), quelle que soit la source : manette, clavier ou souris passent
 * par le même `SwingStick`, donc les mêmes gestes et le même ressenti. Un pas de `dt` s. Sans `swing`, rien ne change.
 * Un bouton de coup tenu garde la priorité.
 */
export function applySwing(state: PadState, swing?: SwingStick, dt = 0): PadState {
  if (!swing) return state;
  const right = state.aim ?? { right: 0, up: 0 };
  const gesture = swing.update(right.right, right.up, dt);
  const { shot } = state;
  return {
    ...state,
    shot: shot ?? gesture.shot,
    ...(!shot && gesture.swing ? { gesture: gesture.swing } : {}),
    swing: { ...right, shot: gesture.shot },
  };
}

/** Frappe au stick droit, sauf `?geste=0`. */
export const swingEnabled = (): boolean => new URLSearchParams(location.search).get('geste') !== '0';

/**
 * Boutons de coup (A, B, X, Y et leurs indications) : cachés et sans effet sur la manette, tout se joue aux
 * sticks ; `?boutons=1` les remet. Sans stick droit (`?geste=0`), ils reviennent aussi.
 */
export const buttonsEnabled = (): boolean => {
  // Hors navigateur (tests) : pas d'adresse, réglages par défaut.
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  return params.get('boutons') === '1' || params.get('geste') === '0';
};

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
  return { stick: { forward: state.stick.up * flip, right: state.stick.right * flip }, shot: state.shot, ...(state.gesture ? { swing: state.gesture } : {}) };
}

/** Fusionne deux sources (manette et clavier) : le stick le plus poussé, le premier bouton. */
export function mergePads(a: PadState, b: PadState): PadState {
  const strength = (s: PadState): number => Math.abs(s.stick.up) + Math.abs(s.stick.right);
  return {
    stick: strength(a) >= strength(b) ? a.stick : b.stick,
    shot: a.shot ?? b.shot,
    assistButton: a.assistButton || b.assistButton,
    // Le geste du stick droit vient de la manette : au relâcher (plus de coup tenu), sa fin doit passer quand même.
    ...((a.gesture ?? b.gesture) ? { gesture: (a.gesture ?? b.gesture)! } : {}),
    swing: a.swing ?? b.swing,
    face: a.face ?? b.face ?? null,
    // Stick droit : le plus poussé, pour que le geste se reconnaisse une seule fois sur les deux sources.
    ...((a.aim ?? b.aim) ? { aim: strongest(a.aim ?? { right: 0, up: 0 }, b.aim ?? { right: 0, up: 0 }) } : {}),
  };
}
