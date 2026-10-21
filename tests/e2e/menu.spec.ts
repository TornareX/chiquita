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
  // La ligne d'aide d'une action se clique aussi.
  await page.locator('[data-item="compter"] .menu-hint').click();
  await expect(page.locator('[data-item="compter"]')).toContainText('Compter (3)');
});

test('accueil en tuiles : gauche et droite passent d’une tuile à l’autre, haut et bas aussi ; les manettes se voient', async ({ page }) => {
  await page.goto('/');
  const home = page.locator('#accueil');
  await expect(home).toHaveAttribute('data-layout', 'tiles');
  await expect(focused(page)).toHaveAttribute('data-item', 'jouer');
  await expect(home.locator('.menu-pads')).toHaveAttribute('data-count', '0');
  await expect(home.locator('.menu-pads-label')).toHaveText('Aucune manette : appuie sur un bouton');

  // Clavier : droite et gauche, en boucle ; bas suit le même ordre.
  await page.keyboard.press('ArrowRight');
  await expect(focused(page)).toHaveAttribute('data-item', 'en-ligne');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(focused(page)).toHaveAttribute('data-item', 'reglages');
  await page.keyboard.press('ArrowDown');
  await expect(focused(page)).toHaveAttribute('data-item', 'jouer');

  // Manette : la croix à droite, puis A ouvre l'écran, en liste, où droite ne déplace plus le focus.
  await plugPad(page);
  await expect(home.locator('.menu-pads')).toHaveAttribute('data-count', '1');
  await expect(home.locator('.menu-pad.is-on')).toHaveCount(1);
  await expect(home.locator('.menu-pads-label')).toHaveText('1 manette');
  await tap(page, 15);
  await tap(page, 15);
  await expect(focused(page)).toHaveAttribute('data-item', 'entrainement');
  await tap(page, 0);
  await expect(home).toHaveAttribute('data-screen', 'entrainement');
  await expect(home).toHaveAttribute('data-layout', 'list');
  const first = await focused(page).getAttribute('data-item');
  await tap(page, 15);
  await expect(focused(page)).toHaveAttribute('data-item', first!);
});

test('Jouer en colonnes : Bleu à gauche, Rouge à droite, tout tient sans défiler ; LB/RB et Tab changent de colonne', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.locator('[data-item="jouer"] button').click();
    const menu = page.locator('#accueil');
    await expect(menu).toHaveAttribute('data-layout', 'columns');
    await page.locator('[data-item="format"] .menu-next').click();
    // Pire cas : quatre places humaines, chacune avec sa course et sa main.
    for (const i of [3, 2, 1, 0]) {
      const value = page.locator(`[data-item="place-${i}"] .menu-value`);
      for (let k = 0; k < 12 && !(await value.innerText()).startsWith(`Manette ${i + 1}`); k++) await page.locator(`[data-item="place-${i}"] .menu-next`).click();
    }
    await expect(page.locator('[data-item$="-course"]')).toHaveCount(4);
    const fits = await page.evaluate(() => {
      const panel = document.querySelector('#accueil .menu-panel')!;
      const launch = document.querySelector('[data-item="lancer"]')!.getBoundingClientRect();
      const hints = document.querySelector('#accueil .menu-pad-hints')!.getBoundingClientRect();
      return panel.scrollHeight <= panel.clientHeight && launch.bottom <= hints.top;
    });
    expect(fits).toBe(true);
    // Chaque équipe dans sa moitié.
    const left = async (id: string) => (await page.locator(`[data-item="${id}"]`).boundingBox())!.x;
    expect(await left('place-0')).toBeLessThan(size.width / 2);
    expect(await left('place-2')).toBeLessThan(size.width / 2);
    expect(await left('place-1')).toBeGreaterThan(size.width / 2);
    expect(await left('place-3')).toBeGreaterThan(size.width / 2);
  }

  // Clavier : bas suit l'ordre de lecture ; Tab passe à l'autre équipe, à la même hauteur ; droite change la valeur.
  await page.locator('[data-item="place-0"]').hover();
  await expect(focused(page)).toHaveAttribute('data-item', 'place-0');
  await page.keyboard.press('ArrowDown');
  await expect(focused(page)).toHaveAttribute('data-item', 'place-0-course');
  await page.keyboard.press('Tab');
  await expect(focused(page)).toHaveAttribute('data-item', 'place-1-course');
  await page.keyboard.press('Shift+Tab');
  await expect(focused(page)).toHaveAttribute('data-item', 'place-0-course');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await expect(focused(page)).toHaveAttribute('data-item', 'place-0');
  await expect(page.locator('[data-item="place-0"] .menu-value')).not.toHaveText(/Manette 1/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-item="place-0"] .menu-value')).toHaveText(/Manette 1/);

  // Manette : RB et LB changent de colonne ; un bouton de la manette 1 allume sa place.
  await plugPad(page);
  await tap(page, 5);
  await expect(focused(page)).toHaveAttribute('data-item', 'place-1');
  await tap(page, 4);
  await expect(focused(page)).toHaveAttribute('data-item', 'place-0');
  await tap(page, 2);
  await expect(page.locator('[data-item="place-0"]')).toHaveClass(/is-lit/);
  await expect(page.locator('#accueil .menu-pad-hint.is-jump')).toBeVisible();

  // Les écrans en liste ne changent pas : Tab n'y déplace pas le focus du menu.
  await page.keyboard.press('Escape');
  await page.locator('[data-item="reglages"] button').click();
  await expect(page.locator('#accueil')).toHaveAttribute('data-layout', 'list');
  await expect(page.locator('#accueil .menu-pad-hint.is-jump')).toBeHidden();
});

test('Jouer en colonnes : la croix suit l’écran, sans sauter d’une colonne à l’autre', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.locator('[data-item="jouer"] button').click();
  await page.locator('[data-item="format"] .menu-next').click();
  const path = async (keys: string[], ids: string[]): Promise<void> => {
    for (const [n, key] of keys.entries()) {
      await page.keyboard.press(key);
      await expect(focused(page)).toHaveAttribute('data-item', ids[n]!);
    }
  };
  const down = (n: number) => Array<string>(n).fill('ArrowDown');

  // Colonne Bleu jusqu'en bas, puis les règles de gauche, puis « Retour » ; droite : « Lancer » ; haut : la colonne d'où l'on vient.
  await page.locator('[data-item="place-0"]').hover();
  await path(down(9), ['place-0-course', 'place-0-main', 'place-2', 'place-2-main', 'libre', 'sets', 'jeux', 'retour', 'retour']);
  await path(['ArrowRight', 'ArrowUp'], ['lancer', 'jeux']);

  // Colonne Rouge, puis les règles de droite, puis « Lancer » ; gauche : « Retour » ; haut : la colonne d'où l'on vient.
  await page.locator('[data-item="place-1"]').hover();
  await path(down(6), ['place-1-main', 'place-3', 'place-3-main', 'punto', 'pression', 'lancer']);
  await path(['ArrowLeft', 'ArrowUp'], ['retour', 'pression']);

  // Haut depuis la première place : le format ; bas y ramène. Tab change de colonne, même dans les règles.
  await page.locator('[data-item="place-0"]').hover();
  await path(['ArrowUp', 'ArrowDown'], ['format', 'place-0']);
  await page.locator('[data-item="libre"]').hover();
  await path(['Tab', 'Shift+Tab'], ['punto', 'libre']);

  // Manette : LB/RB depuis un choix, un stick en diagonale ne change pas de colonne, et tenu vers le bas il descend
  // toute la colonne Bleu sans passer à droite.
  await plugPad(page);
  await page.locator('[data-item="place-0-main"]').hover();
  await tap(page, 5);
  await expect(focused(page)).toHaveAttribute('data-item', /^place-[13]/);
  await tap(page, 4);
  await expect(focused(page)).toHaveAttribute('data-item', /^place-[02]/);
  await page.locator('[data-item="place-0"]').hover();
  const stick = (x: number, y: number) =>
    page.evaluate(([ax, ay]) => {
      (window as unknown as { __pad: { axes: number[] } }).__pad.axes = [ax!, ay!, 0, 0];
    }, [x, y]);
  await stick(0.75, 0.75);
  await page.waitForTimeout(150);
  await stick(0, 0);
  await expect(focused(page)).toHaveAttribute('data-item', 'place-0-course');
  const seen = new Set<string>();
  await stick(0, 1);
  for (let t = 0; t < 20; t++) {
    seen.add((await focused(page).getAttribute('data-item'))!);
    await page.waitForTimeout(100);
  }
  await stick(0, 0);
  await expect(focused(page)).toHaveAttribute('data-item', 'retour');
  expect([...seen].filter((id) => /^place-[13]|punto|pression|lancer/.test(id))).toEqual([]);
});

/** L'écran tient sans défiler : rien sous le pli, et la dernière entrée au-dessus de la barre d'aides. */
async function fitsOnScreen(page: Page, root: string, last: string): Promise<boolean> {
  return page.evaluate(
    ([rootId, lastId]) => {
      const panel = document.querySelector(`#${rootId} .menu-panel`)!;
      const item = document.querySelector(`#${rootId} [data-item="${lastId}"]`)!.getBoundingClientRect();
      const hints = document.querySelector(`#${rootId} .menu-pad-hints`)!.getBoundingClientRect();
      return panel.scrollHeight <= panel.clientHeight && item.bottom <= hints.top;
    },
    [root, last] as const,
  );
}

test('Réglages, Entraînement et situations tiennent sans défiler ; la fiche suit la situation sélectionnée', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.locator('[data-item="reglages"] button').click();
    await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'reglages');
    expect(await fitsOnScreen(page, 'accueil', 'retour')).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('[data-item="entrainement"] button').click();
    expect(await fitsOnScreen(page, 'accueil', 'retour')).toBe(true);
    await page.locator('[data-item="situations"] button').click();
    await expect(page.locator('#accueil')).toHaveAttribute('data-layout', 'detail');
    expect(await fitsOnScreen(page, 'accueil', 'retour')).toBe(true);
  }

  // La fiche montre le nom et l'explication de la situation sélectionnée, boutons écrits en clair.
  const detail = page.locator('.menu-detail');
  await expect(focused(page)).toHaveAttribute('data-item', 'situation-echange-fond');
  await expect(page.locator('.menu-detail-title')).toHaveText('Échange de fond');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.menu-detail-title')).toHaveText('Balle flottante au filet');
  await expect(page.locator('.menu-detail-text')).toContainText('de volée');
  await expect(page.locator('.menu-detail-text')).not.toContainText('{');
  // Liste ordinaire : droite ne bouge pas le focus, la fiche est à côté de la liste.
  await page.keyboard.press('ArrowRight');
  await expect(focused(page)).toHaveAttribute('data-item', 'situation-balle-flottante');
  const list = (await focused(page).boundingBox())!;
  const box = (await detail.boundingBox())!;
  expect(box.x).toBeGreaterThan(list.x + list.width);
  // « Retour » n'a pas d'explication : pas de fiche.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(focused(page)).toHaveAttribute('data-item', 'retour');
  await expect(detail).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'entrainement');
});

test('pause : bandeau à gauche, Reprendre en premier, la pause et ses réglages tiennent sans défiler', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/?ai=normal&bot=both&seed=7');
    await page.waitForFunction(() => (window as unknown as { __duel?: unknown }).__duel !== undefined);
    await page.keyboard.press('Escape');
    const pause = page.locator('#pause-menu');
    await expect(pause).toHaveAttribute('data-screen', 'pause');
    await expect(pause.locator('.menu-item.is-focused')).toHaveAttribute('data-item', 'reprendre');
    expect(await fitsOnScreen(page, 'pause-menu', 'quitter')).toBe(true);
    // Le menu dans la moitié gauche : le match reste visible à droite.
    const panel = (await pause.locator('.menu-panel').boundingBox())!;
    expect(panel.x + panel.width).toBeLessThan(size.width * 0.6);
    await pause.locator('[data-item="reglages"] button').click();
    await expect(pause).toHaveAttribute('data-screen', 'reglages');
    expect(await fitsOnScreen(page, 'pause-menu', 'retour')).toBe(true);
  }
});
