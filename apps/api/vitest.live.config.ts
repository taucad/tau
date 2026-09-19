import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Live provider credentials are the point of this configuration, so `.env` is
// authoritative; `.env.test` only fills the values `getEnvironment()` requires
// to boot (dotenv never overwrites an already-set variable).
config({ path: path.resolve(__dirname, '.env') });
config({ path: path.resolve(__dirname, '.env.test') });

// Vitest 4 isolates `test.env` and does not inherit `process.env`, which would
// leave `ConfigModule.forRoot` without the values the environment schema
// requires and crash before `describe.skipIf` can report a missing credential.
const forwardedEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string') {
    forwardedEnv[key] = value;
  }
}

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/api-live',
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    include: ['app/testing/live/**/*.live.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Live provider quota is shared and Vertex rate-limited a 16-call burst:
    // one file at a time, one test at a time, no retries hiding a real refusal.
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 600_000,
    hookTimeout: 600_000,
    reporters: ['verbose'],
    // Gaxios and google-auth-library `await import('node-fetch')` at request
    // time, which vite-node resolves relative to the test file rather than the
    // importer. Node's own resolver restores what gaxios expects.
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
