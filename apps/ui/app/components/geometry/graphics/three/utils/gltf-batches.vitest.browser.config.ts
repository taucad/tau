import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Native pixel, draw and buffer-lifetime qualification against the installed Three package. */
export default defineConfig({
  root: fileURLToPath(new URL('../../../../../../', import.meta.url)),
  cacheDir: '../../node_modules/.cache/gltf-batches-browser',
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three', 'three/addons', 'three/webgpu', 'three/tsl'] },
  test: {
    include: [
      'app/components/geometry/graphics/three/utils/gltf-surface-batches.browser.test.ts',
      'app/components/geometry/graphics/three/utils/gltf-edge-batches.browser.test.ts',
    ],
    fileParallelism: false,
    reporters: ['verbose'],
    testTimeout: 120_000,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/test-results/gltf-batches-browser',
      provider: playwright({ launchOptions: { channel: 'chromium', args: ['--enable-unsafe-webgpu'] } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
