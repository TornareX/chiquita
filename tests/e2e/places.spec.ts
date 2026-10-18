import { expect, test } from '@playwright/test';

/**
 * Écran de composition : une seule manette, donnée à Bleu 2 (à gauche) dans les réglages. Elle allume sa place
 * quand on appuie sur un bouton, puis joue à gauche en double avec trois IA : la manette virtuelle, pilotée par
 * le joueur automatique, frappe plusieurs fois.
 */
test('une manette seule joue à gauche en double', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  // La manette virtuelle ne se place pas : course assistée, stick libre.
  await page.goto('/?double=1&ai=normal&bot=both&boutons=1&assist=magnet&prepa=libre&models=off');
  await page.waitForFunction(() => window.__duel !== undefined);

  await page.keyboard.press('Escape');
  await page.locator('.place[data-place="2"] select').first().selectOption('manette1');
  await expect(page.locator('.place[data-place="2"] .place-name')).toContainText('gauche');

  await page.evaluate(() => {
    const { duel, Bot } = window.__duel!;
    const bot = new Bot(2, 7);
    const buttonOf = { normal: 0, overhead: 1, slice: 2, lob: 3 } as const;
    const hits = { left: 0 };
    const fake = {
      index: 0,
      id: 'manette virtuelle',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { __left: typeof hits; __fake: typeof fake }).__left = hits;
    (window as unknown as { __fake: typeof fake }).__fake = fake;
    let lastTick = -1;
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick && duel.tick > 0) {
        lastTick = duel.tick;
        if (duel.shot?.player === 2) hits.left++;
        const commands = bot.commands(duel);
        fake.axes = [commands.stick.right, -commands.stick.forward, 0, 0];
        fake.buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
        if (commands.shot) fake.buttons[buttonOf[commands.shot]] = { pressed: true, touched: true, value: 1 };
      }
      return [fake as unknown as Gamepad];
    };
  });

  // Un bouton de la manette allume la place qu'elle joue.
  await page.evaluate(() => {
    const fake = (window as unknown as { __fake: { buttons: unknown[] } }).__fake;
    fake.buttons[0] = { pressed: true, touched: true, value: 1 };
  });
  await expect(page.locator('.place[data-place="2"]')).toHaveClass(/lit/);
  await expect(page.locator('#settings .pads')).toContainText('Manette 1 : manette virtuelle');
  await page.screenshot({ path: 'screenshots/40-composition.png' });

  await page.getByRole('button', { name: 'Reprendre' }).click();
  await expect(page.locator('#players')).toContainText('Manette 1');
  await page.waitForFunction(() => (window as unknown as { __left: { left: number } }).__left.left >= 3, null, {
    timeout: 110_000,
  });
  // Toujours à gauche : la manette a joué Bleu 2, pas Bleu 1.
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-smash.reglages')!).players);
  expect(settings[0]).not.toBe('manette1');
  expect(settings[2]).toBe('manette1');
});
