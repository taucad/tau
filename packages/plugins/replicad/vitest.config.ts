import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    /* ponytail: Node 24's V8 (13.6) can abort a worker with `Check failed: jit_page_->allocations_.erase(addr) == 1`
     * in `ThreadIsolation::UnregisterWasmAllocation` (nodejs/node#66366). The OCCT wasm's import wrappers live in
     * a process-wide cache; when a worker or OCCT pthread that used one exits, wasm code GC starts freeing it, and
     * a wrapper tier-up on another thread can take a reference to it before seeing it is dying, so the wrapper
     * is freed twice. `--no-wasm-code-gc` removes the only path that frees dying code. V8 flags are process-wide:
     * worker threads reject them in `execArgv` and NODE_OPTIONS refuses them, so the suite runs in forks that
     * inherit the flag from here. Node 26's V8 14.6 carries the fix (9b8ca54d5a, 68210d500a) and Node 24's 13.6 does
     * not (Brain research/node-26-ci-migration.md, Finding 1), so the flag is set on V8 13 only: in CI that is the
     * Node 24 floor lane (`ci.yml` `node-floor`), and the Node 26 lanes run with wasm code GC on, as users do. Remove
     * once Node 24 ships the backport (nodejs/node#66376) or the `engines.node` floor leaves Node 24. */
    pool: 'forks',
    execArgv: process.versions.v8.startsWith('13.') ? ['--no-wasm-code-gc'] : [],
    /* The kernel's generated source map and font, so `vitest` started outside Nx's `test` target finds them too. */
    globalSetup: ['./vitest.global-setup.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: testReporters('verbose'),
    retry: testRetry(),
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../out/reports/coverage/packages/plugins/replicad',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
