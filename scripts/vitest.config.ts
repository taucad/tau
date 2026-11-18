import { configDefaults, defineConfig } from 'vitest/config';

import { browserTests, workspaceTests } from '#test-sets.js';

/* `scripts:test` sets none, `scripts:test:e2e` sets `browser`, `scripts:validate-workspace-tests` sets `workspace`. */
const testSet = process.env['TAU_SCRIPTS_TEST_SET'];

const selection =
  testSet === 'browser'
    ? { include: browserTests }
    : testSet === 'workspace'
      ? { include: workspaceTests }
      : { exclude: [...configDefaults.exclude, ...browserTests, ...workspaceTests] };

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose'],
    ...selection,
    coverage: {
      provider: 'v8',
      reportsDirectory: '../out/reports/coverage/scripts',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
