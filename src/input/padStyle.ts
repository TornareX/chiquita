import type { ShotKind } from '../sim/commands';

/**
 * Famille de manette, pour afficher les bons symboles. La Gamepad API ne donne que des positions
 * (disposition « standard » : 0 = bas, 1 = droite, 2 = gauche, 3 = haut), pas ce qui est imprimé
 * sur les boutons : « X » est à gauche sur une manette Xbox, en bas sur une PlayStation (✕) et en
 * haut sur une manette Nintendo.
 */
export type PadFamily = 'xbox' | 'playstation' | 'nintendo' | 'generic';

/** Choix du joueur dans les réglages : détection automatique, ou une famille imposée. */
export type PadStyle = 'auto' | PadFamily;

export const PAD_FAMILIES: readonly PadFamily[] = ['xbox', 'playstation', 'nintendo', 'generic'];
export const PAD_STYLES: readonly PadStyle[] = ['auto', ...PAD_FAMILIES];

export const PAD_FAMILY_NAMES: Record<PadFamily, string> = {
  xbox: 'Xbox',
  playstation: 'PlayStation',
  nintendo: 'Nintendo',
  generic: 'générique',
};

/** Position d'un bouton de face sur la manette. */
export type ButtonPosition = 'bottom' | 'right' | 'left' | 'top';

/** Position du bouton de chaque coup (index 0 à 3 de la disposition standard, voir `gamepad.ts`). */
export const SHOT_POSITIONS: Record<ShotKind, ButtonPosition> = {
  normal: 'bottom',
  overhead: 'right',
  slice: 'left',
  lob: 'top',
};

/** Index de chaque position dans la disposition standard. */
export const POSITION_INDEX: Record<ButtonPosition, number> = { bottom: 0, right: 1, left: 2, top: 3 };

export const SHOT_NAMES: Record<ShotKind, string> = {
  normal: 'coup normal',
  overhead: 'au-dessus de la tête',
  slice: 'coupé',
  lob: 'lob',
};

export const POSITION_NAMES: Record<ButtonPosition, string> = {
  bottom: 'bouton du bas',
  right: 'bouton de droite',
  left: 'bouton de gauche',
  top: 'bouton du haut',
};

export interface ButtonGlyph {
  /** Ce qui est imprimé sur le bouton (`null` : manette inconnue, on ne montre que la position). */
  text: string | null;
  /** Couleur du symbole, comme sur la manette. */
  color: string;
}

export const BUTTON_GLYPHS: Record<PadFamily, Record<ButtonPosition, ButtonGlyph>> = {
  xbox: {
    bottom: { text: 'A', color: '#5fd35a' },
    right: { text: 'B', color: '#ff5a55' },
    left: { text: 'X', color: '#4aa3ff' },
    top: { text: 'Y', color: '#ffd23f' },
  },
  playstation: {
    bottom: { text: '✕', color: '#8fb4ff' },
    right: { text: '○', color: '#ff6f7d' },
    left: { text: '□', color: '#f59ad8' },
    top: { text: '△', color: '#4fe0b5' },
  },
  // Disposition Nintendo : A à droite et B en bas, X en haut et Y à gauche.
  nintendo: {
    bottom: { text: 'B', color: '#e8edf1' },
    right: { text: 'A', color: '#e8edf1' },
    left: { text: 'Y', color: '#e8edf1' },
    top: { text: 'X', color: '#e8edf1' },
  },
  generic: {
    bottom: { text: null, color: '#e8edf1' },
    right: { text: null, color: '#e8edf1' },
    left: { text: null, color: '#e8edf1' },
    top: { text: null, color: '#e8edf1' },
  },
};

/**
 * Famille d'une manette d'après `Gamepad.id`. Chrome écrit « … (STANDARD GAMEPAD Vendor: 054c Product: 0ce6) »,
 * Firefox « 054c-0ce6-… » ; une manette Xbox sous Windows apparaît souvent comme « XInput ».
 * Identifiants fabricants USB : 045e Microsoft, 054c Sony, 057e Nintendo.
 */
export function detectPadFamily(id: string): PadFamily {
  const text = id.toLowerCase();
  const vendor = /vendor:\s*([0-9a-f]{4})/.exec(text)?.[1] ?? /^([0-9a-f]{4})-[0-9a-f]{4}-/.exec(text)?.[1] ?? null;
  if (vendor === '054c' || /dualsense|dualshock|playstation/.test(text)) return 'playstation';
  if (vendor === '057e' || /pro controller|joy-con|nintendo|switch/.test(text)) return 'nintendo';
  if (vendor === '045e' || /xbox|xinput/.test(text)) return 'xbox';
  return 'generic';
}

/** Famille à afficher : celle imposée dans les réglages, sinon celle détectée sur la manette. */
export function resolvePadFamily(style: PadStyle, pad: { id: string } | null | undefined): PadFamily {
  if (style !== 'auto') return style;
  return pad ? detectPadFamily(pad.id) : 'generic';
}

/** Touches de coup au clavier (`event.code`), en libellé lisible. */
const CODE_LABELS: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/**
 * Libellé d'une touche lue par position (`event.code`). `layout` traduit la position en caractère
 * réellement imprimé (`navigator.keyboard.getLayoutMap()`, AZERTY ou QWERTY) quand le navigateur le permet.
 */
export function keyLabel(code: string, layout?: ReadonlyMap<string, string> | null): string {
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `${numpad[1]} (pavé)`;
  if (code.startsWith('Arrow')) return CODE_LABELS[code]!;
  const printed = layout?.get(code);
  if (printed) return printed.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1]!;
  return CODE_LABELS[code] ?? code;
}
