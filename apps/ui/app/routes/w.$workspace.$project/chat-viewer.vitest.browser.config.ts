import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

/** Real Dockview header acceptance at the ruled viewer widths. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss(), tauRuntime()],
  optimizeDeps: {
    include: [
      'class-variance-authority',
      'cmdk',
      'dockview-react',
      'lucide-react',
      'radix-ui',
      'react-virtuoso',
      'vaul',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5197,
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/routes/w.$workspace.$project/chat-viewer.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/tscircuit-closeout/browser-failures',
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
