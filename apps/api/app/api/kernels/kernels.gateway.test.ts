import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IncomingMessage } from 'node:http';
import type { HttpAdapterHost } from '@nestjs/core';
import type { Auth } from 'better-auth';
import type { WebSocket } from 'ws';
import { entitlementsFromTier } from '@taucad/billing';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import type { KernelsService } from '#api/kernels/kernels.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
import type { DevWebSocketService } from '#api/websocket/dev-websocket.service.js';

type Harness = {
  gateway: KernelsGateway;
  kernelsService: ReturnType<typeof mock<KernelsService>>;
  socket: WebSocket;
  closeSpy: ReturnType<typeof vi.fn>;
  request: IncomingMessage;
};

const createGateway = (options: { userId?: string; tier?: 'free' | 'pro'; sessionError?: boolean }): Harness => {
  const kernelsService = mock<KernelsService>();
  const billingService = mock<BillingService>();
  billingService.getEntitlements.mockResolvedValue(entitlementsFromTier(options.tier ?? 'free'));

  const getSession =
    options.sessionError === true
      ? vi.fn().mockRejectedValue(new Error('session backend down'))
      : vi.fn().mockResolvedValue(options.userId === undefined ? null : { user: { id: options.userId } });
  const auth = { api: { getSession } } as unknown as Auth;

  const gateway = new KernelsGateway(
    kernelsService,
    mock<DevWebSocketService>(),
    billingService,
    auth,
    mock<HttpAdapterHost>(),
  );

  const closeSpy = vi.fn();
  const socket = { close: closeSpy, on: vi.fn() } as unknown as WebSocket;
  const request = { headers: {} } as unknown as IncomingMessage;
  return { gateway, kernelsService, socket, closeSpy, request };
};

describe('KernelsGateway.handleZooProxy (B4 gate)', () => {
  it('should close 4401 before any proxy frames for unauthenticated upgrades (S49)', async () => {
    const { gateway, kernelsService, socket, closeSpy, request } = createGateway({});

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'UNAUTHENTICATED');
    expect(kernelsService.createZooProxy).not.toHaveBeenCalled();
  });

  it('should close 4403 for authenticated users without the Pro kernel entitlement (S48)', async () => {
    const { gateway, kernelsService, socket, closeSpy, request } = createGateway({ userId: 'u_free', tier: 'free' });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4403, 'PRO_KERNELS_REQUIRED');
    expect(kernelsService.createZooProxy).not.toHaveBeenCalled();
  });

  it('should splice the upstream proxy for entitled users without closing (S48 pro passes)', async () => {
    const { gateway, kernelsService, socket, closeSpy, request } = createGateway({ userId: 'u_pro', tier: 'pro' });
    const queryParameters = new URLSearchParams('pool=default');

    await gateway.handleZooProxy(socket, queryParameters, request);

    expect(kernelsService.createZooProxy).toHaveBeenCalledWith(socket, queryParameters, 'u_pro');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('should fail closed with 4401 when the session lookup errors', async () => {
    const { gateway, kernelsService, socket, closeSpy, request } = createGateway({ sessionError: true });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'AUTH_ERROR');
    expect(kernelsService.createZooProxy).not.toHaveBeenCalled();
  });
});
