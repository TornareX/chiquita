import { expect, test } from '@playwright/test';

test('exercice « vitre de fond » : la machine lance des balles qui touchent la vitre du fond', async ({ page }) => {
  await page.goto('/?exercise=back-glass&seed=1&models=off');
  await page.waitForFunction(() => window.__sim?.world.ball != null);

  // La première balle part vers le joueur, puis revient vers le filet après la vitre.
  await page.waitForFunction(() => window.__sim!.world.ball!.vel.z < 0);
  await page.waitForFunction(() => window.__sim!.world.ball!.pos.z < -8);
  await page.waitForFunction(() => window.__sim!.world.ball!.vel.z > 0);
  const afterGlass = await page.evaluate(() => window.__sim!.world.ball!);
  expect(afterGlass.out).toBe(false);
  expect(afterGlass.pos.z).toBeLessThan(-7);

  // Personne ne frappe : au deuxième rebond, la balle est comptée ratée.
  await expect(page.locator('#result')).toHaveText('Ratée : deuxième rebond');
  await expect(page.locator('#stats')).toHaveText('Vitre de fond · 0/1 valides (0 %)');

  // Capture de la balle suivante en vol.
  await page.waitForFunction(() => window.__sim!.world.machine!.count >= 2);
  await page.waitForFunction(() => window.__sim!.world.ball!.pos.z < -1);
  await page.screenshot({ path: 'screenshots/04-machine.png' });
});
