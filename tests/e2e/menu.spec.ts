import { expect, test, type Page } from '@playwright/test';

/**
 * Composant de menu commun (`src/ui/menu.ts`), sur une page de test (`tests/e2e/pages/menu.html`) : se déplacer,
 * changer un choix, valider et revenir, à la manette virtuelle, au clavier et à la souris.
 */

/** Manette virtuelle : `navigator.getGamepads` rend une manette dont on tient les boutons et le stick. */
async function plugPad(page: Page): Promise<void> {
  await page.evaluate(() => {
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

/** Appuie puis relâche un bouton de la manette virtuelle (A = 0, B = 1, croix : 12 haut, 13 bas, 14 gauche, 15 droite). */
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

const focused = (page: Page) => page.locator('.menu-item.is-focused');

test('à la manette : se déplacer, changer un choix, valider, revenir', async ({ page }) => {
  await page.goto('/tests/e2e/pages/menu.html');
  await plugPad(page);
  await expect(focused(page)).toHaveAttribute('data-item', 'compter');

  // A valide au relâcher.
  await tap(page, 0);
  await expect(page.locator('[data-item="compter"]')).toContainText('Compter (1)');
  // Le focus reste sur l'entrée après le rafraîchissement.
  await expect(focused(page)).toHaveAttribute('data-item', 'compter');

  // Bas : le titre et la note ne se sélectionnent pas.
  await tap(page, 13);
  await expect(focused(page)).toHaveAttribute('data-item', 'niveau');
  await tap(page, 15);
  await expect(page.locator('[data-item="niveau"] .menu-value')).toHaveText('Fort');
  await tap(page, 15);
  await expect(page.locator('[data-item="niveau"] .menu-value')).toHaveText('Facile');
  expect(await page.evaluate(() => (window as unknown as { __state: { level: string } }).__state.level)).toBe('facile');

  // Le stick aussi : vers le bas, puis gauche sur un oui/non.
  await page.evaluate(() => ((window as unknown as { __pad: { axes: number[] } }).__pad.axes[1] = 1));
  await page.waitForTimeout(60);
  await page.evaluate(() => ((window as unknown as { __pad: { axes: number[] } }).__pad.axes[1] = 0));
  await expect(focused(page)).toHaveAttribute('data-item', 'son');
  await tap(page, 14);
  await expect(page.locator('[data-item="son"] .menu-value')).toHaveText('Non');

  // Un code à la manette : A ouvre l'édition, haut change la lettre, droite passe à la suivante, A termine.
  await tap(page, 13);
  await expect(focused(page)).toHaveAttribute('data-item', 'nom');
  await tap(page, 0);
  await expect(page.locator('[data-item="nom"]')).toHaveClass(/is-editing/);
  await tap(page, 12);
  await tap(page, 12);
  await tap(page, 15);
  await tap(page, 12);
  await tap(page, 0);
  await expect(page.locator('[data-item="nom"] input')).toHaveValue('BA');

  // Sous-écran, puis B revient sur l'entrée qui l'avait ouvert ; B à la racine prévient l'écran.
  await tap(page, 13);
  await tap(page, 0);
  await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'sous-ecran');
  await tap(page, 1);
  await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'essai');
  await expect(focused(page)).toHaveAttribute('data-item', 'sous-ecran');
  await tap(page, 1);
  expect(await page.evaluate(() => (window as unknown as { __log: string[] }).__log)).toEqual(['compter', 'racine']);
});

test('au clavier et à la souris', async ({ page }) => {
  await page.goto('/tests/e2e/pages/menu.html');
  await expect(focused(page)).toHaveAttribute('data-item', 'compter');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-item="compter"]')).toContainText('Compter (1)');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-item="niveau"] .menu-value')).toHaveText('Facile');
  // Flèche haut depuis la première entrée : on boucle sur la dernière.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(focused(page)).toHaveAttribute('data-item', 'sous-ecran');

  // Taper un code au clavier, Entrée le valide.
  await page.keyboard.press('ArrowUp');
  await expect(focused(page)).toHaveAttribute('data-item', 'nom');
  await page.keyboard.type('CAB');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as unknown as { __log: string[] }).__log)).toEqual(['compter', 'code CAB']);

  // Échap dans un sous-écran revient.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'sous-ecran');
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'essai');

  // Souris : les flèches d'un choix, un clic sur un oui/non, un clic sur une action.
  await page.locator('[data-item="niveau"] .menu-next').click();
  await expect(page.locator('[data-item="niveau"] .menu-value')).toHaveText('Normal');
  await page.locator('[data-item="son"]').click();
  await expect(page.locator('[data-item="son"] .menu-value')).toHaveText('Non');
  await page.locator('[data-item="compter"] button').click();
  await expect(page.locator('[data-item="compter"]')).toContainText('Compter (2)');
  await expect(focused(page)).toHaveAttribute('data-item', 'compter');
});
