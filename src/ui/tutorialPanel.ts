import type { Lesson } from '../sim/lessons';
import { escapeHtml, formatButtons, type InputSource } from './buttonIcons';

/** Étoiles gagnées par leçon : 1 = réussie, 2 = réussie avec des frappes parfaites. */
export type TutorialProgress = Record<string, number>;

const STORAGE_KEY = 'padel-smash.tutoriel';

export function loadProgress(): TutorialProgress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 0 && entry[1] <= 2),
    );
  } catch {
    return {};
  }
}

export function saveProgress(progress: TutorialProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Stockage indisponible : la progression vaut pour cette visite seulement.
  }
}

export const starsText = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(2 - stars);

export interface TutorialPanelActions {
  pick(index: number): void;
  testPad(): void;
  /** Bouton principal d'une carte (« Commencer », « Leçon suivante »). */
  confirm(): void;
  /** Retour à la liste, ou au match depuis la liste. */
  back(): void;
}

export interface TutorialPanel {
  showList(lessons: readonly Lesson[], progress: TutorialProgress, selected: number, source: InputSource): void;
  showCard(lesson: Lesson, source: InputSource): void;
  showDone(lesson: Lesson, stars: number, perfects: number, hasNext: boolean, source: InputSource): void;
  hideOverlay(): void;
  /** Bandeau du haut : leçon, étape et progression ; `null` le cache. */
  setStatus(html: string | null): void;
  /** Consigne de l'essai en cours. */
  setInstruction(text: string | null, source: InputSource): void;
  /** Verdict de l'essai, ou message d'étape. */
  setMessage(text: string | null, tone: 'ok' | 'fail' | 'info', source: InputSource): void;
  /** Gros indice au centre pendant l'essai guidé (« Relâche ! »). */
  setPrompt(text: string | null, source: InputSource): void;
}

const TONES = { ok: '#5fd35a', fail: '#ffb35c', info: '#f2f5f7' } as const;

/** Interface du tutoriel : liste des leçons, carte d'une leçon, bandeau, consignes et verdicts. */
export function createTutorialPanel(actions: TutorialPanelActions): TutorialPanel {
  const style = document.createElement('style');
  style.textContent = `
    #tutorial-overlay { position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.5); z-index:10 }
    #tutorial-overlay .card { width:min(560px,calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow-y:auto; box-sizing:border-box;
      padding:18px 22px; border-radius:12px; background:rgba(12,18,26,.97); color:#f2f5f7; font:14px/1.5 system-ui,sans-serif }
    #tutorial-overlay h1 { margin:0 0 4px; font-size:21px }
    #tutorial-overlay h2 { margin:14px 0 4px; font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:#9fb0bf }
    #tutorial-overlay ul { margin:4px 0; padding-left:20px }
    #tutorial-overlay .lesson { display:flex; justify-content:space-between; gap:10px; width:100%; margin:4px 0; padding:8px 12px; text-align:left;
      border-radius:8px; border:1px solid #3a4a58; background:#1c2833; color:inherit; font:inherit; cursor:pointer }
    #tutorial-overlay .lesson.selected { border-color:#ffe27a; background:#2a3542 }
    #tutorial-overlay .stars { color:#ffd23f; white-space:nowrap }
    #tutorial-overlay .row { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:14px }
    #tutorial-overlay .row button { padding:7px 14px; border-radius:6px; border:1px solid #3a4a58; background:#1c2833; color:#f2f5f7; font:inherit; cursor:pointer }
    #tutorial-overlay .row button.primary { border-color:#ffe27a }
    #tutorial-overlay .muted { color:#9fb0bf; font-size:12px }
  `;
  document.head.append(style);

  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  const card = document.createElement('div');
  card.className = 'card';
  overlay.append(card);

  const text = (css: string): HTMLDivElement => {
    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);text-align:center;color:#f2f5f7;pointer-events:none;' +
      'font-family:system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.85);' +
      css;
    document.body.append(div);
    return div;
  };
  const status = text('top:12px;font-size:15px;font-weight:600;background:rgba(10,16,24,.6);padding:6px 14px;border-radius:8px');
  status.id = 'tutorial-status';
  const instruction = text('top:52px;font-size:16px;width:min(720px,calc(100vw - 32px))');
  instruction.id = 'tutorial-instruction';
  const message = text('top:22%;font-size:20px;font-weight:700;width:min(720px,calc(100vw - 32px))');
  message.id = 'tutorial-message';
  const prompt = text('top:34%;font-size:30px;font-weight:800;color:#ffe27a');
  prompt.id = 'tutorial-prompt';
  document.body.append(overlay);

  const set = (element: HTMLElement, html: string): void => {
    if (element.innerHTML !== html) element.innerHTML = html;
  };
  const button = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', onClick);
    return b;
  };
  const open = (): void => {
    overlay.style.display = 'flex';
  };

  return {
    showList(lessons, progress, selected, source) {
      card.innerHTML =
        '<h1>Tutoriel</h1>' +
        `<p class="muted">${formatButtons('Chaque leçon montre un coup, quand le jouer et comment le réussir. Stick haut/bas pour choisir, {normal} pour commencer.', source)}</p>`;
      lessons.forEach((lesson, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `lesson${i === selected ? ' selected' : ''}`;
        b.dataset.lesson = lesson.id;
        b.innerHTML =
          `<span><b>${i + 1}. ${escapeHtml(lesson.title)}</b><br><span class="muted">${formatButtons(lesson.buttons, source)}</span></span>` +
          `<span class="stars">${starsText(progress[lesson.id] ?? 0)}</span>`;
        b.addEventListener('click', () => actions.pick(i));
        card.append(b);
      });
      const row = document.createElement('div');
      row.className = 'row';
      row.append(button('Tester ma manette', actions.testPad), button('Retour au match (Échap)', actions.back));
      card.append(row);
      open();
    },
    showCard(lesson, source) {
      card.innerHTML =
        `<h1>${escapeHtml(lesson.title)}</h1>` +
        `<p class="muted">Boutons : ${formatButtons(lesson.buttons, source)}</p>` +
        `<h2>Quand</h2><p style="margin:0">${formatButtons(lesson.when, source)}</p>` +
        `<h2>Comment</h2><ul>${lesson.how.map((line) => `<li>${formatButtons(line, source)}</li>`).join('')}</ul>` +
        `<p class="muted">D’abord une démo au ralenti, puis tu essaies avec de l’aide, puis seul : ${lesson.goal} réussites pour valider.</p>`;
      const row = document.createElement('div');
      row.className = 'row';
      row.append(button('Retour (Échap)', actions.back), button(formatButtons('Voir la démo {normal}', source), actions.confirm, true));
      card.append(row);
      open();
    },
    showDone(lesson, stars, perfects, hasNext, source) {
      card.innerHTML =
        `<h1>${escapeHtml(lesson.title)} : réussie !</h1>` +
        `<p style="font-size:26px;margin:6px 0" class="stars">${starsText(stars)}</p>` +
        `<p>${perfects} frappe${perfects > 1 ? 's' : ''} parfaite${perfects > 1 ? 's' : ''}.` +
        (stars < 2 ? ' Deuxième étoile : réussis la leçon avec au moins 3 frappes parfaites.' : '') +
        '</p>';
      const row = document.createElement('div');
      row.className = 'row';
      row.append(button('Liste des leçons (Échap)', actions.back));
      row.append(button(formatButtons(hasNext ? 'Leçon suivante {normal}' : 'Liste des leçons {normal}', source), actions.confirm, true));
      card.append(row);
      open();
    },
    hideOverlay() {
      overlay.style.display = 'none';
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    setStatus(html) {
      status.style.display = html ? '' : 'none';
      set(status, html ?? '');
    },
    setInstruction(value, source) {
      set(instruction, value ? formatButtons(value, source) : '');
    },
    setMessage(value, tone, source) {
      message.style.color = TONES[tone];
      set(message, value ? formatButtons(value, source) : '');
    },
    setPrompt(value, source) {
      set(prompt, value ? formatButtons(value, source) : '');
    },
  };
}
