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
     * inherit the flag from here. Remove once Node 24 ships the V8 backport (9b8ca54d5a, 68210d500a;
     * nodejs/node#66376) or CI leaves Node 24. */
    pool: 'forks',
    execArgv: ['--no-wasm-code-gc'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
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
