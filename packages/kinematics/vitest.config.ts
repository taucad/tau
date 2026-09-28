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
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/kinematics',
      include: ['src/**/*'],
      // The benchmark is a measurement script run by the `benchmark` target, not library code.
      exclude: ['src/**/*.{test,spec,test-d}.ts', 'src/benchmark.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
