import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { z } from 'zod';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite configuration lives outside the app alias root.
import uiConfig from './vite.config.js';

const output = path.resolve(import.meta.dirname, '../../out/render-calibration');
const captureSchema = z.object({
  name: z.string().regex(/^[\da-z][\da-z-]{0,120}$/),
  image: z.string().startsWith('data:image/png;base64,'),
  metadata: z.record(z.string(), z.unknown()),
});

/** Local-only diagnostic server. Neither fixture bytes nor capture endpoints enter the product build. */
export default defineConfig(() => {
  const config = uiConfig({ mode: 'test', command: 'serve' });
  return {
    ...config,
    cacheDir: '../../node_modules/.vite/render-calibration',
    plugins: [
      ...(config.plugins ?? []),
      react(),
      {
        name: 'tau-render-calibration',
        configureServer(server) {
          server.middlewares.use('/calibration-data/', (request, response, next) => {
            const filename = (request.url?.split('?')[0] ?? '').replace(/^\//, '');
            if (request.method !== 'GET' || !/^(catalog\.json|fixtures\/[\w.-]+\.glb)$/.test(filename)) {
              next();
              return;
            }
            const serveFixture = async (): Promise<void> => {
              try {
                const data = await readFile(path.join(output, filename));
                response.setHeader(
                  'Content-Type',
                  filename.endsWith('.glb') ? 'model/gltf-binary' : 'application/json',
                );
                response.end(data);
              } catch {
                response.statusCode = 404;
                response.end('Run the render calibration fixture generator first.');
              }
            };
            void serveFixture();
          });
          server.middlewares.use('/calibration-capture', (request, response) => {
            if (request.method !== 'POST' || request.headers.origin !== `http://${request.headers.host}`) {
              response.statusCode = 403;
              response.end('Same-origin POST required.');
              return;
            }
            // async-iife: bootstrap — Connect owns the synchronous handler; errors are returned over HTTP.
            void (async () => {
              try {
                const chunks: Array<Uint8Array<ArrayBuffer>> = [];
                let bytes = 0;
                for await (const chunk of request) {
                  const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
                  bytes += data.byteLength;
                  if (bytes > 32 * 1024 * 1024) {
                    throw new Error('Capture exceeds 32 MiB.');
                  }
                  chunks.push(new Uint8Array(data));
                }
                const capture = captureSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                const png = Buffer.from(capture.image.slice('data:image/png;base64,'.length), 'base64');
                if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
                  throw new Error('Invalid PNG signature.');
                }
                const directory = path.join(output, 'captures');
                await mkdir(directory, { recursive: true });
                const filename = `${capture.name}-${Date.now()}`;
                await writeFile(path.join(directory, `${filename}.png`), png, { flag: 'wx' });
                await writeFile(path.join(directory, `${filename}.json`), JSON.stringify(capture.metadata, null, 2), {
                  flag: 'wx',
                });
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ file: `out/render-calibration/captures/${filename}` }));
              } catch (error) {
                response.statusCode = 400;
                response.end(error instanceof Error ? error.message : 'Invalid capture.');
              }
            })();
          });
        },
      },
    ],
    server: {
      ...config.server,
      host: '127.0.0.1',
      port: 3005,
      strictPort: true,
      allowedHosts: ['localhost'],
      hmr: false,
    },
  };
});
