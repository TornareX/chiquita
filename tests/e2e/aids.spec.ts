import { expect, test } from '@playwright/test';

test('aides : trajectoire, point de rebond, taille du tamis, ralenti et revue du point', async ({ page }) => {
  await page.goto('/?mode=trainer&seed=1&models=off');
  await page.waitForFunction(() => window.__sim?.world.ball != null);

  // Par défaut : trajectoire et point de rebond affichés, tamis agrandi, vitesse normale.
  await expect(page.locator('[data-aid=trajectory] input')).toBeChecked();
  await expect(page.locator('[data-aid=bounce] input')).toBeChecked();
  expect(await page.evaluate(() => window.__sim!.world.profile.racket.tolerance)).toBe(1.5);
  await page.waitForFunction(() => window.__sim!.world.ball!.pos.z < 4);
  await page.screenshot({ path: 'screenshots/09-aides.png' });

  // Taille du tamis ramenée à la taille réelle.
  await page.locator('[data-aid=tolerance] input').fill('100');
  await page.waitForFunction(() => window.__sim!.world.profile.racket.tolerance === 1);

  // Désactivation des aides visuelles.
  await page.locator('[data-aid=trajectory] input').uncheck();
  await page.locator('[data-aid=bounce] input').uncheck();
  expect(await page.evaluate(() => window.__sim!.aids)).toMatchObject({ trajectory: false, bounceMarker: false });

  // Ralenti : à 0,5×, le temps simulé avance deux fois moins vite.
  const rate = async (): Promise<number> => {
    const [t0, s0] = await page.evaluate(() => [performance.now(), window.__sim!.world.time] as const);
    await page.waitForTimeout(600);
    const [t1, s1] = await page.evaluate(() => [performance.now(), window.__sim!.world.time] as const);
    return (s1 - s0) / ((t1 - t0) / 1000);
  };
  expect(await rate()).toBeGreaterThan(0.85);
  await page.locator('#panel .speeds button', { hasText: '0,5×' }).click();
  expect(await page.evaluate(() => window.__sim!.aids.timeScale)).toBe(0.5);
  const slow = await rate();
  expect(slow).toBeGreaterThan(0.35);
  expect(slow).toBeLessThan(0.65);
  await page.locator('#panel .speeds button', { hasText: /^1×$/ }).click();

  // Revue du dernier point : le jeu se met en pause, puis reprend.
  await page.waitForFunction(() => window.__sim!.world.rally.result !== null);
  await page.keyboard.press('KeyV');
  await expect(page.locator('#pause')).toContainText('Revue du point');
  expect(await page.evaluate(() => window.__sim!.world.paused)).toBe(true);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyS');
  await page.screenshot({ path: 'screenshots/09-revue.png' });
  await page.keyboard.press('KeyV');
  await expect(page.locator('#pause')).toBeHidden();
  expect(await page.evaluate(() => window.__sim!.world.paused)).toBe(false);
});
