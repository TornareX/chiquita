import { expect, test } from '@playwright/test';

test('l’arène : public qui réagit, panneaux du por tres, sans erreur ; `?arene=0` la retire', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?ai=normal&bot=both&seed=3&models=off');
  await page.waitForFunction(() => window.__arena !== undefined && window.__duel !== undefined);
  await page.evaluate(() => {
    window.__arena!.react({ kind: 'cheer', intensity: 1 });
    window.__arena!.porTres();
  });
  await page.waitForTimeout(400);
  const mood = await page.evaluate(() => ({ jump: window.__arena!.mood.jump, flash: window.__arena!.mood.flash }));
  expect(mood.jump).toBeGreaterThan(0.3);
  expect(mood.jump).toBeLessThan(1);
  await page.screenshot({ path: 'screenshots/50-arene-clameur.png' });
  expect(errors).toEqual([]);

  await page.goto('/?ai=normal&bot=both&seed=3&models=off&arene=0');
  await page.waitForFunction(() => window.__duel !== undefined);
  expect(await page.evaluate(() => window.__arena === undefined)).toBe(true);
});
