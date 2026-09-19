import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IncomingMessage } from 'node:http';
import type { HttpAdapterHost } from '@nestjs/core';
import type { Auth } from 'better-auth';
import type { WebSocket } from 'ws';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import type { KernelsService } from '#api/kernels/kernels.service.js';
import type { DevWebSocketService } from '#api/websocket/dev-websocket.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';

type Harness = {
  gateway: KernelsGateway;
  socket: WebSocket;
  closeSpy: ReturnType<typeof vi.fn>;
  request: IncomingMessage;
};

const createGateway = (options: { userId?: string; sessionError?: boolean; pro?: boolean }): Harness => {
  const getSession =
    options.sessionError === true
      ? vi.fn().mockRejectedValue(new Error('session backend down'))
      : vi.fn().mockResolvedValue(options.userId === undefined ? null : { user: { id: options.userId } });
  const auth = { api: { getSession } } as unknown as Auth;

  const service = mock<KernelsService>();
  service.createZooProxy.mockImplementation((socket) => {
    socket.close(1013, 'ZOO_SUPPLIER_LIMIT_UNQUALIFIED');
  });
  const entitlements = mock<CommercialEntitlementsService>();
  entitlements.getEntitlements.mockResolvedValue({
    canUseProKernels: options.pro ?? true,
    canCreatePrivateShares: false,
    canSyncFiles: false,
  });
  const gateway = new KernelsGateway(service, mock<DevWebSocketService>(), auth, entitlements, mock<HttpAdapterHost>());

  const closeSpy = vi.fn();
  const socket = { close: closeSpy, on: vi.fn(), send: vi.fn() } as unknown as WebSocket;
  const request = { headers: {} } as unknown as IncomingMessage;
  return { gateway, socket, closeSpy, request };
};

describe('KernelsGateway.handleZooProxy', () => {
  it('should close 4401 before any proxy frames for unauthenticated upgrades (S49)', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({});

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'UNAUTHENTICATED');
  });

  it('should preserve a Pro project while the supplier limit remains unqualified (S6)', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({ userId: 'u_pro' });

    await gateway.handleZooProxy(socket, new URLSearchParams('pool=default'), request);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith(1013, 'ZOO_SUPPLIER_LIMIT_UNQUALIFIED');
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('should deny Free execution before the kernel service sees the request', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({ userId: 'u_free', pro: false });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4403, 'PRO_REQUIRED');
  });

  it('should fail closed with 4401 when the session lookup errors', async () => {
    const { gateway, socket, closeSpy, request } = createGateway({ sessionError: true });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'AUTH_ERROR');
  });
});
