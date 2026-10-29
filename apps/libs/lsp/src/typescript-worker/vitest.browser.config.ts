import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../../..', import.meta.url)),
  cacheDir: 'node_modules/.cache/typescript-worker-browser',
  server: { fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] } },
  test: {
    include: ['apps/libs/lsp/src/typescript-worker/typescript-worker.browser.test.ts'],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: fileURLToPath(new URL('../../../../../out/test-results/typescript-worker', import.meta.url)),
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
