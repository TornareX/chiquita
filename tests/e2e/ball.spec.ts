import { expect, test } from '@playwright/test';

test('une balle lancée vole, rebondit et reste dans le terrain', async ({ page }) => {
  await page.goto('/?exercise=none&models=off');
  await page.waitForFunction(() => window.__sim !== undefined);
  await page.evaluate(() => {
    window.__sim!.world.launchBall({ x: 1.5, y: 1.2, z: 8 }, { x: -1.5, y: 4, z: -15 });
  });

  // Capture en vol, quand la balle arrive dans le camp du joueur.
  await page.waitForFunction(() => window.__sim!.world.ball!.pos.z < -2.5);
  await page.screenshot({ path: 'screenshots/03-balle.png' });

  await page.waitForFunction(() => window.__sim!.world.time > 4);
  const ball = await page.evaluate(() => window.__sim!.world.ball!);
  expect(ball.out).toBe(false);
  expect(Math.abs(ball.pos.x)).toBeLessThan(5);
  expect(Math.abs(ball.pos.z)).toBeLessThan(10);
});
