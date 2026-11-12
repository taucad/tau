import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

/** Real-browser acceptance of History's lanes: the bend rule measured on the drawn graph (History D2). */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false', tauTelemetryHostCloudBuild: 'false' },
  plugins: [tailwindcss(), tauRuntime()],
  server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] } },
  optimizeDeps: { include: ['buffer', '@taucad/revisions > isomorphic-git'] },
  test: {
    globals: true,
    include: ['app/routes/w.$workspace.$project/history-lanes.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
