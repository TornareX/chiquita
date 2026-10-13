import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function waitForSimulation(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.__sim?.world.tick ?? 0) > 0);
  const before = await page.evaluate(() => window.__sim!.world.tick);
  await page.waitForFunction((tick) => window.__sim!.world.tick > tick, before);
}

test('la page charge sans erreur et la simulation avance', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForSimulation(page);
  await page.screenshot({ path: 'screenshots/02-terrain.png' });
  expect(errors).toEqual([]);
});

test("la vue d'ensemble du terrain s'affiche sans erreur", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?cam=overview');
  await waitForSimulation(page);
  await page.screenshot({ path: 'screenshots/02-terrain-vue-ensemble.png' });
  expect(errors).toEqual([]);
});
