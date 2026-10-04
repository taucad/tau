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
      // Full Chromium, not the headless shell, so WebGPU has an adapter. CI's GPU-less
      // lane selects SwiftShader as `apps/ui-e2e` and the agent-host suites do.
      provider: playwright({
        launchOptions: {
          channel: 'chromium',
          args: [
            '--enable-unsafe-webgpu',
            ...(process.env['TAU_E2E_WEBGPU_PROFILE'] === 'software' ? ['--use-webgpu-adapter=swiftshader'] : []),
          ],
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
