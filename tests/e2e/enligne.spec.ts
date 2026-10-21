import { expect, test, type Page } from '@playwright/test';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const GAME_SERVER = `localhost:${env.E2E_SERVEUR ?? 2567}`;

/**
 * Deux manettes branchées sur le PC, vues par chaque fenêtre (comme sur un vrai PC : le navigateur donne toutes les
 * manettes à toutes les pages). Dans cette fenêtre, seule la manette `own` (0 ou 1) est tenue, par une IA qui ne voit
 * que la partie de cette fenêtre (comme un joueur devant son écran) ; l'autre reste au repos. Installée avant le
 * chargement de la page : elle attend que la partie existe.
 */
async function virtualPads(page: Page, seed: number, own: number): Promise<void> {
  await page.addInitScript(([seed, own]) => {
    const buttonOf = { normal: 0, overhead: 1, slice: 2, lob: 3 } as const;
    let bot: { commands(duel: unknown): { stick: { forward: number; right: number }; shot: keyof typeof buttonOf | null } } | null = null;
    let lastTick = -1;
    let pads: Gamepad[] = [];
    navigator.getGamepads = () => {
      const online = window.__duel?.online?.();
      if (!window.__duel || !online) return [];
      const { duel, Bot } = window.__duel;
      const seat = online.options.seats[0];
      if (seat === undefined) return [];
      bot ??= new Bot(seat, seed) as unknown as NonNullable<typeof bot>;
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        // L'IA remplit des caches de la partie (`ownerCache`) : un vrai joueur ne le fait pas, on les remet comme avant
        // (comme `withoutTrace` sur le serveur), sinon l'empreinte de ce navigateur diffère de celle du serveur.
        const record = duel as unknown as Record<string, unknown>;
        const saved = Object.keys(record)
          .filter((key) => key.endsWith('Cache'))
          .map((key) => [key, Array.isArray(record[key]) ? [...(record[key] as unknown[])] : record[key]] as const);
        const commands = bot.commands(duel);
        for (const [key, value] of saved) {
          const current = record[key];
          if (Array.isArray(current) && Array.isArray(value)) current.splice(0, current.length, ...value);
          else record[key] = value;
        }
        // L'équipe d'en face (places 1 et 3) voit l'écran à l'envers : ses directions le sont aussi.
        const flip = seat % 2 === 0 ? 1 : -1;
        const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
        if (commands.shot) buttons[buttonOf[commands.shot]] = { pressed: true, touched: true, value: 1 };
        const idle = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
        pads = [0, 1].map(
          (index) =>
            ({
              index,
              id: `manette virtuelle ${index + 1}`,
              connected: true,
              mapping: 'standard',
              axes: index === own ? [commands.stick.right * flip, -commands.stick.forward * flip, 0, 0] : [0, 0, 0, 0],
              buttons: index === own ? buttons : idle,
            }) as unknown as Gamepad,
        );
      }
      return pads;
    };
  }, [seed, own] as const);
}

/**
 * Jeu en ligne, phase 1 : deux onglets (deux joueurs sur un même PC, deux manettes) passent par le salon et le vrai
 * serveur (`npm run serveur`) : l'un crée une salle et choisit la manette 1 dans le salon, l'autre rejoint avec le
 * code et `&manette=2` dans l'adresse ; l'hôte lance un double (les deux places libres jouées par l'IA du serveur).
 * Chaque fenêtre ne doit lire que sa manette (sinon l'invité, qui lirait la manette 1 au repos chez lui, ne frapperait
 * jamais), et calculer exactement le même match que le serveur, seconde après seconde.
 */
/** Garde chaque WebSocket ouverte par la page (`window.__sockets`), pour pouvoir couper la liaison dans un test. */
async function trackSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const sockets: WebSocket[] = [];
    (window as unknown as { __sockets: WebSocket[] }).__sockets = sockets;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        sockets.push(this);
      }
    };
  });
}

/** Ce que dit le client en ligne d'une fenêtre. */
async function stats(page: Page) {
  return page.evaluate(() => {
    // Match pas encore commencé (ou page en train de recharger) : rien de compté.
    const online = window.__duel?.online?.();
    if (!window.__duel || !online) {
      return { ping: 0, ahead: 0, overridden: 0, checked: 0, desyncs: 0, firstDesync: null, resyncs: 0, tick: 0, hits: [] as boolean[], rollbacks: 0 };
    }
    const { duel } = window.__duel;
    return { ...online.stats, tick: duel.tick, hits: duel.players.map((p) => Number.isFinite(p.lastHitTick)), rollbacks: online.session.stats.rollbacks };
  });
}

test('en ligne : deux joueurs, une salle à code, le même match que le serveur', async ({ browser }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const open = async (seed: number, own: number, query = ''): Promise<Page> => {
    const context = await browser.newContext({ viewport: { width: 400, height: 225 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await virtualPads(page, seed, own);
    await page.goto(`/?enligne&serveur=${GAME_SERVER}&boutons=1${query}`);
    await page.waitForSelector('#online-name');
    return page;
  };
  const host = await open(61, 0);
  const guest = await open(62, 1, '&manette=2');
  await expect(guest.locator('#online-device')).toHaveValue('manette2');

  await host.selectOption('#online-device', 'manette1');
  await host.fill('#online-name', 'Xavier');
  await host.click('#online-create');
  const codeBox = host.locator('.room-code');
  await expect(codeBox).toHaveText(/^[A-Z]{4}$/);
  const code = (await codeBox.textContent())!;

  await guest.fill('#online-name', 'Ami');
  await guest.fill('#online-code', code);
  await guest.click('#online-join');
  await expect(guest.locator('.room-code')).toHaveText(code);
  // Chacun a pris la première place libre : Bleu 1 pour l'hôte, Rouge 1 pour l'invité.
  await expect(host.locator('.seat[data-seat="1"] .who')).toHaveText('Ami');
  await host.screenshot({ path: 'screenshots/41-enligne-salon.png' });

  await host.click('#online-start');
  await expect(host.locator('#online-lobby')).toBeHidden();
  await expect(guest.locator('#online-lobby')).toBeHidden();

  // Le match se joue ; chaque navigateur compare son empreinte à celle du serveur chaque seconde.
  await expect
    .poll(async () => Math.min((await stats(host)).checked, (await stats(guest)).checked), { timeout: 60_000, intervals: [2000] })
    .toBeGreaterThanOrEqual(12);
  const a = await stats(host);
  const b = await stats(guest);
  console.log(JSON.stringify({ host: a, guest: b }));
  for (const s of [a, b]) {
    expect(s.desyncs).toBe(0);
    expect(s.rollbacks).toBeGreaterThan(50);
  }
  // Les deux humains (et les IA) frappent (en double, l'un peut attendre la balle un moment).
  await expect.poll(async () => (await stats(host)).hits.every(Boolean), { timeout: 60_000 }).toBe(true);
  expect((await stats(host)).desyncs).toBe(0);
  await expect(host.locator('#net-hud')).toContainText('identiques au serveur');
  await host.screenshot({ path: 'screenshots/42-enligne-match.png' });
  expect(errors).toEqual([]);
});

/**
 * Robustesse : pendant le match, la liaison de l'invité est coupée ; elle se rétablit d'elle-même, le serveur lui rend sa
 * place et l'état du match, il redevient identique au serveur. Puis il recharge sa page : il revient directement dans
 * le match, sans repasser par le salon.
 */
test('en ligne : liaison coupée puis page rechargée, le joueur reprend sa place', async ({ browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const open = async (seed: number, own: number, query: string): Promise<Page> => {
    const context = await browser.newContext({ viewport: { width: 400, height: 225 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await virtualPads(page, seed, own);
    await trackSockets(page);
    await page.goto(`/?enligne&serveur=${GAME_SERVER}&boutons=1${query}`);
    await page.waitForSelector('#online-name');
    return page;
  };
  const host = await open(71, 0, '&manette=1');
  const guest = await open(72, 1, '&manette=2');
  await host.fill('#online-name', 'Xavier');
  await host.click('#online-create');
  await expect(host.locator('.room-code')).toHaveText(/^[A-Z]{4}$/);
  const code = (await host.locator('.room-code').textContent())!;
  await guest.fill('#online-name', 'Ami');
  await guest.fill('#online-code', code);
  await guest.click('#online-join');
  await expect(host.locator('.seat[data-seat="1"] .who')).toHaveText('Ami');
  await host.click('#online-start');
  await expect.poll(async () => Math.min((await stats(host)).checked, (await stats(guest)).checked), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);

  // Liaison coupée : bandeau, puis reconnexion d'elle-même et reprise depuis l'état du serveur.
  await guest.evaluate(() => (window as unknown as { __sockets: WebSocket[] }).__sockets.at(-1)!.close());
  await expect(guest.locator('#online-banner')).toBeVisible();
  await expect(guest.locator('#online-banner')).toBeHidden({ timeout: 15_000 });
  expect((await stats(guest)).resyncs).toBeGreaterThanOrEqual(1);
  const before = (await stats(guest)).checked;
  await expect.poll(async () => (await stats(guest)).checked, { timeout: 60_000 }).toBeGreaterThanOrEqual(before + 3);
  expect((await stats(guest)).desyncs).toBe(0);

  // Page rechargée : directement dans le match (le salon ne s'affiche pas), un client neuf, identique au serveur.
  await guest.reload();
  await guest.waitForFunction(() => window.__duel?.online?.() != null, null, { timeout: 30_000 });
  await expect(guest.locator('#online-lobby')).toBeHidden();
  await expect.poll(async () => (await stats(guest)).checked, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  const after = await stats(guest);
  console.log(JSON.stringify({ guest: after, host: await stats(host) }));
  expect(after.desyncs).toBe(0);
  expect((await stats(host)).desyncs).toBe(0);
  expect(errors).toEqual([]);
});
