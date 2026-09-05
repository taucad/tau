import { createHash } from 'node:crypto';

import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

import { relayHostFramesThroughRedis } from '#api/hosts/host-frame-relay.js';
import { hostControlMessageSchema } from '#api/hosts/hosts.dto.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { agentRun } from '#database/schema.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';

vi.mock('#api/hosts/host-frame-relay.js', () => ({
  relayHostFramesThroughRedis: vi.fn(async () => ({ close: vi.fn() })),
}));

const hash = (value: string): string => createHash('sha256').update(value).digest('base64url');

const socket = (): WebSocket =>
  ({
    close: vi.fn(),
    once: vi.fn(),
  }) as unknown as WebSocket;

const session = (userId: string, deviceId: string) =>
  JSON.stringify({
    userId,
    deviceId,
    runtimeVersion: '1.0.0',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    runtimeGrantHash: hash('runtime-grant'),
    fileSystemGrantHash: hash('filesystem-grant'),
  });

describe('HostsService route admission', () => {
  const values = new Map<string, string>();
  const getdel = vi.fn(async (key: string) => {
    const value = values.get(key);
    values.delete(key);
    return value;
  });
  const set = vi.fn(async (key: string, value: string) => {
    values.set(key, value);
    return 'OK';
  });
  /** `expire` on a key this double never expires: the session keepalive's write. */
  const expire = vi.fn((key: string) => (values.has(key) ? 1 : 0));
  const redis = {
    client: {
      get: vi.fn(async (key: string) => values.get(key)),
      getdel,
      set,
      /* The outcome is announced as well as written; nothing here listens. */
      publish: vi.fn(async () => 0),
      multi: () => {
        const pipeline = {
          expire: (key: string) => {
            expire(key);
            return pipeline;
          },
          exec: async () => [],
        };
        return pipeline;
      },
    },
    createDuplicateClient: vi.fn(() => ({})),
  } as unknown as RedisService;
  let deviceExists = true;
  const database = {
    database: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => (deviceExists ? [{ id: 'device-1' }] : []) }),
        }),
      }),
    },
  } as unknown as DatabaseService;
  const config = {} as unknown as ConfigService<Environment, true>;
  let service = new HostsService(database, redis, config);

  afterEach(() => {
    service.onModuleDestroy();
    values.clear();
    getdel.mockClear();
    set.mockClear();
    deviceExists = true;
    service = new HostsService(database, redis, config);
  });

  it('does not consume a browser route for another user, then rejects its replay', async () => {
    values.set('host:session:session-1', session('owner-1', 'device-1'));
    values.set('host:browser:session-1:runtime', '1');
    const crossUser = socket();

    await service.acceptBrowserRoute({
      sessionId: 'session-1',
      route: 'runtime',
      userId: 'owner-2',
      socket: crossUser,
    });

    expect(crossUser.close).toHaveBeenCalledWith(1008, 'session unavailable');
    expect(getdel).not.toHaveBeenCalled();

    const owner = socket();
    await service.acceptBrowserRoute({
      sessionId: 'session-1',
      route: 'runtime',
      userId: 'owner-1',
      socket: owner,
    });
    expect(owner.close).not.toHaveBeenCalled();

    const replay = socket();
    await service.acceptBrowserRoute({
      sessionId: 'session-1',
      route: 'runtime',
      userId: 'owner-1',
      socket: replay,
    });
    expect(replay.close).toHaveBeenCalledWith(1008, 'route already consumed');
  });

  it('binds a one-use host grant to its route and rejects revoked devices', async () => {
    const grant = 'x'.repeat(32);
    values.set(
      `host:host-grant:${hash(grant)}`,
      JSON.stringify({ sessionId: 'session-2', deviceId: 'device-1', route: 'fs' }),
    );
    const wrongRoute = socket();
    await service.acceptHostRoute({
      sessionId: 'session-2',
      route: 'runtime',
      authorization: `Bearer ${grant}`,
      socket: wrongRoute,
    });
    expect(wrongRoute.close).toHaveBeenCalledWith(1008, 'host grant route mismatch');

    const replay = socket();
    await service.acceptHostRoute({
      sessionId: 'session-2',
      route: 'fs',
      authorization: `Bearer ${grant}`,
      socket: replay,
    });
    expect(replay.close).toHaveBeenCalledWith(1008, 'host grant unavailable');

    const revokedGrant = 'y'.repeat(32);
    values.set(
      `host:host-grant:${hash(revokedGrant)}`,
      JSON.stringify({ sessionId: 'session-3', deviceId: 'device-1', route: 'fs' }),
    );
    deviceExists = false;
    const revoked = socket();
    await service.acceptHostRoute({
      sessionId: 'session-3',
      route: 'fs',
      authorization: `Bearer ${revokedGrant}`,
      socket: revoked,
    });
    expect(revoked.close).toHaveBeenCalledWith(1008, 'device revoked');
  });

  /*
   * Rung 2. The agent channel relays through the API exactly like `runtime` and
   * `fs` — a one-use grant on the host side, a one-use marker on the browser
   * side — and the API stores nothing from its frames (PH19). This asserts the
   * admission half; nothing here ever reads a frame.
   */
  it('admits the agent route on both sides with the same one-use grants', async () => {
    values.set('host:session:session-5', session('owner-1', 'device-1'));
    values.set('host:browser:session-5:agent', '1');

    const browser = socket();
    await service.acceptBrowserRoute({ sessionId: 'session-5', route: 'agent', userId: 'owner-1', socket: browser });
    expect(browser.close).not.toHaveBeenCalled();

    const replay = socket();
    await service.acceptBrowserRoute({ sessionId: 'session-5', route: 'agent', userId: 'owner-1', socket: replay });
    expect(replay.close).toHaveBeenCalledWith(1008, 'route already consumed');

    const grant = 'z'.repeat(32);
    values.set(
      `host:host-grant:${hash(grant)}`,
      JSON.stringify({ sessionId: 'session-5', deviceId: 'device-1', route: 'agent' }),
    );
    const host = socket();
    await service.acceptHostRoute({
      sessionId: 'session-5',
      route: 'agent',
      authorization: `Bearer ${grant}`,
      socket: host,
    });
    expect(host.close).not.toHaveBeenCalled();
  });

  it('accepts a durable session outcome only from its assigned device', async () => {
    values.set('host:session:session-4', session('owner-1', 'device-1'));
    const accept = JSON.stringify({ v: 1, type: 'accept', sessionId: 'session-4' });

    await service.handleControlMessage('device-2', accept);
    expect(set).not.toHaveBeenCalled();

    await service.handleControlMessage('device-1', accept);
    expect(set).toHaveBeenCalledWith('host:session-outcome:session-4', JSON.stringify({ accepted: true }), 'EX', 15);
  });
});

/**
 * Ruling 4. The agent route is minted from what the *device* advertised, never
 * from what the API hopes it can do: a daemon started without `--agent-port`,
 * or one that predates the capability, must still pair and simply get no agent
 * grant, no browser marker, and no `agentUrl` anywhere.
 */
describe('HostsService agent capability advertisement', () => {
  const deviceRow = {
    id: 'device-1',
    ownerId: 'owner-1',
    label: 'workshop-mac',
    credentialHash: 'never-returned',
    createdAt: new Date(0),
    lastSeenAt: null,
    revokedAt: null,
  };

  const harness = () => {
    const values = new Map<string, string>();
    const offers: Array<Record<string, unknown>> = [];
    const client = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      },
      getdel: async (key: string) => {
        const value = values.get(key);
        values.delete(key);
        return value ?? null;
      },
      del: async (...keys: string[]) => {
        for (const key of keys) {
          values.delete(key);
        }
        return keys.length;
      },
      srem: async () => 1,
      smembers: async () => [],
      /* The daemon's side of the offer: accept it the moment it is published, so
       * `waitForSessionOutcome` settles without a timer. */
      publish: async (_channel: string, raw: string) => {
        const envelope: unknown = JSON.parse(raw);
        const message = envelope as { kind?: string; payload?: string };
        if (message.kind === 'message' && message.payload) {
          const offer = JSON.parse(message.payload) as Record<string, unknown>;
          offers.push(offer);
          values.set(`host:session-outcome:${String(offer['sessionId'])}`, JSON.stringify({ accepted: true }));
        }
        return 1;
      },
      /* The presence scripts, in the only shape these tests reach: rewrite the
       * stored state when the caller still owns the connection. */
      eval: async (_script: string, _keys: number, ...rest: unknown[]) => {
        const [key, connectionId, replacement] = rest as [string, string, unknown];
        const raw = values.get(key);
        if (!raw || (JSON.parse(raw) as { connectionId?: string }).connectionId !== connectionId) {
          return 0;
        }
        if (typeof replacement === 'string' && replacement.startsWith('{')) {
          values.set(key, replacement);
        }
        return 1;
      },
      multi: () => {
        const writes: Array<() => void> = [];
        const pipeline = {
          set: (key: string, value: string) => {
            writes.push(() => values.set(key, value));
            return pipeline;
          },
          sadd: () => pipeline,
          expire: () => pipeline,
          exec: async () => {
            for (const write of writes) {
              write();
            }
            return [];
          },
        };
        return pipeline;
      },
    };
    const redis = {
      client,
      createDuplicateClient: () => ({
        status: 'ready',
        connect: async () => undefined,
        subscribe: async () => undefined,
        on: () => undefined,
        disconnect: () => undefined,
      }),
    } as unknown as RedisService;
    const rows = { limit: async () => [deviceRow], orderBy: async () => [deviceRow] };
    const database = {
      database: {
        select: () => ({ from: () => ({ where: () => rows }) }),
        update: () => ({ set: () => ({ where: async () => [deviceRow] }) }),
      },
    } as unknown as DatabaseService;
    const config = { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>;
    return { values, offers, redis, database, config };
  };

  const controlSocket = (): WebSocket => ({ close: vi.fn(), once: vi.fn(), readyState: 1 }) as unknown as WebSocket;

  const announce = async (service: HostsService, capabilities?: unknown): Promise<void> => {
    await service.registerControl('device-1', controlSocket());
    await service.handleControlMessage(
      'device-1',
      JSON.stringify({
        v: 1,
        type: 'ready',
        deviceId: 'device-1',
        runtimeVersion: '1.0.0',
        capacity: 1,
        ...(capabilities === undefined ? {} : { capabilities }),
      }),
    );
  };

  it('mints the agent grant, marker and offer only for an advertised capability', async () => {
    const { values, offers, redis, database, config } = harness();
    const service = new HostsService(database, redis, config);
    await announce(service, { agent: { workspaceRoot: '/home/tau/projects' } });

    await expect(service.listDevices('owner-1')).resolves.toMatchObject([
      { id: 'device-1', online: true, agent: { workspaceRoot: '/home/tau/projects' } },
    ]);

    const session = await service.createSession({ deviceId: 'device-1', userId: 'owner-1', runtimeVersion: '1.0.0' });
    expect(session.agentUrl).toContain(`/v1/agents/sessions/${session.id}/browser/agent`);
    expect(offers[0]).toMatchObject({
      agentUrl: expect.stringContaining(`/v1/agents/sessions/${session.id}/host/agent`) as unknown,
      agentAuthorization: expect.any(String) as unknown,
    });
    expect(values.has(`host:browser:${session.id}:agent`)).toBe(true);
    service.onModuleDestroy();
  });

  it('still pairs a daemon whose ready frame carries no capabilities', async () => {
    const { values, offers, redis, database, config } = harness();
    const service = new HostsService(database, redis, config);
    await announce(service);

    await expect(service.listDevices('owner-1')).resolves.toMatchObject([{ id: 'device-1', online: true }]);
    const [listed] = await service.listDevices('owner-1');
    expect(listed?.agent).toBeUndefined();

    const session = await service.createSession({ deviceId: 'device-1', userId: 'owner-1', runtimeVersion: '1.0.0' });
    expect(session).not.toHaveProperty('agentUrl');
    expect(offers[0]).not.toHaveProperty('agentUrl');
    expect(offers[0]).not.toHaveProperty('agentAuthorization');
    expect(values.has(`host:browser:${session.id}:agent`)).toBe(false);
    expect(values.has(`host:browser:${session.id}:runtime`)).toBe(true);
    service.onModuleDestroy();
  });
});

/**
 * A relayed session must outlive its own fixed lifetime while it is in use.
 *
 * `createSession` writes the session record, the browser route markers and the
 * device's session set with one flat TTL. Nothing refreshed them, so two minutes
 * after the *offer* — however much traffic was flowing — the record was gone:
 * the session's remaining routes could no longer be admitted, and `revokeDevice`
 * could not find the state it needs to close the sockets that were still
 * relaying. The fixed lifetime belongs to an unclaimed offer, not to a session
 * whose sockets are open.
 */
describe('HostsService session lifetime', () => {
  const deviceRow = {
    id: 'device-1',
    ownerId: 'owner-1',
    label: 'workshop-mac',
    credentialHash: 'never-returned',
    createdAt: new Date(0),
    lastSeenAt: null,
    revokedAt: null,
  };

  /** Redis with real key expiry, on the same clock vitest's fake timers drive. */
  const ttlHarness = () => {
    const values = new Map<string, { value: string; expiresAt: number | undefined }>();
    const sets = new Map<string, Set<string>>();
    const offers: Array<Record<string, unknown>> = [];
    const streams: string[] = [];
    const live = (key: string): string | undefined => {
      const entry = values.get(key);
      if (!entry) {
        return undefined;
      }
      if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
        values.delete(key);
        return undefined;
      }
      return entry.value;
    };
    const put = (key: string, value: string, seconds?: number): void => {
      values.set(key, { value, expiresAt: seconds === undefined ? undefined : Date.now() + seconds * 1000 });
    };
    const expire = (key: string, seconds: number): number => {
      const value = live(key);
      if (value === undefined) {
        return 0;
      }
      put(key, value, seconds);
      return 1;
    };
    const client = {
      get: async (key: string) => live(key) ?? null,
      /* Ioredis' variadic `SET key value EX n`, in the one shape the service uses. */
      set: async (key: string, value: string, ...expiry: readonly unknown[]) => {
        put(key, value, expiry[0] === 'EX' ? Number(expiry[1]) : undefined);
        return 'OK';
      },
      getdel: async (key: string) => {
        const value = live(key);
        values.delete(key);
        return value ?? null;
      },
      del: async (...keys: string[]) => {
        for (const key of keys) {
          values.delete(key);
        }
        return keys.length;
      },
      expire: async (key: string, seconds: number) => expire(key, seconds),
      srem: async (key: string, member: string) => ((sets.get(key)?.delete(member) ?? false) ? 1 : 0),
      smembers: async (key: string) => [...(sets.get(key) ?? [])],
      publish: async (_channel: string, raw: string) => {
        const message = JSON.parse(raw) as { kind?: string; payload?: string };
        if (message.kind === 'message' && message.payload) {
          const offer = JSON.parse(message.payload) as Record<string, unknown>;
          offers.push(offer);
          put(`host:session-outcome:${String(offer['sessionId'])}`, JSON.stringify({ accepted: true }), 15);
        }
        return 1;
      },
      eval: async (_script: string, _keys: number, ...rest: unknown[]) => {
        const [key, connectionId, replacement] = rest as [string, string, unknown];
        const raw = live(key);
        if (!raw || (JSON.parse(raw) as { connectionId?: string }).connectionId !== connectionId) {
          return 0;
        }
        if (typeof replacement === 'string' && replacement.startsWith('{')) {
          put(key, replacement, 60);
        }
        return 1;
      },
      multi: () => {
        const writes: Array<() => void> = [];
        const pipeline = {
          set: (key: string, value: string, ...expiry: readonly unknown[]) => {
            writes.push(() => {
              put(key, value, expiry[0] === 'EX' ? Number(expiry[1]) : undefined);
            });
            return pipeline;
          },
          sadd: (key: string, member: string) => {
            writes.push(() => {
              const members = sets.get(key) ?? new Set<string>();
              members.add(member);
              sets.set(key, members);
            });
            return pipeline;
          },
          expire: (key: string, seconds: number) => {
            writes.push(() => {
              expire(key, seconds);
              /* A Redis set is a key like any other; the double keeps its TTL in
               * the same map so `deviceSessionsKey` can expire too. */
              if (sets.has(key)) {
                put(key, '', seconds);
              }
            });
            return pipeline;
          },
          xadd: (key: string) => {
            writes.push(() => streams.push(key));
            return pipeline;
          },
          exec: async () => {
            for (const write of writes) {
              write();
            }
            return [];
          },
        };
        return pipeline;
      },
    };
    const redis = {
      client,
      createDuplicateClient: () => ({
        status: 'ready',
        connect: async () => undefined,
        subscribe: async () => undefined,
        on: () => undefined,
        disconnect: () => undefined,
      }),
    } as unknown as RedisService;
    const rows = { limit: async () => [deviceRow], orderBy: async () => [deviceRow] };
    const database = {
      database: {
        select: () => ({ from: () => ({ where: () => rows }) }),
        update: () => ({
          /* Drizzle's update builder is a thenable that also carries
           * `.returning()`; both shapes are used here (`ready` awaits it,
           * `revokeDevice` asks for the rows). */
          // oxlint-disable-next-line typescript/promise-function-async -- a thenable builder, not an async function
          set: () => ({
            // oxlint-disable-next-line typescript/promise-function-async -- same builder, one level down
            where: () => Object.assign(Promise.resolve([deviceRow]), { returning: async () => [deviceRow] }),
          }),
        }),
      },
    } as unknown as DatabaseService;
    const config = { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>;
    return { values, offers, streams, redis, database, config };
  };

  type RouteSocket = WebSocket & { fireClose(): void };

  /**
   * @param readyState - `ws`'s own constants; 3 (CLOSED) is a socket that died
   *   before the route admitting it attached a single listener, so no `close`
   *   event is ever coming.
   */
  const routeSocket = (readyState = 1): RouteSocket => {
    const closeHandlers: Array<() => void> = [];
    return {
      close: vi.fn(),
      readyState,
      OPEN: 1,
      CLOSED: 3,
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'close') {
          closeHandlers.push(listener);
        }
      }),
      fireClose: () => {
        for (const listener of closeHandlers.splice(0)) {
          listener();
        }
      },
    } as unknown as RouteSocket;
  };

  const openSession = async (service: HostsService, offers: Array<Record<string, unknown>>) => {
    await service.registerControl('device-1', routeSocket());
    await service.handleControlMessage(
      'device-1',
      JSON.stringify({
        v: 1,
        type: 'ready',
        deviceId: 'device-1',
        runtimeVersion: '1.0.0',
        capacity: 1,
        capabilities: { agent: { workspaceRoot: '/home/tau/projects' } },
      }),
    );
    const session = await service.createSession({
      deviceId: 'device-1',
      userId: 'owner-1',
      runtimeVersion: '1.0.0',
    });
    return { session, offer: offers[0] as { agentAuthorization: string } };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a session whose sockets are open past its offer lifetime', async () => {
    vi.useFakeTimers();
    const { offers, streams, redis, database, config } = ttlHarness();
    const service = new HostsService(database, redis, config);
    const { session, offer } = await openSession(service, offers);

    const browser = routeSocket();
    await service.acceptBrowserRoute({ sessionId: session.id, route: 'agent', userId: 'owner-1', socket: browser });
    const host = routeSocket();
    await service.acceptHostRoute({
      sessionId: session.id,
      route: 'agent',
      authorization: `Bearer ${offer.agentAuthorization}`,
      socket: host,
    });
    expect(browser.close).not.toHaveBeenCalled();
    expect(host.close).not.toHaveBeenCalled();

    // Well past the 120 s offer lifetime, with both sockets still parked.
    await vi.advanceTimersByTimeAsync(200_000);

    // Nothing may be torn down while the session is relaying.
    expect(browser.close).not.toHaveBeenCalled();
    expect(host.close).not.toHaveBeenCalled();
    expect(streams).toHaveLength(0);

    // The session record still resolves: its remaining routes are admissible.
    const fileSystem = routeSocket();
    await service.acceptBrowserRoute({ sessionId: session.id, route: 'fs', userId: 'owner-1', socket: fileSystem });
    expect(fileSystem.close).not.toHaveBeenCalled();

    // And a revocation still finds the live session it has to close.
    await service.revokeDevice('device-1', 'owner-1');
    expect(browser.close).toHaveBeenCalledWith(4003, 'device revoked');
    expect(host.close).toHaveBeenCalledWith(4003, 'device revoked');
    service.onModuleDestroy();
  });

  it('lets a session whose sockets all closed expire on its own lifetime', async () => {
    vi.useFakeTimers();
    const { offers, redis, database, config } = ttlHarness();
    const service = new HostsService(database, redis, config);
    const { session, offer } = await openSession(service, offers);

    const host = routeSocket();
    await service.acceptHostRoute({
      sessionId: session.id,
      route: 'agent',
      authorization: `Bearer ${offer.agentAuthorization}`,
      socket: host,
    });
    host.fireClose();

    await vi.advanceTimersByTimeAsync(200_000);

    const late = routeSocket();
    await service.acceptBrowserRoute({ sessionId: session.id, route: 'agent', userId: 'owner-1', socket: late });
    expect(late.close).toHaveBeenCalledWith(1008, 'session unavailable');
    service.onModuleDestroy();
  });

  /**
   * The relay publishes the departure to its peer from its *own* `close`
   * listener, so anything that closes the relay handle first silently cancels
   * that publish — which is the whole FIX-RELAY-PEER-CLOSE defect, reintroduced
   * one listener earlier. A parked socket's teardown belongs to the relay.
   */
  it('leaves the relay to close itself when a parked socket departs', async () => {
    vi.useFakeTimers();
    const { offers, redis, database, config } = ttlHarness();
    const service = new HostsService(database, redis, config);
    const { session, offer } = await openSession(service, offers);

    const host = routeSocket();
    await service.acceptHostRoute({
      sessionId: session.id,
      route: 'agent',
      authorization: `Bearer ${offer.agentAuthorization}`,
      socket: host,
    });
    const parked = vi.mocked(relayHostFramesThroughRedis).mock.results.at(-1);
    const relay = parked?.type === 'return' ? await parked.value : undefined;
    host.fireClose();

    expect(relay?.close).not.toHaveBeenCalled();
    service.onModuleDestroy();
    expect(relay?.close).not.toHaveBeenCalled();
  });

  /**
   * Admission is all awaits — a one-use grant read, a device lookup, the
   * keepalive's own pipeline, the relay's reader connect — and every listener is
   * attached after one of them. A socket that dies in that window emits its
   * `close` to nobody, so it stays in the session's set and the keepalive
   * refreshes a record no socket is using, for the process's lifetime.
   */
  it('releases a route whose socket died while it was being admitted', async () => {
    vi.useFakeTimers();
    const { offers, redis, database, config } = ttlHarness();
    const service = new HostsService(database, redis, config);
    const { session, offer } = await openSession(service, offers);

    await service.acceptHostRoute({
      sessionId: session.id,
      route: 'agent',
      authorization: `Bearer ${offer.agentAuthorization}`,
      socket: routeSocket(3),
    });

    await vi.advanceTimersByTimeAsync(200_000);

    const late = routeSocket();
    await service.acceptBrowserRoute({ sessionId: session.id, route: 'agent', userId: 'owner-1', socket: late });
    expect(late.close).toHaveBeenCalledWith(1008, 'session unavailable');
    service.onModuleDestroy();
  });
});

/**
 * A cloud host is a paired device the API provisions: same `agent_device` row,
 * same credential shape, same control channel — only the user-code dance is
 * skipped, because the provisioner is the one who receives the credential.
 */
describe('HostsService cloud provisioning', () => {
  type DeviceRow = {
    id: string;
    ownerId: string;
    label: string;
    credentialHash: string;
    cloudProjectId?: string | undefined;
    revokedAt?: Date | undefined;
  };

  const cloudHarness = () => {
    const devices: DeviceRow[] = [];
    const runs: Array<Record<string, unknown>> = [];
    const started: Array<{ deviceId: string; credential: string; ownerId: string; projectId: string; apiUrl: string }> =
      [];
    const stopped: string[] = [];
    let startFailure: Error | undefined;
    /* One predicate per call site, applied in order: the doubles below feed the
     * same rows to every `where`, so each query names what it is looking for. */
    let nextMatch: (row: DeviceRow) => boolean = () => true;
    const live = (): DeviceRow[] => devices.filter((row) => row.revokedAt === undefined && nextMatch(row));
    const database = {
      database: {
        select: () => ({
          from: (table: unknown) => ({
            where: () => {
              const rows: Array<Record<string, unknown>> = table === agentRun ? runs : live();
              return {
                limit: async () => rows.slice(0, 1),
                orderBy: () => ({ limit: async () => rows }),
              };
            },
          }),
        }),
        insert: (table: unknown) => ({
          // oxlint-disable-next-line typescript/promise-function-async -- drizzle's builder is a thenable with methods on it, not a promise.
          values: function values(row: Record<string, unknown>) {
            const apply = (): void => {
              if (table === agentRun) {
                const index = runs.findIndex((existing) => existing['runId'] === row['runId']);
                if (index !== -1) {
                  runs[index] = { ...runs[index], ...row };
                  return;
                }
                runs.push(row);
                return;
              }
              devices.push(row as DeviceRow);
            };
            const promise = (async (): Promise<void> => {
              await Promise.resolve();
              apply();
            })();
            return Object.assign(promise, { onConflictDoUpdate: async () => promise });
          },
        }),
        update: () => ({
          set: (patch: Record<string, unknown>) => ({
            // oxlint-disable-next-line typescript/promise-function-async -- drizzle's builder is a thenable with methods on it, not a promise.
            where: function where() {
              const matched = live();
              for (const row of matched) {
                Object.assign(row, patch);
              }
              return Object.assign(Promise.resolve(matched), { returning: async () => matched });
            },
          }),
        }),
      },
    } as unknown as DatabaseService;
    const values = new Map<string, string>();
    const redis = {
      client: {
        get: async (key: string) => values.get(key),
        set: async () => 'OK',
        del: async () => 1,
        smembers: async () => [],
        srem: async () => 1,
        publish: async () => 0,
        eval: async () => 1,
        multi: () => {
          const pipeline = { expire: () => pipeline, exec: async () => [] };
          return pipeline;
        },
      },
      createDuplicateClient: () => ({}),
    } as unknown as RedisService;
    const config = { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>;
    const provisioner = {
      start: async (spec: {
        deviceId: string;
        credential: string;
        ownerId: string;
        projectId: string;
        apiUrl: string;
      }) => {
        if (startFailure !== undefined) {
          throw startFailure;
        }
        started.push(spec);
        return { reference: `tau-host-${spec.deviceId}` };
      },
      stop: async (deviceId: string) => {
        stopped.push(deviceId);
      },
    };
    return {
      devices,
      runs,
      started,
      stopped,
      provisioner,
      database,
      redis,
      config,
      setMatch: (predicate: (row: DeviceRow) => boolean) => {
        nextMatch = predicate;
      },
      failNextStart: (error: Error = new Error('docker: no such image')) => {
        startFailure = error;
      },
    };
  };

  it('provisions once per owner and project, and hands the credential only to the provisioner', async () => {
    const harness = cloudHarness();
    harness.setMatch((row) => row.cloudProjectId === 'project-a' && row.revokedAt === undefined);
    const service = new HostsService(harness.database, harness.redis, harness.config, harness.provisioner);

    const first = await service.provisionCloudHost({ userId: 'owner-1', projectId: 'project-a' });
    expect(first).toMatchObject({ label: 'Tau Cloud', state: 'provisioned' });
    expect(first.deviceId).toMatch(/^agent_/u);
    expect(JSON.stringify(first)).not.toContain(harness.started[0]?.credential ?? 'unreachable');
    expect(harness.started).toHaveLength(1);
    expect(harness.started[0]).toMatchObject({
      deviceId: first.deviceId,
      ownerId: 'owner-1',
      projectId: 'project-a',
      apiUrl: 'https://api.tau.test',
    });
    expect(harness.started[0]?.credential.length).toBeGreaterThanOrEqual(32);
    /* The row stores only a hash — the credential is unrecoverable from here. */
    expect(harness.devices[0]?.credentialHash).not.toBe(harness.started[0]?.credential);

    const second = await service.provisionCloudHost({ userId: 'owner-1', projectId: 'project-a' });
    expect(second).toEqual({ deviceId: first.deviceId, label: 'Tau Cloud', state: 'existing' });
    expect(harness.started).toHaveLength(1);
    expect(harness.devices).toHaveLength(1);
    service.onModuleDestroy();
  });

  /*
   * A refusal is a *typed* refusal. The provisioner fails for reasons an owner
   * can act on — no image built, no Docker daemon, no Docker at all — and
   * rethrowing its raw `Error` made the filter answer `500 Internal server
   * error`: the live G5 leg showed a page that stayed silently on its previous
   * placement while `api-4000.log` held the only copy of the reason.
   */
  it('refuses with a typed 503 carrying the provisioner reason, and still revokes the device it created', async () => {
    const harness = cloudHarness();
    harness.setMatch((row) => row.cloudProjectId === 'project-b' && row.revokedAt === undefined);
    harness.failNextStart();
    const service = new HostsService(harness.database, harness.redis, harness.config, harness.provisioner);

    const refusal = await service
      .provisionCloudHost({ userId: 'owner-1', projectId: 'project-b' })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ServiceUnavailableException);
    expect((refusal as ServiceUnavailableException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((refusal as ServiceUnavailableException).getResponse()).toEqual({
      code: 'CLOUD_HOST_UNAVAILABLE',
      message: 'docker: no such image',
    });
    expect(harness.devices[0]?.revokedAt).toBeInstanceOf(Date);
    service.onModuleDestroy();
  });

  /*
   * `execFile` rejects with `Command failed: docker run …` and the daemon's own
   * words on `stderr`; the first stderr line is the one the user can act on,
   * and the rest is a stack of `See 'docker run --help'`.
   */
  it('shows the provisioner first stderr line rather than the exec command line', async () => {
    const harness = cloudHarness();
    harness.setMatch((row) => row.cloudProjectId === 'project-c' && row.revokedAt === undefined);
    harness.failNextStart(
      Object.assign(new Error('Command failed: docker run --detach --name tau-host-agent_1 tau-host:latest'), {
        stderr:
          "Unable to find image 'tau-host:latest' locally\ndocker: Error response from daemon: pull access denied.\nSee 'docker run --help'.\n",
      }),
    );
    const service = new HostsService(harness.database, harness.redis, harness.config, harness.provisioner);

    const refusal = await service
      .provisionCloudHost({ userId: 'owner-1', projectId: 'project-c' })
      .catch((error: unknown) => error);

    expect((refusal as ServiceUnavailableException).getResponse()).toEqual({
      code: 'CLOUD_HOST_UNAVAILABLE',
      message: "Unable to find image 'tau-host:latest' locally",
    });

    /* What the *browser* receives, not what the service threw: the shared
     * `HttpExceptionFilter` rewrites every `HttpException` into
     * `HttpErrorResponse` (`error`/`code`/`statusCode`/`path`/`requestId`) and
     * drops every other key, so the reason has to ride `message`, which the
     * filter maps to `error`. This is the contract `remote-host-client.ts`
     * reads back. */
    const reply = { header: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), send: vi.fn() };
    new HttpExceptionFilter().catch(refusal, {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => ({ url: '/v1/agents/cloud', id: 'req_1', headers: {} }),
      }),
    } as unknown as ArgumentsHost);
    expect(reply.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Unable to find image 'tau-host:latest' locally",
      code: 'CLOUD_HOST_UNAVAILABLE',
      statusCode: 503,
      path: '/v1/agents/cloud',
      requestId: 'req_1',
    });
    service.onModuleDestroy();
  });

  it('stops the container when a cloud device is revoked, and leaves a paired laptop alone', async () => {
    const harness = cloudHarness();
    harness.devices.push({
      id: 'device-cloud',
      ownerId: 'owner-1',
      label: 'Tau Cloud',
      credentialHash: 'hash',
      cloudProjectId: 'project-c',
    });
    harness.setMatch((row) => row.id === 'device-cloud');
    const service = new HostsService(harness.database, harness.redis, harness.config, harness.provisioner);

    await service.revokeDevice('device-cloud', 'owner-1');
    expect(harness.stopped).toEqual(['device-cloud']);

    harness.devices.push({
      id: 'device-laptop',
      ownerId: 'owner-1',
      label: 'workshop-mac',
      credentialHash: 'hash',
    });
    harness.setMatch((row) => row.id === 'device-laptop');
    await service.revokeDevice('device-laptop', 'owner-1');
    expect(harness.stopped).toEqual(['device-cloud']);
    service.onModuleDestroy();
  });

  it('records a run frame in the directory and lists a host rows back', async () => {
    const harness = cloudHarness();
    harness.devices.push({
      id: 'device-cloud',
      ownerId: 'owner-1',
      label: 'Tau Cloud',
      credentialHash: 'hash',
      cloudProjectId: 'project-c',
    });
    harness.setMatch((row) => row.id === 'device-cloud');
    const service = new HostsService(harness.database, harness.redis, harness.config, harness.provisioner);

    await service.handleControlMessage(
      'device-cloud',
      JSON.stringify({
        v: 1,
        type: 'run',
        runId: 'run-1',
        chatId: 'chat-1',
        state: 'running',
        updatedAt: new Date(1000).toISOString(),
      }),
    );
    expect(harness.runs).toHaveLength(1);
    expect(harness.runs[0]).toMatchObject({
      runId: 'run-1',
      chatId: 'chat-1',
      ownerId: 'owner-1',
      /* Derived from the device's project binding: the T0 wire carries none. */
      projectId: 'project-c',
      placement: 'device-cloud',
      state: 'running',
    });
    /* Nothing but identity and state: a frame carrying content would be a
     * second chat store, which PH19 forbids. */
    expect(Object.keys(harness.runs[0] ?? {}).toSorted()).toEqual([
      'chatId',
      'ownerId',
      'placement',
      'projectId',
      'runId',
      'state',
      'updatedAt',
    ]);

    await service.handleControlMessage(
      'device-cloud',
      JSON.stringify({
        v: 1,
        type: 'run',
        runId: 'run-1',
        chatId: 'chat-1',
        state: 'completed',
        updatedAt: new Date(2000).toISOString(),
      }),
    );
    expect(harness.runs).toHaveLength(1);
    expect(harness.runs[0]).toMatchObject({ state: 'completed' });

    const listed = await service.listRuns('device-cloud', 'owner-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ runId: 'run-1', state: 'completed' });
    service.onModuleDestroy();
  });
});

/**
 * The offer travels to the daemon on pub/sub and its answer used to come back on
 * a 100 ms poll — measured (W5-TAIL) at p50 96.9 ms of a 139 ms reconnect while
 * the daemon's real accept took 5.3 ms. The answer now rides the same channel
 * the question did; the poll survives as the cross-replica fallback.
 */
describe('HostsService session outcome delivery', () => {
  const outcomeHarness = (onOffer: (sessionId: string) => void) => {
    const subscribers = new Map<string, Array<(channel: string, payload: string) => void>>();
    const values = new Map<string, string>([
      ['host:online:device-1', JSON.stringify({ connectionId: 'connection-1', runtimeVersion: '1.0.0', capacity: 1 })],
    ]);
    const redis = {
      client: {
        get: async (key: string) => values.get(key),
        /* Always empty: only the pub/sub path can answer, so a test that passes
         * proves the poll is not what resolved it. */
        getdel: async () => undefined,
        set: async () => 'OK',
        del: async () => 1,
        sadd: async () => 1,
        expire: async () => 1,
        publish: async (channel: string, payload: string) => {
          if (channel.startsWith('host:control:')) {
            /* The daemon learns the session id from the offer, exactly here. */
            const offer = JSON.parse(JSON.parse(payload).payload as string) as { sessionId: string };
            onOffer(offer.sessionId);
            return 1;
          }
          const listeners = subscribers.get(channel) ?? [];
          for (const listener of listeners) {
            setTimeout(() => {
              listener(channel, payload);
            }, 0);
          }
          return listeners.length;
        },
        multi: () => {
          const pipeline = {
            set: (key: string, value: string) => {
              values.set(key, value);
              return pipeline;
            },
            sadd: () => pipeline,
            expire: () => pipeline,
            exec: async () => [],
          };
          return pipeline;
        },
      },
      createDuplicateClient: () => {
        const listeners: Array<(channel: string, payload: string) => void> = [];
        let channel = '';
        return {
          status: 'wait',
          connect: async () => undefined,
          subscribe: async (name: string) => {
            channel = name;
            subscribers.set(name, [...(subscribers.get(name) ?? []), ...listeners]);
            return 1;
          },
          on: (event: string, listener: (channel: string, payload: string) => void) => {
            if (event === 'message') {
              listeners.push(listener);
              if (channel) {
                subscribers.set(channel, [...(subscribers.get(channel) ?? []), listener]);
              }
            }
          },
          disconnect: () => {
            subscribers.delete(channel);
          },
        };
      },
    } as unknown as RedisService;
    const database = {
      database: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'device-1' }] }) }) }),
      },
    } as unknown as DatabaseService;
    const config = { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>;
    return { redis, database, config, values };
  };

  it('resolves an offer from the daemon answer, not from the next poll tick', async () => {
    const daemon: { service?: HostsService } = {};
    /* The daemon answers 5 ms after the offer reaches it — the measured shape. */
    const harness = outcomeHarness((sessionId) => {
      setTimeout(() => {
        void daemon.service?.handleControlMessage('device-1', JSON.stringify({ v: 1, type: 'accept', sessionId }));
      }, 5);
    });
    const service = new HostsService(harness.database, harness.redis, harness.config);
    daemon.service = service;

    const started = performance.now();
    const session = await service.createSession({ deviceId: 'device-1', userId: 'owner-1', runtimeVersion: '1.0.0' });
    const elapsed = performance.now() - started;

    expect(session.id).toMatch(/^as_/u);
    expect(elapsed).toBeLessThan(60);
    service.onModuleDestroy();
  });
});

describe('hostControlMessageSchema', () => {
  const ready = { v: 1, type: 'ready', deviceId: 'device-1', runtimeVersion: '1.0.0', capacity: 1 };

  it('accepts a ready frame with and without the agent capability', () => {
    expect(hostControlMessageSchema.safeParse(ready).success).toBe(true);
    expect(
      hostControlMessageSchema.parse({ ...ready, capabilities: { agent: { workspaceRoot: '/home/tau' } } }),
    ).toMatchObject({ capabilities: { agent: { workspaceRoot: '/home/tau' } } });
    expect(hostControlMessageSchema.safeParse({ ...ready, capabilities: {} }).success).toBe(true);
  });

  it('refuses an agent capability with no workspace root', () => {
    expect(hostControlMessageSchema.safeParse({ ...ready, capabilities: { agent: {} } }).success).toBe(false);
    expect(
      hostControlMessageSchema.safeParse({ ...ready, capabilities: { agent: { workspaceRoot: '' } } }).success,
    ).toBe(false);
  });

  it('accepts a run frame and refuses a state outside the directory vocabulary', () => {
    const run = {
      v: 1,
      type: 'run',
      runId: 'run-1',
      chatId: 'chat-1',
      state: 'awaiting-approval',
      updatedAt: new Date(0).toISOString(),
    };
    expect(hostControlMessageSchema.parse(run)).toMatchObject({ type: 'run', state: 'awaiting-approval' });
    expect(hostControlMessageSchema.parse({ ...run, projectId: 'project-a' })).toMatchObject({
      projectId: 'project-a',
    });
    expect(hostControlMessageSchema.safeParse({ ...run, state: 'planning' }).success).toBe(false);
    expect(hostControlMessageSchema.safeParse({ ...run, updatedAt: 'yesterday' }).success).toBe(false);
  });
});
