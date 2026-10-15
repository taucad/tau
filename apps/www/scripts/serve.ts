import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequestHandler } from 'react-router';
import type { ServerBuild } from 'react-router';

// Local production verification server. Netlify runs the adapter's function in deployment.
const serverUrl = new URL('../build/server/server-build.js', import.meta.url);
const build = (await import(serverUrl.href)) as ServerBuild;
const handleRequest = createRequestHandler(build, 'production');
const root = resolve(fileURLToPath(new URL('../build/client/', import.meta.url)));
const port = Number(process.env['PORT'] ?? 4173);
const types: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};
createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    let result: Response;
    if (url.pathname.startsWith('/_www/') && !url.pathname.endsWith('.data')) {
      const filename = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!filename.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        result = new Response(new Uint8Array(await readFile(filename)), {
          headers: {
            'Content-Type': types[extname(filename)] ?? 'application/octet-stream',
            'Cache-Control': url.pathname.startsWith('/_www/bundles/')
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=0, must-revalidate',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        result = new Response('Not found', { status: 404 });
      }
    } else {
      result = await handleRequest(new Request(url, { method: request.method }));
    }
    response.statusCode = result.status;
    for (const [key, value] of result.headers) {
      response.setHeader(key, value);
    }
    let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(await result.arrayBuffer());
    if (
      /\bgzip\b/u.test(request.headers['accept-encoding'] ?? '') &&
      /text|javascript|json|xml|svg/u.test(result.headers.get('content-type') ?? '')
    ) {
      bytes = new Uint8Array(gzipSync(bytes));
      response.setHeader('Content-Encoding', 'gzip');
      response.setHeader('Vary', 'Accept-Encoding');
    }
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Tau marketing: http://127.0.0.1:${port}`);
});
