import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import type { Auth } from 'better-auth';
import type { HttpAdapterHost } from '@nestjs/core';
import type { WebSocket } from 'ws';

import { HostsGateway } from '#api/hosts/hosts.gateway.js';
import type { HostsService } from '#api/hosts/hosts.service.js';
import type { DevWebSocketService, WebSocketConnectionHandler } from '#api/websocket/dev-websocket.service.js';

/**
 * Drives the gateway through its dev-mode prefix registration so the admitted prefix and the route
 * parsing are exercised together: they drifted apart once ('/v1/hosts/...' vs '/v1/agents/...') and
 * closed every session socket with 'unknown host route'.
 */
describe('HostsGateway session routes', () => {
  it('accepts a host runtime socket on the prefix it admits', async () => {
    const acceptHostRoute = vi.fn(async () => {});
    const hostsService = { acceptHostRoute } as unknown as HostsService;
    let prefix: string | undefined;
    let handler: WebSocketConnectionHandler | undefined;
    const devWebSocketService = {
      registerPathHandler: vi.fn(),
      registerPrefixHandler: vi.fn((registered: string, register: WebSocketConnectionHandler) => {
        prefix = registered;
        handler = register;
      }),
      ensureStarted: vi.fn(async () => {}),
    } as unknown as DevWebSocketService;
    const gateway = new HostsGateway(hostsService, devWebSocketService, {} as Auth, {} as HttpAdapterHost);

    await gateway.onModuleInit();
    expect(prefix).toBe('/v1/agents/sessions/');

    const socket = { close: vi.fn(), on: vi.fn() } as unknown as WebSocket;
    const request = {
      url: `${prefix ?? ''}as_abc/host/runtime`,
      headers: { host: 'localhost', authorization: 'Bearer grant' },
    } as unknown as IncomingMessage;
    await handler?.(socket, request);

    expect(socket.close).not.toHaveBeenCalled();
    expect(acceptHostRoute).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'as_abc', route: 'runtime' }));
  });
});
