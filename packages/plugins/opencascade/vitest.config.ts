import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    /* ponytail: Node 24's V8 (13.6) can abort with `Check failed: jit_page_->allocations_.erase(addr) == 1`
     * in `ThreadIsolation::UnregisterWasmAllocation` (nodejs/node#66366). Wasm import wrappers live in a
     * process-wide cache; when a thread that used one exits, wasm code GC starts freeing it, and another thread can
     * take a reference to it before seeing it is dying, so the wrapper is freed twice. The `wasm: 'multi'` suite
     * runs OCCT on pthread workers in one process. `--no-wasm-code-gc` removes the only path that frees dying code.
     * V8 flags are process-wide: worker threads reject them in `execArgv` and NODE_OPTIONS refuses them, so the
     * forks pool passes them from here. Node 26's V8 14.6 carries the fix (9b8ca54d5a, 68210d500a) and Node 24's 13.6
     * does not (Brain research/node-26-ci-migration.md, Finding 1), so the flag is set on V8 13 only: in CI that is the
     * Node 24 floor lane (`ci.yml` `node-floor`), and the Node 26 lanes run with wasm code GC on, as users do. Remove
     * once Node 24 ships the backport (nodejs/node#66376) or the `engines.node` floor leaves Node 24. */
    pool: 'forks',
    execArgv: process.versions.v8.startsWith('13.') ? ['--no-wasm-code-gc'] : [],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../out/reports/coverage/packages/plugins/opencascade',
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
