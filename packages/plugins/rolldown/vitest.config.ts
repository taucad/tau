import { testReporters, testRetry } from '@taucad/vitest-ci';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts', 'src/**/*.benchmark.test.ts'],
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
      reportsDirectory: '../../../out/reports/coverage/packages/plugins/rolldown',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
