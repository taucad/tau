import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../out/reports/coverage/scripts',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
