/**
 * Effets de l'étape V7 (`research/rendu/POLISH_VISUEL.md` §3.9) : chacun se coupe par l'URL, pour comparer et pour
 * juger à la manette. `?juice=0` les coupe tous d'un coup.
 * - `?poussiere=0` : pas de gerbe de sable aux glissades ;
 * - `?arc=0` : pas d'arc de raquette ;
 * - `?ecrasement=0` : la balle ne s'écrase pas à l'impact ni au rebond ;
 * - `?ralenti=0` : pas de ralenti du coup gagnant ; `?ralenti=tous` : après chaque point gagné sur un coup ;
 * - `?hitstop=0` : pas de micro-pause sur les frappes ; `?hitstop=1.5` : micro-pauses 1,5 fois plus longues.
 */
export interface JuiceFlags {
  sand: boolean;
  swingArc: boolean;
  squash: boolean;
  replay: 'off' | 'big' | 'all';
  /** Multiplicateur des micro-pauses (0 : aucune). */
  hitstop: number;
}

export function juiceFlags(search = location.search): JuiceFlags {
  const params = new URLSearchParams(search);
  const all = params.get('juice') !== '0';
  const on = (name: string): boolean => all && params.get(name) !== '0';
  const replay = params.get('ralenti');
  const hitstop = Number(params.get('hitstop') ?? 1);
  return {
    sand: on('poussiere'),
    swingArc: on('arc'),
    squash: on('ecrasement'),
    replay: !all || replay === '0' ? 'off' : replay === 'tous' ? 'all' : 'big',
    hitstop: all && Number.isFinite(hitstop) ? Math.max(0, hitstop) : 0,
  };
}

/**
 * Micro-pause (ms, temps réel) après une frappe : la frappe « pèse ». Seulement sur les coups qui le méritent, en trois
 * tailles : frappe parfaite, smash, smash parfait. Rien sur un coup ordinaire : figer le jeu touche au timing des
 * autres joueurs. [à calibrer à la manette]
 */
export function hitstopMs(shot: { perfect: boolean; overhead: string | null }, scale = 1): number {
  const smash = shot.overhead === 'remate';
  const base = smash ? (shot.perfect ? 85 : 50) : shot.perfect ? 40 : 0;
  return base * scale;
}
