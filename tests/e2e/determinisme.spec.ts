import { chromium, expect, firefox, test, webkit, type BrowserType } from '@playwright/test';
import { playReferenceMatch } from '../../src/net/crossMatch';

/**
 * Jeu en ligne (`research/en-ligne/PLAN_EN_LIGNE.md`, phase 0) : le même match d'IA de 30 s, calculé dans Node et dans
 * Chromium, Firefox et WebKit (le moteur de Safari), doit donner la même empreinte d'état au bit près. Sinon deux
 * joueurs sur deux navigateurs différents verraient leurs matchs diverger. Les navigateurs chargent la simulation
 * telle quelle depuis le serveur de développement.
 */
test('même match au bit près dans Node, Chromium, Firefox et WebKit', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const node = playReferenceMatch(30);
  // Le match a vraiment été joué.
  expect(node.shots).toBeGreaterThan(10);
  expect(node.points).toBeGreaterThanOrEqual(1);
  const engines: [string, BrowserType][] = [
    ['chromium', chromium],
    ['firefox', firefox],
    ['webkit', webkit],
  ];
  const results: Record<string, string> = { node: node.final };
  for (const [name, engine] of engines) {
    // Navigateur pas installé (`npx playwright install firefox webkit`) : signalé, pas compté comme un échec.
    const browser = await engine.launch().catch((error: Error) => {
      if (!/Executable doesn't exist/.test(error.message) || name === 'chromium') throw error;
      test.info().annotations.push({ type: 'absent', description: `${name} non installé : npx playwright install ${name}` });
      return null;
    });
    if (!browser) {
      results[name] = 'absent';
      continue;
    }
    try {
      const page = await browser.newPage();
      // Un document du même serveur, sans lancer le jeu : la simulation est importée comme module.
      await page.goto(`${baseURL}/src/sim/prng.ts`);
      const result = await page.evaluate(async () => {
        const module = (await import('/src/net/crossMatch.ts' as string)) as typeof import('../../src/net/crossMatch');
        return module.playReferenceMatch(30);
      });
      results[name] = result.final;
      // Première seconde qui diffère, pour savoir où chercher.
      const first = result.hashes.findIndex((hash, i) => hash !== node.hashes[i]);
      expect(first, `${name} diverge à la seconde ${first + 1}`).toBe(-1);
      expect(result.final).toBe(node.final);
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify(results));
});
