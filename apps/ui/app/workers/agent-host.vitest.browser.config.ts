/* oxlint-disable import/extensions -- The composed source fixture is replaced by the package export when FIX-PROJ adds the UI dependency. */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';
// eslint-disable-next-line @nx/enforce-module-boundaries -- This composed browser contract fixture exercises the package wire through the UI worker until FIX-PROJ adds the UI package dependency.
import { authoritativeGatewayWireFixtures } from '../../../../packages/agent-host/src/transport/gateway-wire.fixture.js';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    {
      // Minimal mirror of the app config's tau-ui-source-alias: '#X.js' -> app/X.ts.
      name: 'agent-host-ui-source-alias',
      enforce: 'pre',
      resolveId(source: string) {
        if (!source.startsWith('#')) {
          return null;
        }
        const [specifier, query] = source.split('?', 2);
        if (specifier === undefined) {
          return null;
        }
        // Preserve import queries (e.g. `?worker`) so Vite's own handling —
        // worker-constructor wrapping in particular — still engages.
        const suffix = query === undefined ? '' : `?${query}`;
        const base = fileURLToPath(new URL(`../${specifier.slice(1)}`, import.meta.url));
        for (const candidate of [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')]) {
          if (existsSync(candidate)) {
            return candidate + suffix;
          }
        }
        return null;
      },
    },
    {
      name: 'agent-host-gateway-fixture',
      configureServer(server) {
        server.middlewares.use('/v1/llm/openai/v1/chat/completions', (_request, response) => {
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
          });
          for (const frame of authoritativeGatewayWireFixtures.browserTurn) {
            response.write(frame);
          }
          response.end();
        });
      },
    },
    tauRuntime(),
    nxViteTsPaths(),
  ],
  server: {
    host: '127.0.0.1',
    // Vite 8's fs check must admit the monorepo root (worker + package imports).
    fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] },
  },
  optimizeDeps: { include: ['@taucad/gltf > draco3dgltf'] },
  test: {
    include: [
      'app/workers/agent-host.browser.test.ts',
      'app/workers/gltf-codec.browser.test.ts',
      'app/workers/headless-capture-in-worker.browser.test.ts',
      'app/machines/file-manager.browser.test.ts',
    ],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // `--enable-unsafe-webgpu` is what `apps/ui-e2e` launches with; the
      // headless capture probe needs a real adapter or its answer is vacuous.
      provider: playwright({ launchOptions: { channel: 'chromium', args: ['--enable-unsafe-webgpu'] } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
