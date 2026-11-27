import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    name: 'www-download-browser',
    environment: 'node',
    include: ['tests/download-catalog.browser.test.ts'],
  },
});
