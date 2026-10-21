import { test, type Page } from '@playwright/test';

/**
 * Une capture de chaque surface hors scène 3D (`research/DESIGN_PLAN.md` §2), en 1280×720 et 1920×1080, dans
 * `screenshots/design/<CAPTURES>/` (`avant` par défaut). Sert à comparer avant/après chaque étape de la passe design ;
 * ne vérifie rien.
 */

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const DIR = `screenshots/design/${env.CAPTURES ?? 'avant'}`;
const GAME_SERVER = `localhost:${env.E2E_SERVEUR ?? 2567}`;
// Match local rejoué à l'identique : deux IA, même graine.
const MATCH = '/?ai=normal&bot=both&seed=7';

const SIZES = [
  { name: '720p', width: 1280, height: 720 },
  { name: '1080p', width: 1920, height: 1080 },
] as const;

async function menuItem(page: Page, id: string): Promise<void> {
  await page.locator(`[data-item="${id}"] button`).first().click();
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}-${size.name}.png` });

    test('menus', async ({ page }) => {
      await page.goto('/');
      await page.locator('#accueil').waitFor();
      await shot(page, '01-accueil');

      await menuItem(page, 'jouer');
      await shot(page, '02-jouer-simple');
      await page.keyboard.press('ArrowRight');
      await shot(page, '03-jouer-double');
      await page.keyboard.press('Escape');

      await menuItem(page, 'reglages');
      await shot(page, '04-reglages');
      await menuItem(page, 'tester-manette');
      await page.waitForTimeout(300);
      await shot(page, '05-test-manette');
      await page.goto('/');

      await menuItem(page, 'entrainement');
      await shot(page, '06-entrainement');
      await menuItem(page, 'situations');
      await shot(page, '07-situations');
    });

    test('en ligne', async ({ page }) => {
      await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
      await page.locator('#online-lobby[data-screen="en-ligne"]').waitFor();
      await shot(page, '10-en-ligne');
      await menuItem(page, 'creer');
      await page.locator('#online-lobby[data-screen="salle"]').waitFor();
      await shot(page, '11-salle');
      await page.goto('/?enligne&serveur=localhost:1');
      await page.locator('#online-lobby .menu-message').waitFor();
      await shot(page, '12-serveur-introuvable');
    });

    test('match', async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(MATCH);
      await page.waitForFunction(() => window.__duel !== undefined);
      await page.waitForTimeout(1500);
      await shot(page, '20-hud-service');
      await page.waitForTimeout(5000);
      await shot(page, '21-hud-echange');
      await page.keyboard.press('Escape');
      await page.locator('#pause-menu').waitFor();
      await shot(page, '22-pause');

      await page.goto(`${MATCH}&double=1`);
      await page.waitForFunction(() => window.__duel !== undefined);
      await page.waitForTimeout(6000);
      await shot(page, '23-hud-double');

      await page.goto('/?ai=normal&boutons=1&entrees=detaille');
      await page.waitForFunction(() => window.__duel !== undefined);
      await page.waitForTimeout(1500);
      await shot(page, '24-affichage-entrees');
    });

    test('écrans annexes', async ({ page }) => {
      await page.goto('/?mode=tutoriel');
      await page.waitForTimeout(2500);
      await shot(page, '30-tutoriel');
      await page.goto('/?mode=labo&situation=lob-court');
      await page.locator('#panel').waitFor();
      await page.waitForTimeout(1500);
      await shot(page, '31-labo');
    });
  });
}
