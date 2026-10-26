import { fileURLToPath } from 'node:url';
import type { CDPSession, Page } from 'playwright';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';
// oxlint-disable-next-line eslint/no-restricted-imports -- Browser acceptance shares the application's native-module aliases.
import { uiResolveAlias } from '../../../vite.config.js';

const emulationSessions = new WeakMap<Page, CDPSession>();

/** Real-browser composer spacing acceptance with the shipped styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false', tauTelemetryHostCloudBuild: 'false' },
  plugins: [tailwindcss(), tauRuntime()],
  resolve: { alias: uiResolveAlias },
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
      commands: {
        /** A phone's coarse pointer, so `pointer-coarse:` styles apply (I3, I7). */
        async composerPointer({ page, context }, coarse: boolean) {
          let session = emulationSessions.get(page);
          if (!session) {
            session = await context.newCDPSession(page);
            emulationSessions.set(page, session);
          }
          await session.send('Emulation.setTouchEmulationEnabled', { enabled: coarse, maxTouchPoints: 1 });
        },
      },
      instances: [{ browser: 'chromium' }],
    },
  },
});
