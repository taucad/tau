import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, '.env') });
// Live provider credentials remain authoritative when present; the tracked
// test environment fills only missing values so hermetic integration targets
// also boot from a clean checkout.
config({ path: path.resolve(__dirname, '.env.test') });

// Forward every value loaded from `.env` (and any inherited from the shell)
// into the test worker. Vitest 4 isolates `test.env` and does NOT inherit
// `process.env` automatically, which would otherwise leave `ConfigModule.forRoot`
// without DATABASE_URL/AUTH_SECRET/etc. and crash before `describe.skipIf` runs.
const forwardedEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string') {
    forwardedEnv[key] = value;
  }
}

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/api-integration',
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    include: ['app/testing/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    reporters: ['verbose'],
    // Gaxios + google-auth-library run `await import('node-fetch')` at request
    // time. Vitest's vite-node module runner resolves dynamic imports relative
    // to the *test file*, not the importer, which means `node-fetch` (a direct
    // dep of gaxios but not of apps/api) is unresolvable and gaxios throws
    // "fetchImpl is not a function". Externalising these via Node's resolver
    // restores the canonical module resolution that gaxios expects.
    server: {
      deps: {
        external: [/gaxios/, /google-auth-library/, /node-fetch/],
      },
    },
    env: {
      ...forwardedEnv,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      NODE_ENV: 'test',
    },
  },
});
