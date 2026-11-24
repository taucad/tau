import { defineConfig } from 'vitest/config';

/**
 * The harness's own unit tests: parsers, guards and the matrix writer, offline. The staging rows (`*.spec.ts`) run
 * only through `billing-e2e:test:staging` and its own config.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
    env: {
      // The support modules name the run at import; unit tests never write a run directory.
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      BILLING_E2E_RUN_ID: 'unit',
    },
  },
});
