import './annexes.css';
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

/** Une étoile à cinq branches, dessinée (couleur dans `annexes.css`). */
const STAR = '<path d="M12 1.5l3.1 7.2 7.8.7-5.9 5.2 1.8 7.6L12 18.2l-6.8 4 1.8-7.6L1.1 9.4l7.8-.7z"/>';
/** Les deux étoiles d'une leçon : pleines si gagnées, éteintes sinon ; le nombre est dit en toutes lettres. */
const starsHtml = (stars: number, className: string): string =>
  `<span class="${className}" role="img" aria-label="${stars} étoile${stars > 1 ? 's' : ''} sur 2">` +
  [0, 1].map((n) => `<svg class="star${n < stars ? ' is-won' : ''}" viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg>`).join('') +
  '</span>';

export interface TutorialPanelActions {
  pick(index: number): void;
  testPad(): void;
  /** Bouton principal d'une carte (« Commencer », « Leçon suivante »). */
  confirm(): void;
  /** Retour à la liste, ou à l'accueil depuis la liste. */
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

/** Interface du tutoriel : liste des leçons, carte d'une leçon, bandeau, consignes et verdicts (`annexes.css`). */
export function createTutorialPanel(actions: TutorialPanelActions): TutorialPanel {
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  const card = document.createElement('div');
  card.className = 'card';
  overlay.append(card);

  const text = (id: string): HTMLDivElement => {
    const div = document.createElement('div');
    div.id = id;
    div.className = 'tutorial-text';
    document.body.append(div);
    return div;
  };
  const status = text('tutorial-status');
  const instruction = text('tutorial-instruction');
  const message = text('tutorial-message');
  const prompt = text('tutorial-prompt');
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
          starsHtml(progress[lesson.id] ?? 0, 'stars');
        b.addEventListener('click', () => actions.pick(i));
        card.append(b);
      });
      const row = document.createElement('div');
      row.className = 'row';
      row.append(button('Tester ma manette', actions.testPad), button('Retour à l’accueil (Échap)', actions.back));
      card.append(row);
      open();
    },
    showCard(lesson, source) {
      card.innerHTML =
        `<h1>${escapeHtml(lesson.title)}</h1>` +
        `<p class="muted">${source.kind === 'keyboard' ? 'Touches' : 'Boutons'} : ${formatButtons(lesson.buttons, source)}</p>` +
        `<h2>Quand</h2><p class="when">${formatButtons(lesson.when, source)}</p>` +
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
        `<p>${starsHtml(stars, 'stars stars-big')}</p>` +
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
      message.dataset.tone = tone;
      set(message, value ? formatButtons(value, source) : '');
    },
    setPrompt(value, source) {
      set(prompt, value ? formatButtons(value, source) : '');
    },
  };
}
