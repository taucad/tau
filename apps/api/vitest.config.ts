import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  root: __dirname,
  plugins: [nxViteTsPaths()],
  cacheDir: '../../node_modules/.vite/apps/api',
  test: {
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/api',
    },
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.test.ts', 'app/**/*.spec.ts'],
    /*
     * Live-LLM integration tests live under `app/testing/**` and run only via
     * the `test:models` Nx target with `vitest.integration.config.ts` (which
     * forwards real provider keys from `.env` into the worker). They must NOT
     * run under the default `nx test api` target, because Vitest 4's per-mode
     * env loading auto-injects `.env.test` (mock keys) into workers and the
     * integration tests then hit 401s against the test fixtures.
     */
    exclude: ['app/testing/**', 'node_modules/**', 'dist/**', 'out-tsc/**'],
    reporters: ['default'],
    testTimeout: 120_000,
  },
});
