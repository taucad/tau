import { defineConfig } from 'vitest/config';

/** Only the test-owned launcher supplies this suite's database; dotenv loading is disabled. */
export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  cacheDir: '../../../node_modules/.vite/apps/libs/api-billing-foundation',
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./src/testing/billing-foundation.setup.ts'],
    include: [
      'src/*.foundation.test.ts',
      'src/testing/billing-foundation.test.ts',
      'src/billing-stripe.test.ts',
      'src/billing-cash-stripe.test.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
