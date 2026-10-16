import { SIM_DT } from '../sim/constants';
import type { AssistLevel, Duel, PointReason } from '../sim/duel';

export interface DuelHud {
  /** `sources` : d'où viennent les commandes de chaque joueur (« Manette 1 », « Clavier »…). */
  update(duel: Duel, sources: readonly [string, string]): void;
}

const NAMES = ['Bleu', 'Rouge'] as const;
/** Durée d'affichage du retour « parfait ! » / « trop tard ! » (s). */
const FEEDBACK_TIME = 0.9;

const ASSIST_LABELS: Record<AssistLevel, string> = {
  full: 'course assistée',
  partial: 'assistance partielle',
  off: 'placement manuel',
};

const REASONS: Record<PointReason, string> = {
  net: 'filet',
  'own-ground': 'la balle n’a pas passé le filet',
  'own-mesh': 'propre grillage',
  'opponent-wall': 'mur adverse avant le rebond',
  out: 'sortie',
  'second-bounce': 'deuxième rebond',
  'not-returned': 'balle non renvoyée',
};

function element(id: string, css: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText =
    'position:fixed;color:#f2f5f7;font:15px/1.4 system-ui,sans-serif;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.85);pointer-events:none;' +
    css;
  document.body.append(div);
  return div;
}

export function createDuelHud(): DuelHud {
  const rally = element('rally', 'top:14px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:600;text-align:center');
  const message = element('point', 'top:16%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:600');
  const feedback = element('feedback', 'top:24%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:700');
  const players = element('players', 'bottom:14px;left:18px;font-size:13px');
  const help = element('help', 'bottom:14px;right:18px;font-size:13px;text-align:right;color:#c9d3db');
  help.innerHTML =
    'A coup normal · X coupé · Y lob : maintiens, relâche quand l’anneau se referme<br>' +
    'Stick : se placer, puis viser au moment de l’impact (haut = profond)<br>' +
    'Clavier : ZQSD + J K L (bleu), flèches + 1 2 3 du pavé ou , ; : (rouge)<br>' +
    'Assistance : bouton Affichage, U (bleu) ou 0 du pavé (rouge)';

  return {
    update(duel: Duel, sources: readonly [string, string]): void {
      rally.innerHTML =
        `Échange : ${duel.hits} coup${duel.hits > 1 ? 's' : ''}<br>` +
        `<span style="font-size:13px;font-weight:400">Record : ${duel.bestRally}</span>`;
      players.innerHTML = sources
        .map(
          (source, i) =>
            `<span style="color:${i === 0 ? '#6fb2ff' : '#ff8a94'}">●</span> ${NAMES[i]} : ${source} · ` +
            ASSIST_LABELS[duel.players[i]!.assist],
        )
        .join('<br>');

      // Retour sur la dernière frappe ou le dernier coup raté, pendant un court instant.
      const recent = (tick: number): boolean => (duel.tick - tick) * SIM_DT < FEEDBACK_TIME;
      const notes = duel.players.map((player, i) => {
        if (recent(player.lastWhiffTick)) return `<span style="color:#ffb35c">${NAMES[i]} : trop tard !</span>`;
        if (player.lastHit?.perfect && recent(player.lastHitTick)) return `<span style="color:#fff">${NAMES[i]} : parfait !</span>`;
        return '';
      });
      feedback.innerHTML = notes.filter(Boolean).join('<br>');

      if (duel.phase === 'serve') {
        message.style.color = '#f2f5f7';
        message.textContent = `${NAMES[duel.server]} au service : appuie sur A`;
      } else if (duel.phase === 'dead' && duel.lastResult) {
        const { winner, reason, hits } = duel.lastResult;
        message.style.color = winner === 0 ? '#8cc4ff' : '#ff9aa3';
        message.textContent = `Point ${NAMES[winner]} : ${REASONS[reason]} (${hits} coups)`;
      } else {
        message.textContent = '';
      }
    },
  };
}
