import { buttonsEnabled } from '../input/gamepad';
import type { OverheadKind } from '../sim/commands';
import { SIM_DT } from '../sim/constants';
import type { AssistLevel, Duel, DuelShot, PointReason, ServeFault } from '../sim/duel';
import { buttonIcon, formatButtons, sourceKey, type InputSource } from './buttonIcons';
import { playerName } from './duelSettings';

export interface DuelHud {
  /**
   * `sources` : d'où viennent les commandes de chaque joueur (« Manette 1 », « Clavier »…) ;
   * `buttons` : manette ou clavier de chaque joueur humain (`null` pour une IA), pour afficher ses symboles
   * dans l'aide (celle du premier humain) et les consignes (celle du joueur concerné).
   * `detailed` : pour le labo et les tests, l'aide aux coups en bas à droite et le nom de chaque frappe. Sinon,
   * le match reste épuré : seuls les coups marquants (frappe parfaite, salida de pista) sont annoncés.
   */
  update(duel: Duel, sources: readonly string[], buttons?: readonly (InputSource | null)[], detailed?: boolean): void;
}

/** Nom d'une équipe : le joueur en simple, la paire en double. */
const teamName = (team: 0 | 1, doubles: boolean): string => (doubles ? ['Bleus', 'Rouges'] : ['Bleu', 'Rouge'])[team]!;
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
  'por-tres': 'por tres, sortie par le côté',
  'por-cuatro': 'por cuatro, sortie par le fond',
};

const SERVE_FAULTS: Record<ServeFault, string> = {
  late: 'balle pas frappée',
  net: 'filet',
  box: 'hors du carré',
  wall: 'vitre ou grillage',
};

const COLORS = ['#8cc4ff', '#ff9aa3'] as const;
/** Fond des annonces au centre : lisibles sur le terrain comme sur les bandeaux. */
const PILL = 'background:rgba(10,16,24,.6);padding:4px 14px;border-radius:8px;white-space:nowrap;';
/** Couleur des pastilles de joueur : celle de l'équipe, plus claire pour le partenaire (joueurs 2 et 3). */
const DOTS = ['#6fb2ff', '#ff8a94', '#b5d8ff', '#ffc2c8'] as const;

/** Aide en bas à droite, tout aux sticks (les boutons sont cachés). */
const STICK_HELP = [
  'Stick gauche : se placer, puis viser au moment de la frappe (haut = profond)',
  'Stick droit tiré vers toi : préparer (plus tu as le temps, plus le coup est fort et précis)',
  'Puis tout droit : coup normal · en arc : lob · lâché : chiquita',
  'De volée : préparé = volée coupée · coup sec vers l’avant sans préparer = volée bloquée',
  'Au-dessus de la tête : tout droit = smash · en arc = víbora · lâché = feinte · coup sec = bandeja',
  'Balle qui file vers ta vitre (repère sur la vitre) : stick droit en avant, puis vers toi = contre-vitre',
  'Service : tire le stick vers toi pour lâcher la balle, ramène-le tout droit au sommet du rebond',
  'Assistance : bouton Affichage · Réglages : Start',
];

/** La même aide au clavier : les jetons `{k:…}` deviennent les touches de son côté (`formatButtons`). */
function keyboardHelp(player: 0 | 1): string[] {
  return [
    '{k:move} : se placer, puis viser au moment de la frappe (haut = profond)',
    '{k:down} tenu : préparer (plus tu as le temps, plus le coup est fort et précis)',
    'Puis {k:up} : coup normal · par {k:sides}, puis {k:up} : lob · tout lâché : chiquita',
    'De volée : préparé = volée coupée · appui sec sur {k:up} sans préparer = volée bloquée',
    'Au-dessus de la tête : {k:up} = smash · par le côté = víbora · lâché = feinte · appui sec = bandeja',
    'Balle qui file vers ta vitre (repère sur la vitre) : {k:up}, puis {k:down} = contre-vitre',
    'Service : tiens {k:down} pour lâcher la balle, passe à {k:up} au sommet du rebond',
    ...(player === 0 ? ['Ou à la souris, clic gauche tenu : tirée vers toi pour préparer, poussée vers l’écran pour frapper'] : []),
    `Assistance : ${player === 0 ? 'U' : '0 du pavé'} · Réglages : Échap`,
  ];
}

/** Aide aux boutons (`?boutons=1`) : les jetons `{normal}`… deviennent les boutons de la manette ou du clavier du joueur. */
const HELP = [
  '{normal} coup normal · {slice} coupé · {lob} lob : maintiens, relâche quand l’anneau se referme',
  'Anneau vert : balle facile (lob, chiquita, attaque) · jaune : transition · rouge : balle dure, remets-la bas',
  '{slice} de volée sur une balle flottante : volée coupée qui meurt · {slice} stick vers soi : chiquita · appuie tôt pour armer, sinon tu bloques',
  '{overhead} balle haute : bandeja · stick sur le côté : víbora · stick en avant près du filet : remate',
  'Remate parfait près du filet : il peut sortir du terrain (por tres) ; sors par la porte pour la rattraper',
  'Balle passée qui file vers ta vitre (repère sur la vitre) : {normal} stick vers ta vitre = contre-vitre',
  'Service : maintiens pour lâcher la balle, relâche au sommet du rebond',
  'Stick : se placer, puis viser au moment de l’impact (haut = profond)',
  'Clavier : ZQSD + J K L, I (bleu) ; flèches + 1 2 3 4 du pavé, ou M , ; : en AZERTY (rouge)',
  'Assistance : bouton Affichage, U (bleu) ou 0 du pavé (rouge) · Réglages : Échap ou Start',
];

const OVERHEADS: Record<OverheadKind, string> = {
  feinte: 'feinte de smash',
  bandeja: 'bandeja',
  vibora: 'víbora',
  remate: 'smash',
  bajada: 'bajada',
};

/** Perte de contrôle à partir de laquelle le retour dit « trop tôt » ou « trop tard » (`DuelShot.miscue`). */
const MISCUE_SHOWN = 0.3;

/**
 * Nom du coup à afficher, ou `null` pour un coup ordinaire sans frappe parfaite. Hors mode détaillé, seuls les
 * coups marquants : en pleine volée-volée, un nom par frappe ferait défiler du texte au milieu du jeu.
 */
function shotLabel(shot: DuelShot, detailed: boolean): string | null {
  // La contre-vitre est toujours marquante : un sauvetage.
  if (shot.counterWall) return shot.perfect ? 'contre-vitre parfaite !' : 'contre-vitre !';
  // Balle lourde (smash bloqué) ou rouge, mal contrôlée : on dit pourquoi, c'est ce qui apprend le timing.
  if ((shot.miscue ?? 0) >= MISCUE_SHOWN) return `${shot.volley ? 'balle lourde' : 'balle rouge'} : trop ${shot.timing < 0 ? 'tôt' : 'tard'} !`;
  if (!detailed && !shot.perfect && !shot.outside) return null;
  if (shot.outside) return 'salida de pista !';
  if (shot.overhead) return OVERHEADS[shot.overhead] + (shot.perfect ? ' parfaite !' : '');
  if (shot.style === 'cut') return shot.perfect ? 'volée coupée parfaite !' : 'volée coupée';
  if (shot.style === 'chiquita') return 'chiquita';
  if (shot.style === 'block') return 'bloquée';
  return shot.perfect ? 'parfait !' : null;
}

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
  const message = element('point', `top:16%;left:50%;transform:translateX(-50%);font-size:22px;font-weight:600;text-align:center;${PILL}`);
  const feedback = element(
    'feedback',
    `top:26%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:700;text-align:center;transition:opacity .25s;${PILL}`,
  );
  // Sous le score : qui joue avec quoi, entre les points seulement (en mode détaillé, tout le temps).
  const players = element('players', 'left:16px;font-size:12px;color:#c9d3db;transition:opacity .3s');
  const help = element(
    'help',
    'bottom:14px;right:18px;font-size:12px;text-align:right;color:#c9d3db;max-width:min(680px,calc(100vw - 390px))',
  );
  let helpKey = '';

  return {
    update(duel: Duel, sources: readonly string[], buttons: readonly (InputSource | null)[] = [], detailed = false): void {
      const doubles = duel.doubles;
      const name = (index: number): string => playerName(index, doubles);
      const main: InputSource = buttons.find((b) => b !== null && b !== undefined) ?? { kind: 'keyboard', player: 0 };
      const key = sourceKey(main);
      if (key !== helpKey) {
        helpKey = key;
        const lines = buttonsEnabled() ? HELP : main.kind === 'keyboard' ? keyboardHelp(main.player) : STICK_HELP;
        help.innerHTML = lines.map((line) => formatButtons(line, main)).join('<br>');
      }
      help.style.display = detailed ? '' : 'none';
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
            `<td style="color:${COLORS[i]};padding-right:10px">${teamName(i, doubles)}</td>${sets}` +
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
      players.style.top = `${(match ? score.getBoundingClientRect().bottom : 4) + 8}px`;
      players.style.opacity = detailed || duel.phase !== 'rally' ? '1' : '0';
      players.innerHTML = sources
        .slice(0, duel.players.length)
        .map((source, i) => `<span style="color:${DOTS[i]}">●</span> ${name(i)} : ${source} · ` + ASSIST_LABELS[duel.players[i]!.assist])
        .join('<br>');

      // Retour sur la dernière frappe ou le dernier coup raté, pendant un court instant. Épuré : une seule ligne,
      // la frappe marquante la plus récente, qui s'efface en fondu.
      const recent = (tick: number): boolean => (duel.tick - tick) * SIM_DT < FEEDBACK_TIME;
      const notes = duel.players.map((player, i) => {
        if (detailed && recent(player.lastWhiffTick)) return { tick: player.lastWhiffTick, html: `<span style="color:#ffb35c">${name(i)} : dans le vide !</span>` };
        const label = player.lastHit && recent(player.lastHitTick) ? shotLabel(player.lastHit, detailed) : null;
        if (label) return { tick: player.lastHitTick, html: `<span style="color:${DOTS[i]}">${name(i)}</span> ${label}` };
        return null;
      });
      const shown = notes.filter((n) => n !== null).sort((a, b) => b.tick - a.tick);
      const lines = (detailed ? shown : shown.slice(0, 1)).map((n) => n.html).join('<br>');
      // Le texte reste pendant le fondu.
      if (lines) feedback.innerHTML = lines;
      feedback.style.opacity = lines ? '1' : '0';

      const call = duel.lastServeCall;
      if (duel.phase === 'serve') {
        message.style.color = '#f2f5f7';
        const second = duel.serveNumber === 2 ? ' (second service)' : '';
        const server = buttons[duel.server] ?? main;
        const how = buttonsEnabled() ? `maintiens ${buttonIcon('normal', server)}` : formatButtons('tire le stick droit vers toi', server);
        message.innerHTML = `${name(duel.server)} au service${second}<br><span style="font-size:13px;font-weight:400;color:#c9d3db">${how}</span>`;
      } else if (duel.phase === 'dead' && call) {
        message.style.color = '#ffe27a';
        message.textContent = call.call === 'let' ? 'Let : service à rejouer' : `Faute : ${SERVE_FAULTS[call.reason!]}`;
      } else if (duel.phase === 'dead' && duel.lastResult) {
        const { winner, reason, hits } = duel.lastResult;
        const outcome = duel.lastOutcome;
        const won = outcome?.set ? ` · set ${teamName(winner, doubles)}` : outcome?.game ? ` · jeu ${teamName(winner, doubles)}` : '';
        message.style.color = COLORS[winner];
        message.textContent = `Point ${teamName(winner, doubles)} : ${REASONS[reason]} (${hits} coups)${won}`;
      } else if (duel.phase === 'rally' && duel.exit) {
        // Balle sortie après son rebond : encore jouable dehors, jusqu'à ce qu'elle touche le sol.
        const side = duel.exit.wall === 'sidePosX' || duel.exit.wall === 'sideNegX';
        message.style.color = '#ffe27a';
        message.textContent = side ? 'Por tres !' : 'Por cuatro !';
      } else if (duel.phase === 'over' && duel.match?.winner != null) {
        const winner = duel.match.winner;
        const sets = duel.match.sets.map((set) => `${set[winner]}-${set[winner === 0 ? 1 : 0]}`).join(' ');
        message.style.color = COLORS[winner];
        message.innerHTML =
          `${teamName(winner, doubles)} ${doubles ? 'gagnent' : 'gagne'} le match ${sets}<br>` +
          '<span style="font-size:15px;color:#f2f5f7">Appuie sur un bouton de coup pour rejouer</span>';
      } else {
        message.textContent = '';
      }
      message.style.display = message.innerHTML ? '' : 'none';
    },
  };
}
