import { expect, test } from '@playwright/test';

/**
 * Deux manettes virtuelles, branchées sur la Gamepad API et pilotées par le joueur automatique :
 * l'échange passe par le même chemin qu'avec de vraies manettes (lecture des axes et des boutons,
 * conversion écran → joueur), et doit atteindre 10 coups.
 */
test('deux manettes tiennent un échange de 10 coups', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  // Les manettes virtuelles ne se placent pas : course assistée, stick libre.
  await page.goto('/?boutons=1&assist=magnet&prepa=libre');
  await page.waitForFunction(() => window.__duel !== undefined);
  await page.evaluate(() => {
    const { duel, Bot } = window.__duel!;
    const bots = [new Bot(0, 11), new Bot(1, 12)];
    const buttonOf = { normal: 0, overhead: 1, slice: 2, lob: 3 } as const;
    let lastTick = -1;
    let pads: Gamepad[] = [];
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        pads = bots.map((bot, i) => {
          const commands = bot.commands(duel);
          // Directions de l'écran : le joueur d'en face a les siennes inversées.
          const flip = i === 0 ? 1 : -1;
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

  await expect(page.locator('#players')).toContainText('Manette 2');
  await page.waitForFunction(() => window.__duel!.duel.hits >= 10 || window.__duel!.duel.bestRally >= 10, null, {
    timeout: 80_000,
  });
  await page.screenshot({ path: 'screenshots/11-premier-echange.png' });
});
