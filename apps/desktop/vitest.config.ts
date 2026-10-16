import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors electron.vite.config.ts for a self-host build; unit tests exercise that transport.
  define: { tauCloudBuildEnabled: 'false', tauSentryDsn: '""', tauPostHogClientKey: '""' },
  test: {
    // `scripts/macos-package-mode.test.mts` is a `node:test` script owned by the
    // `test-macos-package-mode` target, so vitest only claims the src suites.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    environment: 'node',
    /* ponytail: Node 24's V8 can abort a fork with `Check failed: jit_page.has_value()` when it tiers up a
     * wasm-to-JS wrapper after a worker thread that used it has exited (nodejs/node#66366). `main.test.ts` boots real
     * compute-store workers. An unreachable tiering budget keeps wrappers untiered; V8 flags are process-wide, so
     * they cannot ride NODE_OPTIONS and worker threads inherit them from here. Remove once Node 24 ships the V8
     * backport (9b8ca54d5a, 68210d500a) or CI leaves Node 24. */
    execArgv: ['--wasm-wrapper-tiering-budget=1000000000'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/apps/desktop',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
