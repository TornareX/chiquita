import { SIM_DT } from '../sim/constants';

/** Ce que l'encart du faux réseau affiche, mesuré par image. */
export interface NetFrame {
  /** Pas rejoués pendant cette image (tous rollbacks confondus). */
  replayed: number;
  /** Corrections de la balle (saut lissé à l'écran) pendant cette image. */
  corrections: number;
  /** Joueurs déplacés par une correction (glissement lissé à l'écran) pendant cette image. */
  playerCorrections: number;
  /** Pas où la partie a dû attendre les commandes distantes. */
  stalls: number;
  /** Plus long rollback de l'image (pas). */
  longest: number;
}

declare global {
  interface Window {
    /** Compteurs du faux réseau (`?reseau=…`), pour les tests du navigateur. */
    __net?: { readonly totals: NetFrame & { frames: number } };
  }
}

/**
 * Encart discret en bas à droite du jeu en réseau (faux réseau ou en ligne) : la liaison (`describe`), les pas rejoués
 * par image (moyenne et pire sur la demi-seconde), les corrections, les attentes, et une ligne de plus (`extra`).
 * Mis à jour deux fois par seconde.
 */
export function createNetHud(describe: () => string, extra?: () => string): { frame(stats: NetFrame): void } {
  const box = document.createElement('div');
  box.id = 'net-hud';
  box.style.cssText =
    'position:fixed;right:12px;bottom:12px;text-align:right;padding:4px 8px;font:12px/1.4 monospace;color:#cfe;background:#0008;border-radius:4px;pointer-events:none;white-space:pre;z-index:50';
  document.body.append(box);
  box.textContent = describe();

  const totals = { frames: 0, replayed: 0, corrections: 0, playerCorrections: 0, stalls: 0, longest: 0 };
  window.__net = { totals };
  let shown = { frames: 0, replayed: 0, worst: 0, longest: 0, stalls: 0 };
  let shownAt = 0;
  return {
    frame(stats: NetFrame): void {
      totals.frames++;
      totals.replayed += stats.replayed;
      totals.corrections += stats.corrections;
      totals.playerCorrections += stats.playerCorrections;
      totals.stalls += stats.stalls;
      totals.longest = Math.max(totals.longest, stats.longest);
      shown.frames++;
      shown.replayed += stats.replayed;
      shown.worst = Math.max(shown.worst, stats.replayed);
      shown.longest = Math.max(shown.longest, stats.longest);
      shown.stalls += stats.stalls;
      const now = performance.now();
      if (now - shownAt < 500) return;
      shownAt = now;
      const mean = shown.frames ? shown.replayed / shown.frames : 0;
      const ms = shown.longest * SIM_DT * 1000;
      box.textContent =
        `${describe()}\n` +
        `rejoués : ${mean.toFixed(1)} pas/image (pire ${shown.worst}) · plus long retour ${Math.round(ms)} ms\n` +
        `corrections : balle ${totals.corrections}, joueurs ${totals.playerCorrections} · attentes : ${totals.stalls}${shown.stalls ? ` (+${shown.stalls})` : ''}` +
        (extra ? `\n${extra()}` : '');
      shown = { frames: 0, replayed: 0, worst: 0, longest: 0, stalls: 0 };
    },
  };
}
