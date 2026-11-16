import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';
// oxlint-disable-next-line eslint/no-restricted-imports -- Browser acceptance shares the application's native-module aliases.
import { uiResolveAlias } from '../../vite.config.js';

/**
 * Composer image conversion in Chromium (blueprint WP5): host parity (b) over the web-worker transport against the
 * raster transcoder's `golden.json`, and the composer's intake and draft image step through the real worker.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false', tauTelemetryHostCloudBuild: 'false' },
  plugins: [tauRuntime()],
  resolve: { alias: uiResolveAlias },
  server: {
    host: '127.0.0.1',
    // The worker, the codecs and the raster fixtures live outside the app root.
    fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/hooks/attachment-image.browser.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
