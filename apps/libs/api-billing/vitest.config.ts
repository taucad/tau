import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/*
 * The API test environment: `apps/libs/api-core/.env.test` fills the variables
 * `getEnvironment()` requires with test placeholders. Values already in the
 * environment (CI's service URLs) win, as they do for the `api` app.
 */
loadDotenv({ path: path.resolve(import.meta.dirname, '../api-core/.env.test') });

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/libs/api-billing',
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    /*
     * The foundation suites need the test-owned PostgreSQL the `test:billing-foundation` launcher
     * starts, and `src/testing/**` holds the operator-only Stripe acceptance suite (`test:billing-stripe`).
     */
    exclude: ['src/*.foundation.test.ts', 'src/testing/**', 'node_modules/**', 'out-tsc/**'],
    testTimeout: 120_000,
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../out/reports/coverage/apps/libs/api-billing',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
