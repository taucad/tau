import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

/**
 * Real-browser run of the printer viewer for the scene screenshots (WebGL,
 * light and dark, paused mid-print and following a live run). Mirrors
 * `app/routes/w.$workspace.$project/chat-print.vitest.browser.config.ts`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss(), tauRuntime()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  // Discovered mid-run otherwise, which makes Vite reload the test.
  optimizeDeps: { include: ['@statelyai/inspect', 'vitest-mock-extended'] },
  test: {
    include: ['app/components/printer/printer-viewer.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
