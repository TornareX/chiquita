import { KEY_LAYOUTS } from '../input/keyboardArcade';
import {
  BUTTON_GLYPHS,
  keyLabel,
  POSITION_NAMES,
  SHOT_POSITIONS,
  type ButtonPosition,
  type PadFamily,
} from '../input/padStyle';
import type { ShotKind } from '../sim/commands';

/**
 * D'où viennent les commandes d'un joueur, pour lui montrer les boutons qu'il a vraiment sous les doigts :
 * une manette (avec sa famille) ou un côté du clavier (avec la disposition AZERTY/QWERTY si connue).
 */
export type InputSource =
  | { kind: 'pad'; family: PadFamily }
  | { kind: 'keyboard'; player: 0 | 1; layout?: ReadonlyMap<string, string> | null };

const SHOT_TOKEN = /\{(normal|overhead|slice|lob)\}/g;

const DOTS: Record<ButtonPosition, [number, number]> = {
  bottom: [8, 13],
  right: [13, 8],
  left: [3, 8],
  top: [8, 3],
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Losange des 4 boutons de face, celui de `position` allumé : lisible sur toutes les manettes. */
export function diamondSvg(position: ButtonPosition | null, color = '#ffe27a', size = 16): string {
  const dots = (Object.keys(DOTS) as ButtonPosition[])
    .map((p) => {
      const [cx, cy] = DOTS[p];
      const lit = p === position;
      return `<circle cx="${cx}" cy="${cy}" r="2.6" fill="${lit ? color : 'none'}" stroke="${lit ? color : '#9fb0bf'}" stroke-width="1.2"/>`;
    })
    .join('');
  return `<svg class="pad-diamond" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="vertical-align:-3px">${dots}</svg>`;
}

/** Touches du clavier qui jouent `kind` pour ce joueur, la principale d'abord. */
export function keysFor(kind: ShotKind, player: 0 | 1): string[] {
  return KEY_LAYOUTS[player].shots.filter(([, shot]) => shot === kind).map(([code]) => code);
}

/** Symbole d'une position sur cette manette, en texte (« ✕ », « A », « bouton du bas »). */
export function glyphText(position: ButtonPosition, family: PadFamily): string {
  return BUTTON_GLYPHS[family][position].text ?? POSITION_NAMES[position];
}

/**
 * Icône HTML du bouton d'un coup : losange de position + symbole de la manette, ou touche(s) du clavier.
 */
export function buttonIcon(kind: ShotKind, source: InputSource): string {
  const position = SHOT_POSITIONS[kind];
  if (source.kind === 'keyboard') {
    const keys = keysFor(kind, source.player).map((code) => keyLabel(code, source.layout));
    // Deux touches au plus : la principale et celle des claviers sans pavé numérique.
    return keys
      .slice(0, 2)
      .map((key) => `<kbd class="key-icon">${escapeHtml(key)}</kbd>`)
      .join('<span style="opacity:.6"> ou </span>');
  }
  const glyph = BUTTON_GLYPHS[source.family][position];
  const text = glyph.text
    ? `<b style="color:${glyph.color};margin-left:2px">${escapeHtml(glyph.text)}</b>`
    : `<span style="margin-left:2px">${POSITION_NAMES[position]}</span>`;
  return `<span class="btn-icon" style="white-space:nowrap">${diamondSvg(position, glyph.color)}${text}</span>`;
}

/**
 * Texte avec des jetons de bouton (`{normal}`, `{overhead}`, `{slice}`, `{lob}`) rendu en HTML :
 * chaque jeton devient l'icône du bouton sur la manette ou le clavier du joueur. Le reste est échappé.
 */
export function formatButtons(text: string, source: InputSource): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(SHOT_TOKEN)) {
    html += escapeHtml(text.slice(last, match.index)) + buttonIcon(match[1] as ShotKind, source);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

/** Le même texte sans icônes, avec le symbole de la manette en clair (titres, infobulles). */
export function plainButtons(text: string, family: PadFamily): string {
  return text.replace(SHOT_TOKEN, (_, kind: ShotKind) => glyphText(SHOT_POSITIONS[kind], family));
}

/** Clé de la source, pour ne reconstruire un texte que quand la manette ou le clavier change. */
export function sourceKey(source: InputSource): string {
  return source.kind === 'pad' ? `pad:${source.family}` : `kbd:${source.player}:${source.layout?.size ?? 0}`;
}

/** Disposition du clavier (caractère imprimé par touche), si le navigateur la donne (Chrome, Edge). */
export function loadKeyboardLayout(): Promise<ReadonlyMap<string, string> | null> {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } })
    .keyboard;
  if (!keyboard?.getLayoutMap) return Promise.resolve(null);
  return keyboard.getLayoutMap().catch(() => null);
}
