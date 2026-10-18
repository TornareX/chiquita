/** Ce que coûte une image côté rendu, lu dans `renderer.info` après le dessin. */
export interface RenderInfo {
  drawCalls: number;
  triangles: number;
}

export interface PerfStats {
  /** Images mesurées depuis le dernier `reset()`. */
  frames: number;
  /** Intervalle moyen entre deux images (ms) : 16,7 à 60 i/s. */
  frameMs: number;
  /** Temps moyen passé à préparer et envoyer l'image au processeur graphique (ms, côté processeur). */
  renderMs: number;
  /** Pire intervalle entre deux images (ms). */
  worstFrameMs: number;
  drawCalls: number;
  triangles: number;
}

declare global {
  interface Window {
    /** Mesure du rendu (banc d'essai, `?perf` pour l'afficher à l'écran), en mode debug. */
    __perf?: { readonly stats: PerfStats; reset(): void };
  }
}

/**
 * Compteur du banc d'essai du rendu (`research/rendu/POLISH_VISUEL.md`, étape V0) : moyennes depuis le dernier
 * `reset()`, exposées dans `window.__perf` ; `visible`, un petit encart en haut à droite les affiche.
 */
export function createPerfMeter(visible: boolean): { frame(frameTime: number, renderMs: number, info: RenderInfo): void } {
  /** Moyennes depuis `reset()` (banc d'essai) ; l'encart a les siennes, remises à zéro à chaque affichage. */
  const total = accumulator();
  const shown = accumulator();
  let info: RenderInfo = { drawCalls: 0, triangles: 0 };
  window.__perf = {
    get stats() {
      return total.stats(info);
    },
    reset: total.reset,
  };

  let box: HTMLDivElement | null = null;
  if (visible) {
    box = document.createElement('div');
    box.style.cssText =
      'position:fixed;top:56px;right:12px;padding:4px 8px;font:12px/1.4 monospace;color:#cfe;background:#000a;border-radius:4px;pointer-events:none;white-space:pre;z-index:50';
    document.body.append(box);
  }
  let shownAt = 0;

  return {
    frame(frameTime, renderMs, latest) {
      info = latest;
      total.add(frameTime * 1000, renderMs);
      shown.add(frameTime * 1000, renderMs);
      const now = performance.now();
      if (box && now - shownAt > 500) {
        shownAt = now;
        const s = shown.stats(info);
        box.textContent =
          `${(1000 / Math.max(1e-3, s.frameMs)).toFixed(0)} i/s · ${s.frameMs.toFixed(1)} ms (pire ${s.worstFrameMs.toFixed(0)})\n` +
          `rendu ${s.renderMs.toFixed(2)} ms · ${s.drawCalls} appels · ${(s.triangles / 1000).toFixed(0)} k tri.`;
        shown.reset();
      }
    },
  };
}

function accumulator(): { add(frameMs: number, renderMs: number): void; stats(info: RenderInfo): PerfStats; reset(): void } {
  let frames = 0;
  let frameSum = 0;
  let renderSum = 0;
  let worst = 0;
  return {
    add(frameMs, renderMs) {
      frames++;
      frameSum += frameMs;
      renderSum += renderMs;
      worst = Math.max(worst, frameMs);
    },
    stats: (info) => ({
      frames,
      frameMs: frames ? frameSum / frames : 0,
      renderMs: frames ? renderSum / frames : 0,
      worstFrameMs: worst,
      drawCalls: info.drawCalls,
      triangles: info.triangles,
    }),
    reset() {
      frames = frameSum = renderSum = worst = 0;
    },
  };
}
