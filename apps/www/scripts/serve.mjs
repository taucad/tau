import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const port = Number(process.env.PORT ?? 4173);
const root = fileURLToPath(new URL('../dist', import.meta.url));
const headerText = await readFile(resolve(root, '_headers'), 'utf8');
/** @type {Record<string, string>} */
const globalHeaders = Object.fromEntries(
  headerText
    .split('\n\n')[0]
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }),
);
/** @type {Record<string, string>} */
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const filename = resolve(root, `.${path}`);
    if (filename !== root && !filename.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    let target = filename;
    try {
      const targetInfo = await stat(target);
      if (targetInfo.isDirectory()) {
        target = resolve(target, 'index.html');
      }
      await stat(target);
    } catch {
      target = resolve(root, '404.html');
      response.statusCode = 404;
    }
    for (const [key, value] of Object.entries(globalHeaders)) {
      response.setHeader(key, value);
    }
    response.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    let bytes = await readFile(target);
    if (target.startsWith(resolve(root, '_www/assets') + sep)) {
      response.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
    if (
      /\b gzip\b|^gzip\b/u.test(String(request.headers['accept-encoding'])) &&
      ['.html', '.css', '.mjs', '.xml', '.svg', '.txt', '.json'].includes(extname(target))
    ) {
      bytes = gzipSync(bytes);
      response.setHeader('Content-Encoding', 'gzip');
      response.setHeader('Vary', 'Accept-Encoding');
    }
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(400).end('Bad request');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Tau marketing: http://127.0.0.1:${port}`);
});
