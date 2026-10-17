import { expect, test } from '@playwright/test';

test('le visionneur joue chaque coup et chaque déplacement, phase par phase, sans erreur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?mode=animations&models=off');
  await page.waitForFunction(() => window.__anim !== undefined);

  for (const family of ['fore', 'back', 'voleeFore', 'voleeBack', 'bandeja', 'overhead', 'serve']) {
    await page.click(`[data-anim="${family}"]`);
    for (const [t, phase] of [[0.3, 'Préparation'], [0.61, 'Impact'], [0.75, 'Fin du geste'], [1.0, 'Retour en attente']] as const) {
      await page.evaluate((t) => window.__anim!.seek(t), t);
      await expect.poll(() => page.evaluate(() => window.__anim!.phase)).toContain(phase);
    }
  }
  await page.click('[data-anim="voleeFore"]');
  await page.evaluate(() => window.__anim!.seek(0.6));
  await page.screenshot({ path: 'screenshots/43-visionneur-animations.png' });

  for (const motion of ['attente', 'repos', 'course', 'chasse', 'recul']) {
    await page.click(`[data-anim="${motion}"]`);
    await page.click('[data-anim="play"]');
  }
  expect(errors).toEqual([]);
});
