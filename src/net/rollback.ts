/**
 * Moteur de rollback, façon GGPO (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 0), sans réseau : il ne sait rien
 * du transport ni du jeu. Chaque machine fait avancer sa propre copie du match à pas fixe :
 * - ses joueurs locaux jouent avec un petit délai d'entrée (`inputDelay` pas) ;
 * - pour les joueurs distants dont la commande n'est pas encore arrivée, il prédit : la dernière reçue ;
 * - quand une commande distante arrive et ne correspond pas à ce qu'il avait prédit, il revient à l'état d'avant ce
 *   pas (un instantané par pas prédit) et rejoue jusqu'au présent avec les bonnes commandes ;
 * - il ne prédit jamais plus de `maxRollback` pas : au-delà, il attend (le match ralentit, comme en vrai).
 */

export interface RollbackGame<S, C> {
  /** Copie de l'état, pour y revenir. */
  save(state: S): S;
  /** Remet `state` dans l'état de `snapshot` (sur place : le rendu garde le même objet). */
  load(state: S, snapshot: S): void;
  /** Un pas de simulation avec une commande par joueur. */
  step(state: S, commands: readonly C[]): void;
}

export interface RollbackOptions<C> {
  /** Nombre de joueurs du match. */
  players: number;
  /** Joueurs tenus par cette machine ; les autres sont distants. */
  local: readonly number[];
  /** Délai d'entrée local (pas) : une commande donnée au pas `t` joue au pas `t + inputDelay`. */
  inputDelay: number;
  /**
   * Délai d'entrée des joueurs distants (pas), convenu au début du match ; par défaut le même. Les premiers pas qu'il
   * couvre sont neutres, chaque machine le sait sans rien recevoir.
   */
  remoteInputDelay?: number;
  /** Pas prédits au plus avant d'attendre les commandes distantes. */
  maxRollback: number;
  /** Commande « rien », pour les premiers pas (délai d'entrée) et un joueur dont on n'a encore rien reçu. */
  neutral: C;
  /** Deux commandes identiques (pour savoir si la prédiction était juste). */
  same(a: C, b: C): boolean;
  /** Pas de l'état de départ. */
  startTick?: number;
  /**
   * Serveur de référence (`matchServer.ts`) : il confirme les commandes de tout le monde, celles des joueurs locaux
   * comprises (il remplace une commande arrivée trop tard). Les commandes locales jouent tout de suite, mais restent
   * provisoires : si celle du serveur diffère, on rejoue comme pour un joueur distant. Les premiers pas du délai
   * d'entrée ne sont alors connus d'avance que pour les joueurs locaux (provisoires, neutres).
   */
  serverConfirms?: boolean;
}

export interface RollbackHooks<S> {
  /** Après chaque pas, rejoué ou non (`replayed`) ; `tick` est le pas qui vient d'être calculé. */
  onStep?(state: S, tick: number, replayed: boolean): void;
  /** Juste avant de revenir en arrière, puis une fois le présent rattrapé (avant le nouveau pas). */
  beforeRollback?(state: S): void;
  afterRollback?(state: S): void;
}

/** Compteurs, pour l'affichage et les tests. */
export interface RollbackStats {
  /** Pas rejoués au total, et au dernier retour en arrière. */
  replayed: number;
  lastReplayed: number;
  /** Retours en arrière, et le plus long (pas). */
  rollbacks: number;
  longest: number;
  /** Fois où la machine a dû attendre des commandes distantes. */
  stalls: number;
}

export class RollbackSession<S, C> {
  /** Prochain pas à calculer : l'état courant est celui d'avant ce pas. */
  tick: number;
  readonly stats: RollbackStats = { replayed: 0, lastReplayed: 0, rollbacks: 0, longest: 0, stalls: 0 };
  /** Commandes connues pour de bon (locales, ou reçues), par joueur et par pas. */
  private readonly confirmed: Map<number, C>[];
  /** Dernier pas jusqu'où les commandes d'un joueur sont toutes connues, sans trou. */
  private readonly confirmedUntil: number[];
  /** Commandes utilisées à chaque pas déjà calculé (prédites ou non), et instantané d'avant ce pas s'il y a eu prédiction. */
  private readonly used = new Map<number, C[]>();
  private readonly snapshots = new Map<number, S>();
  /** Plus ancien pas à recalculer, ou `null`. */
  private rollbackTo: number | null = null;
  private readonly isLocal: boolean[];
  /** Avec `serverConfirms` : commandes locales jouées en attendant celles du serveur. */
  private readonly provisional: Map<number, C>[];

  constructor(
    readonly state: S,
    private readonly game: RollbackGame<S, C>,
    readonly options: RollbackOptions<C>,
    private readonly hooks: RollbackHooks<S> = {},
  ) {
    const start = options.startTick ?? 0;
    this.tick = start;
    this.prunedBefore = start;
    this.isLocal = Array.from({ length: options.players }, (_, i) => options.local.includes(i));
    this.confirmed = Array.from({ length: options.players }, () => new Map<number, C>());
    this.provisional = Array.from({ length: options.players }, () => new Map<number, C>());
    // Les premiers pas, couverts par le délai d'entrée de chacun, sont neutres : chaque machine le sait.
    const delayOf = (p: number): number => (this.isLocal[p] ? options.inputDelay : (options.remoteInputDelay ?? options.inputDelay));
    if (options.serverConfirms) {
      this.provisional.forEach((inputs, p) => {
        if (this.isLocal[p]) for (let t = start; t < start + options.inputDelay; t++) inputs.set(t, options.neutral);
      });
      this.confirmedUntil = Array.from({ length: options.players }, () => start - 1);
      return;
    }
    this.confirmed.forEach((inputs, p) => {
      for (let t = start; t < start + delayOf(p); t++) inputs.set(t, options.neutral);
    });
    this.confirmedUntil = Array.from({ length: options.players }, (_, p) => start + delayOf(p) - 1);
  }

  /** Pas où jouera la prochaine commande locale. */
  get localTick(): number {
    return this.tick + this.options.inputDelay;
  }

  /** Dernier pas connu pour de bon de chaque joueur. */
  confirmedTick(player: number): number {
    return this.confirmedUntil[player]!;
  }

  /** Commande du joueur `player` au pas `tick`, si elle est connue pour de bon. */
  commandAt(player: number, tick: number): C | undefined {
    return this.confirmed[player]!.get(tick);
  }

  /** La commande du joueur local `player` pour le pas `tick` est déjà donnée (pour ne la lire qu'une fois). */
  hasLocal(player: number, tick: number): boolean {
    return this.confirmed[player]!.has(tick) || this.provisional[player]!.has(tick);
  }

  /** Commande locale provisoire (`serverConfirms`) du joueur `player` au pas `tick`. */
  provisionalAt(player: number, tick: number): C | undefined {
    return this.provisional[player]!.get(tick);
  }

  /** Toutes les commandes de tout le monde sont connues pour de bon jusqu'au pas `tick` compris. */
  confirmedThrough(tick: number): boolean {
    return this.confirmedUntil.every((t) => t >= tick);
  }

  /** Recalculer à partir du pas `tick` au prochain rattrapage (s'il a un instantané, c'est-à-dire s'il a été prédit). */
  invalidate(tick: number): boolean {
    if (tick >= this.tick || !this.snapshots.has(tick)) return false;
    this.rollbackTo = this.rollbackTo === null ? tick : Math.min(this.rollbackTo, tick);
    return true;
  }

  /** Commande d'un joueur local, pour le pas `localTick` ; rend ce pas. */
  addLocal(player: number, commands: C): number {
    const tick = this.localTick;
    if (this.options.serverConfirms) this.provisional[player]!.set(tick, commands);
    else this.confirm(player, tick, commands);
    return tick;
  }

  /**
   * Commande reçue d'un joueur distant pour le pas `tick` (en double, en retard ou en désordre : sans danger). Avec
   * `serverConfirms`, aussi celle d'un joueur local, telle que le serveur l'a retenue.
   */
  addRemote(player: number, tick: number, commands: C): void {
    if (this.isLocal[player] && !this.options.serverConfirms) return;
    if (this.confirmed[player]!.has(tick) || tick < this.prunedBefore) return;
    this.confirm(player, tick, commands);
    // Pas déjà calculé avec une autre commande : il faudra le refaire.
    const used = this.used.get(tick);
    if (used && !this.options.same(used[player]!, commands)) {
      this.rollbackTo = this.rollbackTo === null ? tick : Math.min(this.rollbackTo, tick);
    }
  }

  /** Le pas courant peut se calculer : commandes locales données, et pas trop de pas prédits. */
  canAdvance(): boolean {
    for (let p = 0; p < this.options.players; p++) {
      if (this.isLocal[p] && !this.hasLocal(p, this.tick)) return false;
      if ((!this.isLocal[p] || this.options.serverConfirms) && this.tick - this.confirmedUntil[p]! > this.options.maxRollback) return false;
    }
    return true;
  }

  /**
   * Rattrape une éventuelle erreur de prédiction, puis calcule le pas courant s'il le peut. Rend `false` si la
   * machine doit attendre des commandes distantes.
   */
  advance(): boolean {
    this.rollback();
    if (!this.canAdvance()) {
      this.stats.stalls++;
      return false;
    }
    this.compute(false);
    this.prune();
    return true;
  }

  /** Revient au plus ancien pas mal prédit et rejoue jusqu'au présent. */
  rollback(): void {
    const from = this.rollbackTo;
    this.rollbackTo = null;
    if (from === null || from >= this.tick) return;
    const snapshot = this.snapshots.get(from);
    if (!snapshot) throw new Error(`rollback : pas d'instantané au pas ${from}`);
    this.hooks.beforeRollback?.(this.state);
    const present = this.tick;
    this.game.load(this.state, snapshot);
    this.tick = from;
    while (this.tick < present) this.compute(true);
    const count = present - from;
    this.stats.replayed += count;
    this.stats.lastReplayed = count;
    this.stats.rollbacks++;
    this.stats.longest = Math.max(this.stats.longest, count);
    this.hooks.afterRollback?.(this.state);
  }

  /** Calcule le pas courant avec les commandes connues, ou prédites. */
  private compute(replayed: boolean): void {
    const tick = this.tick;
    let predicted = false;
    const commands: C[] = [];
    for (let p = 0; p < this.options.players; p++) {
      const known = this.confirmed[p]!.get(tick);
      if (known === undefined) predicted = true;
      commands.push(known ?? this.provisional[p]!.get(tick) ?? this.predict(p, tick));
    }
    if (predicted) this.snapshots.set(tick, this.game.save(this.state));
    else this.snapshots.delete(tick);
    this.used.set(tick, commands);
    this.game.step(this.state, commands);
    this.tick++;
    this.hooks.onStep?.(this.state, tick, replayed);
  }

  /** Prédiction : la commande connue la plus récente avant ce pas (les boutons restent tenus, le stick aussi). */
  private predict(player: number, tick: number): C {
    const inputs = this.confirmed[player]!;
    for (let t = tick - 1; t >= this.prunedBefore; t--) {
      const known = inputs.get(t);
      if (known !== undefined) return known;
    }
    return this.lastPruned[player] ?? this.options.neutral;
  }

  private confirm(player: number, tick: number, commands: C): void {
    const inputs = this.confirmed[player]!;
    inputs.set(tick, commands);
    while (inputs.has(this.confirmedUntil[player]! + 1)) this.confirmedUntil[player]!++;
  }

  /** Les pas antérieurs à celui-ci sont oubliés : tout y était connu pour de bon. */
  private prunedBefore: number;
  /** Dernière commande oubliée de chaque joueur, pour la prédiction. */
  private readonly lastPruned: (C | undefined)[] = [];

  /** Oublie ce qui ne peut plus servir : les pas où toutes les commandes étaient connues, sauf le dernier de chacun. */
  private prune(): void {
    const settled = Math.min(this.tick, ...this.confirmedUntil.map((t) => t + 1));
    // On garde au moins un pas connu par joueur, pour prédire la suite.
    const keepFrom = settled - 1;
    if (keepFrom <= this.prunedBefore) return;
    for (let t = this.prunedBefore; t < keepFrom; t++) {
      this.used.delete(t);
      this.snapshots.delete(t);
      this.confirmed.forEach((inputs, p) => {
        const old = inputs.get(t);
        if (old !== undefined) this.lastPruned[p] = old;
        inputs.delete(t);
        this.provisional[p]!.delete(t);
      });
    }
    this.prunedBefore = keepFrom;
  }
}
