import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests du jeu en ligne (`tests/net`) jouent des matchs entiers : en parallèle, les plus longs dépassent 5 s.
    testTimeout: 30_000,
    include: ['tests/sim/**/*.test.ts', 'tests/audio/**/*.test.ts', 'tests/input/**/*.test.ts', 'tests/render/**/*.test.ts', 'tests/net/**/*.test.ts'],
  },
});
