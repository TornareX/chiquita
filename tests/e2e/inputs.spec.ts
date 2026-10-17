import { expect, test, type Page } from '@playwright/test';

/**
 * Retour des entrées et « Teste ta manette » avec une manette PlayStation virtuelle : les boutons
 * s'affichent avec les symboles PlayStation (✕ ○ □ △), pas les lettres Xbox.
 */
async function plugPlayStation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fake = {
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __fake: typeof fake }).__fake = fake;
    navigator.getGamepads = () =>
      [
        {
          index: 0,
          id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
          connected: true,
          mapping: 'standard',
          axes: fake.axes,
          buttons: fake.buttons,
        },
      ] as unknown as Gamepad[];
  });
}

async function press(page: Page, index: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ([i, on]) => {
      const fake = (window as unknown as { __fake: { buttons: { pressed: boolean; touched: boolean; value: number }[] } }).__fake;
      fake.buttons[i as number] = { pressed: on as boolean, touched: on as boolean, value: on ? 1 : 0 };
    },
    [index, pressed],
  );
}

test('les boutons pressés s’affichent avec les symboles de la manette', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?ai=normal&boutons=1');
  await page.waitForFunction(() => window.__duel !== undefined);
  await plugPlayStation(page);

  const display = page.locator('.input-display[data-player="0"]');
  await expect(display).toContainText('Manette PlayStation');
  await expect(page.locator('#point')).toContainText('maintiens ✕');
  await expect(page.locator('#help')).toContainText('□ coupé');

  // Service : ✕ maintenu (une fois le délai de service passé), puis relâché au rebond.
  await page.waitForFunction(() => {
    const d = window.__duel!.duel;
    return d.phase === 'serve' && d.tick - d.phaseTick > 480;
  });
  await press(page, 0, true);
  await expect(display).toContainText('armé');
  // Relâché dans la page, au moment idéal : un aller-retour de Playwright rate parfois la fenêtre du service.
  await page.evaluate(() => {
    const fake = (window as unknown as { __fake: { buttons: { pressed: boolean; touched: boolean; value: number }[] } }).__fake;
    const watch = (): void => {
      const d = window.__duel!.duel;
      if (d.toss && d.tick >= d.toss.idealTick - 6) fake.buttons[0] = { pressed: false, touched: false, value: 0 };
      else requestAnimationFrame(watch);
    };
    watch();
  });
  await expect(display).toContainText('service');
  await page.screenshot({ path: 'screenshots/20-retour-entrees.png' });
});

test('« Teste ta manette » dit quel bouton a été pressé', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?ai=normal');
  await page.waitForFunction(() => window.__duel !== undefined);
  await plugPlayStation(page);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Tester ma manette' }).click();
  const screen = page.locator('#pad-test');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText('Appuie sur n’importe quel bouton');

  // Un premier appui désigne la manette ; on attend ensuite ✕ (coup normal).
  await press(page, 3, true);
  await expect(screen).toContainText('manette PlayStation');
  await press(page, 3, false);
  await expect(screen).toContainText('1/4');
  // Mauvais bouton : □ au lieu de ✕.
  await press(page, 2, true);
  await expect(screen).toContainText('Ça, c’est □ (coupé)');
  await press(page, 2, false);
  for (const index of [0, 2, 3, 1]) {
    await press(page, index, true);
    await page.waitForTimeout(80);
    await press(page, index, false);
    await page.waitForTimeout(80);
  }
  await expect(screen).toContainText('tour complet');
  // Tour complet du stick.
  for (let s = 0; s < 16; s++) {
    const a = (s / 16) * 2 * Math.PI;
    await page.evaluate(([x, y]) => {
      const fake = (window as unknown as { __fake: { axes: number[] } }).__fake;
      fake.axes[0] = x!;
      fake.axes[1] = y!;
    }, [Math.cos(a), Math.sin(a)]);
    await page.waitForTimeout(60);
  }
  await expect(screen).toContainText('Tout fonctionne');
  await page.screenshot({ path: 'screenshots/21-teste-ta-manette.png' });
  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();
  await expect(page.locator('#settings')).toBeHidden();
});
