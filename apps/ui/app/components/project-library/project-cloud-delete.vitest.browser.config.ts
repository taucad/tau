import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Render the production menu/dialog with the shipped tokens at both viewport widths. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/components/project-library/project-cloud-delete.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory:
        process.env['TAU_TEST_SCREENSHOT_DIRECTORY'] ?? '../../out/test-results/project-cloud-deletion',
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
