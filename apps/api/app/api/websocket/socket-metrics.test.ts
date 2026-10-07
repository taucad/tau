import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { trackSocket, wsCloseReason } from '#api/websocket/socket-metrics.js';
import type { MetricsService } from '#telemetry/metrics.js';

const fakeMetrics = () => {
  const active = vi.fn();
  const disconnections = vi.fn();
  const size = vi.fn();
  const metrics = {
    wsActiveConnections: { add: active },
    wsDisconnections: { add: disconnections },
    wsMessageSize: { record: size },
  } as unknown as MetricsService;
  return { metrics, active, disconnections, size };
};

describe('trackSocket', () => {
  it('should account open, inbound/outbound sizes and close, returning active to 0', async () => {
    const { metrics, active, disconnections, size } = fakeMetrics();
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(server, 'listening');
    const closed = Promise.withResolvers<void>();
    server.on('connection', (socket) => {
      trackSocket(metrics, 'hosts', socket);
      socket.once('close', () => {
        closed.resolve();
      });
      socket.on('message', () => {
        socket.send('pong!');
      });
    });
    try {
      const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}`);
      await once(client, 'open');
      client.send(Buffer.alloc(10));
      await once(client, 'message');
      client.close(1000);
      await closed.promise;
    } finally {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }

    const labels = { 'ws.gateway': 'hosts' };
    expect(active.mock.calls).toEqual([
      [1, labels],
      [-1, labels],
    ]);
    expect(size).toHaveBeenCalledWith(10, { ...labels, 'ws.direction': 'inbound' });
    expect(size).toHaveBeenCalledWith(5, { ...labels, 'ws.direction': 'outbound' });
    expect(disconnections).toHaveBeenCalledExactlyOnceWith(1, { ...labels, 'ws.close.reason': 'normal' });
  });
});

describe('wsCloseReason', () => {
  it.each([
    [1000, 'normal'],
    [1005, 'normal'],
    [1001, 'going_away'],
    [1012, 'server_shutdown'],
    [4401, 'auth_failed'],
    [1006, 'error'],
    [1008, 'policy_violation'],
    [1013, 'unavailable'],
    [4001, 'replaced'],
    [3000, 'other'],
  ])('should map %i to %s', (code, reason) => {
    expect(wsCloseReason(code)).toBe(reason);
  });
});
