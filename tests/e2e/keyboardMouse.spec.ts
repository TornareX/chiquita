import { expect, test, type Page } from '@playwright/test';

/**
 * Le même geste qu'au stick droit de la manette (`swing.spec.ts`), fait au clavier (I J K L) puis à la souris :
 * Bleu joue au clavier bleu, contre l'IA.
 */
async function startOnKeyboard(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem('padel-smash.reglages', JSON.stringify({ players: ['clavier1', 'normal', 'normal', 'normal'] }));
  });
  await page.goto('/?entrees=detaille');
  await page.waitForFunction(() => window.__duel !== undefined);
  await page.waitForFunction(() => {
    const d = window.__duel!.duel;
    return d.phase === 'serve' && d.tick - d.phaseTick > 480;
  });
}

/** Lance `finish` dans la page au moment idéal du service : un aller-retour de Playwright le rate de peu. */
async function atIdealToss(page: Page, finish: string): Promise<void> {
  await page.evaluate((code) => {
    const watch = (): void => {
      const d = window.__duel!.duel;
      if (d.toss && d.tick >= d.toss.idealTick - 6) new Function(code)();
      else requestAnimationFrame(watch);
    };
    watch();
  }, finish);
}

test('servir au clavier : K tenu (préparation), puis I (tout droit)', async ({ page }) => {
  await startOnKeyboard(page);
  const display = page.locator('.input-display[data-player="0"]');
  await page.keyboard.down('KeyK');
  await expect(display).toContainText('armé au clavier');
  await atIdealToss(
    page,
    `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
     window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyK' }));`,
  );
  await expect(display).toContainText('service');
  expect(await page.evaluate(() => window.__duel!.duel.phase)).not.toBe('serve');
  await page.keyboard.up('KeyK');
  await page.keyboard.up('KeyI');
});

test('servir à la souris : bouton tenu, tirée vers soi, puis poussée vers l’écran', async ({ page }) => {
  await startOnKeyboard(page);
  const display = page.locator('.input-display[data-player="0"]');
  // Vraie souris, dont chaque mouvement fait un aller-retour avec la page : on guette le lancer dès maintenant.
  const tossed = page.waitForFunction(() => window.__duel!.duel.toss !== null);
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(640, 450);
  await expect(display).toContainText('armé au clavier');
  await tossed;
  // Poussée vers l'écran tant que la balle est en l'air : le service part (bon ou pas, c'est l'affaire du timing).
  await page.mouse.move(640, 200);
  await expect(display).toContainText('service');
  await page.mouse.up();
});
