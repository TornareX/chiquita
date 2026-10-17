import { expect, test, type Page } from '@playwright/test';

type Stats = { median: number; p95: number };

/**
 * Temps d'image (ms) mesurés sur `ms` millisecondes de match, médiane et 95e centile : intervalle entre deux
 * images, et travail du jeu dans chaque image (durée de ses rappels `requestAnimationFrame`, côté processeur).
 */
async function frameStats(page: Page, ms: number): Promise<{ interval: Stats; work: Stats; frames: number }> {
  return page.evaluate(
    (duration) =>
      new Promise<{ interval: Stats; work: Stats; frames: number }>((resolve) => {
        const intervals: number[] = [];
        const work = (window as unknown as { __work: number[] }).__work;
        work.length = 0;
        let last = performance.now();
        const end = last + duration;
        const stats = (values: number[]): Stats => {
          const sorted = [...values].sort((a, b) => a - b);
          const at = (q: number): number => Math.round(sorted[Math.floor(q * (sorted.length - 1))]! * 100) / 100;
          return { median: at(0.5), p95: at(0.95) };
        };
        const tick = (now: number): void => {
          intervals.push(now - last);
          last = now;
          if (now < end) return void requestAnimationFrame(tick);
          resolve({ interval: stats(intervals), work: stats(work), frames: intervals.length });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** Chronomètre chaque rappel `requestAnimationFrame` de la page (`window.__work`, en ms). */
const TIME_FRAMES = (): void => {
  const work: number[] = [];
  (window as unknown as { __work: number[] }).__work = work;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((now) => {
      const start = performance.now();
      callback(now);
      work.push(performance.now() - start);
    });
};

/**
 * Mesure de fluidité, IA contre IA, en simple et en double, avec et sans effets. Lancée seulement avec
 * `MESURE=1` (elle prend une minute), et de préférence avec `--headed` : sans affichage, Chromium dessine sans
 * carte graphique (15 images/s sur la machine de Xavier, avec ou sans effets).
 */
test('fluidité avec et sans effets', async ({ page }) => {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  test.skip(!env.MESURE, 'mesure lancée seulement avec MESURE=1');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(TIME_FRAMES);
  const results: Record<string, unknown> = {};
  for (const [name, query] of [
    ['simple', 'ai=normal&bot=both&free=1'],
    ['double', 'double=1&ai=normal&bot=1,2,3,4&free=1'],
  ] as const) {
    for (const effects of ['1', '0']) {
      await page.goto(`/?${query}&effets=${effects}`);
      await page.waitForFunction(() => window.__duel !== undefined && window.__duel.duel.hits >= 2, null, { timeout: 30_000 });
      results[`${name}, effets=${effects}`] = await frameStats(page, 10_000);
    }
  }
  console.log(JSON.stringify(results, null, 2));
});

/** Pousse la balle par-dessus le mur latéral juste après son rebond : la sortie donne un por tres. */
const FORCE_POR_TRES = (): void => {
  const { duel } = window.__duel!;
  const step = duel.step.bind(duel);
  let pushed = false;
  duel.step = (commands) => {
    step(commands);
    const ball = duel.ball;
    if (!pushed && ball && duel.phase === 'rally' && duel.bounces === 1 && duel.hits >= 2 && ball.vel.y > 0) {
      pushed = true;
      ball.vel = { x: ball.pos.x >= 0 ? 6 : -6, y: 14, z: 0 };
    }
    if (duel.result) pushed = false;
  };
};

test('les effets apparaissent sans erreur de console, en simple et en double', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto('/?ai=normal&bot=both&free=1');
  await page.waitForFunction(() => window.__effects !== undefined);
  // Frappes, rebonds au sol et vitres arrivent d'eux-mêmes dans un échange entre IA.
  await page.waitForFunction(
    () => {
      const s = window.__effects!.spawned;
      return s.impact >= 4 && s.dust >= 4 && s.glass >= 1;
    },
    null,
    { timeout: 90_000 },
  );
  // Por tres provoqué : éclat au sommet du mur, éclair et annonce.
  await page.evaluate(FORCE_POR_TRES);
  await expect(page.locator('#effect-banner')).toHaveText(/POR TRES|POR CUATRO/, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__effects!.spawned.exit)).toBeGreaterThanOrEqual(1);
  // La réserve ne grossit pas.
  expect(await page.evaluate(() => window.__effects!.effects.items.length)).toBe(32);

  await page.goto('/?double=1&ai=normal&bot=1,2,3,4&free=1');
  await page.waitForFunction(() => window.__effects !== undefined && window.__effects.spawned.impact >= 4, null, { timeout: 60_000 });

  // `?effets=0` : rien n'est créé.
  await page.goto('/?ai=normal&bot=both&free=1&effets=0');
  await page.waitForFunction(() => window.__duel !== undefined && window.__duel.duel.hits >= 2, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__effects === undefined && !document.querySelector('#effect-banner'))).toBe(true);
  expect(errors).toEqual([]);
});

/**
 * Captures avant / après de chaque effet, au même instant de l'échange (IA contre IA, déterministe) : la
 * simulation est figée au pas de l'événement, les effets avancés d'un temps fixe puis figés. Lancée seulement
 * avec `CAPTURES=dossier`.
 */
test('captures avant et après de chaque effet', async ({ page }) => {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  test.skip(!env.CAPTURES, 'captures lancées seulement avec CAPTURES=dossier');
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const shots = [
    ['frappe', 'ai=normal&bot=both&free=1', 'shot && !shot.perfect && !shot.serve', 0.05, 2],
    ['frappe-parfaite', 'ai=normal&bot=both&free=1', 'shot && shot.perfect', 0.07, 0],
    ['smash', 'ai=fort&bot=both&free=1', "shot && shot.overhead === 'remate'", 0.07, 0],
    ['vitre', 'ai=normal&bot=both&free=1', "contacts.some((c) => c.surface === 'glass' && c.speed > 6)", 0.1, 0],
    ['sol', 'ai=normal&bot=both&free=1', "contacts.some((c) => c.surface === 'ground' && c.speed > 5)", 0.12, 1],
    ['grillage', 'ai=normal&bot=both&free=1', "contacts.some((c) => c.surface === 'mesh')", 0.06, 0],
    ['double-frappe', 'double=1&ai=normal&bot=1,2,3,4&free=1', 'shot && !shot.serve', 0.05, 3],
    ['por-tres', 'ai=normal&bot=both&free=1', "result && result.reason.startsWith('por-')", 0.09, 0],
  ] as const;
  // `CAPTURES_SEULES=sol,vitre` : refaire seulement celles-là.
  const only = env.CAPTURES_SEULES?.split(',');
  for (const [name, query, condition, advance, skip] of shots) {
    if (only && !only.includes(name)) continue;
    for (const effects of ['0', '1']) {
      await page.goto(`/?${query}&effets=${effects}`);
      await page.waitForFunction(() => window.__duel !== undefined);
      if (name === 'por-tres') await page.evaluate(FORCE_POR_TRES);
      await page.evaluate(
        ([condition, advance, skip]) => {
          const { duel } = window.__duel!;
          const step = duel.step.bind(duel);
          const matches = new Function('d', `const { shot, contacts, result } = d; return ${condition};`) as (d: unknown) => boolean;
          let seen = 0;
          let held = false;
          let frozen = false;
          duel.step = (commands) => {
            if (!held) {
              step(commands);
              if (matches(duel) && seen++ >= skip) held = true;
              return;
            }
            // Pas suivants : la simulation ne bouge plus ; les effets lancés au pas tenu avancent d'un temps fixe.
            duel.contacts.length = 0;
            duel.shot = null;
            duel.result = null;
            const fx = window.__effects;
            if (fx && !frozen) {
              fx.update(advance);
              fx.timeScale = 0;
            }
            frozen = true;
            (window as unknown as { __held: number }).__held = duel.tick;
          };
        },
        [condition, advance, skip] as const,
      );
      await page.waitForFunction(() => (window as unknown as { __held?: number }).__held !== undefined, null, { timeout: 240_000 });
      // Le tremblement de caméra s'éteint.
      await page.waitForTimeout(800);
      const tick = await page.evaluate(() => (window as unknown as { __held: number }).__held);
      await page.screenshot({ path: `${env.CAPTURES}/${name}-${effects === '1' ? 'apres' : 'avant'}.png` });
      console.log(name, effects, tick);
    }
  }
});
