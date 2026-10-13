import type { Shot, SwingMiss } from '../sim/racket';
import { averageQuality, successRate, type BallResult } from '../sim/rules';
import type { World } from '../sim/world';

export interface Hud {
  /** À appeler à chaque image. `active` : la souris est capturée et le joueur a la main. */
  update(world: World, active: boolean, reviewing: boolean): void;
  showResult(result: BallResult): void;
  showShot(shot: Shot): void;
  /** Swing dans le vide : dit pourquoi la balle n'a pas été touchée. */
  showMiss(reason: SwingMiss): void;
}

const RESULT_LABELS = {
  valid: 'Valide',
  net: 'Faute : filet',
  'own-ground': 'Faute : la balle n’a pas passé le filet',
  'own-mesh': 'Faute : propre grillage',
  'opponent-wall': 'Faute : mur adverse avant le rebond',
  out: 'Faute : sortie',
  'double-hit': 'Faute : double frappe',
  'second-bounce': 'Ratée : deuxième rebond',
  'not-touched': 'Ratée : balle non touchée',
} as const;

const MISS_LABELS: Record<SwingMiss, string> = {
  early: 'Trop tôt',
  late: 'Trop tard',
  far: 'Trop loin de la balle',
  close: 'Trop près de la balle',
  high: 'Balle trop haute',
  low: 'Balle trop basse',
};

export function resultLabel(result: BallResult): string {
  return RESULT_LABELS[result.kind === 'valid' ? 'valid' : result.reason];
}

const percent = (value: number): string => `${Math.round(value * 100)} %`;

function element(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  document.body.append(div);
  return div;
}

/** Affiche un message, puis le laisse s'effacer (voir la classe `.flash` dans index.html). */
function flash(target: HTMLElement, text: string, kind: string): void {
  target.textContent = text;
  target.dataset.kind = kind;
  target.classList.remove('flash');
  // Force le navigateur à relancer l'animation.
  void target.offsetWidth;
  target.classList.add('flash');
}

export function createHud(): Hud {
  const prompt = element('start-prompt');
  prompt.innerHTML =
    '<strong>Cliquer pour jouer</strong>' +
    '<span>ZQSD : se déplacer · Souris : regarder · Espace : split-step</span>' +
    '<span>Clic gauche maintenu : préparer, relâcher : frapper · Clic droit : coup de toucher</span>' +
    '<span>1 à 6 : exercice · P : pause · R : rejouer la balle · V : revoir le point</span>' +
    '<span>Échap : libérer la souris et ouvrir les réglages</span>';
  const stats = element('stats');
  const result = element('result');
  const contact = element('contact');
  const pause = element('pause');
  // Repère au centre de l'écran : il s'allume quand la balle est dans la zone de frappe.
  const reach = element('reach');
  pause.textContent = 'Pause';

  return {
    update(world: World, active: boolean, reviewing: boolean): void {
      prompt.hidden = active;
      pause.hidden = !world.paused;
      reach.hidden = reviewing;
      reach.classList.toggle('on', world.inReach);
      pause.textContent = reviewing ? 'Revue du point · ZQSD et souris : caméra libre · V : reprendre' : 'Pause';
      pause.classList.toggle('review', reviewing);
      const exercise = world.machine?.exercise;
      if (!exercise) {
        stats.textContent = '';
        return;
      }
      const { balls, valid } = world.stats;
      const rate = successRate(world.stats);
      const quality = averageQuality(world.stats);
      stats.textContent =
        `${exercise.name} · ${valid}/${balls} valides` +
        (rate === null ? '' : ` (${percent(rate)})`) +
        (quality === null ? '' : ` · contact moyen ${percent(quality)}`);
    },
    showResult(value: BallResult): void {
      flash(result, resultLabel(value), value.kind);
    },
    showMiss(reason: SwingMiss): void {
      flash(contact, MISS_LABELS[reason], 'miss');
    },
    showShot(shot: Shot): void {
      flash(contact, shot.perfect ? 'Parfait' : `Contact ${percent(shot.quality)}`, shot.perfect ? 'perfect' : 'normal');
    },
  };
}
