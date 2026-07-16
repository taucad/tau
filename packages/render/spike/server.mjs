// Tiny static server for the browser spike: serves spike/browser at /, the
// GLB fixtures at /fixtures/, and hands out the page's POST /result payloads
// (one promise per browser report, so multi-attempt harnesses stay in sync).
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * @typedef {object} SpikeResult
 * @property {boolean} [ok]
 * @property {string} [error]
 * @property {string} [adapter]
 * @property {number} [initTime] Milliseconds.
 * @property {number} [renderTime] Milliseconds.
 * @property {number} [secondRenderTime] Milliseconds.
 * @property {number} [codecTime] Milliseconds for the webp + jpeg encodes.
 * @property {number} [pngBytes]
 * @property {string} [pngBase64]
 * @property {number} [webpBytes]
 * @property {string} [webpBase64]
 * @property {number} [jpegBytes]
 * @property {string} [jpegBase64]
 * @property {object[]} [bench] Per-size codec benchmark reports (?bench=1).
 * @property {object} [codecConformance] GPU-independent codec fingerprints.
 * @property {object} [multiView] Six-singular versus one-batch benchmark.
 * @property {number} [batchViews] Number of views proven against singular bytes.
 * @property {{ foregroundPixels: number, hasInteriorGap: boolean, leftPixels: number, rightPixels: number }} [analysis]
 * @property {string} [invalidGlbError]
 */

/** @type {Record<string, string>} */
const mimeTypes = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ts': 'text/plain',
};

export async function startServer() {
  /** @type {SpikeResult[]} */
  const pending = [];
  /** @type {((value: SpikeResult) => void)[]} */
  const waiters = [];
  const nextResult = async () => {
    const queued = pending.shift();
    if (queued) {
      return queued;
    }
    return new Promise((/** @type {(value: SpikeResult) => void} */ resolve) => {
      waiters.push(resolve);
    });
  };

  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/result') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      response.writeHead(204).end();
      const payload = /** @type {SpikeResult} */ (JSON.parse(Buffer.concat(chunks).toString()));
      const waiter = waiters.shift();
      if (waiter) {
        waiter(payload);
      } else {
        pending.push(payload);
      }
      return;
    }

    const url = (request.url ?? '/').split('?')[0];
    const relative = url === '/' ? 'browser/index.html' : url.startsWith('/fixtures/') ? url.slice(1) : `browser${url}`;
    const path = resolvePath(root, relative);
    if (!path.startsWith(root)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const file = await readFile(path);
      response.writeHead(200, { 'content-type': mimeTypes[extname(path)] ?? 'application/octet-stream' }).end(file);
    } catch {
      response.writeHead(404).end('not found');
    }
  });

  await new Promise((/** @type {(value: void) => void} */ resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, port, nextResult };
}

// Standalone mode (manual leg): keep serving and print the result when it lands.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, port, nextResult } = await startServer();
  console.log(`serving http://127.0.0.1:${port}/ — waiting for a browser to report…`);
  const { pngBase64, ...summary } = await nextResult();
  console.log(JSON.stringify(summary, null, 2));
  if (pngBase64) {
    await mkdir(join(root, 'out'), { recursive: true });
    await writeFile(join(root, 'out', 'manual.png'), Buffer.from(pngBase64, 'base64'));
    console.log('saved spike/out/manual.png');
  }
  process.exitCode = summary.ok ? 0 : 1;
  server.close();
}
