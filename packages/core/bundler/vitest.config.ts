import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/*.browser.test.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../out/reports/coverage/packages/core/bundler',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
