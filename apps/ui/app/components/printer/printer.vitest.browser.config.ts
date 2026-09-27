import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';
import type { BrowserProviderOption } from 'vitest/node';
import { tauRuntime } from '@taucad/runtime/vite';

/**
 * Real-browser run of the printer viewer for the scene screenshots (WebGL,
 * light and dark, paused mid-print and following a live run). Mirrors
 * `app/routes/w.$workspace.$project/chat-print.vitest.browser.config.ts`.
 */
const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const designSystemRoot = fileURLToPath(new URL('../../../../../packages/ui/src/', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [
    {
      // Minimal mirror of the app config's tau-ui-source-alias: '#X.js' -> app/X.ts, or
      // packages/ui/src/X.ts when the design system imports its own modules.
      name: 'printer-ui-source-alias',
      enforce: 'pre',
      resolveId(source: string, importer?: string) {
        if (!source.startsWith('#')) {
          return null;
        }
        const [specifier, query] = source.split('?', 2);
        if (specifier === undefined) {
          return null;
        }
        const suffix = query === undefined ? '' : `?${query}`;
        const root = importer?.startsWith(designSystemRoot) ? designSystemRoot : appRoot;
        const base = `${root}${specifier.slice(1)}`;
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
    include: ['app/components/printer/printer-viewer.browser.test.tsx'],
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
