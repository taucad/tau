import { defineConfig } from 'vitest/config';

/** Only the test-owned launcher supplies this suite's database; dotenv loading is disabled. */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  cacheDir: '../../node_modules/.vite/apps/api-billing',
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./app/testing/local-pg16.setup.ts'],
    include: ['app/api/billing/*.foundation.test.ts', 'app/testing/billing-foundation.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
