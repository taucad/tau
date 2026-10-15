import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
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
      reportsDirectory: '../../../out/reports/coverage/packages/plugins/build123d',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts', 'src/**/*.fixture.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
