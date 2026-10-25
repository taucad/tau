import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const testEntries = ['app/components/terminal/terminal-renderer.browser.test.ts'];

/** The Terminal renderer's acceptance (A15, I9) runs the real AurigaX engine and its WASM in Chromium. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  // Vite's optimizer hash excludes entries; keep this suite's scan separate from other browser configs.
  cacheDir: fileURLToPath(new URL('../../../node_modules/.vite/terminal-renderer', import.meta.url)),
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  /* Pre-bundled up front so the first test is not reloaded when Vite discovers the renderer. */
  optimizeDeps: { entries: testEntries, include: ['@aurigax-ai/ghostty-web'] },
  test: {
    include: testEntries,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/test-results/terminal-renderer',
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
