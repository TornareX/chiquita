import type { Duel, FaultCause, PlayerStats } from '../sim/duel';
import { playerName } from './duelSettings';

/**
 * Carnet de fin de match (chantier « j'ai mieux joué donc j'ai gagné ») : pour chaque humain, trois chiffres qui
 * viennent de ses gestes (frappes parfaites, coups gagnants, fautes directes) comparés à sa moyenne des derniers
 * matchs, sa faute la plus fréquente et un seul conseil pour la corriger. Dessous, la série de revanches.
 */
export interface MatchReport {
  /** `players` : les humains de cet écran, avec ce qui les identifie d'un match à l'autre (manette, clavier). */
  update(duel: Duel, players: readonly { index: number; controller: string }[]): void;
}

/** Une ligne d'historique : le bilan d'un match. */
interface Entry {
  perfect: number;
  winners: number;
  errors: number;
}

const HISTORY_KEY = 'padel-smash.carnet';
/** Matchs gardés pour la moyenne. */
const HISTORY_SIZE = 10;

type History = Record<string, Entry[]>;

function readHistory(): History {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null') as { players?: History } | null;
    return raw?.players && typeof raw.players === 'object' ? raw.players : {};
  } catch {
    return {};
  }
}

function writeHistory(history: History): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, players: history }));
  } catch {
    // Stockage indisponible : la moyenne repart de zéro à la prochaine page.
  }
}

/** Ce qui coûte des points, de la faute la plus précise à la plus vague, pour départager deux causes à égalité. */
const CAUSES: readonly FaultCause[] = ['retard', 'avance', 'pasPrepare', 'malPlace', 'haute', 'basse', 'vide', 'service', 'pression', 'propre', 'parfait'];

export const CAUSE_TEXT: Record<FaultCause, string> = {
  retard: 'en retard',
  avance: 'en avance',
  pasPrepare: 'pas préparé',
  malPlace: 'mal placé',
  haute: 'prise trop haute',
  basse: 'prise trop basse',
  vide: 'dans le vide',
  service: 'double faute',
  pression: 'sous pression',
  propre: 'coup trop risqué',
  parfait: 'coup trop risqué',
};

/** Un conseil par cause, à faire au prochain match. */
export const TIPS: Record<FaultCause, string> = {
  retard: 'Tu relâches trop tard : finis ton geste juste avant que la balle arrive à ta hauteur.',
  avance: 'Tu relâches trop tôt : laisse la balle venir à ta hauteur avant de lâcher le stick.',
  pasPrepare: 'Tire le stick droit vers toi dès que la balle part vers toi : un coup préparé part plus fort et plus précis.',
  malPlace: 'Place-toi pour prendre la balle à côté de toi, à bout de bras : ni dans le corps, ni trop loin.',
  haute: 'Bandeja et víbora prises trop haut : laisse la balle redescendre juste au-dessus de ta tête.',
  basse: 'Bandeja et víbora prises trop bas : frappe-les plus tôt, quand la balle est encore au-dessus de ta tête.',
  vide: 'Tes coups dans le vide coûtent des points : attends que la balle soit à portée avant de relâcher.',
  service: 'Tes doubles fautes coûtent des points : au second service, joue sûr.',
  pression: 'Sur une balle rouge, ne cherche pas le coup gagnant : remets-la bas, au centre, et replace-toi.',
  propre: 'Tes fautes partent sur des coups bien frappés : garde de la marge, loin des lignes et au-dessus du filet.',
  parfait: 'Tes fautes partent sur des coups bien frappés : garde de la marge, loin des lignes et au-dessus du filet.',
};

/** La cause qui a coûté le plus de points, ou `null` sans aucune faute. */
export function dominantCause(stats: PlayerStats): FaultCause | null {
  let best: FaultCause | null = null;
  for (const cause of CAUSES) {
    const count = stats.faults[cause] ?? 0;
    if (count > 0 && (best === null || count > (stats.faults[best] ?? 0))) best = cause;
  }
  return best;
}

export function entryOf(stats: PlayerStats): Entry {
  return { perfect: stats.shots ? stats.perfects / stats.shots : 0, winners: stats.winners, errors: stats.errors };
}

const mean = (entries: readonly Entry[], key: keyof Entry): number => entries.reduce((sum, e) => sum + e[key], 0) / entries.length;

/**
 * Un chiffre et sa comparaison à la moyenne d'avant : flèche verte quand c'est mieux (plus haut, ou plus bas pour les
 * fautes), rouge quand c'est moins bien ; rien au premier match.
 */
function stat(label: string, value: number, before: number | null, format: (n: number) => string, lowerIsBetter = false): string {
  let trend = '';
  if (before !== null) {
    const delta = value - before;
    const same = Math.abs(delta) < (format === percent ? 0.005 : 0.5);
    const better = lowerIsBetter ? delta < 0 : delta > 0;
    const arrow = same ? '=' : delta > 0 ? '▲' : '▼';
    trend = `<span class="carnet-trend ${same ? '' : better ? 'tone-good' : 'tone-off'}">${arrow} moy. ${format(before)}</span>`;
  }
  return `<div class="carnet-stat"><span class="carnet-label">${label}</span><b>${format(value)}</b>${trend}</div>`;
}

const percent = (n: number): string => `${Math.round(n * 100)} %`;
const count = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

function element(): HTMLDivElement {
  const div = document.createElement('div');
  div.id = 'carnet';
  div.hidden = true;
  document.body.append(div);
  return div;
}

export function createMatchReport(): MatchReport {
  const root = element();
  /** Pas où le match affiché s'est fini : on n'enregistre et ne compte chaque match qu'une fois. */
  let shownTick: number | null = null;
  /** Série de revanches sur cet écran : matchs gagnés par les bleus et par les rouges. */
  const series: [number, number] = [0, 0];

  return {
    update(duel, players) {
      const winner = duel.match?.winner;
      if (duel.phase !== 'over' || winner == null) {
        root.hidden = true;
        shownTick = null;
        return;
      }
      if (shownTick === duel.phaseTick) return;
      shownTick = duel.phaseTick;
      series[winner]++;
      const history = readHistory();
      const doubles = duel.doubles;
      const columns = players.map(({ index, controller }) => {
        const stats = duel.stats[index]!;
        const past = history[controller] ?? [];
        const entry = entryOf(stats);
        const avg = (key: keyof Entry): number | null => (past.length ? mean(past, key) : null);
        history[controller] = [...past, entry].slice(-HISTORY_SIZE);
        const cause = dominantCause(stats);
        const title = players.length === 1 ? 'Ton match' : playerName(index, doubles);
        const work = cause ? `<div class="carnet-work">À travailler : <b>${CAUSE_TEXT[cause]}</b> ×${stats.faults[cause]}</div>` : '';
        return (
          `<div class="carnet-player" data-player="${index}"><div class="carnet-title">${title}</div>` +
          stat('Frappes parfaites', entry.perfect, avg('perfect'), percent) +
          stat('Coups gagnants', entry.winners, avg('winners'), count) +
          stat('Fautes directes', entry.errors, avg('errors'), count, true) +
          work +
          `<div class="carnet-tip">${cause ? TIPS[cause] : 'Aucune faute qui revient : cherche maintenant plus de frappes parfaites.'}</div></div>`
        );
      });
      writeHistory(history);
      const names = doubles ? ['Bleus', 'Rouges'] : ['Bleu', 'Rouge'];
      const played = series[0] + series[1];
      const seriesLine = played > 1 ? `<div class="carnet-series">Série : ${names[0]} <b>${series[0]} – ${series[1]}</b> ${names[1]}</div>` : '';
      root.innerHTML = `<div class="carnet-players">${columns.join('')}</div>${seriesLine}`;
      root.hidden = columns.length === 0 && !seriesLine;
    },
  };
}
