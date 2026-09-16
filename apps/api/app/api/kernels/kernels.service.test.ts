import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { ConfigService } from '@nestjs/config';
import { KernelsService } from '#api/kernels/kernels.service.js';
import type { Environment } from '#config/environment.config.js';

const config = (values: Partial<Environment> = {}): ConfigService<Environment, true> => {
  const configured = { get: (key: keyof Environment) => values[key] } satisfies Pick<
    ConfigService<Environment, true>,
    'get'
  >;
  return configured as ConfigService<Environment, true>;
};

const frameText = (data: RawData): string => {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  }
  return data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data.toString();
};

describe('KernelsService hosted billing gate', () => {
  it('should close with service-unavailable before creating an upstream Zoo socket', () => {
    const close = vi.fn();
    const clientSocket = { close } as unknown as WebSocket;

    new KernelsService(config(), 'cloud').createZooProxy(clientSocket, new URLSearchParams(), 'user-1');

    expect(close).toHaveBeenCalledWith(1013, 'ZOO_SUPPLIER_LIMIT_UNQUALIFIED');
  });

  it('should require the self-host operator to configure its own Zoo key', () => {
    const close = vi.fn();
    const clientSocket = { close } as unknown as WebSocket;

    new KernelsService(
      config({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
        ZOO_WEBSOCKET_URL: 'wss://api.zoo.dev',
      }),
      'self-host',
    ).createZooProxy(clientSocket, new URLSearchParams(), 'user-1');

    expect(close).toHaveBeenCalledWith(1013, 'ZOO_API_KEY_NOT_CONFIGURED');
  });

  it('should keep the operator key server-side and preserve client frame types', async () => {
    const upstreamServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    const proxyServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });

    try {
      await Promise.all([once(upstreamServer, 'listening'), once(proxyServer, 'listening')]);
      const upstreamAddress = upstreamServer.address();
      const proxyAddress = proxyServer.address();
      if (
        upstreamAddress === null ||
        typeof upstreamAddress === 'string' ||
        proxyAddress === null ||
        typeof proxyAddress === 'string'
      ) {
        throw new TypeError('Expected TCP websocket test servers');
      }

      const frames: Array<{ readonly data: string; readonly isBinary: boolean }> = [];
      let resolveAuthorization: (() => void) | undefined;
      let resolveFrames: (() => void) | undefined;
      const authorizationReceived = new Promise<void>((resolve) => {
        resolveAuthorization = resolve;
      });
      const framesReceived = new Promise<void>((resolve) => {
        resolveFrames = resolve;
      });
      upstreamServer.once('connection', (socket) => {
        socket.on('message', (data, isBinary) => {
          frames.push({ data: frameText(data), isBinary });
          if (frames.length === 1) {
            resolveAuthorization?.();
          }
          if (frames.length === 3) {
            resolveFrames?.();
          }
        });
      });

      const service = new KernelsService(
        config({
          // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
          ZOO_API_KEY: 'operator-secret',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
          ZOO_WEBSOCKET_URL: `ws://127.0.0.1:${String(upstreamAddress.port)}`,
        }),
        'self-host',
      );
      proxyServer.once('connection', (socket) => {
        service.createZooProxy(socket, new URLSearchParams('video_res_width=256'), 'user-1');
      });

      const client = new WebSocket(`ws://127.0.0.1:${String(proxyAddress.port)}`);
      await once(client, 'open');
      await authorizationReceived;
      client.send(JSON.stringify({ type: 'headers', headers: { authorization: 'Bearer client-secret' } }));
      client.send(JSON.stringify({ type: 'modeling_cmd_req' }));
      client.send(Uint8Array.of(1, 2, 3));
      await framesReceived;

      expect(frames).toEqual([
        {
          data: JSON.stringify({ type: 'headers', headers: { authorization: 'Bearer operator-secret' } }),
          isBinary: false,
        },
        { data: JSON.stringify({ type: 'modeling_cmd_req' }), isBinary: false },
        { data: String.fromCodePoint(1, 2, 3), isBinary: true },
      ]);
      client.terminate();
    } finally {
      for (const socket of [...proxyServer.clients, ...upstreamServer.clients]) {
        socket.terminate();
      }
      await Promise.all([
        new Promise<void>((resolve) => {
          proxyServer.close(() => {
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          upstreamServer.close(() => {
            resolve();
          });
        }),
      ]);
    }
  });
});
