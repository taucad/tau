import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  cacheDir: '../../node_modules/.cache/monaco-browser',
  define: { tauCloudBuildEnabled: 'false' },
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [tailwindcss(), tauRuntime()],
  server: { fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] } },
  test: {
    include: ['app/components/code/code-editor.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: fileURLToPath(new URL('../../../../../out/test-results/monaco', import.meta.url)),
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
