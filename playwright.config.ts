import { defineConfig, devices } from '@playwright/test';

// `E2E_PORT` : un autre port quand 5173 est déjà pris (autre copie du projet lancée).
// `E2E_SERVEUR` : port du serveur de jeu en ligne (2567 par défaut, réutilisé s'il tourne déjà).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PORT = Number(env.E2E_PORT ?? 5173);
const GAME_SERVER_PORT = Number(env.E2E_SERVEUR ?? 2567);

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
    },
    {
      // Un seul processus (pas d'npm ni de tsx autour) : arrêté proprement à la fin des tests, jamais laissé en route.
      command: 'node --import tsx server/main.ts',
      url: `http://localhost:${GAME_SERVER_PORT}`,
      env: { PORT: String(GAME_SERVER_PORT) },
      reuseExistingServer: true,
    },
  ],
});
