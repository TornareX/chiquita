import { expect, test } from '@playwright/test';

test('sons de l’étape E7 : un match IA contre IA tourne, son débloqué, sans erreur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?ai=normal&bot=both&seed=3&models=off');
  await page.waitForFunction(() => window.__duel !== undefined);
  // Un appui débloque le son (fond sonore, crissements, souffles, voix).
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => (window.__duel!.duel.match?.points ?? [0, 0]).some((p) => p > 0) || window.__duel!.duel.lastResult !== null, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
