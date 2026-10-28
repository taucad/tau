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
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
              chunks.push(Buffer.from(chunk));
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
