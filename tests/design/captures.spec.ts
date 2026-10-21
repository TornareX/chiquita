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
      // La fiche la plus longue (contre-vitre).
      await page.locator('[data-item="situation-lob-qui-passe"]').hover();
      await shot(page, '07b-situations-fiche-longue');
    });

    test('en ligne', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
      await page.locator('#online-lobby[data-screen="en-ligne"]').waitFor();
      await shot(page, '10-en-ligne');
      await menuItem(page, 'creer');
      await page.locator('#online-lobby[data-screen="salle"]').waitFor();
      await shot(page, '11-salle');
      // La pause en ligne : le match continue derrière.
      await menuItem(page, 'lancer');
      await page.waitForFunction(() => window.__duel?.online?.() != null, null, { timeout: 30_000 });
      await page.waitForFunction(() => window.__duel!.duel.tick > 240, null, { timeout: 30_000 });
      // Liaison perdue pendant le match : le bandeau, affiché à la main (couper le serveur des tests n'est pas possible).
      await page.evaluate(() => {
        const banner = document.getElementById('online-banner')!;
        banner.textContent = 'Connexion perdue, reconnexion…';
        banner.hidden = false;
      });
      await shot(page, '14-coupure');
      await page.evaluate(() => (document.getElementById('online-banner')!.hidden = true));
      await page.keyboard.press('Escape');
      await page.locator('#pause-menu').waitFor();
      await shot(page, '13-pause-en-ligne');
      await page.goto('/?enligne&serveur=localhost:1');
      await page.locator('#online-lobby .menu-message').waitFor();
      await shot(page, '12-serveur-introuvable');
    });

    test('en ligne, à plusieurs', async ({ browser }) => {
      test.setTimeout(90_000);
      const open = async (name: string) => {
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
        const page = await context.newPage();
        await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
        await page.locator('#online-lobby[data-screen="en-ligne"]').waitFor();
        await page.fill('[data-item="nom"] input', name);
        return page;
      };
      // Code inconnu.
      const host = await open('Xavier');
      await host.fill('[data-item="code"] input', 'ZZZZ');
      await menuItem(host, 'rejoindre');
      await host.locator('#online-lobby .menu-message:not(:empty)').waitFor();
      await shot(host, '12b-code-inconnu');

      // Un ami rejoint : ce que voit l'invité (il attend l'hôte).
      await menuItem(host, 'creer');
      const code = (await host.locator('.room-code').textContent())!;
      const guest = await open('Ami');
      await guest.fill('[data-item="code"] input', code);
      await menuItem(guest, 'rejoindre');
      await guest.locator('[data-item="attente"]').waitFor();
      await host.locator('[data-item="place-1"]', { hasText: 'Ami' }).waitFor();
      await shot(guest, '11b-salle-invite');

      // En simple, la salle est pleine pour un troisième.
      await host.locator('[data-item="format"] .menu-prev').click();
      await host.locator('[data-item="format"] .menu-value', { hasText: 'Simple' }).waitFor();
      const third = await open('Léa');
      await third.fill('[data-item="code"] input', code);
      await menuItem(third, 'rejoindre');
      await third.locator('[data-item="sans-place"]').waitFor();
      await shot(third, '11c-salle-pleine');
      await shot(host, '11d-salle-hote-simple');
    });

    test('en ligne, code à la manette', async ({ page }) => {
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
      await page.goto(`/?enligne&serveur=${GAME_SERVER}`);
      await page.locator('#online-lobby[data-screen="en-ligne"]').waitFor();
      const tap = async (button: number) => {
        for (const pressed of [true, false]) {
          await page.evaluate(
            ([b, p]) => {
              (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b as number] = { pressed: p as boolean, value: p ? 1 : 0 };
            },
            [button, pressed],
          );
          await page.waitForTimeout(60);
        }
      };
      await page.locator('[data-item="code"]').hover();
      await tap(0);
      // E, M, puis la troisième case.
      for (let i = 0; i < 5; i++) await tap(12);
      await tap(15);
      for (let i = 0; i < 12; i++) await tap(12);
      await tap(15);
      await page.mouse.move(0, 0);
      await shot(page, '10b-code-manette');
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
      await menuItem(page, 'reglages');
      await shot(page, '22b-pause-reglages');

      await page.goto(`${MATCH}&double=1`);
      await page.waitForFunction(() => window.__duel !== undefined);
      await page.waitForTimeout(6000);
      await shot(page, '23-hud-double');

      await page.goto('/?ai=normal&boutons=1&entrees=detaille');
      await page.waitForFunction(() => window.__duel !== undefined);
      await page.waitForTimeout(1500);
      await shot(page, '24-affichage-entrees');
    });

    test('états du match', async ({ page }) => {
      test.setTimeout(60_000);
      // Au clavier, en mode détaillé : service, K tenu puis relâché.
      await page.goto('/?ai=normal&entrees=detaille&seed=7');
      await page.waitForFunction(() => window.__duel?.duel.phase === 'serve');
      await page.waitForTimeout(800);
      await page.keyboard.down('KeyK');
      await page.waitForTimeout(400);
      await shot(page, '25-service-clavier');
      await page.keyboard.up('KeyK');
      await page.waitForTimeout(700);
      await shot(page, '26-apres-frappe');

      // Grand bandeau des effets et ralenti : copies figées des vrais éléments (la boucle du jeu pilote les originaux).
      await page.evaluate(() => {
        const freeze = (id: string, setup: (copy: HTMLElement) => void): void => {
          const copy = document.getElementById(id)!.cloneNode(true) as HTMLElement;
          setup(copy);
          document.body.append(copy);
        };
        freeze('effect-banner', (copy) => {
          copy.textContent = 'POR TRES !';
          copy.style.opacity = '1';
          copy.style.transform = 'scale(1) rotate(-4deg)';
        });
        freeze('replay-badge', (copy) => (copy.style.display = 'block'));
      });
      await shot(page, '27-bandeau-ralenti');

      await page.goto(`${MATCH}&reseau=120`);
      await page.waitForFunction(() => window.__duel !== undefined);
      await page.waitForTimeout(2000);
      await shot(page, '28-faux-reseau');
    });

    test('test de la manette, en cours', async ({ page }) => {
      // Manette virtuelle : A (bouton du bas) est le premier bouton demandé.
      await page.addInitScript(() => {
        const fake = {
          index: 0,
          id: 'manette virtuelle',
          connected: true,
          mapping: 'standard',
          axes: [0.5, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        };
        (window as unknown as { __pad: typeof fake }).__pad = fake;
        navigator.getGamepads = () => [fake as unknown as Gamepad];
      });
      await page.goto('/');
      await menuItem(page, 'reglages');
      await menuItem(page, 'tester-manette');
      const press = (pressed: boolean) =>
        page.evaluate((p) => {
          (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[0] = { pressed: p, value: p ? 1 : 0 };
        }, pressed);
      await press(true);
      await page.waitForTimeout(150);
      await press(false);
      await page.waitForTimeout(150);
      await press(true);
      await page.waitForTimeout(150);
      await shot(page, '08-test-manette-boutons');
    });

    test('écrans annexes', async ({ page }) => {
      await page.goto('/?mode=tutoriel');
      await page.waitForTimeout(2500);
      await shot(page, '30-tutoriel');
      await page.goto('/?mode=labo&situation=lob-court');
      await page.locator('#panel').waitFor();
      await page.waitForTimeout(1500);
      await shot(page, '31-labo');

      // Décompte avant que la situation reparte.
      await page.keyboard.press('KeyR');
      await page.locator('#countdown').waitFor({ state: 'visible' });
      await shot(page, '34-labo-decompte');

      // Tutoriel : carte d'une leçon, puis bandeau de la démo.
      await page.goto('/?mode=tutoriel&boutons=1');
      await page.locator('#tutorial-overlay .lesson').first().waitFor();
      await page.keyboard.press('Enter');
      await page.locator('#tutorial-overlay h2').first().waitFor();
      await shot(page, '32-tutoriel-carte');
      await page.keyboard.press('Enter');
      await page.locator('#tutorial-status', { hasText: 'Démo' }).waitFor();
      await page.waitForTimeout(1500);
      await shot(page, '33-tutoriel-demo');
    });
  });
}
