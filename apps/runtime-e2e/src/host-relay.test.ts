import { createServer } from 'node:http';
import { once } from 'node:events';

import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { serveHostRuntime } from '@taucad/host/runtime-host';
import { createRuntimeClient } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import { extractGltfFromExportResult } from '@taucad/runtime-testing';

import { boxSource, webSocketRuntime } from '#fixtures/websocket-runtime.js';

const closures: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(closures.splice(0).map(async (close) => close()));
});

const startRelay = async (hostUrl: URL, authorizationToken: string): Promise<URL> => {
  const httpServer = createServer();
  const socketServer = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket, head, (browser) => {
      const browserUrl = new URL(request.url ?? '/', 'http://relay.invalid');
      const route = browserUrl.pathname.endsWith('/fs') ? 'fs' : 'runtime';
      const target = new URL(`/${route}`, hostUrl);
      target.search = browserUrl.search;
      const host = new WebSocket(target, { headers: { authorization: `Bearer ${authorizationToken}` } });
      const pending: Array<{ readonly data: WebSocket.RawData; readonly binary: boolean }> = [];
      browser.on('message', (data, binary) => {
        if (host.readyState === WebSocket.OPEN) host.send(data, { binary });
        else pending.push({ data, binary });
      });
      host.once('open', () => {
        for (const frame of pending.splice(0)) host.send(frame.data, { binary: frame.binary });
      });
      host.on('message', (data, binary) => browser.send(data, { binary }));
      browser.on('close', (code, reason) => host.close(code, reason));
      host.on('close', (code, reason) => browser.close(code, reason));
      browser.on('error', () => host.terminate());
      host.on('error', () => browser.terminate());
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  closures.push(
    () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      ),
  );
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP relay address.');
  return new URL(`ws://127.0.0.1:${String(address.port)}/browser`);
};

describe('Tau Host production-surface relay', { concurrent: false }, () => {
  it('renders byte-identical geometry through the relay with browser-owned filesystem authority', async () => {
    const authorizationToken = 'runtime-loopback-token-'.padEnd(40, 'x');
    const host = await serveHostRuntime({ runtime: webSocketRuntime, authorizationToken });
    closures.push(() => host.close());
    const relayUrl = await startRelay(host.url, authorizationToken);
    const fileSystem = fromMemoryFs({ 'main.ts': boxSource(42) });
    const remote = createRuntimeClient({
      transport: webSocketTransport({ url: relayUrl, fileSystem }),
    });
    const local = createRuntimeClient({
      transport: inProcessTransport({ runtime: webSocketRuntime, fileSystem }),
    });

    try {
      const [remoteExport, localExport] = await Promise.all([
        remote.export('glb', { source: { path: 'main.ts' } }),
        local.export('glb', { source: { path: 'main.ts' } }),
      ]);
      const remoteBytes = extractGltfFromExportResult(remoteExport);
      const localBytes = extractGltfFromExportResult(localExport);

      expect(remoteBytes).toBeDefined();
      expect(Buffer.from(remoteBytes!).equals(Buffer.from(localBytes!))).toBe(true);
    } finally {
      remote.terminate();
      local.terminate();
    }
  }, 120_000);

  it('rejects a loopback runtime route without the parent token', async () => {
    const authorizationToken = 'runtime-loopback-token-'.padEnd(40, 'x');
    const host = await serveHostRuntime({ runtime: webSocketRuntime, authorizationToken });
    closures.push(() => host.close());
    const rejected = new WebSocket(new URL('/runtime?session=rejected', host.url));
    const [error] = (await once(rejected, 'error')) as [Error];

    expect(error.message).toContain('401');
  });
});
