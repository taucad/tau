import process from 'node:process';
import { defineConfig } from 'vitest/config';

/** One id per run: it names the accounts (`tau-e2e-<runId>-<case>`) and the evidence directory. */
const runId =
  process.env['BILLING_E2E_RUN_ID'] ?? new Date().toISOString().replaceAll(/[-:]/gu, '').slice(0, 15).replace('T', '-');

/** `BILLING_E2E_SUITE` picks rows by the tags in their test names. */
const suites: Readonly<Record<string, RegExp | undefined>> = { smoke: /\bsmoke\]/u, p0: /\bP0\b/u, all: undefined };
const suite = process.env['BILLING_E2E_SUITE'] ?? 'all';
if (!Object.hasOwn(suites, suite)) {
  throw new Error(`BILLING_E2E_SUITE must be one of ${Object.keys(suites).join(', ')}`);
}

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // One staging, one set of rate limits and one results file: the rows run one after another.
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    testNamePattern: suites[suite],
    env: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      BILLING_E2E_RUN_ID: runId,
    },
  },
});
