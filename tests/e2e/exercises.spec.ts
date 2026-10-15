import { expect, test } from '@playwright/test';

test('choix de l’exercice, pause, rejeu, cadence et difficulté', async ({ page }) => {
  await page.goto('/?mode=trainer&seed=1&models=off');
  await page.waitForFunction(() => window.__sim?.world.machine != null);
  await expect(page.locator('#panel .exercises button.selected')).toHaveText('1 · Vitre de fond');
  await expect(page.locator('#panel .exercises button')).toHaveCount(6);

  // Touche 5 : exercice « Volée », le joueur est replacé près du filet.
  await page.keyboard.press('Digit5');
  await expect(page.locator('#stats')).toHaveText(/^Volée/);
  await expect(page.locator('#panel .exercises button.selected')).toHaveText('5 · Volée');
  expect(await page.evaluate(() => window.__sim!.world.player.pos.z)).toBe(-3);

  // Clic dans le panneau : exercice « Lob ».
  await page.locator('#panel button', { hasText: 'Lob' }).click();
  await expect(page.locator('#stats')).toHaveText(/^Lob/);

  // Cadence et difficulté.
  await page.locator('#panel input').nth(0).fill('3');
  await page.locator('#panel input').nth(1).fill('80');
  expect(await page.evaluate(() => window.__sim!.world.machine!.interval)).toBe(3);
  expect(await page.evaluate(() => window.__sim!.world.machine!.difficulty)).toBe(0.8);

  // La difficulté est conservée en changeant d'exercice.
  await page.keyboard.press('Digit6');
  await expect(page.locator('#stats')).toHaveText(/^Mix aléatoire/);
  expect(await page.evaluate(() => window.__sim!.world.machine!.difficulty)).toBe(0.8);

  // Pause : le temps simulé s'arrête.
  await page.waitForFunction(() => window.__sim!.world.ball != null);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toBeVisible();
  const tick = await page.evaluate(() => window.__sim!.world.tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__sim!.world.tick)).toBe(tick);
  await page.screenshot({ path: 'screenshots/08-exercices.png' });
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause')).toBeHidden();
  await page.waitForFunction((t) => window.__sim!.world.tick > t, tick);

  // Rejeu : la même balle repart, sans compter comme une nouvelle balle de la machine.
  const count = await page.evaluate(() => window.__sim!.world.machine!.count);
  const before = await page.evaluate(() => window.__sim!.world.machine!.lastLaunchTime);
  await page.keyboard.press('KeyR');
  await page.waitForFunction((t) => window.__sim!.world.machine!.lastLaunchTime > t, before);
  expect(await page.evaluate(() => window.__sim!.world.machine!.count)).toBe(count);
});
