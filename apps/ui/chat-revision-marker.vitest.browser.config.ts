import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

/** Real-browser revision-marker acceptance, including the authority-to-host-to-DOM boundary. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false' },
  plugins: [tailwindcss(), tauRuntime()],
  server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  optimizeDeps: { include: ['buffer', '@taucad/revisions > isomorphic-git'] },
  test: {
    globals: true,
    include: ['app/routes/w.$workspace.$project/chat-revision-marker.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
