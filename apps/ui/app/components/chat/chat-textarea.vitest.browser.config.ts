import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

/** Real-browser composer spacing acceptance with the shipped styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false' },
  plugins: [tailwindcss(), tauRuntime()],
  optimizeDeps: {
    include: [
      '@tiptap/core',
      '@tiptap/extension-document',
      '@tiptap/extension-hard-break',
      '@tiptap/extension-history',
      '@tiptap/extension-paragraph',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-text',
      '@tiptap/pm/model',
      '@tiptap/pm/state',
      '@tiptap/react',
      '@tiptap/suggestion',
      'embla-carousel-react',
      'react-dom',
    ],
  },
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/components/chat/chat-textarea.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: fileURLToPath(new URL('../../../../../out/test-results/composer', import.meta.url)),
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
