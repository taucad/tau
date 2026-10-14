import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Qualify browser-owned matching and exact equality without jsdom matcher overrides. */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  server: { host: '127.0.0.1' },
  test: {
    include: ['app/lib/dom-text-matchers.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
