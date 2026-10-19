import { expect, test, type Page } from '@playwright/test';

/** Bleu 1 joué par une manette virtuelle, pilotée par une IA qui ne voit que la partie dessinée (la machine locale). */
async function virtualPad(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { duel, Bot } = window.__duel!;
    const bot = new Bot(0, 41);
    const buttonOf = { normal: 0, overhead: 1, slice: 2, lob: 3 } as const;
    let lastTick = -1;
    let pads: Gamepad[] = [];
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        const commands = bot.commands(duel);
        const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
        if (commands.shot) buttons[buttonOf[commands.shot]] = { pressed: true, touched: true, value: 1 };
        pads = [
          {
            index: 0,
            id: 'manette virtuelle',
            connected: true,
            mapping: 'standard',
            axes: [commands.stick.right, -commands.stick.forward, 0, 0],
            buttons,
          } as unknown as Gamepad,
        ];
      }
      return pads;
    };
  });
}

/**
 * Mode « faux réseau » (`?reseau=…`, `research/en-ligne/PLAN_EN_LIGNE.md`, phase 0) : une manette virtuelle, pilotée
 * par une IA qui ne regarde que la partie dessinée (comme le joueur devant l'écran), joue Bleu 1 ; les trois autres
 * places sont des IA sur la « machine distante ». Il doit y avoir des frappes de chacun, des rollbacks, des
 * corrections de balle lissées, l'encart doit s'afficher, et aucun éclat de frappe ne doit partir deux fois.
 */
test('faux réseau : rollback visible, jouable, sans effet joué deux fois', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?reseau=120&gigue=20&perte=5&double=1&ai=normal&bot=2,3,4&free=1&boutons=1&perf');
  await page.waitForFunction(() => window.__duel !== undefined && window.__effects !== undefined);
  await virtualPad(page);
  await page.evaluate(() => {
    const { duel } = window.__duel!;
    // Chaque éclat de frappe, daté (pas de la frappe, frappeur) : un rollback ne doit pas le relancer.
    const impacts: string[] = [];
    (window as unknown as { __impacts: string[] }).__impacts = impacts;
    const fx = window.__effects!;
    const impact = fx.impact.bind(fx);
    fx.impact = (at, shot) => {
      impacts.push(`${duel.tick - 1}:${(shot as { player?: number }).player}`);
      impact(at, shot);
    };
  });

  // Tout le monde frappe, des rollbacks et des corrections de balle ont lieu.
  await page.waitForFunction(
    () => {
      const { duel } = window.__duel!;
      const net = window.__net!.totals;
      return duel.players.every((p) => Number.isFinite(p.lastHitTick)) && net.replayed > 200 && net.corrections >= 3;
    },
    null,
    { timeout: 100_000 },
  );
  const report = await page.evaluate(() => {
    const impacts = (window as unknown as { __impacts: string[] }).__impacts;
    const session = window.__duel!.net!()!.a.session;
    return {
      hud: document.querySelector('#net-hud')?.textContent ?? '',
      impacts: impacts.length,
      unique: new Set(impacts).size,
      totals: window.__net!.totals,
      longest: session.stats.longest,
      frameMs: window.__perf?.stats.frameMs ?? 0,
    };
  });
  console.log(JSON.stringify(report));
  expect(report.hud).toContain('ping 120 ms ±20');
  expect(report.hud).toContain('rejoués');
  expect(report.hud).toContain('corrections : balle');
  expect(report.impacts).toBeGreaterThan(3);
  expect(report.unique).toBe(report.impacts);
  // 150 ms de fenêtre : jamais plus de 36 pas rejoués d'un coup.
  expect(report.longest).toBeLessThanOrEqual(36);
  await page.screenshot({ path: 'screenshots/40-reseau.png' });
  expect(errors).toEqual([]);
});

/**
 * Animations des joueurs en ligne : les rollbacks réécrivent sans cesse le passé récent des joueurs distants ; leur
 * pose ne doit pas pour autant sauter d'une image à l'autre (préparation qui disparaît et revient, foulée retournée).
 * Mesure : l'à-coup de la pose (écart à la ligne droite entre trois images consécutives, sur tous ses angles), en
 * moyenne par joueur, comparé au même match hors réseau. Avant correction : 2 à 7 fois plus qu'hors ligne.
 */
test('faux réseau : les joueurs s’animent aussi proprement qu’hors ligne', async ({ page }) => {
  test.setTimeout(120_000);
  // Petite fenêtre : plus d'images par seconde, la mesure voit les à-coups brefs.
  await page.setViewportSize({ width: 320, height: 180 });
  const jerk = async (query: string): Promise<number[]> => {
    await page.goto('/?double=1&ai=normal&bot=2,3,4&free=1&boutons=1' + query);
    await page.waitForFunction(() => window.__duel !== undefined && window.__poses !== undefined);
    await virtualPad(page);
    await page.waitForTimeout(1500);
    return page.evaluate(async () => {
      const flat = (v: unknown, out: number[]): number[] => {
        if (typeof v === 'number') out.push(v);
        else if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) flat((v as Record<string, unknown>)[k], out);
        return out;
      };
      const history: number[][][] = [[], [], [], []];
      await new Promise<void>((done) => {
        const start = performance.now();
        const frame = (): void => {
          window.__poses!.forEach((p, i) => history[i]!.push(flat(p.pose, [])));
          if (performance.now() - start < 12000) requestAnimationFrame(frame);
          else done();
        };
        requestAnimationFrame(frame);
      });
      return history.map((h) => {
        let sum = 0;
        for (let t = 2; t < h.length; t++) sum += h[t]!.reduce((s, v, k) => s + Math.abs(v - 2 * h[t - 1]![k]! + h[t - 2]![k]!), 0);
        return sum / Math.max(1, h.length - 2);
      });
    });
  };
  const offline = await jerk('');
  const online = await jerk('&reseau=120&gigue=20&perte=5');
  console.log(JSON.stringify({ offline, online }));
  online.forEach((value, i) => expect(value).toBeLessThan(offline[i]! * 1.35 + 0.1));
});
