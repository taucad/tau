import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Queue reflow acceptance uses the production component and shipped styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  test: {
    include: [
      'app/components/chat/chat-message-queue.browser.test.tsx',
      'app/components/chat/chat-questions.browser.test.tsx',
    ],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/test-results/message-queue',
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
