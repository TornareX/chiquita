import { connectedGamepads } from '../input/gamepad';
import { KEY_LAYOUTS } from '../input/keyboardArcade';
import {
  BUTTON_GLYPHS,
  detectPadFamily,
  PAD_FAMILY_NAMES,
  PAD_STYLES,
  POSITION_INDEX,
  POSITION_NAMES,
  resolvePadFamily,
  SHOT_NAMES,
  SHOT_POSITIONS,
  type ButtonPosition,
  type PadStyle,
} from '../input/padStyle';
import type { ShotKind } from '../sim/commands';
import { buttonIcon, formatButtons, loadKeyboardLayout, type InputSource } from './buttonIcons';

export interface PadTest {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

/** Ordre des boutons à trouver : bas, gauche, haut, droite (le coup normal d'abord). */
const ORDER: readonly ShotKind[] = ['normal', 'slice', 'lob', 'overhead'];
const START_BUTTON = 9;
/** Secteurs du stick à atteindre pour valider le tour complet. */
const SECTORS = 8;
/** Pousser à fond : au-delà de cette amplitude, le secteur est atteint. */
const FULL_TILT = 0.85;

type Step = 'detect' | 'buttons' | 'stick' | 'done';

const BUTTON_XY: Record<ButtonPosition, [number, number]> = { bottom: [60, 98], right: [98, 60], left: [22, 60], top: [60, 22] };

/**
 * « Teste ta manette » (TUTORIEL_PLAN.md §1) : on détecte la manette et on affiche ses symboles (choix
 * forcé possible), on fait appuyer sur chacun des 4 boutons de coup dans l'ordre en disant lequel a été
 * pressé quand ce n'est pas le bon, puis on fait faire un tour complet au stick. La partie est en pause
 * pendant ce temps ; Échap, Start ou « Fermer » pour revenir au jeu.
 */
export function createPadTest(getStyle: () => PadStyle, setStyle: (style: PadStyle) => void): PadTest {
  const overlay = document.createElement('div');
  overlay.id = 'pad-test';
  overlay.hidden = true;
  overlay.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:20';
  const panel = document.createElement('div');
  panel.style.cssText =
    'width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;box-sizing:border-box;padding:18px 20px;' +
    'border-radius:12px;background:rgba(12,18,26,.97);color:#f2f5f7;font:14px/1.45 system-ui,sans-serif;text-align:center';
  overlay.append(panel);

  const title = document.createElement('h1');
  title.style.cssText = 'margin:0 0 4px;font-size:20px';
  title.textContent = 'Teste ta manette';
  const detected = document.createElement('div');
  detected.style.cssText = 'color:#9fb0bf;font-size:13px;min-height:20px';
  const styleRow = document.createElement('label');
  styleRow.style.cssText = 'display:inline-flex;gap:8px;align-items:center;font-size:12px;color:#9fb0bf;margin:4px 0 8px';
  const styleSelect = document.createElement('select');
  styleSelect.style.cssText = 'padding:3px;background:#1c2833;color:#f2f5f7;border:1px solid #3a4a58;border-radius:6px';
  for (const style of PAD_STYLES) {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style === 'auto' ? 'Détectés automatiquement' : `Manette ${PAD_FAMILY_NAMES[style]}`;
    styleSelect.append(option);
  }
  styleRow.append('Ce n’est pas ta manette ? Symboles :', styleSelect);
  const instruction = document.createElement('div');
  instruction.style.cssText = 'font-size:18px;font-weight:600;margin:10px 0 4px;min-height:28px';
  const feedback = document.createElement('div');
  feedback.style.cssText = 'font-size:14px;min-height:22px';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };
  const drawing = make('svg', { width: 280, height: 130, viewBox: '0 0 280 130' });
  drawing.style.cssText = 'display:block;margin:6px auto;max-width:100%';
  // Stick à gauche, secteurs autour.
  const stickGroup = make('g', { transform: 'translate(10,5)' });
  const sectors: SVGPathElement[] = [];
  for (let s = 0; s < SECTORS; s++) {
    const a0 = (s - 0.5) * ((2 * Math.PI) / SECTORS) - Math.PI / 2;
    const a1 = (s + 0.5) * ((2 * Math.PI) / SECTORS) - Math.PI / 2;
    const p = (a: number, r: number): string => `${(60 + Math.cos(a) * r).toFixed(1)} ${(60 + Math.sin(a) * r).toFixed(1)}`;
    const path = make('path', {
      d: `M ${p(a0, 46)} A 46 46 0 0 1 ${p(a1, 46)} L ${p(a1, 56)} A 56 56 0 0 0 ${p(a0, 56)} Z`,
      fill: 'rgba(255,255,255,.08)',
      stroke: '#3a4a58',
    });
    sectors.push(path);
    stickGroup.append(path);
  }
  stickGroup.append(make('circle', { cx: 60, cy: 60, r: 44, fill: 'rgba(255,255,255,.05)', stroke: '#5a6b7a', 'stroke-width': 1.5 }));
  const stickDot = make('circle', { cx: 60, cy: 60, r: 9, fill: '#6fb2ff' });
  stickGroup.append(stickDot);
  // Boutons à droite.
  const buttonGroup = make('g', { transform: 'translate(150,5)' });
  const circles = {} as Record<ShotKind, SVGCircleElement>;
  const labels = {} as Record<ShotKind, SVGTextElement>;
  for (const kind of ORDER) {
    const [x, y] = BUTTON_XY[SHOT_POSITIONS[kind]];
    circles[kind] = make('circle', { cx: x, cy: y, r: 17, fill: 'rgba(255,255,255,.06)', stroke: '#9fb0bf', 'stroke-width': 2 });
    labels[kind] = make('text', {
      x,
      y: y + 6,
      'text-anchor': 'middle',
      'font-size': 17,
      'font-weight': 700,
      'font-family': 'system-ui,sans-serif',
      fill: '#e8edf1',
    });
    buttonGroup.append(circles[kind], labels[kind]);
  }
  drawing.append(stickGroup, buttonGroup);

  const summary = document.createElement('div');
  summary.style.cssText = 'font-size:13px;color:#c9d3db;margin-top:6px';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:12px';
  const buttonStyle =
    'padding:6px 14px;border-radius:6px;border:1px solid #3a4a58;background:#1c2833;color:#f2f5f7;font:inherit;cursor:pointer';
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.textContent = 'Recommencer';
  restart.style.cssText = buttonStyle;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fermer (Échap, Start)';
  close.style.cssText = buttonStyle;
  actions.append(restart, close);
  panel.append(title, detected, styleRow, instruction, feedback, drawing, summary, actions);
  document.body.append(overlay);

  let step: Step = 'detect';
  let padIndex: number | null = null;
  let target = 0;
  let reached = new Array<boolean>(SECTORS).fill(false);
  let held = new Set<number>();
  let startHeldOnOpen = false;
  let frame = 0;
  let layout: ReadonlyMap<string, string> | null = null;
  void loadKeyboardLayout().then((map) => (layout = map));

  const pad = (): Gamepad | null => connectedGamepads().find((p) => p.index === padIndex) ?? null;
  const source = (): InputSource => {
    const current = pad();
    return current ? { kind: 'pad', family: resolvePadFamily(getStyle(), current) } : { kind: 'keyboard', player: 0, layout };
  };

  const reset = (): void => {
    step = 'detect';
    padIndex = null;
    target = 0;
    reached = new Array<boolean>(SECTORS).fill(false);
    held = new Set();
    feedback.innerHTML = '';
  };

  const keyboardSummary = (): string =>
    ([0, 1] as const)
      .map((player) => {
        const src: InputSource = { kind: 'keyboard', player, layout };
        const name = player === 0 ? 'Bleu' : 'Rouge';
        return `${name} : ${ORDER.map((kind) => `${buttonIcon(kind, src)} ${SHOT_NAMES[kind]}`).join(' · ')}`;
      })
      .join('<br>');

  const mapping = (src: InputSource): string =>
    ORDER.map((kind) => `${buttonIcon(kind, src)} ${SHOT_NAMES[kind]}`).join(' &nbsp;·&nbsp; ');

  const renderStatic = (): void => {
    const src = source();
    const current = pad();
    if (current) {
      const family = resolvePadFamily(getStyle(), current);
      const auto = detectPadFamily(current.id);
      detected.textContent =
        `Manette ${padIndex! + 1} : ${family === 'generic' ? 'symboles inconnus, on montre la position des boutons' : `manette ${PAD_FAMILY_NAMES[family]}`}` +
        (getStyle() !== 'auto' && auto !== family ? ` (imposé ; détectée : ${PAD_FAMILY_NAMES[auto]})` : '');
    } else detected.textContent = connectedGamepads().length ? '' : 'Aucune manette détectée pour l’instant.';
    for (const kind of ORDER) {
      const glyph = src.kind === 'pad' ? BUTTON_GLYPHS[src.family][SHOT_POSITIONS[kind]] : null;
      labels[kind].textContent = glyph?.text ?? '';
      labels[kind].setAttribute('fill', glyph?.color ?? '#e8edf1');
    }
    if (step === 'detect') {
      instruction.textContent = 'Appuie sur n’importe quel bouton de ta manette';
      summary.innerHTML = `Pas de manette ? Au clavier :<br>${keyboardSummary()}`;
    } else if (step === 'buttons') {
      const kind = ORDER[target]!;
      instruction.innerHTML = `${target + 1}/4 · Appuie sur ${buttonIcon(kind, src)} <span style="color:#9fb0bf">(${SHOT_NAMES[kind]})</span>`;
      summary.innerHTML = '';
    } else if (step === 'stick') {
      instruction.textContent = 'Fais un tour complet avec le stick gauche, poussé à fond';
      summary.innerHTML = '';
    } else {
      instruction.innerHTML = '<span style="color:#5fd35a">Tout fonctionne !</span>';
      summary.innerHTML = `Sur ta manette :<br>${mapping(src)}<br><br>${formatButtons(
        'Maintiens le bouton, relâche quand la balle arrive à côté de toi. Le stick, au moment de la frappe, choisit la direction.',
        src,
      )}`;
    }
  };

  const tick = (): void => {
    if (overlay.hidden) return;
    const pads = connectedGamepads();
    // Détection : le premier bouton pressé désigne la manette testée.
    if (padIndex === null) {
      const pressedPad = pads.find((p) => p.buttons.some((b, i) => b.pressed && !(i === START_BUTTON && startHeldOnOpen)));
      if (pressedPad) {
        padIndex = pressedPad.index;
        held = new Set(pressedPad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
        step = 'buttons';
        renderStatic();
      }
    }
    const current = pad();
    if (current) {
      const pressed = new Set(current.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
      // Start : ferme l'écran au relâcher (un appui en cours à l'ouverture ne compte pas).
      if (held.has(START_BUTTON) && !pressed.has(START_BUTTON) && !startHeldOnOpen) {
        api.close();
        return;
      }
      if (!pressed.has(START_BUTTON)) startHeldOnOpen = false;
      const src = source();
      for (const i of pressed) {
        if (held.has(i)) continue;
        if (step !== 'buttons') continue;
        const want = ORDER[target]!;
        const position = (Object.keys(POSITION_INDEX) as ButtonPosition[]).find((p) => POSITION_INDEX[p] === i);
        if (i === POSITION_INDEX[SHOT_POSITIONS[want]]) {
          feedback.innerHTML = `<span style="color:#5fd35a">Oui : ${buttonIcon(want, src)} c’est le ${SHOT_NAMES[want]}.</span>`;
          target++;
          if (target >= ORDER.length) step = 'stick';
          renderStatic();
        } else if (position) {
          const got = ORDER.find((k) => SHOT_POSITIONS[k] === position)!;
          feedback.innerHTML =
            `<span style="color:#ffb35c">Ça, c’est ${buttonIcon(got, src)} (${SHOT_NAMES[got]}).</span> ` +
            `Cherche ${buttonIcon(want, src)} : le ${POSITION_NAMES[SHOT_POSITIONS[want]]}.`;
        } else if (i !== START_BUTTON) {
          feedback.innerHTML = `<span style="color:#ffb35c">Ce bouton (n° ${i}) ne sert pas à frapper.</span> Cherche ${buttonIcon(want, src)}.`;
        }
      }
      held = pressed;

      for (const kind of ORDER) {
        const index = POSITION_INDEX[SHOT_POSITIONS[kind]];
        const done = step !== 'detect' && (step !== 'buttons' || ORDER.indexOf(kind) < target);
        const wanted = step === 'buttons' && ORDER[target] === kind;
        const pulse = 0.5 + 0.5 * Math.sin(frame / 6);
        circles[kind].setAttribute('fill', pressed.has(index) ? 'rgba(255,255,255,.6)' : done ? 'rgba(95,211,90,.35)' : 'rgba(255,255,255,.06)');
        circles[kind].setAttribute('stroke', wanted ? `rgba(255,226,122,${0.4 + 0.6 * pulse})` : done ? '#5fd35a' : '#9fb0bf');
        circles[kind].setAttribute('stroke-width', wanted ? '3' : '2');
      }

      // Stick brut (sans zone morte) : on voit aussi un stick qui dérive au repos.
      const x = current.axes[0] ?? 0;
      const y = current.axes[1] ?? 0;
      const magnitude = Math.hypot(x, y);
      const k = Math.min(1, magnitude) / (magnitude || 1);
      stickDot.setAttribute('cx', (60 + x * k * 44).toFixed(1));
      stickDot.setAttribute('cy', (60 + y * k * 44).toFixed(1));
      if (step === 'stick') {
        if (magnitude >= FULL_TILT) {
          const angle = Math.atan2(y, x) + Math.PI / 2;
          const sector = ((Math.round(angle / ((2 * Math.PI) / SECTORS)) % SECTORS) + SECTORS) % SECTORS;
          reached[sector] = true;
        }
        const count = reached.filter(Boolean).length;
        feedback.innerHTML =
          magnitude < 0.3 && magnitude > 0.12
            ? `<span style="color:#ffb35c">Au repos, ton stick indique ${Math.round(magnitude * 100)} % : il dérive un peu (le jeu ignore jusqu’à 22 %).</span>`
            : `${count}/${SECTORS} directions`;
        if (count === SECTORS) {
          step = 'done';
          feedback.innerHTML = '';
          renderStatic();
        }
      }
      sectors.forEach((path, s) => path.setAttribute('fill', reached[s] ? 'rgba(95,211,90,.6)' : 'rgba(255,255,255,.08)'));
    }
    frame++;
    requestAnimationFrame(tick);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (overlay.hidden) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      api.close();
      return;
    }
    // Au clavier : montre quelle touche fait quoi, sans bloquer le test de la manette.
    for (const player of [0, 1] as const) {
      const shot = KEY_LAYOUTS[player].shots.find(([code]) => code === event.code)?.[1];
      if (shot && padIndex === null) {
        const src: InputSource = { kind: 'keyboard', player, layout };
        feedback.innerHTML = `${buttonIcon(shot, src)} : ${SHOT_NAMES[shot]} (${player === 0 ? 'Bleu' : 'Rouge'})`;
      }
    }
  };
  window.addEventListener('keydown', onKey, true);

  styleSelect.addEventListener('change', () => {
    setStyle(styleSelect.value as PadStyle);
    renderStatic();
  });
  restart.addEventListener('click', () => {
    reset();
    renderStatic();
  });
  close.addEventListener('click', () => api.close());
  window.addEventListener('gamepadconnected', () => !overlay.hidden && renderStatic());

  const api: PadTest = {
    get isOpen() {
      return !overlay.hidden;
    },
    open() {
      if (!overlay.hidden) return;
      reset();
      styleSelect.value = getStyle();
      startHeldOnOpen = connectedGamepads().some((p) => p.buttons[START_BUTTON]?.pressed ?? false);
      overlay.hidden = false;
      overlay.style.display = 'flex';
      renderStatic();
      requestAnimationFrame(tick);
    },
    close() {
      overlay.hidden = true;
      overlay.style.display = 'none';
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
  };
  return api;
}
