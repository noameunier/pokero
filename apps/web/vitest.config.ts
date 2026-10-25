import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests E2E sont exécutés par Playwright, pas par Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
