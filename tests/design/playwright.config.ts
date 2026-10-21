import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

// Captures de référence de la passe design (`research/DESIGN_PLAN.md`) : à part des tests, lancées à la main
// avec `npm run captures` (avant) ou `CAPTURES=apres npm run captures`. Les serveurs partent de la racine du projet.
const servers = Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : [];

export default defineConfig({
  ...base,
  testDir: '.',
  workers: 1,
  webServer: servers.map((server) => ({ ...server, cwd: '../..' })),
});
