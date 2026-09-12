import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IncomingMessage } from 'node:http';
import type { HttpAdapterHost } from '@nestjs/core';
import type { Auth } from 'better-auth';
import type { WebSocket } from 'ws';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import { KernelsService } from '#api/kernels/kernels.service.js';
import type { DevWebSocketService } from '#api/websocket/dev-websocket.service.js';

type Harness = {
  gateway: KernelsGateway;
  socket: WebSocket;
  closeSpy: ReturnType<typeof vi.fn>;
  request: IncomingMessage;
};

const createGateway = (options: { userId?: string; sessionError?: boolean }): Harness => {
  const getSession =
    options.sessionError === true
      ? vi.fn().mockRejectedValue(new Error('session backend down'))
      : vi.fn().mockResolvedValue(options.userId === undefined ? null : { user: { id: options.userId } });
  const auth = { api: { getSession } } as unknown as Auth;

  const gateway = new KernelsGateway(new KernelsService(), mock<DevWebSocketService>(), auth, mock<HttpAdapterHost>());

  const closeSpy = vi.fn();
  const socket = { close: closeSpy, on: vi.fn(), send: vi.fn() } as unknown as WebSocket;
  const request = { headers: {} } as unknown as IncomingMessage;
  return { gateway, socket, closeSpy, request };
};

describe('KernelsGateway.handleZooProxy (B7 R3 disabled route)', () => {
  it('should close 4401 before any proxy frames for unauthenticated upgrades (S49)', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({});

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'UNAUTHENTICATED');
  });

  it('should close every authorized connection 1013 with no upstream frame and no billing read (S6)', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({ userId: 'u_pro' });

    await gateway.handleZooProxy(socket, new URLSearchParams('pool=default'), request);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith(1013, 'HOSTED_BILLING_MIGRATION_REQUIRED');
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('should fail closed with 4401 when the session lookup errors', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({ sessionError: true });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'AUTH_ERROR');
  });
});
