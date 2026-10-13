import { expect, test } from '@playwright/test';

test('un swing calé renvoie la balle dans le camp adverse', async ({ page }) => {
  await page.goto('/?exercise=none');
  await page.waitForFunction(() => window.__sim !== undefined);

  // Même scénario que tests/sim/racket.test.ts : balle sur le coup droit, préparation de 0,25 s,
  // relâchement 1,18 s après le lancement. Le script est évalué à chaque pas de simulation.
  await page.evaluate(() => {
    const sim = window.__sim!;
    const DT = 1 / 240;
    sim.world.launchBall({ x: -0.5, y: 1.1, z: 6 }, { x: 0, y: 2.3, z: -12.8 });
    const launchTick = sim.world.tick;
    sim.commandScript = (world) => {
      const time = (world.tick - launchTick) * DT;
      return { prepare: time >= 0.93 && time < 1.18 };
    };
  });

  await page.waitForFunction(() => window.__sim!.world.racket.phase === 'preparing');
  await page.screenshot({ path: 'screenshots/06-raquette-preparation.png' });
  await page.waitForFunction(() => window.__sim!.world.lastShot !== null);
  await page.screenshot({ path: 'screenshots/06-raquette-frappe.png' });

  const shot = await page.evaluate(() => window.__sim!.world.lastShot!);
  expect(shot.quality).toBeGreaterThan(0.8);
  expect(shot.side).toBe(1);

  // La balle franchit le filet et retombe dans le camp adverse.
  await page.waitForFunction(() => window.__sim!.world.ball!.pos.z > 1);
  await page.waitForFunction(() => window.__sim!.world.ball!.pos.y < 0.05);
  const ball = await page.evaluate(() => window.__sim!.world.ball!);
  expect(ball.out).toBe(false);
  expect(ball.pos.z).toBeGreaterThan(0);
  expect(ball.pos.z).toBeLessThan(10);

  // Retour au joueur : verdict et qualité du contact affichés.
  await expect(page.locator('#result')).toHaveText('Valide');
  await expect(page.locator('#contact')).toHaveText(/Parfait|Contact \d+ %/);
  await page.screenshot({ path: 'screenshots/07-verdict.png' });
});
