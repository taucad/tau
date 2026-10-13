// @vitest-environment node
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { installZooProxyCredential, zooProxyCredentialFrameType } from '#proxy/zoo-proxy-credential.js';

const originalWebSocket = globalThis.WebSocket;

/** A parent port reduced to what the installer needs: one listener list. */
const createParentPort = (): {
  subscribe: (listener: (data: unknown) => void) => void;
  send: (data: unknown) => void;
} => {
  const listeners: Array<(data: unknown) => void> = [];
  return {
    subscribe(listener) {
      listeners.push(listener);
    },
    send(data) {
      for (const listener of listeners) {
        listener(data);
      }
    },
  };
};

/**
 * Serve one loopback upgrade, let `prepare` publish frames naming that server, then open `path` there.
 *
 * @param prepare - Receives the proxy URL on the fresh port; publishes whatever frames the case needs.
 * @param path - The path the socket opens.
 * @returns The `tau-zoo-token` the upgrade carried, if any.
 */
const upgradeToken = async (
  prepare: (proxyUrl: string) => void,
  path = '/v1/kernels/zoo',
): Promise<string | undefined> => {
  const server = createServer();
  const seen = new Promise<string | undefined>((resolve) => {
    server.once('upgrade', (request, socket) => {
      resolve(request.headers['tau-zoo-token'] as string | undefined);
      socket.destroy();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  try {
    prepare(`${origin}/v1/kernels/zoo`);
    const socket = new globalThis.WebSocket(`${origin}${path}?video_res_width=256`);
    socket.addEventListener('error', () => undefined);
    return await seen;
  } finally {
    server.close();
  }
};

describe('installZooProxyCredential', () => {
  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('puts the latest Zoo-scoped token on the proxy upgrade and drops it on sign-out', async () => {
    const parentPort = createParentPort();
    installZooProxyCredential(parentPort.subscribe);
    const publish = (url: string, token?: string): void => {
      parentPort.send({ type: zooProxyCredentialFrameType, url, ...(token === undefined ? {} : { token }) });
    };

    /* Before main has published anything, and past the boot frame, which carries no `type`. */
    expect(
      await upgradeToken(() => {
        parentPort.send({ taucadRuntime: true });
      }),
    ).toBeUndefined();
    expect(
      await upgradeToken((url) => {
        publish(url, 'zt1.first');
      }),
    ).toBe('zt1.first');
    expect(
      await upgradeToken((url) => {
        publish(url, 'zt1.first');
        publish(url, 'zt1.second');
      }),
    ).toBe('zt1.second');
    expect(
      await upgradeToken((url) => {
        publish(url);
      }),
    ).toBeUndefined();
  });

  it('never lends the token to another path on the proxy origin', async () => {
    const parentPort = createParentPort();
    installZooProxyCredential(parentPort.subscribe);

    const token = await upgradeToken((url) => {
      parentPort.send({ type: zooProxyCredentialFrameType, url, token: 'zt1.x' });
    }, '/v1/agents/control');

    expect(token).toBeUndefined();
  });

  it('ignores a malformed credential frame', () => {
    const parentPort = createParentPort();
    installZooProxyCredential(parentPort.subscribe);
    const before = globalThis.WebSocket;

    parentPort.send({ type: zooProxyCredentialFrameType, url: 'not a url', token: 'zt1.x' });
    parentPort.send({ type: zooProxyCredentialFrameType, url: 'ws://a/b', token: 42 });

    expect(globalThis.WebSocket).toBe(before);
  });
});
