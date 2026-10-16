import { SIM_DT } from '../sim/constants';
import type { AssistLevel, Duel, PointReason, ServeFault } from '../sim/duel';

export interface DuelHud {
  /** `sources` : d'où viennent les commandes de chaque joueur (« Manette 1 », « Clavier »…). */
  update(duel: Duel, sources: readonly [string, string]): void;
}

const NAMES = ['Bleu', 'Rouge'] as const;
/** Durée d'affichage du retour « parfait ! » / « trop tard ! » (s). */
const FEEDBACK_TIME = 0.9;

const ASSIST_LABELS: Record<AssistLevel, string> = {
  magnet: 'aimant',
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
  'double-fault': 'double faute',
};

const SERVE_FAULTS: Record<ServeFault, string> = {
  late: 'balle pas frappée',
  net: 'filet',
  box: 'hors du carré',
  wall: 'vitre ou grillage',
};

const COLORS = ['#8cc4ff', '#ff9aa3'] as const;

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
  const score = element(
    'score',
    'top:12px;left:16px;font-size:17px;font-weight:600;background:rgba(10,16,24,.55);' +
      'padding:6px 10px;border-radius:6px;font-variant-numeric:tabular-nums',
  );
  const message = element('point', 'top:16%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:600');
  const feedback = element('feedback', 'top:24%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:700');
  const players = element('players', 'bottom:14px;left:18px;font-size:13px');
  const help = element('help', 'bottom:14px;right:18px;font-size:13px;text-align:right;color:#c9d3db');
  help.innerHTML =
    'A coup normal · X coupé · Y lob : maintiens, relâche quand l’anneau se referme<br>' +
    'Service : maintiens pour lâcher la balle, relâche au sommet du rebond<br>' +
    'Stick : se placer, puis viser au moment de l’impact (haut = profond)<br>' +
    'Clavier : ZQSD + J K L (bleu), flèches + 1 2 3 du pavé ou , ; : (rouge)<br>' +
    'Assistance : bouton Affichage, U (bleu) ou 0 du pavé (rouge)';

  return {
    update(duel: Duel, sources: readonly [string, string]): void {
      const match = duel.match;
      score.style.display = match ? '' : 'none';
      if (match) {
        // Une ligne par joueur : balle de service, nom, sets terminés, jeux, points.
        const labels = match.pointLabels();
        // Match terminé : seuls restent les sets.
        const over = duel.phase === 'over';
        const rows = ([0, 1] as const).map((i) => {
          const serving = duel.phase !== 'over' && match.server === i ? '●' : '&nbsp;';
          const sets = match.sets.map((set) => `<td style="padding:0 6px;opacity:.75">${set[i]}</td>`).join('');
          return (
            `<tr><td style="color:#ffe27a;width:14px">${serving}</td>` +
            `<td style="color:${COLORS[i]};padding-right:10px">${NAMES[i]}</td>${sets}` +
            (over
              ? ''
              : `<td style="padding:0 6px">${match.games[i]}</td>` +
                `<td style="padding-left:8px;min-width:30px;text-align:right">${labels[i]}</td>`) +
            '</tr>'
          );
        });
        const call = match.call();
        score.innerHTML =
          `<table style="border-collapse:collapse">${rows.join('')}</table>` +
          (call ? `<div style="font-size:13px;color:#ffe27a;margin-top:3px">${call}</div>` : '');
        rally.innerHTML = duel.hits > 1 && !over ? `<span style="font-size:15px">Échange : ${duel.hits} coups</span>` : '';
      } else {
        rally.innerHTML =
          `Échange : ${duel.hits} coup${duel.hits > 1 ? 's' : ''}<br>` +
          `<span style="font-size:13px;font-weight:400">Record : ${duel.bestRally}</span>`;
      }
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
        if (recent(player.lastWhiffTick)) return `<span style="color:#ffb35c">${NAMES[i]} : dans le vide !</span>`;
        if (player.lastHit?.perfect && recent(player.lastHitTick)) return `<span style="color:#fff">${NAMES[i]} : parfait !</span>`;
        return '';
      });
      feedback.innerHTML = notes.filter(Boolean).join('<br>');

      const call = duel.lastServeCall;
      if (duel.phase === 'serve') {
        message.style.color = '#f2f5f7';
        const second = duel.serveNumber === 2 ? ' (second service)' : '';
        message.textContent = `${NAMES[duel.server]} au service${second} : maintiens A`;
      } else if (duel.phase === 'dead' && call) {
        message.style.color = '#ffe27a';
        message.textContent = call.call === 'let' ? 'Let : service à rejouer' : `Faute : ${SERVE_FAULTS[call.reason!]}`;
      } else if (duel.phase === 'dead' && duel.lastResult) {
        const { winner, reason, hits } = duel.lastResult;
        const outcome = duel.lastOutcome;
        const won = outcome?.set ? ` · set ${NAMES[winner]}` : outcome?.game ? ` · jeu ${NAMES[winner]}` : '';
        message.style.color = COLORS[winner];
        message.textContent = `Point ${NAMES[winner]} : ${REASONS[reason]} (${hits} coups)${won}`;
      } else if (duel.phase === 'over' && duel.match?.winner != null) {
        const winner = duel.match.winner;
        const sets = duel.match.sets.map((set) => `${set[winner]}-${set[winner === 0 ? 1 : 0]}`).join(' ');
        message.style.color = COLORS[winner];
        message.innerHTML =
          `${NAMES[winner]} gagne le match ${sets}<br>` +
          '<span style="font-size:15px;color:#f2f5f7">Appuie sur un bouton de coup pour rejouer</span>';
      } else {
        message.textContent = '';
      }
    },
  };
}
