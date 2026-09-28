import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  test: {
    include: ['src/rolldown-module-vm.browser.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ actionTimeout: 120_000, launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium', name: 'rolldown-isolated' }],
    },
  },
});
