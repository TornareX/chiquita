import { expect, test } from '@playwright/test';

/**
 * Étape C : une partie à 4 manettes. Quatre manettes virtuelles, branchées sur la Gamepad API et pilotées
 * par le joueur automatique, jouent un 2 contre 2 par le même chemin qu'avec de vraies manettes (lecture des
 * axes et des boutons, conversion écran → joueur). Chacun des quatre doit frapper, et des points se jouer.
 */
test('quatre manettes jouent un 2 contre 2', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?double=1&bot=none&boutons=1');
  await page.waitForFunction(() => window.__duel !== undefined);
  await page.evaluate(() => {
    const { duel, Bot } = window.__duel!;
    const bots = duel.players.map((_, i) => new Bot(i, 31 + i));
    const buttonOf = { normal: 0, overhead: 1, slice: 2, lob: 3 } as const;
    const hits = [0, 0, 0, 0];
    (window as unknown as { __hits: number[] }).__hits = hits;
    let lastTick = -1;
    let pads: Gamepad[] = [];
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        if (duel.shot) hits[duel.shot.player]!++;
        pads = bots.map((bot, i) => {
          const commands = bot.commands(duel);
          // Directions de l'écran : l'équipe d'en face (joueurs 1 et 3) a les siennes inversées.
          const flip = i % 2 === 0 ? 1 : -1;
          const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
          if (commands.shot) buttons[buttonOf[commands.shot]] = { pressed: true, touched: true, value: 1 };
          return {
            index: i,
            id: `manette virtuelle ${i + 1}`,
            connected: true,
            mapping: 'standard',
            axes: [commands.stick.right * flip, -commands.stick.forward * flip, 0, 0],
            buttons,
          } as unknown as Gamepad;
        });
      }
      return pads;
    };
  });

  await expect(page.locator('#players')).toContainText('Manette 4');
  await expect(page.locator('#players')).toContainText('Rouge 2');
  // Chacun des quatre a frappé au moins deux fois, et au moins quatre points se sont joués.
  await page.waitForFunction(
    () => (window as unknown as { __hits: number[] }).__hits.every((n) => n >= 2) && window.__duel!.duel.rallies >= 4,
    null,
    { timeout: 110_000 },
  );
  await page.screenshot({ path: 'screenshots/30-double.png' });
});
