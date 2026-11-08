import process from 'node:process';
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

/*
 * The operator-only Stripe acceptance suite (`test:billing-stripe`). Live credentials come from the
 * shell or the API's `.env`; the tracked test environment fills only missing values.
 */
config({ path: path.resolve(import.meta.dirname, '../../api/.env') });
config({ path: path.resolve(import.meta.dirname, '../api-core/.env.test') });

// Vitest 4 isolates `test.env`; forward the loaded environment into the worker.
const forwardedEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string') {
    forwardedEnv[key] = value;
  }
}

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/libs/api-billing-integration',
  test: {
    environment: 'node',
    include: ['src/testing/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    reporters: ['verbose'],
    env: {
      ...forwardedEnv,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      NODE_ENV: 'test',
    },
  },
});
