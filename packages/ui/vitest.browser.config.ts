import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [tailwindcss()],
  server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    include: ['src/**/*.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { channel: 'chromium' },
        /* `clipboard.browser.test.tsx` reads back what a press copied. */
        contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
