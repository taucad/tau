import { testReporters } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    reporters: testReporters('default'),
    environment: 'node',
    include: ['src/server-modes.spec.ts'],
    testTimeout: 240_000,
  },
});
