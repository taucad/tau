import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Real Chromium acceptance of the authored SVG viewer and its isolated styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../../../..', import.meta.url)),
  plugins: [tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5196,
    fs: { allow: [fileURLToPath(new URL('../../../../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/components/geometry/graphics/svg/svg-viewer.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/tscircuit-closeout/browser-failures',
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
