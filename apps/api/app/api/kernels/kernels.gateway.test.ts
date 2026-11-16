import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { IncomingMessage } from 'node:http';
import type { HttpAdapterHost } from '@nestjs/core';
import type { Auth } from 'better-auth';
import type { WebSocket } from 'ws';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import type { KernelsService } from '#api/kernels/kernels.service.js';
import type { DevWebSocketService } from '@taucad/api-lifecycle';
import type { CommercialEntitlementsService } from '@taucad/api-projects/entitlements/commercial-entitlements';
import { MetricsService } from '@taucad/api-observability/metrics';
import { ZooTokenService } from '#api/kernels/zoo-token.service.js';
import { SessionResolver } from '@taucad/api-auth';
import { createSessionCacheHarness, dataCookie, tokenCookie } from '@taucad/api-auth/testing/session-cache';
import type { SessionCacheHarness } from '@taucad/api-auth/testing/session-cache';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';

type Harness = {
  gateway: KernelsGateway;
  getSession: ReturnType<typeof vi.fn>;
  service: ReturnType<typeof mock<KernelsService>>;
  socket: WebSocket;
  closeSpy: ReturnType<typeof vi.fn>;
  rejectionSpy: MockInstance<MetricsService['wsUpgradeRejections']['add']>;
  sendSpy: ReturnType<typeof vi.fn>;
  request: IncomingMessage;
};

const zooTokens = new ZooTokenService({ get: () => 'zoo-token-secret' } as unknown as ConfigService<Environment, true>);

const createGateway = (options: {
  userId?: string;
  sessionError?: boolean;
  pro?: boolean;
  headers?: Record<string, string>;
  /** A real resolver over a real Better Auth instance, in place of the stub. */
  sessions?: SessionResolver;
}): Harness => {
  const getSession =
    options.sessionError === true
      ? vi.fn().mockRejectedValue(new Error('session backend down'))
      : vi.fn().mockResolvedValue({
          response:
            options.userId === undefined ? null : { session: { id: 'session-1' }, user: { id: options.userId } },
          headers: new Headers(),
        });
  // The real resolver over a stub instance, so the upgrade's lookup is the one production makes.
  const sessions =
    options.sessions ?? new SessionResolver({ api: { getSession } } as unknown as Auth, mockDeep<MetricsService>());

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
  const metrics = new MetricsService();
  const rejectionSpy = vi.spyOn(metrics.wsUpgradeRejections, 'add');
  const gateway = new KernelsGateway(
    service,
    mock<DevWebSocketService>(),
    sessions,
    entitlements,
    zooTokens,
    mock<HttpAdapterHost>(),
    undefined,
    undefined,
    metrics,
  );

  const closeSpy = vi.fn();
  const sendSpy = vi.fn();
  const socket = { close: closeSpy, on: vi.fn(), once: vi.fn(), send: sendSpy } as unknown as WebSocket;
  const request = { headers: options.headers ?? {} } as unknown as IncomingMessage;
  return { gateway, getSession, service, socket, closeSpy, rejectionSpy, sendSpy, request };
};

describe('KernelsGateway.handleZooProxy', () => {
  it('should close 4401 before any proxy frames for unauthenticated upgrades (S49)', async () => {
    const { gateway, socket, closeSpy, rejectionSpy, request } = createGateway({});

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'UNAUTHENTICATED');
    expect(rejectionSpy).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'kernels', reason: 'unauthenticated' });
  });

  it('should preserve a Pro project while the supplier limit remains unqualified (S6)', async () => {
    const { gateway, socket, closeSpy, sendSpy, request } = createGateway({ userId: 'u_pro' });

    await gateway.handleZooProxy(socket, new URLSearchParams('pool=default'), request);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith(1013, 'ZOO_SUPPLIER_LIMIT_UNQUALIFIED');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('should deny Free execution before the kernel service sees the request', async () => {
    const { gateway, socket, closeSpy, rejectionSpy, request } = createGateway({ userId: 'u_free', pro: false });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4403, 'PRO_REQUIRED');
    expect(rejectionSpy).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'kernels', reason: 'forbidden' });
  });

  it('should admit a Zoo-scoped token as its user without a session lookup', async () => {
    const { token } = zooTokens.mint('u_desktop');
    const { gateway, getSession, service, socket, request } = createGateway({ headers: { 'tau-zoo-token': token } });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(getSession).not.toHaveBeenCalled();
    expect(service.createZooProxy).toHaveBeenCalledWith(socket, expect.any(URLSearchParams), 'u_desktop');
  });

  it('should still require Pro for a Zoo-scoped token', async () => {
    const { token } = zooTokens.mint('u_free');
    const { gateway, socket, closeSpy, request } = createGateway({ headers: { 'tau-zoo-token': token }, pro: false });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4403, 'PRO_REQUIRED');
  });

  it('should refuse an invalid Zoo-scoped token without falling back to the session', async () => {
    const { gateway, getSession, socket, closeSpy, rejectionSpy, request } = createGateway({
      userId: 'u_cookie',
      headers: { 'tau-zoo-token': 'zt1.forged.token' },
    });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(getSession).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledWith(4401, 'UNAUTHENTICATED');
    expect(rejectionSpy).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'kernels', reason: 'unauthenticated' });
  });

  it('should fail closed with 4401 when the session lookup errors', async () => {
    const { gateway, socket, closeSpy, rejectionSpy, request } = createGateway({ sessionError: true });

    await gateway.handleZooProxy(socket, new URLSearchParams(), request);

    expect(closeSpy).toHaveBeenCalledWith(4401, 'AUTH_ERROR');
    expect(rejectionSpy).toHaveBeenCalledExactlyOnceWith(1, { 'ws.gateway': 'kernels', reason: 'auth_error' });
  });
});

/** Blueprint WP4 case 10 (H3): a deleted session row closes the upgrade although a fresh snapshot is replayed. */
describe('KernelsGateway.handleZooProxy with the session cookie cache', () => {
  let auth: SessionCacheHarness;

  beforeAll(async () => {
    auth = await createSessionCacheHarness();
  });

  afterAll(async () => {
    await auth.close();
  });

  const cookiesOf = async (): Promise<{ wellFormed: string; nbsp: string; userId: string }> => {
    const { jar, userId } = await auth.signUp();
    const token = `${tokenCookie}=${jar.get(tokenCookie) ?? ''}`;
    const data = `${dataCookie}=${jar.get(dataCookie) ?? ''}`;
    expect(jar.get(dataCookie)).toBeDefined();
    return { wellFormed: `${token}; ${data}`, nbsp: `${data};\u00A0${token}`, userId };
  };

  it('should admit the cookies while the session row exists (positive control)', async () => {
    const { wellFormed } = await cookiesOf();
    const { gateway, socket, closeSpy, service } = createGateway({ sessions: auth.sessions });
    await gateway.handleZooProxy(socket, new URLSearchParams(), { headers: { cookie: wellFormed } } as IncomingMessage);
    expect(service.createZooProxy).toHaveBeenCalledOnce();
    expect(closeSpy).not.toHaveBeenCalledWith(4401, expect.anything());
  });

  it('should close 4401 on a replay after the row is deleted, well-formed and with U+00A0 before the token', async () => {
    const { wellFormed, nbsp, userId } = await cookiesOf();
    auth.deleteSessions(userId);
    for (const cookie of [wellFormed, nbsp]) {
      const { gateway, socket, closeSpy, service } = createGateway({ sessions: auth.sessions });
      // oxlint-disable-next-line no-await-in-loop -- one upgrade per header shape.
      await gateway.handleZooProxy(socket, new URLSearchParams(), { headers: { cookie } } as IncomingMessage);
      expect(closeSpy).toHaveBeenCalledWith(4401, 'UNAUTHENTICATED');
      expect(service.createZooProxy).not.toHaveBeenCalled();
    }
  });
});
