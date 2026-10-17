/**
 * Comptage d'un match de padel (règles FIP, GAME_DESIGN.md §7) : points comme au tennis, jeux,
 * sets, jeu décisif à 6-6, option punto de oro. Pur et déterministe, sans lien avec la physique.
 */

export interface MatchRules {
  /** Sets à gagner pour remporter le match (1 = un set, 2 = deux sets gagnants). */
  setsToWin: number;
  /** Jeux pour gagner un set (avec deux d'écart, jeu décisif à égalité à ce nombre). */
  gamesPerSet: number;
  /** Punto de oro : à 40-40, le point suivant gagne le jeu. */
  goldenPoint: boolean;
}

export const DEFAULT_RULES: MatchRules = { setsToWin: 1, gamesPerSet: 6, goldenPoint: false };

/** Côté d'où l'on sert : à droite sur un nombre pair de points joués dans le jeu, à gauche sinon. */
export type ServeSide = 'right' | 'left';

/** Ce qu'un point a terminé. */
export interface PointOutcome {
  game: boolean;
  set: boolean;
  match: boolean;
}

type Pair = [number, number];
const other = (player: 0 | 1): 0 | 1 => (player === 0 ? 1 : 0);
const TENNIS = ['0', '15', '30', '40'] as const;

export class Match {
  /** Sets terminés, dans l'ordre. */
  readonly sets: Pair[] = [];
  games: Pair = [0, 0];
  points: Pair = [0, 0];
  tiebreak = false;
  winner: 0 | 1 | null = null;
  /** Serveur du jeu en cours ; en jeu décisif, celui qui a servi le premier point. */
  gameServer: 0 | 1;
  /** Jeux terminés depuis le début du match, jeux décisifs compris. */
  private gamesPlayed = 0;

  constructor(
    readonly rules: MatchRules = DEFAULT_RULES,
    firstServer: 0 | 1 = 0,
  ) {
    this.gameServer = firstServer;
  }

  /** Serveur du point à jouer. En jeu décisif : un point, puis deux chacun à tour de rôle. */
  get server(): 0 | 1 {
    if (!this.tiebreak) return this.gameServer;
    const played = this.points[0] + this.points[1];
    return Math.floor((played + 1) / 2) % 2 === 0 ? this.gameServer : other(this.gameServer);
  }

  /**
   * Tours de service écoulés depuis le début du match : un par jeu, et en jeu décisif un tour au premier
   * point puis tous les deux points. En double, le serveur est le joueur suivant de la rotation à chaque tour.
   */
  get serveTurn(): number {
    if (!this.tiebreak) return this.gamesPlayed;
    const played = this.points[0] + this.points[1];
    return this.gamesPlayed + Math.floor((played + 1) / 2);
  }

  get serveSide(): ServeSide {
    return (this.points[0] + this.points[1]) % 2 === 0 ? 'right' : 'left';
  }

  /** Sets gagnés par chaque joueur. */
  get setsWon(): Pair {
    const won: Pair = [0, 0];
    for (const [a, b] of this.sets) won[a > b ? 0 : 1]++;
    return won;
  }

  /** Point décisif : le prochain point gagne le jeu pour l'un comme pour l'autre (punto de oro). */
  get decidingPoint(): boolean {
    return !this.tiebreak && this.rules.goldenPoint && this.points[0] === 3 && this.points[1] === 3;
  }

  awardPoint(winner: 0 | 1): PointOutcome {
    const outcome: PointOutcome = { game: false, set: false, match: false };
    if (this.winner !== null) return outcome;
    this.points[winner]++;
    if (!this.gameWonBy(winner)) return outcome;

    outcome.game = true;
    this.gamesPlayed++;
    const wasTiebreak = this.tiebreak;
    this.games[winner]++;
    this.points = [0, 0];
    this.tiebreak = false;
    // Après un jeu décisif, sert celui qui y a reçu en premier : c'est aussi l'alternance normale.
    this.gameServer = other(this.gameServer);

    const n = this.rules.gamesPerSet;
    const [mine, theirs] = [this.games[winner], this.games[other(winner)]];
    if (wasTiebreak || (mine >= n && mine - theirs >= 2)) {
      outcome.set = true;
      this.sets.push(this.games);
      this.games = [0, 0];
      if (this.setsWon[winner] >= this.rules.setsToWin) {
        outcome.match = true;
        this.winner = winner;
      }
    } else if (mine === n && theirs === n) {
      this.tiebreak = true;
    }
    return outcome;
  }

  private gameWonBy(player: 0 | 1): boolean {
    const mine = this.points[player];
    const theirs = this.points[other(player)];
    if (this.tiebreak) return mine >= 7 && mine - theirs >= 2;
    if (this.rules.goldenPoint && mine === 4 && theirs === 3) return true;
    return mine >= 4 && mine - theirs >= 2;
  }

  /** Points du jeu en cours, à afficher pour chaque joueur (« 15 », « 40 », « AV », ou le compte du jeu décisif). */
  pointLabels(): [string, string] {
    const [a, b] = this.points;
    if (this.tiebreak) return [String(a), String(b)];
    if (a >= 3 && b >= 3) {
      if (a === b) return ['40', '40'];
      return a > b ? ['AV', '40'] : ['40', 'AV'];
    }
    return [TENNIS[Math.min(a, 3)]!, TENNIS[Math.min(b, 3)]!];
  }

  /** Annonce du point en cours : « Égalité », « Punto de oro », « Jeu décisif »… ou `null`. */
  call(): string | null {
    const [a, b] = this.points;
    if (this.tiebreak) return 'Jeu décisif';
    if (this.decidingPoint) return 'Punto de oro';
    if (a >= 3 && a === b) return 'Égalité';
    return null;
  }
}
