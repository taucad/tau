import { playwright } from '@vitest/browser-playwright';
import { testReporters } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: testReporters('default'),
    include: ['src/rolldown-capability.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ actionTimeout: 120_000, launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium', name: 'rolldown-nonisolated' }],
    },
  },
});
