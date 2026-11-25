import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    environment: 'node',
    include: ['src/server-modes.spec.ts'],
    testTimeout: 240_000,
  },
});
