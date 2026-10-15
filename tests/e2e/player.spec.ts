import { expect, test } from '@playwright/test';

test('le joueur se déplace au clavier avec inertie et reste dans son camp', async ({ page }) => {
  await page.goto('/?mode=trainer&exercise=none&models=off');
  await page.waitForFunction(() => window.__sim !== undefined);
  await expect(page.locator('#start-prompt')).toBeVisible();

  const start = await page.evaluate(() => window.__sim!.world.player.pos);
  expect(start).toEqual({ x: 0, y: 0, z: -7 });

  // Touche physique « Z » d'un AZERTY (= « W » d'un QWERTY) : avancer vers le filet.
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__sim!.world.player.pos.z > -5);
  await page.screenshot({ path: 'screenshots/05-joueur.png' });
  await page.waitForFunction(() => window.__sim!.world.player.vel.z === 0 && window.__sim!.world.player.pos.z > -1);
  await page.keyboard.up('KeyW');
  const atNet = await page.evaluate(() => window.__sim!.world.player.pos);
  expect(atNet.z).toBeCloseTo(-0.3, 6);

  // Touche physique « Q » d'un AZERTY (= « A ») : pas chassé vers la gauche (+X).
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => window.__sim!.world.player.pos.x > 1);
  await page.keyboard.up('KeyA');
  await page.waitForFunction(() => window.__sim!.world.player.vel.x === 0);

  // Espace : split-step.
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__sim!.world.player.airborne);
  await page.waitForFunction(() => !window.__sim!.world.player.airborne);
});
