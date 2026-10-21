import { type AssistLevel, type PrepMove } from '../sim/duel';
import { type Hand } from '../sim/shots';
import type { Controller, InputDisplayMode } from './settingsStore';

// Réglages et leur enregistrement : `settingsStore.ts`. Ici, les noms affichés (menus, match).
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
