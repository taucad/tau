import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors electron.vite.config.ts for a self-host build; unit tests exercise that transport.
  define: {
    tauTelemetryHostCloudBuild: 'false',
    tauSentryDsn: '""',
    tauSentryRelease: '""',
    tauPostHogClientKey: '""',
  },
  test: {
    // `scripts/macos-package-mode.test.mts` is a `node:test` script owned by the
    // `test-macos-package-mode` target, so vitest only claims the src suites.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    environment: 'node',
    /* ponytail: Node 24's V8 (13.6) can abort a fork with `Check failed: jit_page.has_value()` or
     * `jit_page_->allocations_.erase(addr) == 1` (nodejs/node#66366). Wasm import wrappers live in a process-wide
     * cache; when a worker thread that used one exits, wasm code GC starts freeing it, and another thread can take a
     * reference to it before seeing it is dying, so the wrapper is freed twice. `main.test.ts` boots real
     * compute-store workers. An unreachable tiering budget stops the wrapper tier-up that usually takes that
     * reference; `--no-wasm-code-gc` removes the only path that frees dying code, which also covers the lookups
     * instantiation makes. V8 flags are process-wide: worker threads reject them in `execArgv` and NODE_OPTIONS
     * refuses them, so the forks pool passes them from here. Node 26's V8 14.6 carries the fix (9b8ca54d5a,
     * 68210d500a) and Node 24's 13.6 does not (Brain research/node-26-ci-migration.md, Finding 1), so the flags are set
     * on V8 13 only. CI runs this suite on Node 26 alone (the app ships on Electron's own V8 15, and the Node 24 floor
     * lane runs published packages only), so they now only cover a local run on Node 24, the `engines.node` floor.
     * Remove once Node 24 ships the backport (nodejs/node#66376) or the floor leaves Node 24. */
    pool: 'forks',
    execArgv: process.versions.v8.startsWith('13.')
      ? ['--wasm-wrapper-tiering-budget=1000000000', '--no-wasm-code-gc']
      : [],
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/apps/desktop',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
