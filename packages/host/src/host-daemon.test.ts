import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { startHostDaemon } from '#host-daemon.js';
import type { HostDaemonEvent } from '#host-daemon.js';
import { writeHostCredential } from '#credential-store.js';
import type { HostJobWorkerFactory } from '#job-worker.js';

let temporaryDirectory: string | undefined;
const originalWorkingDirectory = process.cwd();
const resources: Array<{ close(): void }> = [];

afterEach(async () => {
  delete process.env['TAU_CONFIG_DIR'];
  process.chdir(originalWorkingDirectory);
  for (const resource of resources.splice(0)) {
    resource.close();
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true });
    temporaryDirectory = undefined;
  }
});

const agentToken = 'daemon-agent-token-with-at-least-32-characters';

type StubRelay = {
  readonly url: URL;
  readonly control: Promise<WebSocket>;
  /** Every control frame the daemon has sent, parsed. */
  readonly controlFrames: unknown[];
  /** The route socket the daemon spliced onto `pathname`. */
  route(pathname: string): Promise<WebSocket>;
  /** The first frame the daemon pushed *through* that route. */
  firstFrame(pathname: string): Promise<WebSocket.RawData>;
};

/**
 * A relay that accepts the control socket and every session route, and hands
 * each one back by path. Unlike the real API it reaps nothing on its own, so a
 * test decides exactly when a peerless route dies.
 */
const startRelay = async (): Promise<StubRelay> => {
  const httpServer = createServer();
  resources.push(httpServer);
  const socketServer = new WebSocketServer({ noServer: true });
  resources.push(socketServer);
  const control = Promise.withResolvers<WebSocket>();
  const controlFrames: unknown[] = [];
  const routeSockets = new Map<string, PromiseWithResolvers<WebSocket>>();
  const routeFrames = new Map<string, PromiseWithResolvers<WebSocket.RawData>>();
  const slotFor = <T>(slots: Map<string, PromiseWithResolvers<T>>, key: string): PromiseWithResolvers<T> => {
    const existing = slots.get(key);
    if (existing) {
      return existing;
    }
    const created = Promise.withResolvers<T>();
    slots.set(key, created);
    return created;
  };
  httpServer.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket, head, (accepted) => {
      const { pathname } = new URL(request.url ?? '/', 'http://relay.invalid');
      if (pathname === '/v1/agents/control') {
        accepted.on('message', (raw) => {
          controlFrames.push(JSON.parse(Buffer.from(raw as Uint8Array<ArrayBuffer>).toString('utf8')));
        });
        control.resolve(accepted);
        return;
      }
      /* Listen before resolving the socket: the daemon's agent channel posts its
       * hello the instant the splice opens, and `ws` drops a message that lands
       * with no listener attached. */
      accepted.on('message', (raw) => {
        slotFor(routeFrames, pathname).resolve(raw);
      });
      slotFor(routeSockets, pathname).resolve(accepted);
    });
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new TypeError('Expected a TCP relay address.');
  }
  return {
    url: new URL(`http://127.0.0.1:${String(address.port)}`),
    control: control.promise,
    controlFrames,
    route: async (pathname) => slotFor(routeSockets, pathname).promise,
    firstFrame: async (pathname) => slotFor(routeFrames, pathname).promise,
  };
};

/** An offer carrying all three routes, exactly as the API mints one for an agent-capable device. */
const agentOffer = (relayUrl: URL, sessionId: string, lifetimeMs = 60_000): Record<string, unknown> => {
  const route = (name: string): string =>
    new URL(`/v1/agents/sessions/${sessionId}/host/${name}`, relayUrl).href.replace('http:', 'ws:');
  return {
    v: 1,
    type: 'offer',
    sessionId,
    runtimeVersion: 'test-version',
    runtimeUrl: route('runtime'),
    fileSystemUrl: route('fs'),
    agentUrl: route('agent'),
    runtimeAuthorization: 'r'.repeat(32),
    fileSystemAuthorization: 'f'.repeat(32),
    agentAuthorization: 'a'.repeat(32),
    expiresAt: new Date(Date.now() + lifetimeMs).toISOString(),
  };
};

const routePath = (sessionId: string, name: string): string => `/v1/agents/sessions/${sessionId}/host/${name}`;

/** The API's 15 s reap of a route whose browser peer never connected. */
const reapRoute = async (relay: StubRelay, sessionId: string, name: string): Promise<void> => {
  const socket = await relay.route(routePath(sessionId, name));
  socket.close(1008, 'route peer did not connect');
};

/** Launcher-1 options over a workspace inside the test's own temporary directory. */
const agentOptionsIn = async (root: string) => {
  const workspaceRoot = join(root, 'workspace');
  await mkdir(workspaceRoot, { recursive: true });
  return {
    workspaceRoot,
    /* Never contacted: no test here runs a model turn. */
    gatewayBaseUrl: 'http://127.0.0.1:1',
    model: { id: 'fixture-model', contextWindow: 1000 },
    systemPrompt: 'You are a fixture.',
    token: agentToken,
    port: 0,
  } as const;
};

/** A paired daemon with the agent capability on, over a stub relay. */
const startPairedAgentDaemon = async (
  root: string,
  relay: StubRelay,
  events: HostDaemonEvent[],
): Promise<ReturnType<typeof startHostDaemon>> => {
  await writeHostCredential({
    v: 1,
    deviceId: 'device-1',
    credential: 'secret-credential-value-that-never-enters-a-url',
  });
  return startHostDaemon({
    relayUrl: relay.url,
    runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
    agent: await agentOptionsIn(root),
    onEvent: (event) => events.push(event),
  });
};

describe('startHostDaemon', () => {
  /*
   * The agent channel is not a client of the compute child: it needs one only
   * for the geometry tools, which answer a typed refusal without it. A child
   * that cannot start must therefore be a retriable warning — never the fatal
   * outcome that takes `tau serve --ui` down with it.
   */
  it('serves the agent channel and stays up when the runtime child cannot start', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-child-down-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });

    const events: HostDaemonEvent[] = [];
    const daemon = startHostDaemon({
      /* Nothing listens here: with the child down no control connection is
       * attempted, which is exactly the loop shape under test. */
      relayUrl: new URL('http://127.0.0.1:1'),
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-failing-child.mjs', import.meta.url)) },
      agent: await agentOptionsIn(temporaryDirectory),
      onEvent: (event) => events.push(event),
    });

    // `ready` no longer waits on a control connection when the agent channel is on.
    await daemon.ready;
    const agentReady = events.find(
      (event): event is Extract<HostDaemonEvent, { readonly type: 'agent' }> => event.type === 'agent',
    );
    expect(agentReady?.state).toBe('ready');
    const origin = new URL(agentReady?.url ?? 'http://127.0.0.1:0');

    // The channel is serving: it greets an admitted client with its hello frame.
    const client = new WebSocket(new URL('/agent', origin).href.replace('http:', 'ws:'), {
      headers: { authorization: `Bearer ${agentToken}` },
    });
    /* Listen before awaiting `open`: the channel posts its hello the instant the
     * upgrade completes, and `ws` drops a message that lands with no listener. */
    const hello = once(client, 'message');
    try {
      await once(client, 'open');
      await expect(Promise.race([hello, delay(5000, 'no-hello')])).resolves.not.toBe('no-hello');
    } finally {
      client.close();
    }

    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ type: 'warning', code: 'RUNTIME_CHILD_FAILED' }));
    });
    await expect(Promise.race([daemon.closed, delay(50).then(() => 'still-running')])).resolves.toBe('still-running');

    await daemon.close();
    expect(await daemon.closed).toEqual({ cause: 'requested' });
  }, 20_000);

  it('advertises the agent capability on the control ready frame', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-capability-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });

    const httpServer = createServer();
    resources.push(httpServer);
    const socketServer = new WebSocketServer({ noServer: true });
    resources.push(socketServer);
    const control = Promise.withResolvers<WebSocket>();
    httpServer.on('upgrade', (request, socket, head) => {
      socketServer.handleUpgrade(request, socket, head, (accepted) => {
        control.resolve(accepted);
      });
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new TypeError('Expected a TCP relay address.');
    }
    const agent = await agentOptionsIn(temporaryDirectory);
    const daemon = startHostDaemon({
      relayUrl: new URL(`http://127.0.0.1:${String(address.port)}`),
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
      agent,
    });
    const controlSocket = await control.promise;
    const [readyFrame] = (await once(controlSocket, 'message')) as [Uint8Array<ArrayBuffer>];
    expect(JSON.parse(Buffer.from(readyFrame).toString())).toMatchObject({
      type: 'ready',
      capabilities: { agent: { workspaceRoot: agent.workspaceRoot } },
    });

    await daemon.close();
  }, 20_000);

  /*
   * One `POST /v1/agents/sessions` mints three routes; an *agent* placement
   * dials exactly one of them, and the API closes a route whose browser peer
   * never connects after 15 s (`1008 route peer did not connect`). Racing all
   * three splices made that reap fatal to the whole session — every rung-2
   * session of the G4 proof died ~15 s in, reported as `RELAY_CLOSED`. A route
   * now lives and dies on its own sockets.
   */
  it('keeps a relayed agent session alive when the relay reaps a route the page never dialled', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-peerless-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));

    const relay = await startRelay();
    const events: HostDaemonEvent[] = [];
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, events);
    const control = await relay.control;
    await vi.waitFor(() => {
      expect(relay.controlFrames).toContainEqual(expect.objectContaining({ type: 'ready' }));
    });

    control.send(JSON.stringify(agentOffer(relay.url, 'session-1')));
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'session', sessionId: 'session-1', state: 'connected' });
    });

    // The agent splice carries: the daemon's channel hello arrives through the relay.
    await expect(
      Promise.race([relay.firstFrame(routePath('session-1', 'agent')), delay(5000, 'no-hello')]),
    ).resolves.not.toBe('no-hello');

    // Nobody dialled these two, so the API reaps them. That is not this session's death.
    await reapRoute(relay, 'session-1', 'runtime');
    await reapRoute(relay, 'session-1', 'fs');
    await delay(300);
    expect(events.filter((event) => event.type === 'session' && event.state === 'disconnected')).toEqual([]);
    const agentSocket = await relay.route(routePath('session-1', 'agent'));
    expect(agentSocket.readyState).toBe(WebSocket.OPEN);

    // The session ends with its own socket instead.
    agentSocket.close(1000, 'page closed');
    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: 'session',
        sessionId: 'session-1',
        state: 'disconnected',
        code: 'RELAY_CLOSED',
      });
    });

    await daemon.close();
  }, 20_000);

  /*
   * `sessionLifetimeSeconds` bounds an *unclaimed* offer — the API refreshes a
   * session's record for as long as it has a parked socket
   * (`HostsService.touchSession`). The daemon's own hard close at the offer's
   * expiry was the last thing capping a claimed session at 120 s, for a reason
   * that has nothing to do with its sockets.
   */
  it('stops enforcing the offer expiry once every route is spliced', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-expiry-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));

    const relay = await startRelay();
    const events: HostDaemonEvent[] = [];
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, events);
    const control = await relay.control;
    await vi.waitFor(() => {
      expect(relay.controlFrames).toContainEqual(expect.objectContaining({ type: 'ready' }));
    });
    control.send(JSON.stringify(agentOffer(relay.url, 'session-1', 400)));
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'session', sessionId: 'session-1', state: 'connected' });
    });

    await delay(900);
    expect(events.filter((event) => event.type === 'session' && event.state === 'disconnected')).toEqual([]);
    const agentSocket = await relay.route(routePath('session-1', 'agent'));
    expect(agentSocket.readyState).toBe(WebSocket.OPEN);

    await daemon.close();
  }, 20_000);

  /*
   * A session nobody ever dialled is a different outcome from a relay that
   * dropped a live wire, and the daemon's log must say which.
   */
  it('reports a session no browser ever dialled as ROUTE_UNUSED, not RELAY_CLOSED', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-unused-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));

    const relay = await startRelay();
    const events: HostDaemonEvent[] = [];
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, events);
    const control = await relay.control;
    await vi.waitFor(() => {
      expect(relay.controlFrames).toContainEqual(expect.objectContaining({ type: 'ready' }));
    });
    control.send(JSON.stringify(agentOffer(relay.url, 'session-1')));
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'session', sessionId: 'session-1', state: 'connected' });
    });

    for (const name of ['runtime', 'fs', 'agent']) {
      // oxlint-disable-next-line no-await-in-loop -- three reaps in the relay's own order.
      await reapRoute(relay, 'session-1', name);
    }
    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: 'session',
        sessionId: 'session-1',
        state: 'disconnected',
        code: 'ROUTE_UNUSED',
      });
    });

    await daemon.close();
  }, 20_000);

  /*
   * `maxSessions` defaults to 1 and the slot was released only once every splice
   * had drained — a relay round trip plus the child-exit attribution grace after
   * the client had already gone. Two dials 325 ms apart from one page hit 409 in
   * the live proof; the second must be admitted.
   */
  it('frees the capacity slot the moment a session loses a route', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-capacity-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));

    const relay = await startRelay();
    const events: HostDaemonEvent[] = [];
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, events);
    const control = await relay.control;
    await vi.waitFor(() => {
      expect(relay.controlFrames).toContainEqual(expect.objectContaining({ type: 'ready' }));
    });
    control.send(JSON.stringify(agentOffer(relay.url, 'session-1')));
    await vi.waitFor(() => {
      expect(relay.controlFrames).toContainEqual({ v: 1, type: 'accept', sessionId: 'session-1' });
    });

    /* The page closed its only socket. 20 ms is an order of magnitude under the
     * 50 ms child-exit attribution grace the drain still owes, and an order of
     * magnitude over a loopback close. */
    const agentSocket = await relay.route(routePath('session-1', 'agent'));
    agentSocket.close(1000, 'page closed');
    await delay(20);
    control.send(JSON.stringify(agentOffer(relay.url, 'session-2')));

    await vi.waitFor(() => {
      expect(relay.controlFrames).toContainEqual(expect.objectContaining({ sessionId: 'session-2' }));
    });
    expect(relay.controlFrames).toContainEqual({ v: 1, type: 'accept', sessionId: 'session-2' });

    await daemon.close();
  }, 20_000);

  it('contains a fatal job worker without terminating the chat control plane', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-job-crash-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const credential = 'secret-credential-value-that-never-enters-a-url';
    await writeHostCredential({ v: 1, deviceId: 'device-1', credential });

    const httpServer = createServer();
    resources.push(httpServer);
    const socketServer = new WebSocketServer({ noServer: true });
    resources.push(socketServer);
    const control = Promise.withResolvers<WebSocket>();
    httpServer.on('upgrade', (request, socket, head) => {
      socketServer.handleUpgrade(request, socket, head, (accepted) => {
        control.resolve(accepted);
      });
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new TypeError('Expected a TCP relay address.');
    }
    const workerClosed = Promise.withResolvers<{
      readonly cause: 'fatal';
      readonly error: Error;
    }>();
    const events: HostDaemonEvent[] = [];
    const daemon = startHostDaemon({
      relayUrl: new URL(`http://127.0.0.1:${String(address.port)}`),
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
      jobWorker: {
        start: async () => ({
          registration: { runnerId: 'device-1', capabilities: {}, slots: 1 },
          profiles: [],
          ready: Promise.resolve(),
          closed: workerClosed.promise,
          close: async () => undefined,
        }),
      },
      onEvent: (event) => events.push(event),
    });
    const controlSocket = await control.promise;
    await once(controlSocket, 'message');
    await daemon.ready;

    workerClosed.resolve({ cause: 'fatal', error: new Error('solver worker crashed') });
    await vi.waitFor(() => {
      const warning = events.find(
        (event): event is Extract<HostDaemonEvent, { readonly type: 'warning' }> =>
          event.type === 'warning' && event.code === 'JOB_WORKER_FAILED',
      );
      expect(warning?.message).toContain('crashed');
    });
    expect(controlSocket.readyState).toBe(WebSocket.OPEN);
    await expect(Promise.race([daemon.closed, delay(50).then(() => 'still-running')])).resolves.toBe('still-running');

    await daemon.close();
    expect(await daemon.closed).toEqual({ cause: 'requested' });
  });

  it('keeps control alive across a child crash and reconnects after relay loss', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const credential = 'secret-credential-value-that-never-enters-a-url';
    await writeHostCredential({ v: 1, deviceId: 'device-1', credential });

    const httpServer = createServer();
    resources.push(httpServer);
    const socketServer = new WebSocketServer({ noServer: true });
    resources.push(socketServer);
    const controls: WebSocket[] = [];
    const routes = new Map<string, WebSocket>();
    const nextControl = Promise.withResolvers<WebSocket>();
    const reconnectedControl = Promise.withResolvers<WebSocket>();
    httpServer.on('upgrade', (request, socket, head) => {
      socketServer.handleUpgrade(request, socket, head, (accepted) => {
        const { url } = request;
        const { pathname } = new URL(url ?? '/', 'http://relay.invalid');
        if (pathname === '/v1/agents/control') {
          const { authorization } = request.headers;
          expect(authorization).toBe(`Bearer ${credential}`);
          controls.push(accepted);
          (controls.length === 1 ? nextControl : reconnectedControl).resolve(accepted);
          return;
        }
        expect(request.headers.authorization).toMatch(/^Bearer [A-Za-z\d_-]{32,}$/u);
        routes.set(pathname, accepted);
      });
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new TypeError('Expected a TCP relay address.');
    }
    const relayUrl = new URL(`http://127.0.0.1:${String(address.port)}`);
    const events: HostDaemonEvent[] = [];
    const childModule = fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url));
    const drainStarted = Promise.withResolvers<void>();
    const allowDrain = Promise.withResolvers<void>();
    const jobWorkerClosed = Promise.withResolvers<{ readonly cause: 'requested' }>();
    const startJobWorker = vi.fn<HostJobWorkerFactory['start']>(async (input) => ({
      registration: {
        runnerId: `${input.credential.deviceId}-jobs`,
        capabilities: { 'container.engine': 'docker' },
        slots: 2,
      },
      profiles: [
        {
          name: 'profile-1',
          slotCost: 1,
          maxAttempts: 1,
          executionTimeout: '1h',
          scheduleTimeout: '1h',
          idempotencyTtl: 60_000,
        },
      ],
      ready: Promise.resolve(),
      closed: jobWorkerClosed.promise,
      async close() {
        drainStarted.resolve();
        await allowDrain.promise;
        jobWorkerClosed.resolve({ cause: 'requested' });
      },
    }));
    const daemon = startHostDaemon({
      relayUrl,
      runtimeHost: { modulePath: childModule },
      jobWorker: { start: startJobWorker },
      onEvent: (event) => events.push(event),
    });

    const firstControl = await nextControl.promise;
    const [readyFrame] = (await once(firstControl, 'message')) as [Uint8Array<ArrayBuffer>];
    const ready: unknown = JSON.parse(Buffer.from(readyFrame).toString());
    expect(ready).toMatchObject({ type: 'ready', deviceId: 'device-1' });
    // A compute-only daemon advertises no agent capability, so the API mints no agent grant.
    expect(ready).not.toHaveProperty('capabilities');
    await daemon.ready;

    const offer = (sessionId: string) => ({
      v: 1,
      type: 'offer',
      sessionId,
      runtimeVersion: 'test-version',
      runtimeUrl: new URL(`/v1/agents/sessions/${sessionId}/host/runtime`, relayUrl).href.replace('http:', 'ws:'),
      fileSystemUrl: new URL(`/v1/agents/sessions/${sessionId}/host/fs`, relayUrl).href.replace('http:', 'ws:'),
      runtimeAuthorization: 'r'.repeat(32),
      fileSystemAuthorization: 'f'.repeat(32),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    firstControl.send(JSON.stringify(offer('session-1')));
    const [acceptedFrame] = (await once(firstControl, 'message')) as [Uint8Array<ArrayBuffer>];
    expect(JSON.parse(Buffer.from(acceptedFrame).toString())).toMatchObject({ type: 'accept', sessionId: 'session-1' });
    const runtimeRoute = '/v1/agents/sessions/session-1/host/runtime';
    await vi.waitFor(() => {
      expect(routes.has(runtimeRoute)).toBe(true);
    });
    routes.get(runtimeRoute)?.send('crash');
    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: 'session',
        sessionId: 'session-1',
        state: 'disconnected',
        code: 'CHILD_EXIT',
      });
    });
    expect(firstControl.readyState).toBe(WebSocket.OPEN);

    firstControl.send(JSON.stringify(offer('session-2')));
    const [secondAcceptedFrame] = (await once(firstControl, 'message')) as [Uint8Array<ArrayBuffer>];
    expect(JSON.parse(Buffer.from(secondAcceptedFrame).toString())).toMatchObject({
      type: 'accept',
      sessionId: 'session-2',
    });

    firstControl.close(1012, 'relay restarting');
    const secondControl = await reconnectedControl.promise;
    const [secondReadyFrame] = (await once(secondControl, 'message')) as [Uint8Array<ArrayBuffer>];
    expect(JSON.parse(Buffer.from(secondReadyFrame).toString())).toMatchObject({ type: 'ready', deviceId: 'device-1' });

    const daemonClosing = daemon.close();
    await drainStarted.promise;
    expect(startJobWorker).toHaveBeenCalledWith({
      apiUrl: relayUrl,
      credential: { v: 1, deviceId: 'device-1', credential },
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'jobs', state: 'ready', runnerId: 'device-1-jobs', slots: 2 }),
    );
    await vi.waitFor(() => {
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'jobs', state: 'draining', runnerId: 'device-1-jobs' }),
      );
    });
    allowDrain.resolve();
    await daemonClosing;
    expect(await daemon.closed).toEqual({ cause: 'requested' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'jobs', state: 'stopped' }));
    expect(JSON.stringify(events)).not.toContain(credential);
  }, 15_000);
});
