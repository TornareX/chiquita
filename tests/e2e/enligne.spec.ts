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
  const stats = async (page: Page) =>
    page.evaluate(() => {
      const online = window.__duel!.online!()!;
      const { duel } = window.__duel!;
      return { ...online.stats, tick: duel.tick, hits: duel.players.map((p) => Number.isFinite(p.lastHitTick)), rollbacks: online.session.stats.rollbacks };
    });
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
  // Les deux humains (et les IA) ont frappé.
  expect(a.hits.every(Boolean)).toBe(true);
  await expect(host.locator('#net-hud')).toContainText('identiques au serveur');
  await host.screenshot({ path: 'screenshots/42-enligne-match.png' });
  expect(errors).toEqual([]);
});
