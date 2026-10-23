import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const testEntries = [
  'app/components/chat/chat-message-queue.browser.test.tsx',
  'app/components/chat/chat-questions.browser.test.tsx',
  'app/components/chat/chat-acp-activity.browser.test.tsx',
];

/** Queue reflow acceptance uses the production component and shipped styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  // Vite's optimizer hash excludes entries; keep this suite's scan separate from other browser configs.
  cacheDir: fileURLToPath(new URL('../../../node_modules/.vite/chat-message-queue', import.meta.url)),
  plugins: [tailwindcss()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  optimizeDeps: { entries: testEntries },
  test: {
    include: testEntries,
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
