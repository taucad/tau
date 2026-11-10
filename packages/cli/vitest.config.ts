import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    /*
     * A few unit suites (cold start, serve) spawn the built CLI; the cold path
     * includes WASM init. 60s gives plenty of headroom on slow CI runners. The
     * end-to-end suites live in `apps/cli-e2e`.
     */
    testTimeout: 60_000,
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    // On GitHub Actions a failure also becomes a check-run annotation, readable without the job log.
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/cli',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts', 'src/cli-dist.test.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
