import { expect, test } from '@playwright/test';

interface WallStats {
  played: number;
  crossed: number;
  held: boolean;
  log: string[];
}
type Page = Window & { __hold: boolean; __resume: () => void; __wall: WallStats };

/**
 * Contre-vitre (`CHANTIERS_PLAN.md`, étape 4), jouée aux boutons (`?boutons=1`) : labo, situation « lob qui passe ».
 * Une manette Xbox virtuelle, pilotée dans la page à chaque pas (lecture de la Gamepad API, `readGamepad`,
 * `toCommands`), recule au stick gauche, maintient A quand la balle redescend, tire le stick gauche vers sa vitre et
 * relâche A quand la balle arrive. La balle doit repartir contre la vitre et repasser le filet.
 */
test('labo : contre-vitre aux boutons, la balle repasse le filet', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=labo&boutons=1');
  await page.waitForFunction(() => window.__duel !== undefined);
  await page.locator('[data-situation="lob-qui-passe"]').click();

  await page.evaluate(() => {
    const { duel } = window.__duel!;
    const w = window as unknown as Page;
    // Simulation figée sur demande, pour la capture au bon moment ; le rendu continue (le demi-tour s'achève).
    const step = duel.step.bind(duel);
    w.__hold = false;
    duel.step = (commands) => {
      if (!w.__hold) step(commands);
    };
    w.__resume = () => {
      w.__hold = false;
    };
    const stats: WallStats = (w.__wall = { played: 0, crossed: 0, held: false, log: [] });
    const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
    const axes = [0, 0, 0, 0];
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    let lastTick = -1;
    let point = -1;
    let hit = false;
    let crossed = false;
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        const me = duel.players[0]!;
        // Nouvelle situation : Rouge vient de lober.
        if (duel.phase === 'rally' && duel.phaseTick !== point) {
          if (point >= 0) stats.log.push(`fin : ${duel.lastResult?.reason} pour ${duel.lastResult?.winner}, dans le vide : ${me.lastWhiffTick > point}`);
          point = duel.phaseTick;
          hit = crossed = false;
        }
        if (duel.shot?.player === 0) {
          hit = true;
          const s = duel.shot;
          if (s.counterWall) stats.played++;
          stats.log.push(`frappe : contre-vitre ${!!s.counterWall}, parfaite ${s.perfect}, timing ${s.timing.toFixed(3)}, erreur ${s.error.toFixed(2)}`);
        }
        if (hit && me.lastHit?.counterWall && !crossed && duel.ball && duel.ball.pos.z > 0) {
          crossed = true;
          stats.crossed++;
        }
        // Stick gauche : `forward` vers le filet ; `hold` : A maintenu.
        let left = { forward: 0, right: 0 };
        let hold = false;
        if (duel.phase === 'rally' && !hit) {
          if (duel.bounces === 0) {
            left = { forward: clamp((-8.7 - me.pos.z) * 2), right: clamp(-(0.6 - me.pos.x) * 2) };
            // A maintenu quand la balle redescend dans son camp.
            if (duel.ball && duel.ball.pos.z < -6) hold = true;
          } else {
            const chance = duel.counterWall(0);
            left = { forward: -1, right: 0 };
            // A relâché quand la balle passe au point idéal.
            hold = !(chance && chance.timing >= -0.04);
            if (!stats.held && chance && me.engagement) {
              stats.held = true;
              w.__hold = true;
            }
          }
        }
        // Gamepad API : axes positifs vers la droite et vers le bas.
        axes[0] = left.right;
        axes[1] = -left.forward;
        buttons[0] = { pressed: hold, touched: hold, value: hold ? 1 : 0 };
      }
      return [{ index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes, buttons }] as unknown as Gamepad[];
    };
  });

  // Capture : la balle a passé Bleu, il est tourné vers sa vitre, le repère est allumé.
  await page.waitForFunction(() => (window as unknown as Page).__hold, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/51-contre-vitre.png' });
  await page.evaluate(() => (window as unknown as Page).__resume());
  await expect(page.locator('#feedback')).toContainText('contre-vitre');

  // La situation repart à l'identique : trois contre-vitres qui repassent le filet.
  await page
    .waitForFunction(() => (window as unknown as Page).__wall.crossed >= 3, null, { timeout: 60_000 })
    .catch(() => undefined);
  const stats = await page.evaluate(() => (window as unknown as Page).__wall);
  console.log(stats.log.join('\n'));
  expect(stats.crossed).toBeGreaterThanOrEqual(3);
  expect(stats.crossed).toBe(stats.played);
});

test('labo : une situation part après un décompte de 2 s, joueurs en place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=labo');
  await page.waitForFunction(() => window.__duel !== undefined);
  await page.locator('[data-situation="balle-qui-meurt"]').click();
  const countdown = page.locator('#countdown');
  await expect(countdown).toBeVisible();
  await expect(countdown).toHaveText('2');
  // Pendant le décompte, le jeu attend : la balle ne bouge pas.
  const before = await page.evaluate(() => window.__duel!.duel.tick);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__duel!.duel.tick)).toBe(before);
  await page.screenshot({ path: 'screenshots/52-labo-decompte.png' });
  await expect(countdown).toHaveText('1', { timeout: 2000 });
  await expect(countdown).toBeHidden({ timeout: 2000 });
  await page.waitForFunction((t) => window.__duel!.duel.tick > t + 60, before);
});

/**
 * Le geste de contre-vitre au stick droit, proposé par Xavier (18/10) : tourné vers sa vitre, stick poussé vers
 * l'avant pour préparer, ramené vers soi (vers sa vitre) pour frapper. Il court vers sa vitre au stick gauche.
 */
test('labo : stick droit en avant puis vers soi, en courant vers sa vitre : contre-vitre', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=labo');
  await page.waitForFunction(() => window.__duel !== undefined);
  await page.locator('[data-situation="lob-qui-passe"]').click();
  await page.evaluate(() => {
    const { duel } = window.__duel!;
    const stats = { played: 0, crossed: 0, attempts: 0, held: false };
    const w = window as unknown as { __wallGesture: typeof stats; __hold: boolean };
    w.__wallGesture = stats;
    // Simulation figée sur demande, pour la capture ; le rendu continue.
    const step = duel.step.bind(duel);
    w.__hold = false;
    duel.step = (commands) => {
      if (!w.__hold) step(commands);
    };
    const axes = [0, 0, 0, 0];
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    let lastTick = -1;
    let point = -1;
    let bounceTick: number | null = null;
    let offered = false;
    let hit = false;
    let crossed = false;
    navigator.getGamepads = () => {
      if (duel.tick !== lastTick) {
        lastTick = duel.tick;
        if (duel.phase === 'rally' && duel.phaseTick !== point) {
          point = duel.phaseTick;
          bounceTick = null;
          offered = hit = crossed = false;
          stats.attempts++;
        }
        if (duel.shot?.player === 0) {
          hit = true;
          if (duel.shot.counterWall) stats.played++;
        }
        if (hit && duel.players[0]!.lastHit?.counterWall && !crossed && duel.ball && duel.ball.pos.z > 0) {
          crossed = true;
          stats.crossed++;
        }
        if (bounceTick === null && duel.bounces === 1) bounceTick = duel.tick;
        offered ||= duel.counterWallReady(0);
        const strike = bounceTick !== null && duel.tick - bounceTick >= 24;
        // Stick gauche vers sa vitre ; stick droit en avant dès que la contre-vitre est proposée, vers soi 0,1 s après
        // le rebond (axes de la Gamepad API : positifs vers le bas).
        axes[1] = duel.phase === 'rally' && !hit ? 1 : 0;
        axes[3] = hit ? 0 : strike ? 1 : offered ? -1 : 0;
        // Capture : contre-vitre préparée (stick en avant), la balle a rebondi et arrive.
        if (!stats.held && bounceTick !== null && duel.tick - bounceTick === 12 && duel.players[0]!.engagement) {
          stats.held = true;
          w.__hold = true;
        }
      }
      return [{ index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes, buttons }] as unknown as Gamepad[];
    };
  });
  await page.waitForFunction(() => (window as unknown as { __hold: boolean }).__hold, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await expect(page.locator('.swing-guide')).toContainText('Contre-vitre');
  await page.screenshot({ path: 'screenshots/53-contre-vitre-geste.png' });
  await page.evaluate(() => ((window as unknown as { __hold: boolean }).__hold = false));
  await page
    .waitForFunction(() => (window as unknown as { __wallGesture: { crossed: number } }).__wallGesture.crossed >= 3, null, { timeout: 60_000 })
    .catch(() => undefined);
  const stats = await page.evaluate(() => (window as unknown as { __wallGesture: { played: number; crossed: number; attempts: number } }).__wallGesture);
  console.log(stats);
  expect(stats.crossed).toBeGreaterThanOrEqual(3);
});
