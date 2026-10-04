import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Suites that launch Playwright Chromium or run Pandoc. `scripts:test:e2e` sets
 * `TAU_SCRIPTS_BROWSER_TESTS` to run only these on the Browser end-to-end lane, which
 * provides both; `scripts:test` excludes them and stays hermetic.
 */
const browserTests = ['src/canvas-vite.config.test.ts', 'src/reference-html.test.ts'];
const browserLane = process.env['TAU_SCRIPTS_BROWSER_TESTS'] === 'true';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose'],
    ...(browserLane ? { include: browserTests } : { exclude: [...configDefaults.exclude, ...browserTests] }),
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
