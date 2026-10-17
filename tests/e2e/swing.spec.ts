import { expect, test, type Page } from '@playwright/test';

/** Frappe au stick droit avec une manette Xbox virtuelle : le geste prépare, puis frappe. */
async function plugPad(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fake = {
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __fake: typeof fake }).__fake = fake;
    navigator.getGamepads = () =>
      [{ index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: fake.axes, buttons: fake.buttons }] as unknown as Gamepad[];
  });
}

/** Stick droit : `up` vers le haut de l'écran (l'axe de la Gamepad API est positif vers le bas). */
async function rightStick(page: Page, right: number, up: number): Promise<void> {
  await page.evaluate(
    ([r, u]) => {
      const fake = (window as unknown as { __fake: { axes: number[] } }).__fake;
      fake.axes[2] = r!;
      fake.axes[3] = -u!;
    },
    [right, up],
  );
}

test('servir au stick droit : tiré vers soi, puis ramené devant', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?ai=normal');
  await page.waitForFunction(() => window.__duel !== undefined);
  await plugPad(page);

  const display = page.locator('.input-display[data-player="0"]');
  await page.waitForFunction(() => {
    const d = window.__duel!.duel;
    return d.phase === 'serve' && d.tick - d.phaseTick > 480;
  });
  await rightStick(page, 0, -1);
  await expect(display).toContainText('armé au stick droit');
  // Le geste se finit dans la page, au moment idéal : un aller-retour de Playwright le rate de peu.
  await page.evaluate(() => {
    const fake = (window as unknown as { __fake: { axes: number[] } }).__fake;
    const watch = (): void => {
      const d = window.__duel!.duel;
      if (d.toss && d.tick >= d.toss.idealTick - 6) fake.axes[3] = -1;
      else requestAnimationFrame(watch);
    };
    watch();
  });
  await expect(display).toContainText('service');
  // Le coup est attribué au geste (badge R), pas au bouton A.
  await expect(display.getByText('R', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'screenshots/26-frappe-au-stick.png' });
});

test('par défaut, tout se joue aux sticks : pas de boutons affichés, aide aux sticks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?ai=normal');
  await page.waitForFunction(() => window.__duel !== undefined);
  await plugPad(page);
  await expect(page.locator('#help')).toContainText('Stick droit tiré vers toi');
  await expect(page.locator('#help')).not.toContainText('coupé ·');
  await expect(page.locator('#point')).toContainText('tire le stick droit vers toi');
  // Un bouton de face ne frappe pas : le service ne part pas.
  await page.waitForFunction(() => {
    const d = window.__duel!.duel;
    return d.phase === 'serve' && d.tick - d.phaseTick > 480;
  });
  await page.evaluate(() => {
    const fake = (window as unknown as { __fake: { buttons: { pressed: boolean; touched: boolean; value: number }[] } }).__fake;
    fake.buttons[0] = { pressed: true, touched: true, value: 1 };
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__duel!.duel.phase)).toBe('serve');
});

test('tutoriel : seulement les leçons au stick, et la démo du smash dessine le geste', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=tutoriel');
  await expect(page.locator('body')).toContainText('Le smash');
  await expect(page.locator('body')).not.toContainText('Diriger la balle');
  await page.goto('/?mode=tutoriel&lecon=stick-smash');
  await page.waitForTimeout(800);
  await plugPad(page);
  await page.evaluate(() => {
    const fake = (window as unknown as { __fake: { buttons: { pressed: boolean; touched: boolean; value: number }[] } }).__fake;
    fake.buttons[0] = { pressed: true, touched: true, value: 1 };
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const fake = (window as unknown as { __fake: { buttons: { pressed: boolean; touched: boolean; value: number }[] } }).__fake;
    fake.buttons[0] = { pressed: false, touched: false, value: 0 };
  });
  const guide = page.locator('.swing-guide');
  await expect(guide).toContainText('smash', { timeout: 15000 });
  await expect(guide).toContainText('víbora');
  await expect(guide).toContainText('feinte de smash');
  await page.screenshot({ path: 'screenshots/27-guide-coups-hauts.png' });
});

test('tutoriel : la démo au ralenti se passe avec le bouton de validation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=tutoriel&lecon=stick-lob');
  await page.waitForFunction(() => window.__tutorial !== undefined);
  await page.keyboard.press('Enter');
  await expect(page.locator('#tutorial-status')).toContainText('Démo');
  await expect(page.locator('body')).toContainText('pour passer la démo');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tutorial-status')).toContainText('Essai guidé');
});
