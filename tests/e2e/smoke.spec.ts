import { expect, test } from '@playwright/test';

test('la page charge sans erreur et la simulation avance', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__sim?.world.tick ?? 0) > 0);

  const before = await page.evaluate(() => window.__sim!.world.tick);
  await page.waitForFunction((tick) => window.__sim!.world.tick > tick, before);

  await page.screenshot({ path: 'screenshots/01-squelette.png' });
  expect(errors).toEqual([]);
});
