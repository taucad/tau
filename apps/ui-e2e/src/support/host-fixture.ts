/* eslint-disable @nx/enforce-module-boundaries -- executable fixture imports source projects before package install. */
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

// oxlint-disable-next-line no-restricted-imports -- public source entry runs before install.
import { serveHostRuntime } from '../../../../packages/host/src/runtime-host.ts';
// oxlint-disable-next-line no-restricted-imports -- share the canonical test runtime.
import { webSocketRuntime } from '../../../runtime-e2e/src/fixtures/websocket-runtime.ts';

const startHostFixture = async (): Promise<{ readonly url: string; close(): Promise<void> }> => {
  const authorizationToken = randomBytes(32).toString('base64url');
  const runtimeHost = await serveHostRuntime({ runtime: webSocketRuntime, authorizationToken });
  const httpServer = createServer();
  const socketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  httpServer.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket, head, (browser) => {
      const browserUrl = new URL(request.url ?? '/', 'http://relay.invalid');
      const route = browserUrl.pathname.endsWith('/fs') ? 'fs' : 'runtime';
      const target = new URL(`/${route}`, runtimeHost.url);
      target.search = browserUrl.search;
      const host = new WebSocket(target, { headers: { authorization: `Bearer ${authorizationToken}` } });
      sockets.add(browser);
      sockets.add(host);
      const pending: Array<{ readonly data: WebSocket.RawData; readonly binary: boolean }> = [];
      browser.on('message', (data, binary) => {
        if (host.readyState === WebSocket.OPEN) {
          host.send(data, { binary });
        } else {
          pending.push({ data, binary });
        }
      });
      host.once('open', () => {
        for (const frame of pending.splice(0)) {
          host.send(frame.data, { binary: frame.binary });
        }
      });
      host.on('message', (data, binary) => {
        browser.send(data, { binary });
      });
      browser.on('close', (code, reason) => {
        host.close(code, reason);
      });
      host.on('close', (code, reason) => {
        browser.close(code, reason);
      });
      browser.on('error', () => {
        host.terminate();
      });
      host.on('error', () => {
        browser.terminate();
      });
      browser.once('close', () => {
        sockets.delete(browser);
      });
      host.once('close', () => {
        sockets.delete(host);
      });
    });
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    await runtimeHost.close();
    throw new TypeError('Expected a TCP browser-host fixture address.');
  }
  const url = `ws://127.0.0.1:${String(address.port)}/browser`;
  return {
    url,
    async close(): Promise<void> {
      for (const socket of sockets) {
        socket.terminate();
      }
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      await runtimeHost.close();
    },
  };
};

const fixture = await startHostFixture();
if (process.send) {
  process.send({ url: fixture.url });
} else {
  process.stdout.write(`${fixture.url}\n`);
}
let closing = false;
const close = async (): Promise<void> => {
  if (closing) {
    return;
  }
  closing = true;
  await fixture.close();
  process.disconnect();
};
const scheduleClose = (): void => {
  void close();
};
process.once('SIGTERM', scheduleClose);
process.once('SIGINT', scheduleClose);
process.once('disconnect', scheduleClose);
