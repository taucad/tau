import { defineConfig } from 'vitest/config';

/* Selects the flake-repro fixtures, which no other suite includes (`flake-repro.test.ts` runs them). */
export default defineConfig({
  test: { include: ['*.fixture.ts'], environment: 'node' },
});
