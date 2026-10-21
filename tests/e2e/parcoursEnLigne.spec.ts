import { expect, test, type Page } from '@playwright/test';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GAME_SERVER = `localhost:${env.E2E_SERVEUR ?? 2567}`;

/**
 * Parcours en ligne à la manette virtuelle (`research/MENUS_PLAN.md` §5) : accueil → En ligne → créer une salle →
 * lancer le match (contre l'IA du serveur) → pause → quitter la salle → accueil. Et le serveur introuvable.
 */

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

async function padTo(page: Page, menu: string, id: string, button = DOWN): Promise<void> {
  const focused = page.locator(`#${menu} .menu-item.is-focused`);
  for (let i = 0; i < 30; i++) {
    if ((await focused.getAttribute('data-item')) === id) return;
    await tap(page, button);
  }
  throw new Error(`entrée ${id} introuvable`);
}

test('à la manette : accueil → En ligne → salle → match → quitter la salle → accueil', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await plugPad(page);
  await page.goto(`/?serveur=${GAME_SERVER}`);
  await padTo(page, 'accueil', 'en-ligne');
  await tap(page, A);
  await page.waitForURL(/enligne/);
  expect(new URL(page.url()).searchParams.get('serveur')).toBe(GAME_SERVER);

  // Salon : créer une salle (le nom vide devient « Joueur »).
  await expect(page.locator('#online-lobby')).toHaveAttribute('data-screen', 'en-ligne');
  await padTo(page, 'online-lobby', 'creer');
  await tap(page, A);
  await expect(page.locator('#online-lobby')).toHaveAttribute('data-screen', 'salle');
  await expect(page.locator('.room-code')).toHaveText(/^[A-Z]{4}$/);
  await expect(page.locator('[data-item="place-0"]')).toContainText('Joueur (toi)');

  // L'hôte lance : le match part, joué contre l'IA du serveur.
  await padTo(page, 'online-lobby', 'lancer');
  await tap(page, A);
  await expect(page.locator('#online-lobby')).toBeHidden();
  await page.waitForFunction(() => window.__duel?.online?.() != null, null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__duel!.duel.tick > 240, null, { timeout: 30_000 });

  // Pause : le match continue (en ligne, on ne l'arrête pas pour les autres) ; quitter la salle ramène à l'accueil.
  await tap(page, START);
  await expect(page.locator('#pause-menu')).toBeVisible();
  const tick = await page.evaluate(() => window.__duel!.duel.tick);
  await page.waitForFunction((t) => window.__duel!.duel.tick > t + 60, tick);
  await padTo(page, 'pause-menu', 'quitter', UP);
  await expect(page.locator('[data-item="quitter"]')).toContainText('Quitter la salle');
  await tap(page, A);
  await page.waitForURL((url) => url.search === '');
  await expect(page.locator('#accueil')).toHaveAttribute('data-screen', 'accueil');

  // De retour dans « En ligne » : pas de reprise du match quitté, on est au salon.
  await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
  await expect(page.locator('#online-lobby')).toHaveAttribute('data-screen', 'en-ligne');
  await page.waitForTimeout(1500);
  await expect(page.locator('#online-lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

test('serveur introuvable : un message, « Réessayer » et « Retour à l’accueil »', async ({ page }) => {
  await page.goto('/?enligne&serveur=localhost:1');
  await expect(page.locator('#online-lobby .menu-message')).toContainText('Serveur introuvable');
  await expect(page.locator('[data-item="reessayer"]')).toBeVisible();
  await page.locator('[data-item="reessayer"] button').click();
  await expect(page.locator('#online-lobby .menu-message')).toContainText('Serveur introuvable');
  await page.locator('[data-item="retour"] button').click();
  await page.waitForURL((url) => url.search === '');
  await expect(page.locator('#accueil')).toBeVisible();
});
