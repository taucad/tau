import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';
// oxlint-disable-next-line eslint/no-restricted-imports -- Browser acceptance shares the application's native-module aliases.
import { uiResolveAlias } from '../../vite.config.js';

/**
 * Composer image conversion (blueprint WP5): host parity over the web-worker transport against the raster
 * transcoder's `golden.json`, and the composer's intake and draft image step through the real worker. Host parity
 * (b) is the `chromium` project, run by `verify-browser` in the browser lane; (c) is the `firefox` and `webkit`
 * projects, run by `test:e2e:attachment-image-engines` in the merge queue's `e2e-queue` lane (`test:e2e:queue`)
 * whenever `ui` is affected.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  define: { tauTelemetryHostCloudBuild: 'false' },
  plugins: [tauRuntime()],
  resolve: { alias: uiResolveAlias },
  // Vite's optimizer hash excludes entries; keep this suite's pre-bundle separate from other browser configs.
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite/attachment-image-browser', import.meta.url)),
  /*
   * Pre-bundled up front: the worker discovers these on its first conversion, and a cold cache otherwise
   * re-optimizes and reloads the page mid-run, which closes the worker the parity suite just connected.
   */
  optimizeDeps: {
    include: [
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@taucad/image > @jsquash/avif/codec/dec/avif_dec.js',
      '@taucad/image > @jsquash/jpeg/codec/dec/mozjpeg_dec.js',
      '@taucad/image > @jsquash/jpeg/codec/enc/mozjpeg_enc.js',
      '@taucad/image > @jsquash/jpeg/meta.js',
      '@taucad/image > @jsquash/png/codec/pkg/squoosh_png.js',
      '@taucad/image > @jsquash/resize/lib/resize/pkg/squoosh_resize.js',
      '@taucad/image > @jsquash/webp/codec/dec/webp_dec.js',
      '@taucad/image > @jsquash/webp/codec/enc/webp_enc.js',
      '@taucad/image > @jsquash/webp/meta.js',
      '@taucad/image > @resvg/resvg-wasm',
      '@taucad/heif > libheif-js/libheif-wasm/libheif.js',
      'deepmerge',
      '@taucad/image > jpeg-js',
      'manifold-3d/manifold-gltf',
      '@taucad/image > nanoraster',
      '@taucad/image > nanoraster/options',
      '@taucad/image > omggif',
      '@taucad/image > utif2',
    ],
  },
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
      provider: playwright(),
      instances: [
        { browser: 'chromium', name: 'chromium', provider: playwright({ launchOptions: { channel: 'chromium' } }) },
        { browser: 'firefox', name: 'firefox' },
        { browser: 'webkit', name: 'webkit' },
      ],
    },
  },
});
