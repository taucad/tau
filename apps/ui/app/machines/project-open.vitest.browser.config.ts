import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    tauRuntime(),
    {
      name: 'project-open-probe-evidence',
      configureServer(server) {
        server.middlewares.use('/__project-open-probe', async (request, response) => {
          if (request.method !== 'POST') {
            response.writeHead(405).end();
            return;
          }
          try {
            const chunks: Array<Uint8Array<ArrayBuffer>> = [];
            for await (const chunk of request) {
              const bytes: unknown = chunk;
              if (typeof bytes === 'string') {
                chunks.push(new TextEncoder().encode(bytes));
              } else if (bytes instanceof Uint8Array) {
                chunks.push(new Uint8Array(bytes));
              } else {
                throw new TypeError('Unexpected request body chunk');
              }
            }
            const evidence: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (
              typeof evidence !== 'object' ||
              evidence === null ||
              !('authoredRootFilesExcludingManifestAndIdentity' in evidence) ||
              (evidence.authoredRootFilesExcludingManifestAndIdentity !== 10 &&
                evidence.authoredRootFilesExcludingManifestAndIdentity !== 1000)
            ) {
              response.writeHead(400).end();
              return;
            }
            const directory = fileURLToPath(
              new URL(
                '../../../../out/research/taucad-dev-load-performance-audit/project-open-20261027/tree-probe-1/',
                import.meta.url,
              ),
            );
            await mkdir(directory, { recursive: true });
            await writeFile(
              `${directory}/root-${String(evidence.authoredRootFilesExcludingManifestAndIdentity)}.json`,
              `${JSON.stringify(evidence, null, 2)}\n`,
            );
            response.writeHead(204).end();
          } catch {
            response.writeHead(500).end();
          }
        });
      },
    },
  ],
  // Worker dependencies must be optimized before the probe starts; late discovery reloads its page.
  optimizeDeps: {
    include: [
      '@taucad/revisions > buffer',
      '@taucad/utils > cdn-resolve',
      'diff',
      'es-module-lexer',
      '@taucad/bambu > fflate',
      'geospec/agent/resources.js',
      '@taucad/revisions > isomorphic-git',
      '@taucad/chat > js-yaml',
      'minimatch',
      '@taucad/chat > safe-regex',
      '@taucad/bundler-core > semver',
      '@taucad/runtime > source-map-js',
      'vscode-uri',
    ],
  },
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/machines/project-open.browser.test.ts'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
