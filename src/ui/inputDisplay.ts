import type { PadState } from '../input/gamepad';
import { BUTTON_GLYPHS, keyLabel, PAD_FAMILY_NAMES, POSITION_INDEX, SHOT_NAMES, SHOT_POSITIONS, type ButtonPosition } from '../input/padStyle';
import type { ArcadeCommands, OverheadKind, ShotKind } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import type { Duel, DuelShot } from '../sim/duel';
import type { PhysicsProfile } from '../sim/profile';
import { buttonIcon, escapeHtml, keysFor, type InputSource } from './buttonIcons';

/** Résultat d'un relâcher, qui colore le bouton : doré parfait, vert réussi, orange imprécis, rouge raté. */
export type ReleaseQuality = 'perfect' | 'good' | 'off' | 'miss';

export interface ReleaseNote {
  button: ShotKind;
  quality: ReleaseQuality;
  /** Ce que le bouton a donné, en clair : « bandeja parfaite », « relâché trop tôt : dans le vide ». */
  text: string;
  /** Direction du stick au moment de la frappe, en clair, relative au joueur. */
  stick: string;
}

const QUALITY_COLORS: Record<ReleaseQuality, string> = {
  perfect: '#ffd23f',
  good: '#5fd35a',
  off: '#ffb35c',
  miss: '#ff6b6b',
};

const OVERHEAD_NAMES: Record<OverheadKind, string> = { bandeja: 'bandeja', vibora: 'víbora', remate: 'remate', bajada: 'bajada' };

/** Durée d'affichage du dernier relâcher au-dessus de l'historique, et de la couleur du bouton (s). */
const NOTE_TIME = 1.6;
const FLASH_TIME = 0.6;
const HISTORY = 5;

/** Direction du stick relative au joueur (`forward` vers le filet), en mots. */
export function describeStick(stick: ArcadeCommands['stick']): string {
  const parts: string[] = [];
  if (stick.forward >= 0.4) parts.push('avant');
  else if (stick.forward <= -0.4) parts.push('vers toi');
  if (stick.right >= 0.4) parts.push('droite');
  else if (stick.right <= -0.4) parts.push('gauche');
  return parts.length ? `stick ${parts.join(' ')}` : 'stick au centre';
}

/** Ce qu'une frappe a donné, et sa qualité, d'après l'événement de frappe de la simulation. */
export function describeShot(shot: DuelShot, profile: PhysicsProfile): { text: string; quality: ReleaseQuality } {
  const r = profile.rally;
  let name: string;
  if (shot.serve) name = 'service';
  else if (shot.outside) name = 'salida de pista';
  else if (shot.overhead) name = OVERHEAD_NAMES[shot.overhead];
  else if (shot.style === 'cut') name = 'volée coupée';
  else if (shot.style === 'chiquita') name = 'chiquita';
  else if (shot.volley) name = shot.kind === 'normal' ? 'volée' : `volée (${SHOT_NAMES[shot.kind]})`;
  else name = SHOT_NAMES[shot.kind];
  if (shot.style === 'block') return { text: `${name} bloqué : appuie plus tôt pour armer`, quality: 'off' };
  if (shot.perfect) return { text: `${name} parfait !`, quality: 'perfect' };
  if (shot.timing > r.perfectAfter) {
    return { text: `${name}, relâché en retard (+${shot.timing.toFixed(2).replace('.', ',')} s)`, quality: 'off' };
  }
  if (shot.timing < -r.perfectBefore) return { text: `${name}, relâché un peu tôt`, quality: 'good' };
  return { text: name, quality: 'good' };
}

/**
 * Suit les relâchers d'un joueur, pas à pas : quel bouton, quel stick, et ce que ça a donné (frappe, ou
 * coup dans le vide). Indépendant du DOM, pour être testé et réutilisé (labo, tutoriel).
 */
export class ReleaseTracker {
  /** Bouton maintenu au pas précédent. */
  private held: ShotKind | null = null;
  private lastHitTick = -Infinity;
  private lastWhiffTick = -Infinity;
  /** Pas de la dernière note, et historique, la plus récente d'abord. */
  noteTick = -Infinity;
  readonly history: ReleaseNote[] = [];

  constructor(private readonly index: 0 | 1) {}

  /** À appeler après chaque `duel.step`, avec l'état lu pour ce joueur à ce pas. */
  step(duel: Duel, state: PadState): void {
    const player = duel.players[this.index];
    const released = this.held;
    if (player.lastHitTick !== this.lastHitTick) {
      this.lastHitTick = player.lastHitTick;
      if (player.lastHit) {
        const { text, quality } = describeShot(player.lastHit, duel.profile);
        // Le bouton réellement pressé : B sur une balle basse donne un coupé, mais c'est bien B.
        this.push(duel, { button: state.shot ?? released ?? player.lastHit.kind, quality, text, stick: describeStick(player.stick) });
      }
    }
    if (player.lastWhiffTick !== this.lastWhiffTick) {
      this.lastWhiffTick = player.lastWhiffTick;
      if (Number.isFinite(player.lastWhiffTick)) {
        this.push(duel, {
          button: released ?? state.shot ?? 'normal',
          quality: 'miss',
          text: 'relâché trop tôt : dans le vide',
          stick: describeStick(player.stick),
        });
      }
    }
    this.held = state.shot;
  }

  private push(duel: Duel, note: ReleaseNote): void {
    this.noteTick = duel.tick;
    this.history.unshift(note);
    this.history.length = Math.min(this.history.length, HISTORY);
  }
}

export interface InputDisplay {
  /** Après chaque pas de simulation : état lu pour chaque joueur, `null` pour une IA. */
  step(duel: Duel, states: readonly [PadState | null, PadState | null]): void;
  /** À chaque image : `sources[i]` est `null` pour une IA (pas d'affichage). */
  render(duel: Duel, states: readonly [PadState | null, PadState | null], sources: readonly [InputSource | null, InputSource | null], visible: boolean): void;
}

const NAMES = ['Bleu', 'Rouge'] as const;
const TEAM = ['#6fb2ff', '#ff8a94'] as const;
const BUTTON_XY: Record<ButtonPosition, [number, number]> = { bottom: [30, 50], right: [50, 30], left: [10, 30], top: [30, 10] };
const KINDS: readonly ShotKind[] = ['normal', 'overhead', 'slice', 'lob'];

interface Widget {
  root: HTMLDivElement;
  title: HTMLDivElement;
  dot: SVGCircleElement;
  buttons: Record<ShotKind, { circle: SVGCircleElement; label: SVGTextElement }>;
  note: HTMLDivElement;
  history: HTMLDivElement;
  key: string;
  historyHtml: string;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

/** Libellé court d'un bouton dans le losange : symbole de la manette, ou touche du clavier. */
function shortLabel(kind: ShotKind, source: InputSource): string {
  if (source.kind === 'keyboard') return keyLabel(keysFor(kind, source.player)[0]!, source.layout).replace(' (pavé)', '');
  return BUTTON_GLYPHS[source.family][SHOT_POSITIONS[kind]].text ?? '';
}

function sourceName(source: InputSource): string {
  if (source.kind === 'keyboard') return 'Clavier';
  return source.family === 'generic' ? 'Manette' : `Manette ${PAD_FAMILY_NAMES[source.family]}`;
}

function createWidget(index: 0 | 1): Widget {
  const root = document.createElement('div');
  root.className = 'input-display';
  root.dataset.player = String(index);
  root.style.cssText =
    'position:fixed;left:16px;display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;' +
    'background:rgba(10,16,24,.6);color:#f2f5f7;font:12px/1.35 system-ui,sans-serif;pointer-events:none;' +
    `border-left:3px solid ${TEAM[index]};width:min(340px,calc(100vw - 32px));box-sizing:border-box`;
  const pads = document.createElement('div');
  pads.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
  const row = svg('svg', { width: 128, height: 60, viewBox: '0 0 128 60' });
  // Stick : cercle et point.
  row.append(svg('circle', { cx: 30, cy: 30, r: 26, fill: 'rgba(255,255,255,.06)', stroke: '#5a6b7a', 'stroke-width': 1.5 }));
  row.append(svg('line', { x1: 30, y1: 6, x2: 30, y2: 54, stroke: '#3a4a58', 'stroke-width': 1 }));
  row.append(svg('line', { x1: 6, y1: 30, x2: 54, y2: 30, stroke: '#3a4a58', 'stroke-width': 1 }));
  const dot = svg('circle', { cx: 30, cy: 30, r: 7, fill: TEAM[index] });
  row.append(dot);
  // Boutons de face, en losange, à droite du stick.
  const group = svg('g', { transform: 'translate(68,0)' });
  const buttons = {} as Widget['buttons'];
  for (const kind of KINDS) {
    const [x, y] = BUTTON_XY[SHOT_POSITIONS[kind]];
    const circle = svg('circle', { cx: x, cy: y, r: 9.5, fill: 'rgba(255,255,255,.06)', stroke: '#9fb0bf', 'stroke-width': 1.5 });
    const label = svg('text', {
      x,
      y: y + 4,
      'text-anchor': 'middle',
      'font-size': 11,
      'font-weight': 700,
      'font-family': 'system-ui,sans-serif',
      fill: '#e8edf1',
    });
    group.append(circle, label);
    buttons[kind] = { circle, label };
  }
  row.append(group);
  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;color:#c9d3db;white-space:nowrap';
  pads.append(title, row);
  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0';
  const note = document.createElement('div');
  note.style.cssText = 'font-size:13px;font-weight:600;min-height:18px';
  const history = document.createElement('div');
  history.style.cssText = 'opacity:.8';
  text.append(note, history);
  root.append(pads, text);
  document.body.append(root);
  return { root, title, dot, buttons, note, history, key: '', historyHtml: '' };
}

function noteHtml(note: ReleaseNote, source: InputSource): string {
  return (
    `${buttonIcon(note.button, source)} <span style="color:${QUALITY_COLORS[note.quality]}">${escapeHtml(note.text)}</span>` +
    ` <span style="opacity:.7">· ${escapeHtml(note.stick)}</span>`
  );
}

/**
 * Retour des entrées (TUTORIEL_PLAN.md §1) : pour chaque joueur humain, le stick, les 4 boutons de coup
 * avec les symboles de sa manette (le bouton maintenu s'allume, puis prend la couleur du résultat au
 * relâcher), ce que le dernier relâcher a donné, et les 5 précédents.
 */
export function createInputDisplay(): InputDisplay {
  const trackers = [new ReleaseTracker(0), new ReleaseTracker(1)] as const;
  const widgets: (Widget | null)[] = [null, null];

  return {
    step(duel, states) {
      states.forEach((state, i) => state && trackers[i as 0 | 1].step(duel, state));
    },
    render(duel, states, sources, visible) {
      const shown = ([0, 1] as const).filter((i) => visible && sources[i] && states[i]);
      ([0, 1] as const).forEach((i) => {
        const source = sources[i];
        const state = states[i];
        if (!shown.includes(i) || !source || !state) {
          if (widgets[i]) widgets[i]!.root.style.display = 'none';
          return;
        }
        const w = (widgets[i] ??= createWidget(i));
        w.root.style.display = 'flex';
        // En bas à gauche, au-dessus des noms des joueurs : Bleu en bas, Rouge au-dessus.
        const below = i === 1 && shown.includes(0) ? widgets[0]!.root.offsetHeight + 8 : 0;
        w.root.style.bottom = `${58 + below}px`;

        const tracker = trackers[i];
        const key = source.kind === 'pad' ? source.family : `kbd${source.player}${source.layout?.size ?? 0}`;
        if (key !== w.key) {
          w.key = key;
          w.historyHtml = '';
          w.title.innerHTML = `<span style="color:${TEAM[i]}">●</span> ${NAMES[i]} · ${escapeHtml(sourceName(source))}`;
          for (const kind of KINDS) {
            const label = shortLabel(kind, source);
            w.buttons[kind].label.textContent = label;
            w.buttons[kind].label.setAttribute('font-size', label.length > 1 ? '8' : '11');
            const color = source.kind === 'pad' ? BUTTON_GLYPHS[source.family][SHOT_POSITIONS[kind]].color : '#e8edf1';
            w.buttons[kind].label.setAttribute('fill', color);
          }
        }

        w.dot.setAttribute('cx', (30 + state.stick.right * 20).toFixed(1));
        w.dot.setAttribute('cy', (30 - state.stick.up * 20).toFixed(1));

        const since = (duel.tick - tracker.noteTick) * SIM_DT;
        const last = tracker.history[0];
        const flash = last && since < FLASH_TIME ? last : null;
        for (const kind of KINDS) {
          const { circle } = w.buttons[kind];
          let fill = 'rgba(255,255,255,.06)';
          let stroke = '#9fb0bf';
          if (state.shot === kind) {
            fill = 'rgba(255,255,255,.55)';
            stroke = '#ffffff';
          } else if (flash?.button === kind) {
            fill = QUALITY_COLORS[flash.quality];
            stroke = QUALITY_COLORS[flash.quality];
          }
          circle.setAttribute('fill', fill);
          circle.setAttribute('stroke', stroke);
        }

        // Pendant le maintien : quel bouton est armé. Sinon : le dernier relâcher, un court instant.
        let note = '';
        if (state.shot) note = `${buttonIcon(state.shot, source)} <span style="color:#c9d3db">${SHOT_NAMES[state.shot]} : armé, relâche au bon moment</span>`;
        else if (last && since < NOTE_TIME) note = noteHtml(last, source);
        if (w.note.innerHTML !== note) w.note.innerHTML = note;

        const historyHtml = tracker.history
          .slice(note && !state.shot ? 1 : 0)
          .map((n) => `<div>${noteHtml(n, source)}</div>`)
          .join('');
        if (historyHtml !== w.historyHtml) {
          w.historyHtml = historyHtml;
          w.history.innerHTML = historyHtml;
        }
      });
    },
  };
}

/** Index du bouton de face d'un coup dans la disposition standard (pour lire `Gamepad.buttons`). */
export const shotButtonIndex = (kind: ShotKind): number => POSITION_INDEX[SHOT_POSITIONS[kind]];
