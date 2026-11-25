import { testReporters } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: testReporters('default'),
    name: 'www',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/**/*.browser.test.ts'],
  },
});
