import { expect, test } from '@playwright/test';

/**
 * Flashs blancs (V6, `postfx.ts`) : en partie IA contre IA, un pixel invalide étalé par le bloom blanchissait tout
 * l'écran pendant une image. Le test relève la clarté moyenne de chaque image et échoue sur un bond. 95 s de jeu, sur
 * la carte graphique : lancé seulement avec `RENDU_FLASH=1` (`RENDU_FLASH=1 npx playwright test renduFlash`).
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } });

test('pas de flash blanc en partie (post-traitement)', async ({ page }) => {
  test.skip(!env.RENDU_FLASH, 'long : RENDU_FLASH=1 pour le lancer');
  test.setTimeout(300_000);
  const seconds = Number(env.RENDU_FLASH_SECONDES ?? 95);
  // Graine 3 : le flash y tombait vers 88 s de jeu avant le nettoyage.
  await page.goto('/?ai=normal&bot=both&seed=3&debug');
  await page.waitForFunction(() => window.__duel !== undefined);
  const result = await page.evaluate(async (seconds) => {
    const canvas = document.querySelector('canvas')!;
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 18;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    let frames = 0;
    let max = 0;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      // Lu juste après l'image du jeu (même tâche d'animation, appelée après la sienne).
      const step = (): void => {
        ctx.drawImage(canvas, 0, 0, 32, 18);
        const d = ctx.getImageData(0, 0, 32, 18).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!;
        max = Math.max(max, sum / (d.length / 4) / 3);
        frames++;
        if (performance.now() - start < seconds * 1000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return { frames, max };
  }, seconds);
  // Une image normale tourne autour de 55 sur 255 ; le flash montait à 250.
  expect(result.frames).toBeGreaterThan(seconds * 30);
  expect(result.max).toBeLessThan(120);
});
