import { defineConfig } from 'vitest/config';

/*
 * Plain Vitest in Node with a fake KV binding (`src/testing/fake-kv.ts`) and a stubbed fetch, not the
 * Workers runtime: the handlers use only fetch, JSON and the KV binding. The bundle test checks the
 * shipped module separately.
 */
export default defineConfig({
  cacheDir: '../../node_modules/.vite/apps/r2-audit',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/apps/r2-audit',
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
    },
  },
});
