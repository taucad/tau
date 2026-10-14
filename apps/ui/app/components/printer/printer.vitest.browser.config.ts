import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

/**
 * Real-browser run of the printer viewer for the scene screenshots (WebGL and WebGPU,
 * light and dark, paused mid-print and following a live run). Mirrors
 * `app/routes/w.$workspace.$project/chat-print.vitest.browser.config.ts`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss(), tauRuntime()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  // Discovered mid-run otherwise, which makes Vite reload the test.
  optimizeDeps: { include: ['vitest-mock-extended'] },
  test: {
    provide: { webGpuProfile: process.env['TAU_E2E_WEBGPU_PROFILE'] === 'software' ? 'software' : 'hardware' },
    include: ['app/components/printer/printer-viewer.browser.test.tsx'],
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
      screenshotDirectory: '../../out/test-results/vitest-browser/printer',
    },
  },
});
