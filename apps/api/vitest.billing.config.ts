import { defineConfig } from 'vitest/config';

/*
 * The billing foundation suites that compose billing with the app's own chat and agent-observability
 * code. `api-billing:test:billing-foundation` owns the rest; both run on the launcher's test-owned
 * PostgreSQL, and only that launcher supplies the database, so dotenv loading is disabled.
 */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  cacheDir: '../../node_modules/.vite/apps/api-billing',
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['../libs/api-billing/src/testing/billing-foundation.setup.ts'],
    include: ['app/api/billing/*.foundation.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
