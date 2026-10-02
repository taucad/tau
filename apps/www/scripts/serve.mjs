import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const port = Number(process.env.PORT ?? 4173);
const root = fileURLToPath(new URL('../dist', import.meta.url));
const headerText = await readFile(resolve(root, '_headers'), 'utf8');
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
createServer(async (request, res) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const filename = resolve(root, `.${path}`);
    if (filename !== root && !filename.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let target = filename;
    try {
      if ((await stat(target)).isDirectory()) {
        target = resolve(target, 'index.html');
      }
      await stat(target);
    } catch {
      target = resolve(root, '404.html');
      res.statusCode = 404;
    }
    for (const [key, value] of Object.entries(globalHeaders)) {
      res.setHeader(key, value);
    }
    res.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let bytes = await readFile(target);
    if (target.startsWith(resolve(root, '_www/assets') + sep)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
    if (
      /\b gzip\b|^gzip\b/u.test(String(request.headers['accept-encoding'])) &&
      ['.html', '.css', '.mjs', '.xml', '.svg', '.txt', '.json'].includes(extname(target))
    ) {
      bytes = gzipSync(bytes);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
    }
    res.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(400).end('Bad request');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Tau marketing: http://127.0.0.1:${port}`);
});
