import type { SwingEnd, SwingStick } from '../input/swingStick';
import { escapeHtml } from './buttonIcons';

/** Situation de la balle à jouer : elle décide du coup que donne chaque geste. */
export type SwingContext = 'sol' | 'volee' | 'haut';

/**
 * Guide du geste au stick droit : pendant la préparation (stick tiré vers soi), le stick dessiné en grand
 * avec les trois fins (tout droit, en arc, lâché), nommées selon la balle : au sol, de volée ou au-dessus de
 * la tête. Une ligne rappelle le coup sec sans préparation. Le chemin suivi s'allume ; une fois le geste
 * fini, le coup joué reste affiché un court instant.
 */
export interface SwingGuide {
  /** À chaque image. `left`, `bottom` : position du guide (px), à côté du retour des entrées. */
  render(
    swing: SwingStick | null,
    stick: { right: number; up: number } | null,
    visible: boolean,
    left: number,
    bottom: number,
    context: SwingContext,
    /** Ce que le dernier geste a vraiment donné (« volée bloquée », « smash parfait ! »…). */
    result?: string | null,
  ): void;
}

/** Coup donné par chaque fin de geste préparé, et par le coup sec sans préparation, selon la balle. */
export const SWING_SHOTS: Record<SwingContext, Record<SwingEnd | 'flick', string>> = {
  sol: { straight: 'coup normal', arc: 'lob', letGo: 'chiquita', flick: 'coup sans préparation' },
  volee: { straight: 'volée coupée', arc: 'volée coupée', letGo: 'volée coupée', flick: 'volée bloquée' },
  haut: { straight: 'smash', arc: 'víbora', letGo: 'feinte de smash', flick: 'bandeja' },
};
const CONTEXT_NAMES: Record<SwingContext, string> = { sol: 'Au sol', volee: 'De volée', haut: 'Au-dessus de la tête' };

/** Durée d'affichage du coup lu après le geste (ms). */
const RESULT_TIME = 900;
const SIZE = 150;
const C = SIZE / 2;
const R = 46;
const DIM = '#5a6b7a';
const LIT = '#ffd23f';
const TEXT = '#c9d3db';

const SVG = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

/** Point du stick dans le dessin (`up` vers le haut), à `scale` fois le rayon. */
const at = (right: number, up: number, scale = 1): [number, number] => [C + right * R * scale, C - up * R * scale];
const pts = (...points: [number, number][]): string => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

interface Parts {
  root: HTMLDivElement;
  title: HTMLDivElement;
  flick: HTMLDivElement;
  strokes: Record<SwingEnd, SVGElement[]>;
  labels: Record<SwingEnd, SVGTextElement[]>;
  trail: SVGPolylineElement;
  dot: SVGCircleElement;
}

function build(): Parts {
  const root = document.createElement('div');
  root.className = 'swing-guide';
  root.style.cssText =
    'position:fixed;display:none;flex-direction:column;align-items:center;gap:2px;padding:6px 10px 6px;border-radius:10px;' +
    'background:rgba(10,16,24,.7);color:#f2f5f7;font:13px/1.3 system-ui,sans-serif;pointer-events:none;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;min-height:18px';
  const drawing = el('svg', { width: SIZE + 110, height: SIZE + 20, viewBox: `-55 -10 ${SIZE + 110} ${SIZE + 20}` });
  const defs = el('defs', {});
  const marker = el('marker', { id: 'swing-head', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3, markerHeight: 3, orient: 'auto-start-reverse' });
  marker.append(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' }));
  defs.append(marker);
  drawing.append(defs, el('circle', { cx: C, cy: C, r: R + 8, fill: 'rgba(255,255,255,.05)', stroke: '#3a4a58', 'stroke-width': 1.5 }));
  const arrow = (points: [number, number][]): SVGPolylineElement =>
    el('polyline', { points: pts(...points), fill: 'none', stroke: DIM, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'marker-end': 'url(#swing-head)' });
  const label = ([x, y]: [number, number], anchor = 'middle'): SVGTextElement =>
    el('text', { x, y: y + 4, 'text-anchor': anchor, 'font-size': 12, 'font-weight': 700, fill: TEXT });
  // Tout droit, de la préparation (en bas) vers l'avant (en haut).
  const straight = arrow([at(0, -0.85), at(0, 0.8)]);
  // En arc, par la gauche ou par la droite.
  const arc = (side: number): SVGPolylineElement => {
    const points: [number, number][] = [];
    for (let deg = -80; deg <= 80; deg += 10) {
      const t = (deg * Math.PI) / 180;
      points.push(at(side * Math.cos(t), Math.sin(t)));
    }
    return arrow(points);
  };
  const center = el('circle', { cx: C, cy: C, r: 7, fill: 'none', stroke: DIM, 'stroke-width': 3 });
  const prep = el('circle', { cx: C, cy: C + R, r: 5, fill: '#9fb0bf' });
  const strokes: Parts['strokes'] = { straight: [straight], arc: [arc(1), arc(-1)], letGo: [center] };
  const labels: Parts['labels'] = {
    straight: [label(at(0, 1, 1.3))],
    arc: [label(at(1, 0, 1.25), 'start'), label(at(-1, 0, 1.25), 'end')],
    letGo: [label(at(0, -0.45))],
  };
  const trail = el('polyline', { points: '', fill: 'none', stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-linejoin': 'round', opacity: 0.9 });
  const dot = el('circle', { cx: C, cy: C, r: 7, fill: '#ffffff' });
  drawing.append(...strokes.straight, ...strokes.arc, center, prep, ...labels.straight, ...labels.arc, ...labels.letGo, trail, dot);
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px;color:#9fb0bf';
  hint.textContent = 'préparer : stick tiré vers toi';
  const flick = document.createElement('div');
  flick.style.cssText = 'font-size:11px;color:#c9d3db';
  root.append(title, drawing, hint, flick);
  document.body.append(root);
  return { root, title, flick, strokes, labels, trail, dot };
}

export function createSwingGuide(): SwingGuide {
  let parts: Parts | null = null;
  let named: SwingContext | null = null;
  let seen = 0;
  let resultUntil = 0;

  const light = (end: SwingEnd | null): void => {
    for (const key of ['straight', 'arc', 'letGo'] as const) {
      const on = key === end;
      for (const s of parts!.strokes[key]) s.setAttribute('stroke', on ? LIT : DIM);
      for (const l of parts!.labels[key]) l.setAttribute('fill', on ? LIT : TEXT);
    }
  };

  return {
    render(swing, stick, visible, left, bottom, context, result) {
      if (!swing || !stick) {
        if (parts) parts.root.style.display = 'none';
        return;
      }
      const now = performance.now();
      if (swing.count !== seen) {
        seen = swing.count;
        resultUntil = now + RESULT_TIME;
      }
      const active = swing.phase === 'armed' || swing.phase === 'swing';
      const showResult = !active && now < resultUntil && swing.last !== null;
      if (!visible || (!active && !showResult)) {
        if (parts) parts.root.style.display = 'none';
        return;
      }
      parts ??= build();
      const p = parts;
      p.root.style.display = 'flex';
      p.root.style.left = `${left}px`;
      p.root.style.bottom = `${bottom}px`;
      // Les noms des coups suivent la balle à jouer.
      if (named !== context) {
        named = context;
        const shots = SWING_SHOTS[context];
        for (const key of ['straight', 'arc', 'letGo'] as const) for (const l of p.labels[key]) l.textContent = shots[key];
        p.flick.textContent = `sans préparer, coup sec ↑ : ${shots.flick}`;
      }
      let text: string;
      if (showResult) {
        const last = swing.last!;
        light(last.prepared ? last.end : null);
        const name = last.prepared ? SWING_SHOTS[context][last.end] : SWING_SHOTS[context].flick;
        text = `<span style="color:${LIT}">${escapeHtml(result ?? name)}</span>`;
      } else if (swing.phase === 'swing' && swing.sideSeen) {
        light('arc');
        text = `${escapeHtml(SWING_SHOTS[context].arc)}… finis le geste`;
      } else {
        light(null);
        text = `${CONTEXT_NAMES[context]} : choisis la fin du geste`;
      }
      if (p.title.innerHTML !== text) p.title.innerHTML = text;
      p.trail.setAttribute('points', pts(...swing.trail.map((q) => at(q.right, q.up))));
      p.dot.setAttribute('cx', (C + stick.right * R).toFixed(1));
      p.dot.setAttribute('cy', (C - stick.up * R).toFixed(1));
    },
  };
}
