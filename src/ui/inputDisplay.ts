import type { PadState } from '../input/gamepad';
import { BUTTON_GLYPHS, keyLabel, PAD_FAMILY_NAMES, POSITION_INDEX, SHOT_NAMES, SHOT_POSITIONS, type ButtonPosition } from '../input/padStyle';
import type { ArcadeCommands, OverheadKind, ShotKind } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import type { Duel, DuelShot } from '../sim/duel';
import type { PhysicsProfile } from '../sim/profile';
import { buttonsEnabled } from '../input/gamepad';
import type { SwingStick } from '../input/swingStick';
import { buttonIcon, escapeHtml, keysFor, type InputSource } from './buttonIcons';
import { playerName, type InputDisplayMode } from './duelSettings';
import { createSwingGuide, type SwingContext } from './swingGuide';

/**
 * Situation de la balle que le joueur `index` va jouer, comme la simulation la jugera : au-dessus du seuil des
 * coups hauts, coup haut ; avant le rebond, volée ; sinon, coup au sol.
 */
export function swingContext(duel: Duel, index: number): SwingContext {
  const me = duel.players[index]!;
  const plan = me.engagement?.plan;
  const ball = duel.ball;
  const height = plan ? plan.contact.y : (ball?.pos.y ?? 0);
  if (height >= duel.swingFloor(me.height)) return 'haut';
  const volley = plan ? plan.volley : duel.bounces === 0 && Math.abs(me.pos.z) < duel.profile.rally.volleyZone;
  return volley ? 'volee' : 'sol';
}

/** Résultat d'un relâcher, qui colore le bouton : doré parfait, vert réussi, orange imprécis, rouge raté. */
export type ReleaseQuality = 'perfect' | 'good' | 'off' | 'miss';

export interface ReleaseNote {
  button: ShotKind;
  quality: ReleaseQuality;
  /** Ce que le bouton a donné, en clair : « bandeja parfaite », « relâché trop tôt : dans le vide ». */
  text: string;
  /** Direction du stick au moment de la frappe, en clair, relative au joueur. */
  stick: string;
  /** Coup joué au geste du stick droit, pas au bouton. */
  bySwing?: boolean;
}

/** Le coup tenu vient du geste du stick droit (pas d'un bouton). */
const swingHeld = (state: PadState): boolean => state.shot !== null && state.swing?.shot === state.shot;

const QUALITY_COLORS: Record<ReleaseQuality, string> = {
  perfect: '#ffd23f',
  good: '#5fd35a',
  off: '#ffb35c',
  miss: '#ff6b6b',
};

const OVERHEAD_NAMES: Record<OverheadKind, string> = {
  bandeja: 'bandeja',
  vibora: 'víbora',
  remate: 'smash',
  bajada: 'bajada',
  feinte: 'feinte de smash',
};

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
  // Bandeja et víbora : prise trop haute (elle rebondit) ou trop basse (vers le filet).
  if (shot.overhead === 'bandeja' || shot.overhead === 'vibora') {
    const off = shot.heightOff;
    if (off > 0) return { text: `${name} prise trop haute : relâche plus tard`, quality: 'off' };
    if (off < 0) return { text: `${name} prise trop basse : relâche plus tôt`, quality: 'off' };
  }
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
  /** Bouton maintenu au pas précédent, et si le dernier bouton tenu venait du geste du stick droit. */
  private held: ShotKind | null = null;
  private heldBySwing = false;
  private lastHitTick = -Infinity;
  private lastWhiffTick = -Infinity;
  /** Pas de la dernière note, et historique, la plus récente d'abord. */
  noteTick = -Infinity;
  readonly history: ReleaseNote[] = [];

  constructor(private readonly index: number) {}

  /** À appeler après chaque `duel.step`, avec l'état lu pour ce joueur à ce pas. */
  step(duel: Duel, state: PadState): void {
    const player = duel.players[this.index]!;
    const released = this.held;
    if (player.lastHitTick !== this.lastHitTick) {
      this.lastHitTick = player.lastHitTick;
      if (player.lastHit) {
        let { text, quality } = describeShot(player.lastHit, duel.profile);
        const bySwing = state.shot ? swingHeld(state) : this.heldBySwing;
        // Au stick droit, le coup sec sans préparation est voulu : volée bloquée, ou coup moins fort au sol.
        if (bySwing && player.lastHit.style === 'block') {
          if (player.lastHit.volley) {
            text = player.lastHit.perfect ? 'volée bloquée parfaite !' : 'volée bloquée';
            quality = player.lastHit.perfect ? 'perfect' : 'good';
          } else text = 'coup sans préparation : moins fort, moins précis';
        }
        // Le bouton réellement pressé : B sur une balle basse donne un coupé, mais c'est bien B.
        this.push(duel, {
          button: state.shot ?? released ?? player.lastHit.kind,
          quality,
          text,
          stick: describeStick(player.stick),
          bySwing,
        });
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
          bySwing: this.heldBySwing,
        });
      }
    }
    this.held = state.shot;
    // Gardé après le relâcher : la frappe part souvent quelques pas plus tard.
    if (state.shot) this.heldBySwing = swingHeld(state);
  }

  private push(duel: Duel, note: ReleaseNote): void {
    this.noteTick = duel.tick;
    this.history.unshift(note);
    this.history.length = Math.min(this.history.length, HISTORY);
  }
}

export interface InputDisplay {
  /** Après chaque pas de simulation : état lu pour chaque joueur, `null` pour une IA. */
  step(duel: Duel, states: readonly (PadState | null)[]): void;
  /**
   * À chaque image : `sources[i]` est `null` pour une IA (pas d'affichage). `mode` : discret, les sticks en petit
   * dans le coin ; détaillé, avec le dernier relâcher, l'historique et le guide du geste.
   */
  render(duel: Duel, states: readonly (PadState | null)[], sources: readonly (InputSource | null)[], mode: InputDisplayMode): void;
}

/** Couleur de chaque joueur : celle de son équipe, plus claire pour le partenaire en double. */
const TEAM = ['#6fb2ff', '#ff8a94', '#b5d8ff', '#ffc2c8'] as const;
/** Joueurs suivis au plus (double). */
const MAX_PLAYERS = 4;
const BUTTON_XY: Record<ButtonPosition, [number, number]> = { bottom: [30, 50], right: [50, 30], left: [10, 30], top: [30, 10] };
const KINDS: readonly ShotKind[] = ['normal', 'overhead', 'slice', 'lob'];

interface Widget {
  root: HTMLDivElement;
  title: HTMLDivElement;
  dot: SVGCircleElement;
  /** Stick droit (frappe au geste) : point et trace du geste en cours ou du dernier. */
  swingDot: SVGCircleElement;
  swingTrail: SVGPolylineElement;
  buttons: Record<ShotKind, { circle: SVGCircleElement; label: SVGTextElement }>;
  note: HTMLDivElement;
  history: HTMLDivElement;
  compact: boolean;
  key: string;
  historyHtml: string;
}

const SVG = 'http://www.w3.org/2000/svg';
const SWING_BADGE = '<span style="display:inline-block;padding:0 4px;border-radius:4px;background:#ffd23f;color:#111;font-weight:700;font-size:10px">R</span>';
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

/** Centre du stick droit dans le dessin : après les boutons quand ils sont affichés (`?boutons=1`). */
const swingX = (): number => (buttonsEnabled() ? 160 : 98);

/** Échelle du dessin des sticks en mode discret. */
const COMPACT_SCALE = 0.55;

function createWidget(index: number, compact: boolean): Widget {
  const withButtons = buttonsEnabled();
  const SWING_X = swingX();
  const root = document.createElement('div');
  root.className = 'input-display';
  root.dataset.player = String(index);
  root.style.cssText =
    'position:fixed;left:16px;display:flex;gap:10px;align-items:flex-start;border-radius:10px;' +
    'color:#f2f5f7;font:12px/1.35 system-ui,sans-serif;pointer-events:none;box-sizing:border-box;' +
    `border-left:3px solid ${TEAM[index]!};` +
    (compact ? 'padding:3px 5px;background:rgba(10,16,24,.45);opacity:.85' : 'padding:8px 10px;background:rgba(10,16,24,.6);width:min(400px,calc(100vw - 32px))');
  const pads = document.createElement('div');
  pads.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
  const width = SWING_X + 30;
  const scale = compact ? COMPACT_SCALE : 1;
  const row = svg('svg', { width: Math.round(width * scale), height: Math.round(60 * scale), viewBox: `0 0 ${width} 60` });
  // Stick : cercle et point.
  row.append(svg('circle', { cx: 30, cy: 30, r: 26, fill: 'rgba(255,255,255,.06)', stroke: '#5a6b7a', 'stroke-width': 1.5 }));
  row.append(svg('line', { x1: 30, y1: 6, x2: 30, y2: 54, stroke: '#3a4a58', 'stroke-width': 1 }));
  row.append(svg('line', { x1: 6, y1: 30, x2: 54, y2: 30, stroke: '#3a4a58', 'stroke-width': 1 }));
  const dot = svg('circle', { cx: 30, cy: 30, r: 7, fill: TEAM[index]! });
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
  // Boutons de coup cachés : tout se joue aux sticks (`?boutons=1` pour les remettre).
  if (withButtons) row.append(group);
  // Stick droit, à droite des boutons : la trace montre le geste lu.
  row.append(svg('circle', { cx: SWING_X, cy: 30, r: 26, fill: 'rgba(255,255,255,.06)', stroke: '#5a6b7a', 'stroke-width': 1.5 }));
  row.append(svg('circle', { cx: SWING_X, cy: 30, r: 6, fill: 'none', stroke: '#3a4a58', 'stroke-width': 1 }));
  const swingTrail = svg('polyline', { points: '', fill: 'none', stroke: '#ffd23f', 'stroke-width': 2, 'stroke-linejoin': 'round', opacity: 0.8 });
  const swingDot = svg('circle', { cx: SWING_X, cy: 30, r: 6, fill: '#e8edf1' });
  row.append(swingTrail, swingDot);
  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;color:#c9d3db;white-space:nowrap';
  // Discret : ni titre ni texte, la couleur du bord dit qui est qui.
  title.style.display = compact ? 'none' : '';
  pads.append(title, row);
  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0';
  const note = document.createElement('div');
  note.style.cssText = 'font-size:13px;font-weight:600;min-height:18px';
  const history = document.createElement('div');
  history.style.cssText = 'opacity:.8';
  text.append(note, history);
  root.append(pads);
  if (compact) {
    // Discret : seulement le nom du dernier coup, à droite des sticks, le temps de le lire.
    note.style.cssText = 'font-size:13px;font-weight:600;align-self:center;white-space:nowrap;padding-right:4px;display:none';
    root.append(note);
  } else root.append(text);
  document.body.append(root);
  return { root, title, dot, swingDot, swingTrail, buttons, note, history, compact, key: '', historyHtml: '' };
}

function noteHtml(note: ReleaseNote, source: InputSource): string {
  return (
    `${note.bySwing || !buttonsEnabled() ? SWING_BADGE : buttonIcon(note.button, source)} <span style="color:${QUALITY_COLORS[note.quality]}">${escapeHtml(note.text)}</span>` +
    ` <span style="opacity:.7">· ${escapeHtml(note.stick)}</span>`
  );
}

/**
 * Retour des entrées (TUTORIEL_PLAN.md §1) : pour chaque joueur humain, le stick, les 4 boutons de coup
 * avec les symboles de sa manette (le bouton maintenu s'allume, puis prend la couleur du résultat au
 * relâcher). En mode détaillé, aussi ce que le dernier relâcher a donné, les 5 précédents, et le guide du geste.
 */
export function createInputDisplay(swings?: readonly (SwingStick | null)[] | null): InputDisplay {
  const trackers = Array.from({ length: MAX_PLAYERS }, (_, i) => new ReleaseTracker(i));
  const widgets: (Widget | null)[] = Array.from({ length: MAX_PLAYERS }, () => null);
  /** Guide du geste au stick droit, à droite du retour des entrées de chaque joueur. */
  const guides = Array.from({ length: MAX_PLAYERS }, () => createSwingGuide());

  return {
    step(duel, states) {
      states.forEach((state, i) => state && i < duel.players.length && trackers[i]!.step(duel, state));
    },
    render(duel, states, sources, mode) {
      const indices = trackers.map((_, i) => i);
      const shown = indices.filter((i) => mode !== 'off' && i < duel.players.length && sources[i] && states[i]);
      const compact = mode === 'compact';
      // En bas à gauche, empilés dans l'ordre des joueurs (Bleu en bas). Détaillé, à plus de deux (double à 3 ou
      // 4 manettes) : sans l'historique, pour ne pas cacher le score.
      const crowded = shown.length > 2;
      let stack = compact ? 10 : 14;
      indices.forEach((i) => {
        const source = sources[i];
        const state = states[i];
        const guide = guides[i]!;
        if (!shown.includes(i) || !source || !state) {
          if (widgets[i]) widgets[i]!.root.style.display = 'none';
          guide.render(null, null, false, 0, 0, 'sol');
          return;
        }
        if (widgets[i] && widgets[i]!.compact !== compact) {
          widgets[i]!.root.remove();
          widgets[i] = null;
        }
        const w = (widgets[i] ??= createWidget(i, compact));
        w.root.style.display = 'flex';
        const bottom = stack;
        w.history.style.display = crowded ? 'none' : '';
        w.root.style.bottom = `${bottom}px`;
        stack += w.root.offsetHeight + (compact ? 4 : 8);
        const tracker = trackers[i]!;
        const lastNote = tracker.history[0];
        const recent = lastNote?.bySwing && (duel.tick - tracker.noteTick) * SIM_DT < NOTE_TIME ? lastNote.text : null;
        guide.render(swings?.[i] ?? null, state.swing ?? null, !compact, 16 + w.root.offsetWidth + 10, bottom, swingContext(duel, i), recent);

        const key = source.kind === 'pad' ? source.family : `kbd${source.player}${source.layout?.size ?? 0}`;
        if (key !== w.key) {
          w.key = key;
          w.historyHtml = '';
          w.title.innerHTML = `<span style="color:${TEAM[i]!}">●</span> ${playerName(i, duel.doubles)} · ${escapeHtml(sourceName(source))}`;
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
        const swing = state.swing;
        const SWING_X = swingX();
        w.swingDot.style.display = swing ? '' : 'none';
        if (swing) {
          w.swingDot.setAttribute('cx', (SWING_X + swing.right * 20).toFixed(1));
          w.swingDot.setAttribute('cy', (30 - swing.up * 20).toFixed(1));
          w.swingDot.setAttribute('fill', swing.shot ? '#ffd23f' : '#e8edf1');
        }
        const recognizer = swings?.[i];
        const points = recognizer ? recognizer.trail.map((p) => `${(SWING_X + p.right * 20).toFixed(1)},${(30 - p.up * 20).toFixed(1)}`).join(' ') : '';
        if (w.swingTrail.getAttribute('points') !== points) w.swingTrail.setAttribute('points', points);

        const since = (duel.tick - tracker.noteTick) * SIM_DT;
        const last = tracker.history[0];
        const flash = last && since < FLASH_TIME ? last : null;
        for (const kind of KINDS) {
          const { circle } = w.buttons[kind];
          let fill = 'rgba(255,255,255,.06)';
          let stroke = '#9fb0bf';
          if (state.shot === kind && !swingHeld(state)) {
            fill = 'rgba(255,255,255,.55)';
            stroke = '#ffffff';
          } else if (flash?.button === kind && !flash.bySwing) {
            fill = QUALITY_COLORS[flash.quality];
            stroke = QUALITY_COLORS[flash.quality];
          }
          circle.setAttribute('fill', fill);
          circle.setAttribute('stroke', stroke);
        }

        // Pendant le maintien : quel bouton est armé. Sinon : le dernier relâcher, un court instant.
        let note = '';
        if (compact) {
          note = last && since < NOTE_TIME ? `<span style="color:${QUALITY_COLORS[last.quality]}">${escapeHtml(last.text)}</span>` : '';
          w.note.style.display = note ? '' : 'none';
        } else if (state.shot && swingHeld(state)) {
          note = `${SWING_BADGE} <span style="color:#c9d3db">armé au stick droit : choisis la fin du geste</span>`;
        } else if (state.shot && buttonsEnabled()) note = `${buttonIcon(state.shot, source)} <span style="color:#c9d3db">${SHOT_NAMES[state.shot]} : armé, relâche au bon moment</span>`;
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
