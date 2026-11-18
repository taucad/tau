import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `scripts/*.test.mts` are `node:test` scripts owned by the `test:scripts` target, so vitest only claims src.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/libs/sandbox',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
