import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';
import type { BrowserProviderOption } from 'vitest/node';
import { tauRuntime } from '@taucad/runtime/vite';

/**
 * Real-browser run of the Print pane for the reviewed-styling screenshots
 * (desktop and 320 px, light and dark). Mirrors `app/workers/agent-host.vitest.browser.config.ts`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [
    {
      // Minimal mirror of the app config's tau-ui-source-alias: '#X.js' -> app/X.ts.
      name: 'chat-print-ui-source-alias',
      enforce: 'pre',
      resolveId(source: string) {
        if (!source.startsWith('#')) {
          return null;
        }
        const [specifier, query] = source.split('?', 2);
        if (specifier === undefined) {
          return null;
        }
        const suffix = query === undefined ? '' : `?${query}`;
        const base = fileURLToPath(new URL(`../../${specifier.slice(1)}`, import.meta.url));
        for (const candidate of [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')]) {
          if (existsSync(candidate)) {
            return candidate + suffix;
          }
        }
        return null;
      },
    },
    tailwindcss(),
    tauRuntime(),
    nxViteTsPaths(),
  ],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  // Discovered mid-run otherwise, which makes Vite reload the test.
  optimizeDeps: { include: ['@statelyai/inspect'] },
  test: {
    include: ['app/routes/w.$workspace.$project/chat-print.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- duplicated `vitest` declarations leave no narrower bridge
      provider: playwright({ launchOptions: { channel: 'chromium' } }) as unknown as BrowserProviderOption,
      instances: [{ browser: 'chromium' }],
    },
  },
});
