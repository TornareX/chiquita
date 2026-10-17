import { expect, test } from '@playwright/test';

/**
 * Tutoriel, leçon « coup normal », de bout en bout : liste, carte, démo au ralenti, essais guidés puis
 * seuls, jusqu'à la leçon réussie. Bleu joue avec une manette PlayStation virtuelle tenue par un bot
 * (coup normal, relâché au moment idéal) : même chemin qu'une vraie manette.
 */
test('la leçon du coup normal se joue jusqu’au bout', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=tutoriel&boutons=1');
  await page.waitForFunction(() => window.__tutorial !== undefined);
  await expect(page.locator('#tutorial-overlay')).toContainText('Le coup normal');

  await page.keyboard.press('Enter');
  await expect(page.locator('#tutorial-overlay')).toContainText('Quand');
  await page.screenshot({ path: 'screenshots/22-tutoriel-carte.png' });
  await page.keyboard.press('Enter');
  await expect(page.locator('#tutorial-status')).toContainText('Démo');

  await page.waitForFunction(() => window.__tutorial!.phase === 'guided', null, { timeout: 30_000 });
  // L'élève prend la manette : un bot qui joue le coup normal, relâché au moment idéal.
  await page.evaluate(() => {
    const { duel, Bot } = window.__duel!;
    const bot = new Bot(0, 3, {
      reaction: 0.2, normalShare: 1, sliceShare: 0, aim: 0, release: { offset: 0, spread: 0 }, manualPlacement: false,
      tactics: false, overhead: { maxDepth: 0, remate: 0, vibora: 0, bajada: 0 }, choices: { lob: 0, chiquita: 0, body: 0, cut: 0 },
      forced: { kind: 'normal', stick: { forward: 0, right: 0 } },
    });
    let lastTick = -1;
    let pads: Gamepad[] = [];
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        const commands = bot.commands(duel);
        const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
        if (commands.shot === 'normal') buttons[0] = { pressed: true, touched: true, value: 1 };
        pads = [{
          index: 0, id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', connected: true,
          mapping: 'standard', axes: [commands.stick.right, -commands.stick.forward, 0, 0], buttons,
        } as unknown as Gamepad];
      }
      return pads;
    };
  });
  await expect(page.locator('#tutorial-prompt')).toContainText(/Appuie sur|Garde|Relâche/, { timeout: 15_000 });
  await page.screenshot({ path: 'screenshots/23-tutoriel-guide.png' });
  await page.waitForFunction(() => window.__tutorial!.phase === 'solo', null, { timeout: 40_000 });
  await page.waitForFunction(() => window.__tutorial!.phase === 'done', null, { timeout: 80_000 });
  await expect(page.locator('#tutorial-overlay')).toContainText('réussie');
  await page.screenshot({ path: 'screenshots/24-tutoriel-reussi.png' });
  // Progression mémorisée.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('padel-smash.tutoriel') ?? '{}')['coup-normal'])).toBeGreaterThanOrEqual(1);
});

test('la leçon de direction dessine la zone à viser', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=tutoriel&lecon=diriger&boutons=1');
  await page.waitForFunction(() => window.__tutorial !== undefined);
  await page.keyboard.press('Enter');
  await expect(page.locator('#tutorial-instruction')).toContainText('à droite');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/25-tutoriel-zone.png' });
});
