import { playwright } from '@vitest/browser-playwright';
import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1' },
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    include: ['src/**/*.browser.test.ts', 'src/harness/session.output-limit.test.ts'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
