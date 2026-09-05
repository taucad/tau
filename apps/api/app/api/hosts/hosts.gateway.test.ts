import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Auth } from 'better-auth';
import type { HttpAdapterHost } from '@nestjs/core';
import { WebSocket, WebSocketServer } from 'ws';

import { HostsGateway } from '#api/hosts/hosts.gateway.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import type { DevWebSocketService, WebSocketConnectionHandler } from '#api/websocket/dev-websocket.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';

/** A `ws` socket as the gateway uses one: it closes, listens, and holds its frames while paused. */
const routeSocket = (): WebSocket =>
  ({ close: vi.fn(), on: vi.fn(), pause: vi.fn(), resume: vi.fn() }) as unknown as WebSocket;

/**
 * Drives the gateway through its dev-mode prefix registration so the admitted prefix and the route
 * parsing are exercised together: they drifted apart once ('/v1/hosts/...' vs '/v1/agents/...') and
 * closed every session socket with 'unknown host route'.
 */
describe('HostsGateway session routes', () => {
  it('accepts a host runtime socket on the prefix it admits', async () => {
    const acceptHostRoute = vi.fn(async () => undefined);
    const hostsService = { acceptHostRoute } as unknown as HostsService;
    let prefix: string | undefined;
    let handler: WebSocketConnectionHandler | undefined;
    const devWebSocketService = {
      registerPathHandler: vi.fn(),
      registerPrefixHandler: vi.fn((registered: string, register: WebSocketConnectionHandler) => {
        prefix = registered;
        handler = register;
      }),
      ensureStarted: vi.fn(async () => undefined),
    } as unknown as DevWebSocketService;
    const gateway = new HostsGateway(hostsService, devWebSocketService, {} as Auth, {} as HttpAdapterHost);

    await gateway.onModuleInit();
    expect(prefix).toBe('/v1/agents/sessions/');

    const socket = routeSocket();
    const request = {
      url: `${prefix ?? ''}as_abc/host/runtime`,
      headers: { host: 'localhost', authorization: 'Bearer grant' },
    } as unknown as IncomingMessage;
    await handler?.(socket, request);

    expect(socket.close).not.toHaveBeenCalled();
    expect(acceptHostRoute).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'as_abc', route: 'runtime' }));
    /* The session routes carry the same drop window as the control socket: the
     * relay attaches its listener only after a grant read, a device lookup and a
     * Redis connect. */
    expect(socket.pause).toHaveBeenCalled();
    expect(socket.resume).toHaveBeenCalled();
  });

  it('routes the third channel concern, and still refuses an unknown one', async () => {
    const acceptHostRoute = vi.fn(async () => undefined);
    const hostsService = { acceptHostRoute } as unknown as HostsService;
    let handler: WebSocketConnectionHandler | undefined;
    const devWebSocketService = {
      registerPathHandler: vi.fn(),
      registerPrefixHandler: vi.fn((_prefix: string, register: WebSocketConnectionHandler) => {
        handler = register;
      }),
      ensureStarted: vi.fn(async () => undefined),
    } as unknown as DevWebSocketService;
    const gateway = new HostsGateway(hostsService, devWebSocketService, {} as Auth, {} as HttpAdapterHost);
    await gateway.onModuleInit();

    const agentSocket = routeSocket();
    await handler?.(agentSocket, {
      url: '/v1/agents/sessions/as_abc/host/agent',
      headers: { host: 'localhost', authorization: 'Bearer grant' },
    } as unknown as IncomingMessage);
    expect(agentSocket.close).not.toHaveBeenCalled();
    expect(acceptHostRoute).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'as_abc', route: 'agent' }));

    const unknownSocket = routeSocket();
    await handler?.(unknownSocket, {
      url: '/v1/agents/sessions/as_abc/host/chat',
      headers: { host: 'localhost', authorization: 'Bearer grant' },
    } as unknown as IncomingMessage);
    expect(unknownSocket.close).toHaveBeenCalledWith(1008, 'unknown host route');
  });
});

/** Every fake round trip lands on a later macrotask, like the real Postgres and Redis calls. */
const later = async <T>(value: T): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve(value);
    }, 25);
  });

const deviceRow = {
  id: 'device-1',
  ownerId: 'owner-1',
  label: 'workshop-mac',
  credentialHash: 'never-returned',
  createdAt: new Date(0),
  lastSeenAt: null,
  revokedAt: null,
  cloudProjectId: null,
};

/** Redis and Postgres doubles whose latency is real enough to lose an unbuffered frame. */
const presenceHarness = () => {
  const values = new Map<string, string>();
  const lastSeenWrites = { count: 0 };
  const runRows: Array<Record<string, unknown>> = [];
  const client = {
    get: async (key: string) => later(values.get(key) ?? null),
    set: async (key: string, value: string) => {
      values.set(key, value);
      return later('OK');
    },
    publish: async () => 1,
    /* The three presence scripts, told apart by the command they run under the
     * connectionId compare-and-set the real Lua performs. */
    eval: async (script: string, ...arguments_: unknown[]) => {
      const [, key, connectionId, replacement] = arguments_ as [number, string, string, unknown];
      const raw = values.get(key);
      if (!raw || (JSON.parse(raw) as { connectionId?: string }).connectionId !== connectionId) {
        return 0;
      }
      if (script.includes("redis.call('SET'")) {
        values.set(key, String(replacement));
      } else if (script.includes("redis.call('DEL'")) {
        values.delete(key);
      }
      return 1;
    },
  };
  const redis = {
    client,
    createDuplicateClient: () => ({
      status: 'wait',
      connect: async () => later(undefined),
      subscribe: async () => later(undefined),
      on: () => undefined,
      disconnect: () => undefined,
    }),
  } as unknown as RedisService;
  const database = {
    database: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => later([deviceRow]) }) }) }),
      insert: () => ({
        // oxlint-disable-next-line typescript/promise-function-async -- drizzle's builder is a thenable with methods on it, not a promise.
        values: function values(row: Record<string, unknown>) {
          const promise = (async (): Promise<void> => {
            await later(undefined);
            runRows.push(row);
          })();
          return Object.assign(promise, { onConflictDoUpdate: async () => promise });
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => {
            lastSeenWrites.count += 1;
            return later([deviceRow]);
          },
        }),
      }),
    },
  } as unknown as DatabaseService;
  const config = { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>;
  return { values, lastSeenWrites, runRows, redis, database, config };
};

/**
 * A real daemon sends `ready` in the same turn its socket opens, so the frame is
 * on the wire while the API is still authenticating the device and registering
 * the control connection. `ws` buffers nothing: whatever arrives before the
 * gateway attaches its listener is gone, and with it `online`, the advertised
 * capabilities and `lastSeenAt` (found live on 2026-09-03: the presence key held
 * a bare `{connectionId}` for a daemon that had been connected for minutes).
 */
describe('HostsGateway control admission', () => {
  const servers: Array<{ server: Server; sockets: WebSocketServer; client?: WebSocket; service: HostsService }> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(async (entry) => {
        entry.client?.close();
        entry.service.onModuleDestroy();
        entry.sockets.close();
        return new Promise<void>((resolve) => {
          entry.server.close(() => {
            resolve();
          });
        });
      }),
    );
  });

  const bootControlServer = async (service: HostsService): Promise<number> => {
    let handler: WebSocketConnectionHandler | undefined;
    const devWebSocketService = {
      registerPathHandler: vi.fn((_path: string, register: WebSocketConnectionHandler) => {
        handler = register;
      }),
      registerPrefixHandler: vi.fn(),
      ensureStarted: vi.fn(async () => undefined),
    } as unknown as DevWebSocketService;
    const gateway = new HostsGateway(service, devWebSocketService, {} as Auth, {} as HttpAdapterHost);
    await gateway.onModuleInit();

    const sockets = new WebSocketServer({ noServer: true });
    const server = createServer();
    /* The same shape both real callers use: the handler runs synchronously
     * inside the upgrade callback (DevWebSocketService and the Fastify path). */
    server.on('upgrade', (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (accepted) => {
        void handler?.(accepted, request);
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    servers.push({ server, sockets, service });
    return (server.address() as AddressInfo).port;
  };

  it('writes the presence a ready frame that races registration advertises', async () => {
    const { values, lastSeenWrites, redis, database, config } = presenceHarness();
    const service = new HostsService(database, redis, config);
    const port = await bootControlServer(service);

    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/v1/agents/control`, {
      headers: { authorization: 'Bearer device-credential' },
    });
    servers.at(-1)!.client = client;
    client.on('open', () => {
      client.send(
        JSON.stringify({
          v: 1,
          type: 'ready',
          deviceId: 'device-1',
          runtimeVersion: '1.0.0',
          capacity: 2,
          capabilities: { agent: { workspaceRoot: '/home/tau/projects' } },
        }),
      );
    });

    await vi.waitFor(
      () => {
        const raw = values.get('host:online:device-1');
        expect(raw === undefined ? undefined : JSON.parse(raw)).toMatchObject({
          runtimeVersion: '1.0.0',
          capacity: 2,
          capabilities: { agent: { workspaceRoot: '/home/tau/projects' } },
        });
      },
      { timeout: 5000, interval: 25 },
    );
    expect(lastSeenWrites.count).toBe(1);
  });

  /**
   * The run directory's whole write path, from the daemon's socket: a `run`
   * frame is the only way a row is ever created, and it must land through the
   * same paused-socket admission the `ready` frame needed.
   */
  it('files a run frame from the host control socket in the directory', async () => {
    const { runRows, redis, database, config } = presenceHarness();
    const service = new HostsService(database, redis, config, {
      start: async () => ({ reference: 'unused' }),
      stop: async () => undefined,
    });
    const port = await bootControlServer(service);

    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/v1/agents/control`, {
      headers: { authorization: 'Bearer device-credential' },
    });
    servers.at(-1)!.client = client;
    client.on('open', () => {
      client.send(
        JSON.stringify({
          v: 1,
          type: 'run',
          runId: 'run_1',
          chatId: 'chat_1',
          state: 'running',
          updatedAt: new Date(1000).toISOString(),
        }),
      );
    });

    await vi.waitFor(
      () => {
        expect(runRows[0]).toMatchObject({
          runId: 'run_1',
          chatId: 'chat_1',
          ownerId: 'owner-1',
          placement: 'device-1',
          state: 'running',
        });
      },
      { timeout: 5000, interval: 25 },
    );
  });

  it('discards frames from a socket whose credential is rejected', async () => {
    const { values, redis, config } = presenceHarness();
    const rejecting = {
      database: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => later([]) }) }) }),
      },
    } as unknown as DatabaseService;
    const service = new HostsService(rejecting, redis, config);
    const port = await bootControlServer(service);

    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/v1/agents/control`, {
      headers: { authorization: 'Bearer wrong-credential' },
    });
    servers.at(-1)!.client = client;
    client.on('open', () => {
      client.send(JSON.stringify({ v: 1, type: 'ready', deviceId: 'device-1', runtimeVersion: '1.0.0', capacity: 1 }));
    });

    const closed = await new Promise<number>((resolve) => {
      client.once('close', resolve);
    });
    expect(closed).toBe(4401);
    expect(values.size).toBe(0);
  });

  /* A replaced control socket closes late; its presence delete must not take out
   * the successor's key (the compare-and-set in `deleteControlPresence`). */
  it('keeps the successor presence when the socket it replaced closes', async () => {
    const { values, redis, database, config } = presenceHarness();
    const service = new HostsService(database, redis, config);
    const closeHandlers: Array<() => void> = [];
    const controlSocket = () =>
      ({
        close: vi.fn(),
        once: vi.fn((event: string, listener: () => void) => {
          if (event === 'close') {
            closeHandlers.push(listener);
          }
        }),
        readyState: 1,
      }) as unknown as WebSocket;

    await service.registerControl('device-1', controlSocket());
    const first = JSON.parse(values.get('host:online:device-1') ?? '{}') as { connectionId?: string };
    await service.registerControl('device-1', controlSocket());
    const second = JSON.parse(values.get('host:online:device-1') ?? '{}') as { connectionId?: string };
    expect(second.connectionId).not.toBe(first.connectionId);

    closeHandlers[0]?.();
    await later(undefined);
    expect(JSON.parse(values.get('host:online:device-1') ?? '{}')).toMatchObject({
      connectionId: second.connectionId,
    });
    service.onModuleDestroy();
  });
});
