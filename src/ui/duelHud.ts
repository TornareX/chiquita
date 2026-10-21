import './hud.css';
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

/** Classe de couleur de chaque équipe (`hud.css`). */
const TEAM_CLASSES = ['blue', 'red'] as const;
/** Pastille ou nom d'un joueur, à la couleur de sa place (l'équipe, plus claire pour le partenaire). */
const playerColor = (index: number, html: string): string => `<span class="player-color" data-player="${index}">${html}</span>`;

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
  if (shot.style === 'punch') return 'volée de définition !';
  if (shot.style === 'cut') return shot.perfect ? 'volée coupée parfaite !' : 'volée coupée';
  if (shot.style === 'low') return 'volée basse';
  if (shot.style === 'chiquita') return 'chiquita';
  if (shot.style === 'block') return 'bloquée';
  return shot.perfect ? 'parfait !' : null;
}

/** Un texte du HUD : son apparence est dans `hud.css`, sous son `id` et ses classes. */
function element(id: string, classes = ''): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.className = `hud-text ${classes}`.trim();
  document.body.append(div);
  return div;
}

/** Contenu écrit dans chaque élément, pour ne toucher au DOM que s'il change (pas de mise en page à chaque image). */
const written = new WeakMap<HTMLElement, string>();
function setHtml(target: HTMLElement, html: string): boolean {
  if (written.get(target) === html) return false;
  written.set(target, html);
  target.innerHTML = html;
  return true;
}

/** Losange du service et des repères (`hud.css`). */
const DIAMOND = '<span class="hud-diamond"></span>';

/** Annonce : trois mots au plus, puis la raison, plus petite, et une consigne éventuelle. */
const callout = (main: string, sub = '', again = ''): string =>
  `<div class="call-main">${main}</div>` +
  (sub ? `<div class="call-sub">${sub}</div>` : '') +
  (again ? `<div class="call-again">${again}</div>` : '');

/** Arrivée d'une annonce : elle claque sur sa plaque en ~120 ms, avec un léger dépassement (sauf mouvement réduit). */
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
function slam(target: HTMLElement): void {
  if (reducedMotion?.matches || !target.animate) return;
  target.animate(
    [
      { scale: '1.35', opacity: 0 },
      { scale: '0.96', opacity: 1, offset: 0.75 },
      { scale: '1', opacity: 1 },
    ],
    { duration: 160, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
  );
}

export function createDuelHud(): DuelHud {
  const score = element('score', 'hud-centered');
  const rally = element('rally', 'hud-centered');
  // Annonces au centre du haut, au-dessus du mur du fond : jamais sur le court.
  const message = element('point', 'hud-centered');
  const feedback = element('feedback', 'hud-centered');
  // En haut à gauche : qui joue avec quoi, entre les points seulement (en mode détaillé, tout le temps).
  const players = element('players');
  const help = element('help');
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
      // Match terminé : seuls restent les sets.
      const over = duel.phase === 'over';
      score.style.display = match ? '' : 'none';
      rally.dataset.mode = match ? 'match' : 'free';
      if (match) {
        // Bleu à gauche, Rouge à droite, quel que soit le côté de la caméra ; jeux puis points vers le filet.
        const labels = match.pointLabels();
        const team = (i: 0 | 1): string => {
          const serving = !over && match.server === i ? ' is-serving' : '';
          const label = `<span class="score-name">${teamName(i, doubles)}</span>`;
          return `<div class="score-team ${TEAM_CLASSES[i]}${serving}">${i === 0 ? DIAMOND + label : label + DIAMOND}</div>`;
        };
        const games = (i: 0 | 1): string => `<div class="score-games">${match.games[i]}</div>`;
        const points = (i: 0 | 1): string => `<div class="score-points">${labels[i]}</div>`;
        const board = `<div class="score-board">${team(0)}${games(0)}${points(0)}<div class="score-net"></div>${points(1)}${games(1)}${team(1)}</div>`;
        // Bande : sets terminés (Bleu-Rouge, dans l'ordre du tableau) et appel du point (punto de oro…).
        const sets = match.sets.map((set, k) => `<span class="score-set">Set ${k + 1}<b>${set[0]}-${set[1]}</b></span>`).join('');
        const call = over ? null : match.call();
        setHtml(score, `${board}<div class="score-strip">${sets}${call ? `<span class="score-call">${call}</span>` : ''}</div>`);
        score.toggleAttribute('data-over', over);
        setHtml(rally, duel.hits > 1 && !over ? `${duel.hits} coups` : '');
      } else {
        setHtml(rally, `Échange : ${duel.hits} coup${duel.hits > 1 ? 's' : ''}<span class="hud-record">Record : ${duel.bestRally}</span>`);
      }
      players.style.opacity = detailed || duel.phase !== 'rally' ? '1' : '0';
      setHtml(
        players,
        sources
          .slice(0, duel.players.length)
          .map(
            (source, i) =>
              `<div class="players-row" data-player="${i}">${DIAMOND}<span><b>${name(i)}</b> : ${source} · ${ASSIST_LABELS[duel.players[i]!.assist]}</span></div>`,
          )
          .join(''),
      );

      // Retour sur la dernière frappe ou le dernier coup raté, pendant un court instant. Épuré : une seule ligne,
      // la frappe marquante la plus récente, qui s'efface en fondu.
      const recent = (tick: number): boolean => (duel.tick - tick) * SIM_DT < FEEDBACK_TIME;
      const notes = duel.players.map((player, i) => {
        if (detailed && recent(player.lastWhiffTick)) return { tick: player.lastWhiffTick, html: `<span class="tone-off">${name(i)} : dans le vide !</span>` };
        const label = player.lastHit && recent(player.lastHitTick) ? shotLabel(player.lastHit, detailed) : null;
        if (label) return { tick: player.lastHitTick, html: `${playerColor(i, name(i))} ${label}` };
        return null;
      });
      const shown = notes.filter((n) => n !== null).sort((a, b) => b.tick - a.tick);
      const lines = (detailed ? shown : shown.slice(0, 1)).map((n) => n.html).join('<br>');
      // Le texte reste pendant le fondu.
      if (lines && setHtml(feedback, lines)) slam(feedback);
      feedback.style.opacity = lines ? '1' : '0';

      const call = duel.lastServeCall;
      let tone = '';
      let html = '';
      if (duel.phase === 'serve') {
        const server = buttons[duel.server] ?? main;
        const how = buttonsEnabled() ? `maintiens ${buttonIcon('normal', server)}` : formatButtons('tire le stick droit vers toi', server);
        // Le losange du tableau marque aussi l'équipe au service : l'annonce lui sert de légende.
        html = callout(`${DIAMOND}${duel.serveNumber === 2 ? '2e service' : 'Service'} ${name(duel.server)}`, how);
      } else if (duel.phase === 'dead' && call) {
        tone = 'call';
        html = call.call === 'let' ? callout('Let', 'Service à rejouer') : callout('Faute', SERVE_FAULTS[call.reason!]);
      } else if (duel.phase === 'dead' && duel.lastResult) {
        const { winner, reason, hits } = duel.lastResult;
        const outcome = duel.lastOutcome;
        const won = outcome?.set ? 'Set' : outcome?.game ? 'Jeu' : 'Point';
        tone = TEAM_CLASSES[winner];
        html = callout(`${won} ${teamName(winner, doubles)}`, `${REASONS[reason]} · ${hits} coup${hits > 1 ? 's' : ''}`);
      } else if (duel.phase === 'rally' && duel.exit) {
        // Balle sortie après son rebond : encore jouable dehors, jusqu'à ce qu'elle touche le sol.
        const side = duel.exit.wall === 'sidePosX' || duel.exit.wall === 'sideNegX';
        tone = 'call';
        html = callout(side ? 'Por tres !' : 'Por cuatro !', 'À rattraper dehors');
      } else if (duel.phase === 'over' && duel.match?.winner != null) {
        const winner = duel.match.winner;
        const sets = duel.match.sets.map((set) => `${set[winner]}-${set[winner === 0 ? 1 : 0]}`).join(' ');
        tone = TEAM_CLASSES[winner];
        html = callout(`${teamName(winner, doubles)} ${doubles ? 'gagnent' : 'gagne'}`, `Match ${sets}`, 'Appuie sur un bouton de coup pour rejouer');
      }
      message.dataset.tone = tone;
      if (setHtml(message, html) && html) slam(message);
      message.style.display = html ? '' : 'none';
      // Pendant une annonce (por tres en plein échange), le compteur d'échange se cache dessous.
      rally.style.visibility = html && match ? 'hidden' : '';
    },
  };
}
