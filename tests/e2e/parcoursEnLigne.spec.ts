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
const RIGHT = 15;

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

  // L'hôte lance : le match part, joué contre l'IA du serveur. « Lancer » est en bas à droite, à côté de « Quitter ».
  await padTo(page, 'online-lobby', 'quitter-salle');
  await padTo(page, 'online-lobby', 'lancer', RIGHT);
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

/** Toutes les entrées de l'écran tiennent dans la fenêtre, au-dessus de la barre d'aides, sans défiler. */
async function fitsWithoutScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('#online-lobby .menu-panel')!;
    const hints = document.querySelector<HTMLElement>('#online-lobby .menu-pad-hints')!.getBoundingClientRect();
    const items = [...panel.querySelectorAll<HTMLElement>('[data-item]')].map((e) => e.getBoundingClientRect());
    return {
      scroll: panel.scrollHeight - panel.clientHeight,
      below: Math.max(...items.map((r) => r.bottom)) - hints.top,
      right: Math.max(...items.map((r) => r.right)) - window.innerWidth,
    };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(1);
  expect(overflow.below).toBeLessThanOrEqual(0);
  expect(overflow.right).toBeLessThanOrEqual(0);
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`en ligne en ${size.height}p : salon et salle en deux moitiés, sans défiler, la croix suit l'écran`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
    const lobby = page.locator('#online-lobby');
    const focused = lobby.locator('.menu-item.is-focused');
    const box = async (id: string) => (await page.locator(`[data-item="${id}"]`).boundingBox())!;
    await expect(lobby).toHaveAttribute('data-layout', 'columns');
    await fitsWithoutScroll(page);
    // Créer à gauche, rejoindre à droite ; le bas de la colonne mène à « Retour ».
    expect((await box('code')).x).toBeGreaterThan((await box('creer')).x + (await box('creer')).width);
    await expect(focused).toHaveAttribute('data-item', 'nom');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('data-item', 'creer');
    await page.keyboard.press('ArrowRight');
    await expect(focused).toHaveAttribute('data-item', 'code');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('data-item', 'rejoindre');
    await page.keyboard.press('ArrowLeft');
    await expect(focused).toHaveAttribute('data-item', 'creer');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('data-item', 'retour');

    // La salle : le code en très grand, Bleu à gauche, Rouge à droite, sa place marquée.
    await page.locator('[data-item="creer"] button').click();
    await expect(lobby).toHaveAttribute('data-screen', 'salle');
    await fitsWithoutScroll(page);
    const code = await box('code-salle');
    expect(code.height).toBeGreaterThan(size.height * 0.14);
    expect(code.y).toBeLessThan(size.height * 0.3);
    await expect(page.locator('[data-item="place-0"]')).toHaveClass(/is-mine/);
    await expect(page.locator('[data-item="place-1"]')).toHaveClass(/is-free/);
    expect((await box('place-1')).x).toBeGreaterThan((await box('place-0')).x + (await box('place-0')).width);
    // Bas dans la colonne Bleu, puis « Quitter » ; droite : « Lancer » ; haut ramène d'où l'on venait.
    await expect(focused).toHaveAttribute('data-item', 'place-0');
    for (const id of ['place-2', 'peripherique', 'quitter-salle']) {
      await page.keyboard.press('ArrowDown');
      await expect(focused).toHaveAttribute('data-item', id);
    }
    await page.keyboard.press('ArrowRight');
    await expect(focused).toHaveAttribute('data-item', 'lancer');
    await page.keyboard.press('ArrowUp');
    await expect(focused).toHaveAttribute('data-item', 'peripherique');
    await page.keyboard.press('Tab');
    await expect(focused).toHaveAttribute('data-item', 'format');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('data-item', 'niveau');
    await page.keyboard.press('ArrowDown');
    await expect(focused).toHaveAttribute('data-item', 'lancer');
  });
}

test('en ligne : code inconnu et salle pleine, un message et une suite', async ({ browser }) => {
  const open = async (name: string) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
    await page.fill('[data-item="nom"] input', name);
    return page;
  };
  const host = await open('Xavier');
  await host.fill('[data-item="code"] input', 'ZZZZ');
  await host.locator('[data-item="rejoindre"] button').click();
  await expect(host.locator('#online-lobby .menu-message')).toContainText('Aucune salle avec ce code');
  await expect(host.locator('#online-lobby .menu-message')).toHaveAttribute('data-tone', 'error');

  await host.locator('[data-item="creer"] button').click();
  const code = (await host.locator('.room-code').textContent())!;
  await host.locator('[data-item="format"] .menu-prev').click();
  await expect(host.locator('[data-item="format"] .menu-value')).toHaveText('Simple (1 contre 1)');
  const guest = await open('Ami');
  await guest.fill('[data-item="code"] input', code);
  await guest.locator('[data-item="rejoindre"] button').click();
  await expect(guest.locator('[data-item="place-1"]')).toHaveClass(/is-mine/);
  await expect(guest.locator('[data-item="attente"]')).toContainText('Xavier');
  // Le troisième n'a pas de place : on le lui dit, et l'hôte voit qu'il regarde.
  const third = await open('Léa');
  await third.fill('[data-item="code"] input', code);
  await third.locator('[data-item="rejoindre"] button').click();
  await expect(third.locator('[data-item="sans-place"]')).toContainText('Salle pleine');
  await expect(third.locator('[data-item="place-0"]')).toHaveClass(/is-taken/);
  await expect(host.locator('[data-item="sans-place"]')).toContainText('Léa');
});
