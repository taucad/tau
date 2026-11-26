import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: testReporters('verbose'),
    retry: testRetry(),
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/libs/oxlint',
      include: ['src/**/*'],
      exclude: ['src/**/*.test.js'],
    },
  },
});
