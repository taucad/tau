import { playwright } from '@vitest/browser-playwright';
import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1' },
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    include: [
      'src/contract.test.ts',
      'src/delivery.test.ts',
      'src/pending-stores.test.ts',
      'src/pi-native.test.ts',
      'src/pi-telemetry.test.ts',
      'src/projection.test.ts',
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
