import { expect, test, type Page } from '@playwright/test';

/**
 * Étape V7 (`research/rendu/POLISH_VISUEL.md` §3.9) : arc de raquette, balle écrasée, gerbes de sable et ralenti du coup
 * gagnant, en IA contre IA. Captures : `screenshots/60-juice-arc.png` (gros plan figé juste après une frappe) et
 * `screenshots/61-ralenti.png`.
 */

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
if (!env.RENDU_LOGICIEL) test.use({ launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('arc de raquette et balle écrasée, figés juste après une frappe', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  // Premier passage : le pas de la première frappe du joueur proche (même graine, même échange).
  await page.goto('/?ai=normal&bot=both&seed=3&ralenti=0&debug');
  const hit = await page.waitForFunction(
    () => {
      const p = window.__duel?.duel.players[0];
      return p && Number.isFinite(p.lastHitTick) && !p.lastHit?.serve ? p.lastHitTick : false;
    },
    undefined,
    { timeout: 60_000, polling: 20 },
  );
  const tick = (await hit.jsonValue()) as number;
  await page.goto(`/?ai=normal&bot=both&seed=3&ralenti=0&camera=dos&figer=${((tick + 8) / 240).toFixed(4)}&debug`);
  await page.waitForFunction(() => window.__duel?.duel.tick !== undefined && window.__duel.duel.tick > 0 && document.querySelector('canvas')?.dataset.models === 'loaded', undefined, {
    timeout: 30_000,
  });
  await page.waitForFunction((t) => window.__duel!.duel.tick >= t, tick + 8, { timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/60-juice-arc.png' });
  expect(errors).toEqual([]);
});

test('gerbes de sable, puis ralenti du coup gagnant qui rend la main à la partie', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.goto('/?ai=normal&bot=both&ralenti=tous&debug');
  await page.waitForFunction(() => (window.__effects?.spawned.slide ?? 0) >= 1, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById('replay-badge')?.style.display === 'block', undefined, { timeout: 120_000, polling: 20 });
  const paused = await page.evaluate(() => window.__duel!.duel.tick);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'screenshots/61-ralenti.png' });
  // Pendant le ralenti, la partie en cours attend.
  expect(await page.evaluate(() => window.__duel!.duel.tick)).toBe(paused);
  await page.waitForFunction(() => document.getElementById('replay-badge')?.style.display === 'none', undefined, { timeout: 15_000 });
  await page.waitForFunction((t) => window.__duel!.duel.tick > t + 60, paused, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('un appui passe le ralenti', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?ai=normal&bot=both&ralenti=tous&debug');
  await page.waitForFunction(() => document.getElementById('replay-badge')?.style.display === 'block', undefined, { timeout: 120_000, polling: 20 });
  await page.waitForTimeout(300);
  await page.mouse.click(5, 300);
  await page.waitForFunction(() => document.getElementById('replay-badge')?.style.display === 'none', undefined, { timeout: 1_000 });
});
