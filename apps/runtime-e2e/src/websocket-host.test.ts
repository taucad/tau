/**
 * In-process suite for `webSocketHost` (WS11a).
 *
 * A real `ws` server on `127.0.0.1:0` inside the vitest process — the
 * blueprint's Finding 7 convention keeps real sockets out of the
 * coverage-gated `packages/runtime` unit scope and puts them here.
 *
 * Covers the host-side decisions no fake socket pair can reach: the HTTP
 * upgrade guards (route, origin, session), session pairing, the server
 * heartbeat, per-connection worker isolation, and `close()` teardown.
 */

import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';

import { decode } from '@msgpack/msgpack';
import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createGeometryTestHelpers } from '@taucad/runtime-testing';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import { webSocketHost } from '@taucad/runtime/transport/websocket-host';
import type { WebSocketHostHandle, WebSocketHostOptions } from '@taucad/runtime/transport/websocket-host';
import { createRuntimeWorker } from '@taucad/runtime/worker';

import { boxSource, webSocketRuntime } from '#fixtures/websocket-runtime.js';

const geometryHelpers = createGeometryTestHelpers();

/** Every `it` owns exactly one host; `afterEach` closes it. */
let host: WebSocketHostHandle | undefined;
const roots: string[] = [];
/** Servers and foreign WebSocket services the shared-server cases stand up. */
const disposers: Array<() => Promise<void>> = [];
/** `cleanup()` calls observed on the workers this host minted. */
let workerCleanups = 0;

afterEach(async () => {
  await host?.close();
  host = undefined;
  workerCleanups = 0;
  await Promise.all(disposers.splice(0).map(async (dispose) => dispose()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (source = boxSource(20)): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-ws-host-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), source, 'utf8');
  return root;
};

/** Start the suite's single host and return its base URL. */
const startHost = async (options: Omit<WebSocketHostOptions, 'worker'>): Promise<string> => {
  host = webSocketHost({
    worker: () => {
      const worker = createRuntimeWorker({ runtime: webSocketRuntime });
      const cleanup = worker.cleanup.bind(worker);
      worker.cleanup = async (): Promise<void> => {
        await cleanup();
        workerCleanups += 1;
      };
      return worker;
    },
    ...options,
  });
  await host.ready;
  const { port } = host.address();
  return `ws://127.0.0.1:${port}`;
};

/** Dial a raw `ws` socket and resolve once it is open. */
const openRawSocket = async (url: string, options?: ConstructorParameters<typeof WebSocket>[2]): Promise<WebSocket> => {
  const socket = new WebSocket(url, options);
  await once(socket, 'open');
  return socket;
};

/** Dial a raw `ws` socket that is expected to fail its HTTP upgrade. */
const expectUpgradeFailure = async (
  url: string,
  options?: ConstructorParameters<typeof WebSocket>[2],
): Promise<string> => {
  const socket = new WebSocket(url, options);
  const [error] = (await once(socket, 'error')) as [Error];
  return error.message;
};

/** A listening `http.Server` the suite shares between the host and a foreign service. */
const startSharedServer = async (): Promise<HttpServer> => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  disposers.push(
    async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );
  return server;
};

/**
 * A second `WebSocketServer` on the same HTTP server, owning everything under
 * `prefix` and ignoring every other upgrade — the daemon's `/agent` socket.
 */
const mountForeignService = (server: HttpServer, prefix: string): void => {
  const foreign = new WebSocketServer({ noServer: true });
  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Parameters<WebSocketServer['handleUpgrade']>[2],
  ): void => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      return;
    }
    foreign.handleUpgrade(request, socket, head, (accepted) => {
      accepted.send('agent-hello');
    });
  };
  server.on('upgrade', onUpgrade);
  disposers.push(async () => {
    server.off('upgrade', onUpgrade);
    await new Promise<void>((resolve) => {
      foreign.close(() => {
        resolve();
      });
    });
  });
};

/** Dial a foreign path and report its first frame plus whether the socket survived. */
const dialForeignSocket = async (url: string): Promise<{ frame: string; open: boolean }> => {
  const socket = new WebSocket(url);
  disposers.push(async () => {
    socket.terminate();
  });
  const frame = await Promise.race([
    once(socket, 'message').then(([data]: unknown[]) => String(data)),
    once(socket, 'close').then(([code]: unknown[]) => {
      throw new Error(`socket closed with ${String(code)} before any frame arrived`);
    }),
  ]);
  /* The host's 404-and-destroy lands *after* the foreign hello when the
   * foreign handler ran first, so the survival check needs a settle window. */
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  return { frame, open: socket.readyState === WebSocket.OPEN };
};

describe('webSocketHost (in-process, real ws server)', { concurrent: false }, () => {
  it('admits an allowed origin, refuses a disallowed one, and admits a Node client with no Origin', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()), allowedOrigins: ['http://ui.test'] });

    const allowed = await openRawSocket(`${url}/runtime`, { origin: 'http://ui.test' });
    allowed.close();
    const anonymous = await openRawSocket(`${url}/runtime`);
    anonymous.close();

    expect(await expectUpgradeFailure(`${url}/runtime`, { origin: 'http://evil.test' })).toContain('403');
  });

  it('denies every browser origin by default', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()) });

    expect(await expectUpgradeFailure(`${url}/runtime`, { origin: 'http://ui.test' })).toContain('403');
    const anonymous = await openRawSocket(`${url}/runtime`);
    anonymous.close();
  });

  it('404s an unknown route and 400s a /fs upgrade with no session', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()) });

    expect(await expectUpgradeFailure(`${url}/nope`)).toContain('404');
    expect(await expectUpgradeFailure(`${url}/fs`)).toContain('400');
  });

  it('closes an unpaired /runtime socket with 1008 once the pairing bound elapses', async () => {
    /* No host filesystem, so this connection is W2 and must be paired. */
    const url = await startHost({ pairingTimeout: 500 });
    const socket = await openRawSocket(`${url}/runtime?session=never-paired`);

    const [code, reason] = (await once(socket, 'close')) as [number, Uint8Array<ArrayBuffer>];
    expect(code).toBe(1008);
    expect(new TextDecoder().decode(reason)).toBe('no /fs socket paired for this session');
  });

  it('terminates a peer that stops answering the heartbeat', async () => {
    const url = await startHost({ heartbeat: 1000 });
    /* `ws` answers pings automatically; `autoPong: false` makes this socket the
     * silently-dead TCP peer the heartbeat exists for. A parked `/fs` socket is
     * the cheapest one to strand — no worker is minted for it. */
    const socket = await openRawSocket(`${url}/fs?session=silent-peer`, { autoPong: false });

    const [code] = (await once(socket, 'close')) as [number];
    /* `terminate()` destroys the TCP socket: no close frame, so 1006. */
    expect(code).toBe(1006);
  }, 30_000);

  it('serves one kernel worker per connection, so a second client never sees RuntimeAlreadyInitializedError', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()) });
    const first = createRuntimeClient({ transport: webSocketTransport({ url }) });
    const second = createRuntimeClient({ transport: webSocketTransport({ url }) });

    try {
      const [one, two] = await Promise.all([
        first.render({ source: { path: 'main.ts' } }),
        second.render({ source: { path: 'main.ts' } }),
      ]);
      if (one.superseded || two.superseded) {
        throw new Error('Expected both socket clients to settle their own render');
      }
      await geometryHelpers.expectValidGltf(one.geometry);
      await geometryHelpers.expectValidGltf(two.geometry);
      await geometryHelpers.expectMeshCount(one.geometry, 1);
      await geometryHelpers.expectMeshCount(two.geometry, 1);
    } finally {
      first.terminate();
      second.terminate();
    }
  });

  it('settles every connected client with host-exit and only resolves close() after teardown', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()) });
    const handle = host;
    if (!handle) {
      throw new Error('host was not started');
    }
    const first = webSocketTransport({ url }).materialize();
    const second = webSocketTransport({ url }).materialize();
    const [firstReady, secondReady] = await Promise.all([first.open(), second.open()]);
    /* The hello only exists once the host has minted this connection's worker
     * and dispatcher, so awaiting it removes the accept-path race from the
     * teardown assertion below. */
    await Promise.all([firstReady.channel.ready, secondReady.channel.ready]);

    host = undefined;
    await handle.close();

    /* `close()` resolved, so every connection's dispatcher, fs proxy and worker
     * are already gone — no polling needed for this assertion. */
    expect(workerCleanups).toBe(2);
    await expect(first.closed).resolves.toEqual({ cause: 'host-exit' });
    await expect(second.closed).resolves.toEqual({ cause: 'host-exit' });
  });

  /* Finding 2 of daemon-websocket-prerequisites-blueprint.md, measured: the
   * host used to 404-and-destroy every foreign upgrade on a server it does not
   * own, in both registration orders, and to hijack `/agent/fs` by last
   * segment. These three cases are that probe, kept as the regression. */
  it.each([
    ['foreign handler first', 'foreign'],
    ['host first', 'host'],
  ] as const)('leaves a foreign /agent socket alone on a shared server (%s)', async (_name, order) => {
    const server = await startSharedServer();
    if (order === 'foreign') {
      mountForeignService(server, '/agent');
    }
    await startHost({ server, pathPrefix: '/rt', fileSystem: fromNodeFs(await makeRoot()) });
    if (order === 'host') {
      mountForeignService(server, '/agent');
    }
    const { port } = server.address() as { port: number };

    await expect(dialForeignSocket(`ws://127.0.0.1:${port}/agent`)).resolves.toEqual({
      frame: 'agent-hello',
      open: true,
    });
  });

  it('does not hijack /agent/fs on a shared server', async () => {
    const server = await startSharedServer();
    /* Host first: the ordering in which last-segment routing answered this
     * upgrade as the host's own `/fs` route, so the foreign hello never
     * arrived and the socket was closed 1008 instead. */
    await startHost({ server, pathPrefix: '/rt', fileSystem: fromNodeFs(await makeRoot()) });
    mountForeignService(server, '/agent');
    const { port } = server.address() as { port: number };

    await expect(dialForeignSocket(`ws://127.0.0.1:${port}/agent/fs?session=a`)).resolves.toEqual({
      frame: 'agent-hello',
      open: true,
    });
  });

  it('renders over /rt/runtime and pairs /rt/fs on a shared server', async () => {
    const server = await startSharedServer();
    mountForeignService(server, '/agent');
    await startHost({ server, pathPrefix: '/rt' });
    const { port } = server.address() as { port: number };

    const client = createRuntimeClient({
      transport: webSocketTransport({
        url: `ws://127.0.0.1:${port}/rt`,
        fileSystem: fromNodeFs(await makeRoot()),
      }),
    });

    try {
      const result = await client.render({ source: { path: 'main.ts' } });
      if (result.superseded) {
        throw new Error('Expected the shared-server render to settle');
      }
      await geometryHelpers.expectValidGltf(result.geometry);
      await geometryHelpers.expectMeshCount(result.geometry, 1);
    } finally {
      client.terminate();
    }
  }, 30_000);

  it('refuses an upgrade with a raw 401 when authorize denies or throws, and admits it when it accepts', async () => {
    const denied = await startHost({ fileSystem: fromNodeFs(await makeRoot()), authorize: () => false });
    expect(await expectUpgradeFailure(`${denied}/runtime`)).toContain('401');
    await host?.close();

    const thrown = await startHost({
      fileSystem: fromNodeFs(await makeRoot()),
      authorize: (): boolean => {
        throw new Error('token store unavailable');
      },
    });
    expect(await expectUpgradeFailure(`${thrown}/runtime`)).toContain('401');
    await host?.close();

    const admitted = await startHost({
      fileSystem: fromNodeFs(await makeRoot()),
      authorize: async () => true,
    });
    /* The listener has to exist before the socket opens: the host posts its
     * hello as soon as the dispatcher exists and `ws` drops an unlistened one. */
    const socket = new WebSocket(`${admitted}/runtime`);
    const [hello] = (await once(socket, 'message')) as [Uint8Array<ArrayBuffer>];
    expect(decode(hello)).toMatchObject({ k: 'lh' });
    socket.close();
  });

  it('shows authorize the token both sockets carry on their URL', async () => {
    const seen: string[] = [];
    const url = await startHost({
      authorize: (request) => {
        seen.push(new URL(request.url ?? '/', 'http://localhost').searchParams.get('token') ?? '');
        return true;
      },
    });
    const client = createRuntimeClient({
      transport: webSocketTransport({ url: `${url}/?token=abc`, fileSystem: fromNodeFs(await makeRoot()) }),
    });

    try {
      const result = await client.render({ source: { path: 'main.ts' } });
      if (result.superseded) {
        throw new Error('Expected the authorized render to settle');
      }
      await geometryHelpers.expectValidGltf(result.geometry);
    } finally {
      client.terminate();
    }

    /* `buildSocketUrl` preserves the base URL's search params, so the token
     * reaches the hook on `/runtime` **and** on `/fs` with no client option. */
    expect(seen).toEqual(['abc', 'abc']);
  }, 30_000);

  it('closes a frame over maxPayload with 1009 instead of delivering it', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()), maxPayload: 1024 });
    const socket = await openRawSocket(`${url}/runtime`);
    socket.on('error', () => undefined);

    /* Without the ceiling this frame is delivered and the wire rejects it as
     * undecodable (1003); with it, `ws` never buffers the frame at all. */
    socket.send(new Uint8Array(2048));
    const [code] = (await once(socket, 'close')) as [number];

    expect(code).toBe(1009);
  });

  it('settles wire-failure when a client offers a filesystem to a host that owns one', async () => {
    const url = await startHost({ fileSystem: fromNodeFs(await makeRoot()) });
    const client = webSocketTransport({ url, fileSystem: fromNodeFs(await makeRoot()) }).materialize();

    await client.open();
    const result = await client.closed;

    expect(result.cause).toBe('wire-failure');
    if (result.cause !== 'wire-failure') {
      throw new TypeError('expected wire-failure');
    }
    expect(result.error.message).toContain('must not pass `fileSystem`');
  });
});
