import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

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
    include: [
      'src/graphics/three/empty-viewer.browser.test.tsx',
      'src/graphics/three/post-processing-antialias.browser.test.tsx',
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
            process.env['TAU_E2E_WEBGPU_PROFILE'] === 'software'
              ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader']
              : ['--enable-unsafe-webgpu'],
        },
      }),
      instances: [{ browser: 'chromium' }],
      screenshotDirectory: '../../out/test-results/vitest-browser/viewer-resize-continuation',
    },
  },
});
