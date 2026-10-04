import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../../..', import.meta.url)),
  plugins: [tailwindcss()],
  cacheDir: '../../node_modules/.cache/viewer-resize-browser',
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  optimizeDeps: {
    include: [
      '@testing-library/react',
      '@react-three/fiber',
      'xstate',
      'react',
      'react-dom',
      'react-dom/client',
      'dockview-react',
      'allotment',
      'three',
      'three/webgpu',
    ],
  },
  server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../../../../../../..', import.meta.url))] } },
  test: {
    include: [
      'app/components/geometry/graphics/three/viewer-resize.browser.test.tsx',
      'app/components/geometry/graphics/three/viewer-resize-continuation.browser.test.tsx',
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
      screenshotDirectory: '../../out/test-results/viewer-resize',
      commands: {
        async recordViewerResize(_context, backend: string, evidence: string) {
          if (backend !== 'webgl' && backend !== 'webgpu') {
            throw new Error('Unknown backend');
          }
          const directory = new URL('../../../../../../../out/test-results/viewer-resize/', import.meta.url);
          await mkdir(directory, { recursive: true });
          await writeFile(new URL(`${backend}.json`, directory), evidence);
        },
      },
    },
  },
});
