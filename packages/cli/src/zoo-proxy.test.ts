// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { authorizeCliZooProxy, cliZooProxyUrl } from '#zoo-proxy.js';

const originalWebSocket = globalThis.WebSocket;

describe('cliZooProxyUrl', () => {
  it.each([
    [
      { TAU_WEBSOCKET_URL: 'ws://localhost:4001', TAU_API_URL: 'http://localhost:4000' },
      'ws://localhost:4001/v1/kernels/zoo',
    ],
    [{ TAU_WEBSOCKET_URL: 'wss://api.example.test/' }, 'wss://api.example.test/v1/kernels/zoo'],
    [{ TAU_API_URL: 'https://api.example.test' }, 'wss://api.example.test/v1/kernels/zoo'],
    [{ TAU_API_URL: 'http://localhost:4000/' }, 'ws://localhost:4000/v1/kernels/zoo'],
    [{}, 'wss://api.tau.new/v1/kernels/zoo'],
  ])('resolves %o to %s', (environment, expected) => {
    expect(cliZooProxyUrl(environment)).toBe(expected);
  });
});

describe('authorizeCliZooProxy', () => {
  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  /** Open the proxy path on a loopback server and report the upgrade's `authorization`. */
  const upgradeAuthorization = async (environment: Record<string, string | undefined>, path: string) => {
    const server = createServer();
    const seen = new Promise<string | undefined>((resolve) => {
      server.once('upgrade', (request, socket) => {
        resolve(request.headers.authorization);
        socket.destroy();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `ws://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    try {
      authorizeCliZooProxy({ ...environment, TAU_WEBSOCKET_URL: origin });
      const socket = new globalThis.WebSocket(`${origin}${path}`);
      socket.addEventListener('error', () => undefined);
      return await seen;
    } finally {
      server.close();
    }
  };

  it('puts TAU_API_TOKEN on the Zoo proxy upgrade only', async () => {
    expect(await upgradeAuthorization({ TAU_API_TOKEN: 'session-1' }, '/v1/kernels/zoo?a=1')).toBe('Bearer session-1');
    expect(await upgradeAuthorization({ TAU_API_TOKEN: 'session-1' }, '/v1/agents/control')).toBeUndefined();
  });

  it('leaves WebSocket alone without a token', () => {
    authorizeCliZooProxy({ TAU_API_URL: 'http://localhost:4000' });

    expect(globalThis.WebSocket).toBe(originalWebSocket);
  });
});
