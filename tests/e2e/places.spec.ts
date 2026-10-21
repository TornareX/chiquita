import { expect, test } from '@playwright/test';

/**
 * Écran « Jouer » : une seule manette, donnée à Bleu 2 (à gauche). Elle allume sa place quand on appuie sur un
 * bouton ; « Lancer » part sur l'adresse du match, puis la manette joue à gauche en double avec trois IA : la
 * manette virtuelle, pilotée par le joueur automatique, frappe plusieurs fois.
 */
test('une manette seule joue à gauche en double', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.locator('[data-item="jouer"] button').click();
  await page.locator('[data-item="format"] .menu-next').click();
  const place = page.locator('[data-item="place-2"]');
  await expect(place).toContainText('gauche');
  // IA normale → IA forte → Manette 1.
  await place.locator('.menu-next').click();
  await place.locator('.menu-next').click();
  await expect(place.locator('.menu-value')).toHaveText(/Manette 1/);
  // La manette virtuelle ne se place pas : course assistée.
  const course = page.locator('[data-item="place-2-course"]');
  while (!((await course.locator('.menu-value').textContent()) ?? '').startsWith('Aimant')) await course.locator('.menu-next').click();

  // Un bouton de la manette (pas A, qui validerait) allume la place qu'elle joue.
  await page.evaluate(() => {
    const fake = {
      index: 0,
      id: 'manette virtuelle',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, (_, n) => ({ pressed: n === 3, touched: n === 3, value: n === 3 ? 1 : 0 })),
    };
    navigator.getGamepads = () => [fake as unknown as Gamepad];
  });
  await expect(place).toHaveClass(/is-lit/);
  await expect(page.locator('[data-item="manettes"]')).toContainText('Manette 1 : manette virtuelle');
  await page.screenshot({ path: 'screenshots/40-composition.png' });

  await page.locator('[data-item="lancer"] button').click();
  await page.waitForURL(/places=/);
  const url = new URL(page.url());
  expect(url.searchParams.get('places')).toBe('normal,normal,manette1,normal');
  expect(url.searchParams.get('double')).toBe('1');
  // La configuration est retenue pour la prochaine fois.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-smash.match')!).players);
  expect(saved).toEqual(['normal', 'normal', 'manette1', 'normal']);

  // Le même match, avec les boutons, le stick libre pendant la préparation et sans les modèles (plus rapide).
  await page.goto(`${url.pathname}${url.search}&boutons=1&prepa=libre&models=off`);
  await page.waitForFunction(() => window.__duel !== undefined);

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

  await expect(page.locator('#players')).toContainText('Manette 1');
  // Les frappes comptées sont celles de Bleu 2 (place 2) : la manette joue bien à gauche.
  await page.waitForFunction(() => (window as unknown as { __left: { left: number } }).__left.left >= 3, null, {
    timeout: 110_000,
  });
});
