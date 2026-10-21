import { expect, test } from '@playwright/test';

/**
 * Caméra dans le dos des joueurs de l'écran : un humain rouge seul contre l'IA joue de son côté (la caméra fait un
 * demi-tour), et, comme pour le bleu, le haut de l'écran est vers le filet, le bas vers sa vitre (vers la caméra).
 * Bleu : Bleu 2 en double (manette 3), qui part près du filet (Bleu 1 sert et ne bouge pas avant sa frappe) : stick
 * vers le bas, il recule. Rouge : seul contre l'IA (`?bot=1`, manette 2), au fond : stick vers le haut, il avance.
 */
for (const [name, query, seat, pad, stickY] of [
  ['bleu', '?double=1&bot=1,2,4&ai=normal&free=1&boutons=1', 2, 2, 1],
  ['rouge', '?bot=1&ai=normal&free=1&boutons=1', 1, 1, -1],
] as const) {
  test(`caméra et stick : un humain ${name} va vers le filet au stick vers le haut, vers sa vitre au stick vers le bas`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    // Trois manettes branchées ; celle du joueur tient le stick (axe Y : -1 en haut, 1 en bas), les autres au repos.
    await page.addInitScript(
      ([pad, stickY]) => {
        const idle = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
        navigator.getGamepads = () =>
          [0, 1, 2].map(
            (index) =>
              ({ index, id: `manette virtuelle ${index + 1}`, connected: true, mapping: 'standard', axes: [0, index === pad ? stickY : 0, 0, 0], buttons: idle }) as unknown as Gamepad,
          );
      },
      [pad, stickY] as const,
    );
    await page.goto(`/${query}`);
    await page.waitForFunction(() => window.__duel !== undefined);
    const distanceToNet = (): Promise<number> => page.evaluate((seat) => Math.abs(window.__duel!.duel.players[seat]!.pos.z), seat);
    const start = await distanceToNet();
    await page.waitForTimeout(1500);
    const end = await distanceToNet();
    // Stick vers le haut : plus près du filet ; vers le bas : plus loin. D'au moins un mètre.
    expect((start - end) * -stickY).toBeGreaterThan(1);
    await page.screenshot({ path: `screenshots/43-camera-${name}.png` });
  });
}
