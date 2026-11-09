import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/*
 * The API test environment: `apps/libs/api-core/.env.test` fills the variables
 * `getEnvironment()` requires with test placeholders. Values already in the
 * environment (CI's service URLs) win, as they do for the `api` app.
 *
 * The store and worker suites talk to a real object store (local MinIO, `infra/docker-compose.yml`),
 * whose `TAU_S3_*` settings only the API's own `apps/api/.env` carries (CI copies it from
 * `.env.example`). It loads after `.env.test`, as Nx loads the two for `api:test`, so it
 * adds the object-store settings without overriding a test placeholder.
 */
loadDotenv({ path: path.resolve(import.meta.dirname, '../api-core/.env.test') });
loadDotenv({ path: path.resolve(import.meta.dirname, '../../api/.env') });

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/libs/api-git-core',
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
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
      reportsDirectory: '../../../out/reports/coverage/apps/libs/api-git-core',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
