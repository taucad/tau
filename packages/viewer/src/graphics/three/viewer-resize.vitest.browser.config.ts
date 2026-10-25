// oxlint-disable-next-line eslint/no-restricted-imports, import/no-empty-named-blocks -- Type-only augmentation import for config consumers before aliases are installed.
import type {} from '../../test/webgpu-profile.test-utils.js';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const webGpuProfile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
if (webGpuProfile !== 'hardware' && webGpuProfile !== 'software') {
  throw new TypeError(`Unsupported TAU_E2E_WEBGPU_PROFILE: ${webGpuProfile}`);
}

const surfaceAa = process.env['TAU_E2E_SURFACE_AA'] ?? 'on';
if (surfaceAa !== 'on' && surfaceAa !== 'off') {
  throw new TypeError(`Unsupported TAU_E2E_SURFACE_AA: ${surfaceAa}`);
}

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss()],
  cacheDir: '../../node_modules/.cache/viewer-resize-continuation-browser',
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  optimizeDeps: {
    include: [
      '@testing-library/react',
      '@react-three/fiber',
      'xstate',
      'react',
      'react-dom',
      'react-dom/client',
      'three',
      'three/webgpu',
    ],
  },
  server: {
    host: '127.0.0.1',
    fs: {
      allow: [fileURLToPath(new URL('../../../../..', import.meta.url))],
    },
  },
  test: {
    provide: { webGpuProfile, surfaceAa },
    include: [
      'src/graphics/three/shader-cache.browser.test.ts',
      'src/graphics/three/empty-viewer.browser.test.tsx',
      'src/graphics/three/node-frame-reference.browser.test.ts',
      'src/graphics/three/webgpu-depth-sampling.browser.test.ts',
      'src/graphics/three/transmission-retirement.browser.test.ts',
      'src/graphics/three/post-processing-antialias.browser.test.tsx',
      'src/graphics/three/ao-denoise.browser.test.ts',
      'src/graphics/three/ao-normal.browser.test.ts',
      'src/graphics/three/fxaa.browser.test.ts',
      'src/graphics/three/controls/viewport-gizmo-cube.browser.test.ts',
      'src/graphics/three/viewer-resize-continuation.browser.test.tsx',
    ],
    testTimeout: 60_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
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
      screenshotDirectory: '../../out/test-results/vitest-browser/viewer-resize-continuation',
    },
  },
});
