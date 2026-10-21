import type { SwingEnd, SwingStick } from '../input/swingStick';
import { escapeHtml, formatButtons, sourceKey, type InputSource } from './buttonIcons';

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
    /** Manette ou clavier du joueur : au clavier, les consignes disent les touches. */
    source?: InputSource,
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
  hint: HTMLDivElement;
  flick: HTMLDivElement;
  strokes: Record<SwingEnd, SVGElement[]>;
  labels: Record<SwingEnd, SVGTextElement[]>;
  trail: SVGPolylineElement;
  dot: SVGCircleElement;
}

function build(): Parts {
  const root = document.createElement('div');
  // Apparence dans `hud.css` ; caché jusqu'au premier geste.
  root.className = 'swing-guide';
  root.style.display = 'none';
  const title = document.createElement('div');
  title.className = 'swing-title';
  const drawing = el('svg', { width: SIZE + 110, height: SIZE + 20, viewBox: `-55 -10 ${SIZE + 110} ${SIZE + 20}` });
  const defs = el('defs', {});
  const marker = el('marker', { id: 'swing-head', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3, markerHeight: 3, orient: 'auto-start-reverse' });
  marker.append(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' }));
  defs.append(marker);
  drawing.append(defs, el('circle', { class: 'ring', cx: C, cy: C, r: R + 8 }));
  const arrow = (points: [number, number][]): SVGPolylineElement =>
    el('polyline', { class: 'end', points: pts(...points), 'marker-end': 'url(#swing-head)' });
  const label = ([x, y]: [number, number], anchor = 'middle'): SVGTextElement =>
    el('text', { class: 'end-label', x, y: y + 4, 'text-anchor': anchor });
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
  const center = el('circle', { class: 'end center', cx: C, cy: C, r: 7 });
  const prep = el('circle', { class: 'prep', cx: C, cy: C + R, r: 5 });
  const strokes: Parts['strokes'] = { straight: [straight], arc: [arc(1), arc(-1)], letGo: [center] };
  const labels: Parts['labels'] = {
    straight: [label(at(0, 1, 1.3))],
    arc: [label(at(1, 0, 1.25), 'start'), label(at(-1, 0, 1.25), 'end')],
    letGo: [label(at(0, -0.45))],
  };
  const trail = el('polyline', { class: 'trail', points: '' });
  const dot = el('circle', { class: 'dot', cx: C, cy: C, r: 7 });
  drawing.append(...strokes.straight, ...strokes.arc, center, prep, ...labels.straight, ...labels.arc, ...labels.letGo, trail, dot);
  const hint = document.createElement('div');
  hint.className = 'swing-hint';
  hint.textContent = 'préparer : stick tiré vers toi';
  const flick = document.createElement('div');
  flick.className = 'swing-flick';
  root.append(title, drawing, hint, flick);
  document.body.append(root);
  return { root, title, hint, flick, strokes, labels, trail, dot };
}

export function createSwingGuide(): SwingGuide {
  let parts: Parts | null = null;
  /** Noms affichés : ceux d'un contexte, ou ceux de la contre-vitre. */
  let named: string | null = null;
  let seen = 0;
  let resultUntil = 0;

  const light = (end: SwingEnd | null): void => {
    for (const key of ['straight', 'arc', 'letGo'] as const) {
      const on = key === end;
      for (const s of parts!.strokes[key]) s.classList.toggle('is-lit', on);
      for (const l of parts!.labels[key]) l.classList.toggle('is-lit', on);
    }
  };

  return {
    render(swing, stick, visible, left, bottom, context, result, source) {
      /** Consigne en HTML : au clavier, les mots du stick deviennent ses touches. */
      const say = (text: string): string => (source ? formatButtons(text, source) : escapeHtml(text));
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
      const wall = swing.phase === 'wallArmed' || (swing.phase === 'idle' && swing.wallReady);
      const showResult = !active && now < resultUntil && swing.last !== null;
      if (!visible || (!active && !wall && !showResult)) {
        if (parts) parts.root.style.display = 'none';
        return;
      }
      parts ??= build();
      const p = parts;
      p.root.style.display = 'flex';
      p.root.style.left = `${left}px`;
      p.root.style.bottom = `${bottom}px`;
      // Les noms des coups suivent la balle à jouer ; contre-vitre : geste inversé, sans fins à choisir.
      const naming = `${wall ? 'vitre' : context}:${source ? sourceKey(source) : ''}`;
      if (named !== naming) {
        named = naming;
        const shots = SWING_SHOTS[context];
        for (const key of ['straight', 'arc', 'letGo'] as const) for (const l of p.labels[key]) l.textContent = wall ? '' : shots[key];
        p.hint.innerHTML = say(wall ? (source?.kind === 'keyboard' ? '{k:up} : préparer · {k:down} ou lâché : frapper' : 'en avant : préparer · vers toi ou lâché : frapper') : 'préparer : stick droit tiré vers toi');
        p.flick.innerHTML = wall
          ? 'contre la vitre, elle repasse le filet'
          : `${source?.kind === 'keyboard' ? say('sans préparer, appui sec sur {k:up}') : 'sans préparer, coup sec ↑'} : ${escapeHtml(shots.flick)}`;
      }
      let text: string;
      if (showResult) {
        const last = swing.last!;
        light(last.prepared && !last.wall ? last.end : null);
        const name = last.wall ? 'contre-vitre' : last.prepared ? SWING_SHOTS[context][last.end] : SWING_SHOTS[context].flick;
        text = `<span class="swing-lit">${escapeHtml(result ?? name)}</span>`;
      } else if (wall) {
        // Contre-vitre : tourné vers sa vitre, le geste s'inverse.
        light(null);
        text =
          swing.phase === 'wallArmed'
            ? `<span class="swing-lit">${say('Contre-vitre : ramène le stick vers toi pour frapper')}</span>`
            : say('Contre-vitre possible : stick en avant pour préparer');
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
