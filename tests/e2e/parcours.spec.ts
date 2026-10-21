import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours dans les menus (`research/MENUS_PLAN.md` §5, étape 6), à la manette virtuelle et au clavier : de l'accueil
 * à un match local, la pause, retour à l'accueil ; les raccourcis d'adresse sautent l'accueil.
 */

/** Manette virtuelle branchée dès le chargement de chaque page ; `window.__pad` tient ses boutons. */
async function plugPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fake = {
      index: 0,
      id: 'manette virtuelle',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { __pad: typeof fake }).__pad = fake;
    navigator.getGamepads = () => [fake as unknown as Gamepad];
  });
}

/** Boutons : A = 0, B = 1, Start = 9, croix : 12 haut, 13 bas, 14 gauche, 15 droite. */
const A = 0;
const START = 9;
const UP = 12;
const DOWN = 13;

async function tap(page: Page, button: number): Promise<void> {
  const set = (pressed: boolean): Promise<void> =>
    page.evaluate(
      ([b, p]) => {
        const pad = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad;
        pad.buttons[b as number] = { pressed: p as boolean, value: p ? 1 : 0 };
      },
      [button, pressed] as const,
    );
  await set(true);
  await page.waitForTimeout(80);
  await set(false);
  await page.waitForTimeout(80);
}

const focused = (page: Page, menu: string) => page.locator(`#${menu} .menu-item.is-focused`);

/** Descend (croix) jusqu'à l'entrée `id`. */
async function padTo(page: Page, menu: string, id: string, button = DOWN): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if ((await focused(page, menu).getAttribute('data-item')) === id) return;
    await tap(page, button);
  }
  throw new Error(`entrée ${id} introuvable`);
}

test('à la manette : accueil → Jouer → match → pause → accueil', async ({ page }) => {
  test.setTimeout(60_000);
  await plugPad(page);
  await page.goto('/');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'accueil');
  await expect(focused(page, 'accueil')).toHaveAttribute('data-item', 'jouer');

  await tap(page, A);
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'jouer');
  // Sa place : la manette 1 (préférence par défaut), contre l'IA.
  await expect(page.locator('[data-item="place-0"] .menu-value')).toHaveText(/Manette 1/);
  await padTo(page, 'accueil', 'lancer');
  await tap(page, A);
  await page.waitForURL(/places=manette1,normal/);
  await page.waitForFunction(() => window.__duel !== undefined);

  // Start : la pause ; la partie s'arrête.
  await tap(page, START);
  await expect(page.locator('#pause-menu')).toBeVisible();
  const tick = await page.evaluate(() => window.__duel!.duel.tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__duel!.duel.tick)).toBe(tick);
  // Reprendre (A au relâcher : la partie ne voit pas le bouton tenu), puis de nouveau la pause.
  await tap(page, A);
  await expect(page.locator('#pause-menu')).toBeHidden();
  await page.waitForFunction((t) => window.__duel!.duel.tick > t, tick);
  await tap(page, START);
  await expect(page.locator('#pause-menu')).toBeVisible();
  await padTo(page, 'pause-menu', 'quitter', UP);
  await tap(page, A);
  await page.waitForURL((url) => url.search === '');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'accueil');
});

test('au clavier : accueil → Jouer (double) → match → Recommencer → accueil', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.keyboard.press('Enter');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'jouer');
  // Format : double.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-item="format"] .menu-value')).toHaveText(/Double/);
  // Échap revient à l'accueil, Entrée y retourne : la configuration est gardée.
  await page.keyboard.press('Escape');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'accueil');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-item="format"] .menu-value')).toHaveText(/Double/);
  for (let i = 0; i < 30 && (await focused(page, 'accueil').getAttribute('data-item')) !== 'lancer'; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForURL(/double=1/);
  await page.waitForFunction(() => window.__duel !== undefined);
  expect(await page.evaluate(() => window.__duel!.duel.players.length)).toBe(4);

  await page.waitForFunction(() => window.__duel!.duel.tick > 240);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(focused(page, 'pause-menu')).toHaveAttribute('data-item', 'recommencer');
  await page.keyboard.press('Enter');
  await expect(page.locator('#pause-menu')).toBeHidden();
  // Partie relancée : de nouveau au service, depuis maintenant.
  expect(await page.evaluate(() => window.__duel!.duel.phaseTick)).toBeGreaterThan(240);

  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await expect(focused(page, 'pause-menu')).toHaveAttribute('data-item', 'quitter');
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.search === '');
  await expect(page.locator('#accueil')).toBeVisible();
});

test('les adresses de jeu sautent l’accueil ; `/` et `?debug` l’affichent', async ({ page }) => {
  await page.goto('/?ai=normal&models=off');
  await page.waitForFunction(() => window.__duel !== undefined);
  await expect(page.locator('#accueil')).toHaveCount(0);
  await page.goto('/?debug');
  await expect(page.locator('#accueil')).toBeVisible();
  await page.goto('/?mode=accueil');
  await expect(page.locator('#accueil')).toBeVisible();
});

test('Entraînement : tutoriel et situations de match ; les outils seulement avec `?debug`', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-item="entrainement"] button').click();
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'entrainement');
  await expect(page.locator('[data-item="machine"]')).toHaveCount(0);
  await expect(page.locator('[data-item="animations"]')).toHaveCount(0);
  await page.locator('[data-item="situations"] button').click();
  await page.locator('[data-item="situation-lob-court"] button').click();
  await page.waitForURL(/mode=labo&situation=lob-court/);
  await expect(page.locator('#panel button[data-situation="lob-court"]')).toHaveClass(/selected/);
  // Retour à l'accueil depuis le labo.
  await page.getByRole('button', { name: 'Retour à l’accueil' }).click();
  await page.waitForURL((url) => url.search === '');

  await page.locator('[data-item="entrainement"] button').click();
  await page.locator('[data-item="tutoriel"] button').click();
  await page.waitForURL(/mode=tutoriel/);

  await page.goto('/?debug');
  await page.locator('[data-item="entrainement"] button').click();
  await expect(page.locator('[data-item="machine"]')).toBeVisible();
  await page.locator('[data-item="animations"] button').click();
  await page.waitForURL(/mode=animations&debug/);
});

test('Réglages : les préférences sont gardées et pré-remplissent « Jouer »', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-item="reglages"] button').click();
  await page.locator('[data-item="son"]').click();
  await expect(page.locator('[data-item="son"] .menu-value')).toHaveText('Non');
  const device = page.locator('[data-item="peripherique"]');
  while ((await device.locator('.menu-value').textContent()) !== 'Manette 2') await device.locator('.menu-next').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'accueil');
  await expect(page.locator('#accueil .is-focused')).toHaveAttribute('data-item', 'reglages');

  await page.reload();
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-smash.preferences')!));
  expect(prefs).toMatchObject({ sound: false, device: 'manette2' });
  // Première fois dans « Jouer » : sa place avec sa manette.
  await page.locator('[data-item="jouer"] button').click();
  await expect(page.locator('[data-item="place-0"] .menu-value')).toHaveText(/Manette 2/);
});
