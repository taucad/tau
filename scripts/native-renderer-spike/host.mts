import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { admit, manifest, validateView, limits } from './protocol.mts';
import { createFixtureRuntime } from './runtime.mts';

export const startHost = async ({ geometry, resources, runtimeMetrics, onClose = () => {} }) => {
  let closure = admit(geometry, resources);
  const token = randomBytes(32).toString('hex');
  let revision = 1;
  let view = { angle: 0.4, intensity: 1 };
  let active = 0;
  const stats = {
    get activeRequests() {
      return active;
    },
    assetRequests: 0,
    assetBytes: 0,
    controlRequests: 0,
    rejected: 0,
    runtime: runtimeMetrics,
  };
  const server = createServer(async (req, res) => {
    const reply = (code, body, type = 'application/json') => {
      if (res.destroyed) return;
      res.writeHead(code, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    // DNS rebinding, browser cross-origin calls, arbitrary URLs and forwarded credentials are denied.
    if (
      req.headers.host !== `127.0.0.1:${server.address().port}` ||
      (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
    )
      return reply(403, { error: 'origin' });
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && pathname === '/favicon.ico') return reply(204, '');
    if (req.method === 'GET' && ['/', '/viewer.js'].includes(pathname)) {
      try {
        return reply(
          200,
          await readFile(new URL(pathname === '/' ? './viewer.html' : './viewer.js', import.meta.url)),
          pathname === '/' ? 'text/html' : 'text/javascript',
        );
      } catch {
        return reply(503, { error: 'Build viewer first' });
      }
    }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      stats.rejected++;
      return reply(401, { error: 'authorization' });
    }
    if (active >= 4) return reply(429, { error: 'backpressure' });
    active++;
    res.once('close', () => {
      active--;
    });
    try {
      if (req.method === 'GET' && req.url === '/scene') {
        stats.controlRequests++;
        return reply(200, manifest(closure, revision, view));
      }
      if (req.method === 'GET' && req.url === '/stats') return reply(200, stats);
      if (req.method === 'GET' && /^\/assets\/[a-f0-9]{64}$/.test(req.url)) {
        const bytes = closure.assets.get(req.url.slice(8));
        if (!bytes) return reply(404, { error: 'asset' });
        stats.assetRequests++;
        stats.assetBytes += bytes.length;
        return reply(200, bytes, 'application/octet-stream');
      }
      if (req.method === 'PATCH' && req.url === '/view') {
        const parts = [];
        let count = 0;
        for await (const chunk of req) {
          count += chunk.length;
          if (count > limits.control) return reply(413, { error: 'control budget' });
          parts.push(chunk);
        }
        const patch = JSON.parse(Buffer.concat(parts).toString());
        if (patch.revision !== revision) return reply(409, { error: 'stale revision' });
        view = validateView(patch.view);
        revision++;
        return reply(200, manifest(closure, revision, view));
      }
      return reply(404, { error: 'route' });
    } catch {
      return reply(400, { error: 'invalid request' });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 8;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    token,
    stats,
    publishGeometry: (geometry, resources) => {
      const candidate = admit(geometry, resources);
      closure = candidate;
      revision++;
      return manifest(closure, revision, view);
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await onClose();
    },
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runtime = await createFixtureRuntime();
  const host = await startHost({ geometry: runtime.geometry, runtimeMetrics: runtime.metrics, onClose: runtime.close });
  // Session capability is shown only to the local operator; never save this line in benchmark logs.
  console.log(`Open ${host.url}/#${host.token}`);
  console.log('For native viewer, set SPIKE_URL and SPIKE_TOKEN from that session.');
  process.once('SIGINT', async () => {
    await host.close();
  });
}
