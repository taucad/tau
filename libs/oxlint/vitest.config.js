import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/libs/oxlint',
      include: ['src/**/*'],
      exclude: ['src/**/*.test.js'],
    },
  },
});
