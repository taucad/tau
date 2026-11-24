import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
