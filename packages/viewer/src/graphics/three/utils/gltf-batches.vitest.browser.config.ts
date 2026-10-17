import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const webGpuProfile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
if (webGpuProfile !== 'hardware' && webGpuProfile !== 'software') {
  throw new TypeError(`Unsupported TAU_E2E_WEBGPU_PROFILE: ${webGpuProfile}`);
}

/**
 * Native pixel, draw and buffer-lifetime qualification against the installed Three package, and the measurement
 * worker loaded through the bundler's `new Worker(new URL(…))` resolution.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../../../../', import.meta.url)),
  cacheDir: '../../node_modules/.cache/gltf-batches-browser',
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three', 'three/addons', 'three/webgpu', 'three/tsl', 'three-mesh-bvh'] },
  test: {
    provide: { webGpuProfile },
    include: [
      'src/graphics/three/utils/gltf-surface-batches.browser.test.ts',
      'src/graphics/three/utils/gltf-edge-batches.browser.test.ts',
      'src/graphics/three/materials/section-clip.browser.test.ts',
      'src/graphics/three/utils/measurement-features-worker-client.browser.test.ts',
      'src/graphics/three/utils/bvh-worker-client.browser.test.ts',
      'src/graphics/three/utils/model-gpu-pick.browser.test.ts',
    ],
    fileParallelism: false,
    reporters: ['verbose'],
    testTimeout: 120_000,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/test-results/gltf-batches-browser',
      provider: playwright({
        launchOptions: {
          channel: 'chromium',
          args:
            webGpuProfile === 'software'
              ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader']
              : ['--enable-unsafe-webgpu'],
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
