import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/sim/**/*.test.ts', 'tests/audio/**/*.test.ts', 'tests/input/**/*.test.ts'],
  },
});
