import { expect, test, type Page } from '@playwright/test';

/**
 * Banc d'essai du rendu (`research/rendu/POLISH_VISUEL.md`, étape V0) : les mêmes scènes figées (même graine, même
 * instant de simulation), capturées en rendu soigné et en `?rendu=simple`, en couleur et en niveaux de gris (la
 * balle doit rester lisible), avec le coût moyen d'une image
 * (affiché dans la sortie du test). Captures dans `screenshots/rendu/`.
 * `RENDU_LABEL=avant` : une seule passe, sans `?rendu`, nommée d'après le label (`RENDU_QUERY=tons=agx` : réglages
 * d'URL en plus).
 */

const ALL_SCENES = [
  { name: 'jeu', query: 'ai=normal&bot=both&seed=3&figer=5.2' },
  { name: 'proche', query: 'ai=normal&bot=both&seed=3&figer=5.2&camera=proche' },
  { name: 'double', query: 'double=1&ai=normal&bot=both&seed=5&figer=6' },
] as const;

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const VARIANTS: [string, string][] = env.RENDU_LABEL ? [[env.RENDU_LABEL, env.RENDU_QUERY ? `&${env.RENDU_QUERY}` : '']] : [['simple', '&rendu=simple'], ['soigne', '']];
const DIR = 'screenshots/rendu';
/** `RENDU_SCENE=jeu` : une seule scène, pour régler vite. */
// `RENDU_GPU=1` : Chromium sur la vraie carte graphique (sinon rendu logiciel, temps par image sans valeur).
if (env.RENDU_GPU) test.use({ launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } });
const SCENES = ALL_SCENES.filter((scene) => !env.RENDU_SCENE || scene.name === env.RENDU_SCENE);

async function frozenScene(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}&debug`);
  // Figée : le pas de simulation ne bouge plus d'une vérification à l'autre.
  await page.waitForFunction(() => {
    const d = window.__duel?.duel;
    const w = window as unknown as { __lastTick?: number };
    const still = d !== undefined && d.tick > 0 && d.tick === w.__lastTick;
    w.__lastTick = d?.tick;
    return still && document.querySelector('canvas')?.dataset.models === 'loaded';
  }, undefined, { timeout: 30_000, polling: 250 });
  // La caméra et les poses finissent de se poser sur l'instant figé.
  await page.waitForTimeout(800);
}

for (const [variant, extra] of VARIANTS) {
  test(`banc d'essai du rendu : ${variant}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const perf: Record<string, unknown> = {};
    for (const scene of SCENES) {
      await frozenScene(page, scene.query + extra);
      await page.screenshot({ path: `${DIR}/${scene.name}-${variant}.png` });
      await page.evaluate(() => window.__perf!.reset());
      await page.waitForTimeout(1500);
      perf[scene.name] = await page.evaluate(() => {
        const gl = document.querySelector('canvas')!.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return { ...window.__perf!.stats, gpu: ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '?' };
      });
      await page.evaluate(() => (document.documentElement.style.filter = 'grayscale(1)'));
      await page.screenshot({ path: `${DIR}/${scene.name}-${variant}-gris.png` });
    }
    console.log(`perf ${variant} ${JSON.stringify(perf)}`);
    expect(errors).toEqual([]);
  });
}
