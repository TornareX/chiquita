import { expect, test } from '@playwright/test';

test('les modèles 3D du terrain, de la balle et de la raquette se chargent sans erreur', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?mode=trainer&seed=1');
  await expect(page.locator('#scene')).toHaveAttribute('data-models', 'loaded');
  await page.waitForFunction(() => (window.__sim?.world.ball?.pos.z ?? 9) < 2);
  await page.screenshot({ path: 'screenshots/10-assets.png' });

  await page.goto('/?mode=trainer&exercise=none&cam=overview');
  await expect(page.locator('#scene')).toHaveAttribute('data-models', 'loaded');
  await page.screenshot({ path: 'screenshots/10-assets-vue-ensemble.png' });
  expect(errors).toEqual([]);
});

test('`?models=off` garde les formes simples', async ({ page }) => {
  await page.goto('/?mode=trainer&exercise=none&models=off');
  await expect(page.locator('#scene')).toHaveAttribute('data-models', 'off');
});
