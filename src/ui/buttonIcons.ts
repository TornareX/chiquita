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
/** Jetons de touches du clavier : le stick droit virtuel (`k:up`…, `k:sides` = gauche ou droite) et le déplacement. */
const TOKEN = /\{(normal|overhead|slice|lob|k:(?:up|down|left|right|sides|move))\}/g;

/**
 * Au clavier, les mots du stick deviennent les touches qui le remplacent (`virtualStick.ts`) : tirer le stick droit
 * vers soi, c'est tenir K ; le ramener devant, passer à I ; par un côté, J ou L. Les phrases les plus longues d'abord.
 */
const KEYBOARD_WORDS: readonly [RegExp, string][] = [
  [/(g|G)arde le stick(?: droit)? tiré(?: vers toi)?/g, '$1arde {k:down} enfoncé'],
  [/tire le stick(?: droit)? vers toi/g, 'tiens {k:down}'],
  [/Tire le stick(?: droit)? vers toi/g, 'Tiens {k:down}'],
  [/tirer le stick(?: droit)? vers toi/g, 'tenir {k:down}'],
  [/stick(?: droit)? tiré vers toi/gi, '{k:down} tenu'],
  [/ramène-le tout droit(?: vers l’avant)?/g, 'passe à {k:up}'],
  [/ramène(?:-le| le stick)(?: vers l’avant)? en arc, par un côté/g, 'passe par {k:sides}, puis {k:up}'],
  [/ramène(?:-le| le stick) vers toi/gi, '{k:down}'],
  [/puis tout droit vers l’avant/g, 'puis {k:up}'],
  [/puis en arc/g, 'puis {k:sides} et {k:up}'],
  [/lâche le stick, il revient tout seul au centre/g, 'lâche la touche, sans en presser d’autre'],
  [/lâche-le|lâche le stick/g, 'lâche tout'],
  [/Un coup sec du stick vers l’avant, sans le tirer vers toi/g, 'Un appui sec sur {k:up}, sans tenir {k:down} avant'],
  [/stick droit : un coup sec vers l’avant/g, '{k:up} : un appui sec'],
  [/un coup sec du stick(?: droit)? vers l’avant/g, 'un appui sec sur {k:up}'],
  [/stick(?: droit)? en avant, puis vers toi/gi, '{k:up}, puis {k:down}'],
  [/stick(?: droit)? en avant pour préparer/gi, '{k:up} pour préparer'],
  [/^Tout droit !$/, '{k:up} !'],
  [/^En arc, par un côté !$/, '{k:sides}, puis {k:up} !'],
  [/^Coup sec vers l’avant !$/, '{k:up}, sec !'],
  [/stick gauche/gi, '{k:move}'],
];

/** Texte du stick dit avec les touches de ce côté du clavier ; inchangé pour une manette. */
export function stickWords(text: string, source: InputSource): string {
  if (source.kind !== 'keyboard') return text;
  return KEYBOARD_WORDS.reduce((t, [pattern, words]) => t.replace(pattern, words), text);
}

function kbd(code: string, source: Extract<InputSource, { kind: 'keyboard' }>): string {
  return `<kbd class="key-icon">${escapeHtml(keyLabel(code, source.layout))}</kbd>`;
}

/** Icône d'un jeton de touche (`k:up`…) pour ce côté du clavier. */
function keyToken(token: string, source: Extract<InputSource, { kind: 'keyboard' }>): string {
  const layout = KEY_LAYOUTS[source.player];
  if (token === 'k:move') return [layout.up, layout.left, layout.down, layout.right].map((code) => kbd(code, source)).join('');
  if (token === 'k:sides') return `${kbd(layout.swing.left[0]!, source)}<span style="opacity:.6"> ou </span>${kbd(layout.swing.right[0]!, source)}`;
  const direction = token.slice(2) as 'up' | 'down' | 'left' | 'right';
  return kbd(layout.swing[direction][0]!, source);
}

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
 * chaque jeton devient l'icône du bouton sur la manette ou le clavier du joueur. Au clavier, les mots du stick
 * deviennent ses touches (`stickWords`). Le reste est échappé.
 */
export function formatButtons(text: string, source: InputSource): string {
  let html = '';
  let last = 0;
  const words = stickWords(text, source);
  for (const match of words.matchAll(TOKEN)) {
    const token = match[1]!;
    const icon = token.startsWith('k:') ? (source.kind === 'keyboard' ? keyToken(token, source) : '') : buttonIcon(token as ShotKind, source);
    html += escapeHtml(words.slice(last, match.index)) + icon;
    last = match.index + match[0].length;
  }
  return html + escapeHtml(words.slice(last));
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
