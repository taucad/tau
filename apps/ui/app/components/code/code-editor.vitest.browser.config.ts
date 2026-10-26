import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  cacheDir: '../../node_modules/.cache/code-editor-browser',
  define: { tauCloudBuildEnabled: 'false', tauTelemetryHostCloudBuild: 'false' },
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [tailwindcss(), tauRuntime()],
  optimizeDeps: {
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/search',
      '@codemirror/lint',
      '@lezer/highlight',
      'class-variance-authority',
      'radix-ui',
      'lucide-react',
      'es-module-lexer/js',
      'typescript',
      'vitest-mock-extended',
    ],
  },
  server: { fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] } },
  test: {
    include: ['app/components/code/code-editor.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: fileURLToPath(new URL('../../../../../out/test-results/code-editor', import.meta.url)),
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
