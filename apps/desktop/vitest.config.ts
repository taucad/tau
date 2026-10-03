import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors electron.vite.config.ts for a self-host build; unit tests exercise that transport.
  define: { tauCloudBuildEnabled: 'false', tauSentryDsn: '""' },
  test: {
    // `scripts/macos-package-mode.test.mts` is a `node:test` script owned by the
    // `test-macos-package-mode` target, so vitest only claims the src suites.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/apps/desktop',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
