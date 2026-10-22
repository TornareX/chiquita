import { appendFileSync, mkdirSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Journal des frappes (`src/modes/swingJournal.ts`) : le serveur de développement ajoute les lignes reçues au fichier du jour. */
const swingJournal = (): Plugin => ({
  name: 'journal-des-frappes',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__journal', (req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => (body += chunk));
      req.on('end', () => {
        mkdirSync('journal', { recursive: true });
        appendFileSync(`journal/${new Date().toISOString().slice(0, 10)}.jsonl`, body);
        res.statusCode = 204;
        res.end();
      });
    });
  },
});

export default defineConfig({
  plugins: [swingJournal()],
  test: {
    // Les tests du jeu en ligne (`tests/net`) jouent des matchs entiers : en parallèle, les plus longs dépassent 5 s.
    testTimeout: 30_000,
    include: ['tests/sim/**/*.test.ts', 'tests/audio/**/*.test.ts', 'tests/input/**/*.test.ts', 'tests/render/**/*.test.ts', 'tests/net/**/*.test.ts'],
  },
});
