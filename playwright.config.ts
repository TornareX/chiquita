import { defineConfig, devices } from '@playwright/test';

// `E2E_PORT` : un autre port quand 5173 est déjà pris (autre copie du projet lancée).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PORT = Number(env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
