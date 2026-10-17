import { fileURLToPath } from 'node:url';
import process from 'node:process';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

const chromiumPath = process.env['TAU_TEST_CHROMIUM_PATH'];

/** Keyboard acceptance for the shared project instruction editor. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false' },
  plugins: [tailwindcss(), tauRuntime()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', '@testing-library/react'] },
  server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] } },
  test: {
    include: ['app/components/project-tasks/project-tasks.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: fileURLToPath(new URL('../../../../../out/test-results/project-tasks', import.meta.url)),
      provider: playwright({
        launchOptions: { channel: 'chromium', ...(chromiumPath ? { executablePath: chromiumPath } : {}) },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
