import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { NodeFsProviderClient } from '@taucad/filesystem/backend';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';
import type { NodeFsWatchEvent } from '@taucad/filesystem/backend/node';
import { tauRemoteUrl } from '@taucad/revisions';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createFileSystemBridgeProxy } from '@taucad/runtime/filesystem';
import type { FileSystemBridgeConnection } from '@taucad/runtime/filesystem';

import { startHostDaemon } from '#host-daemon.js';
import type { HostDaemonEvent } from '#host-daemon.js';
import { writeHostCredential } from '#credential-store.js';
import * as revisions from '#revisions.js';
import * as agentTools from '#agent-tools.js';
import type { HostJobWorkerFactory } from '#job-worker.js';

/* Observe the filesystem the daemon binds to its runtime child, without changing
 * it: the captured thunk is the connection that child's bridge opens. */
const runtimeFileSystemOpens = vi.hoisted(() => [] as Array<() => FileSystemBridgeConnection>);
vi.mock('@taucad/runtime/filesystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('@taucad/runtime/filesystem')>();
  return {
    ...original,
    fromFileSystemBridge: (open: () => FileSystemBridgeConnection) => {
      runtimeFileSystemOpens.push(open);
      return original.fromFileSystemBridge(open);
    },
  };
});

/* Observe the tool-surface decision the daemon forwards, without changing it. */
const registrySpy = vi.spyOn(agentTools, 'createHostToolRegistry');
/* Captured before the spy replaces it: a case that counts subscriptions still
 * has to build the real revision tree around the real launcher. */
const realCreateProjectRevisions = revisions.createProjectRevisions;
const revisionsSpy = vi.spyOn(revisions, 'createProjectRevisions');

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

/** A machine with no `git` records nothing, so the native rows sit out. */
const hasGit = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

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
  /* Anything that is not an upgrade is refused rather than left hanging: this
   * origin is also the Tau API, so a daemon may ask it for a Git advertisement,
   * and a socket that never answers would hold the close cut open. */
  httpServer.on('request', (_request, response) => {
    response.statusCode = 404;
    response.end();
  });
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

/** Arm the real host watch, including the macOS FSEvents liveness handshake. */
const armDaemonWatch = async (
  reader: NodeFsProviderClient,
  writer: NodeFsProviderClient,
): Promise<{ readonly events: NodeFsWatchEvent[]; readonly unsubscribe: () => void }> => {
  const events: NodeFsWatchEvent[] = [];
  const unsubscribe = await reader.watch({ paths: [''], recursive: true }, (event) => events.push(event));
  const deadline = Date.now() + 10_000;
  while (!events.some((event) => event.type === 'change' && event.path === '.authority-watch-probe')) {
    if (Date.now() > deadline) {
      throw new Error(`Daemon authority watch never became live: ${JSON.stringify(events)}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- a real macOS watcher needs a delivered probe before the observed write.
    await writer.writeFile('.authority-watch-probe', String(Date.now()));
    // oxlint-disable-next-line no-await-in-loop -- liveness probing is deliberately paced.
    await delay(100);
  }
  events.length = 0;
  return { events, unsubscribe };
};

/** Return the real daemon composition captured by the two narrow observation spies. */
const requiredDaemonComposition = () => {
  const registryResult = registrySpy.mock.results.at(-1);
  const revisionCall = revisionsSpy.mock.calls.at(-1)?.[0];
  const filesystem = revisionCall?.filesystem;
  const useFileSystem = revisionCall?.useFileSystem;
  const checkoutMutation = revisionCall?.checkoutMutation;
  const checkouts = revisionCall?.checkouts;
  if (registryResult?.type !== 'return' || !filesystem || !useFileSystem || !checkoutMutation || !checkouts) {
    throw new TypeError('Expected the daemon filesystem composition.');
  }
  return {
    registry: registryResult.value,
    filesystem,
    useFileSystem,
    checkoutMutation,
    checkouts,
  };
};

type ShutdownRuntimeClient = agentTools.HostRuntimeClient & {
  shutdown(options?: { drain?: boolean }): Promise<void>;
};

/** Whether the tool-facing projection retains the daemon-owned shutdown method. */
const isShutdownRuntimeClient = (client: agentTools.HostRuntimeClient): client is ShutdownRuntimeClient =>
  'shutdown' in client && typeof client.shutdown === 'function';

/** Narrow the tool-facing runtime projection back to the daemon-owned lifecycle handle. */
const requireShutdownRuntimeClient = (client: agentTools.HostRuntimeClient): ShutdownRuntimeClient => {
  if (!isShutdownRuntimeClient(client)) {
    throw new TypeError('Expected the daemon runtime lifecycle handle.');
  }
  return client;
};

type TerminableRuntimeClient = agentTools.HostRuntimeClient & Pick<RuntimeClient, 'lifecycleState' | 'terminate'>;

/** Whether the tool-facing projection retains the client's own termination state. */
const isTerminableRuntimeClient = (client: agentTools.HostRuntimeClient): client is TerminableRuntimeClient =>
  'terminate' in client && typeof client.terminate === 'function';

/** Narrow the tool-facing runtime projection back to the client's own termination state. */
const requireTerminableRuntimeClient = (client: agentTools.HostRuntimeClient): TerminableRuntimeClient => {
  if (!isTerminableRuntimeClient(client)) {
    throw new TypeError('Expected the daemon runtime client.');
  }
  return client;
};

describe('startHostDaemon', () => {
  it('should bind the real runtime child to the daemon filesystem authority', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-runtime-authority-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const originalExecArgv = process.execArgv;
    process.execArgv = [...originalExecArgv, '--import', 'tsx'];
    registrySpy.mockClear();
    const relay = await startRelay();
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });
    const daemon = startHostDaemon({
      relayUrl: relay.url,
      runtimeHost: { modulePath: fileURLToPath(new URL('../../cli/src/host-runtime-child.ts', import.meta.url)) },
      agent: { ...(await agentOptionsIn(temporaryDirectory)), testModel: false },
    });

    let outcome: Awaited<ReturnType<ReturnType<typeof agentTools.createHostToolRegistry>['invoke']>>;
    try {
      await daemon.ready;
      const registryResult = registrySpy.mock.results.at(-1);
      if (registryResult?.type !== 'return') {
        throw new TypeError('Expected the daemon tool registry.');
      }
      const registry = registryResult.value;
      const create = await registry.invoke({
        toolCallId: 'runtime-authority-create',
        toolName: 'create_file',
        input: {
          targetFile: 'main.scad',
          content: 'difference(){ cylinder(d=34,h=14,$fn=6); cylinder(d=8,h=16,$fn=32); }\n',
        },
        signal: new AbortController().signal,
      });
      expect(create.isError).toBe(false);
      outcome = await registry.invoke({
        toolCallId: 'runtime-authority-render',
        toolName: 'get_kernel_result',
        input: { targetFile: 'main.scad' },
        signal: new AbortController().signal,
      });
    } finally {
      await daemon.close();
      process.execArgv = originalExecArgv;
    }

    const serialized = JSON.stringify(outcome.content);
    expect(outcome.isError, serialized).toBe(false);
    expect(serialized).toContain('"success":true');
    expect(serialized).toContain('"status":"ready"');
  }, 120_000);

  it('should keep tool and revision checkout writes on one daemon authority until close', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-authority-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    registrySpy.mockClear();
    revisionsSpy.mockClear();
    const relay = await startRelay();
    const events: HostDaemonEvent[] = [];
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, events);
    await daemon.ready;

    const { registry, filesystem, useFileSystem, checkouts } = requiredDaemonComposition();
    expect(filesystem).toBeTypeOf('function');
    expect(useFileSystem).toBeTypeOf('function');
    const agentConfiguration = await agentOptionsIn(temporaryDirectory);
    const { workspaceRoot } = agentConfiguration;
    const candidateRoot = join(temporaryDirectory, 'candidate');
    await mkdir(candidateRoot);
    const candidate = {
      id: 'candidate-1',
      projectId: 'workspace',
      root: candidateRoot,
      kind: 'linked',
      branch: 'candidate',
      baseRevisionId: undefined,
    } as const;

    await useFileSystem(candidate, async (provider) => {
      await provider.writeFile('prepared.txt', 'prepared\n');
    });
    expect(await readFile(join(candidateRoot, 'prepared.txt'), 'utf8')).toBe('prepared\n');
    expect(() => {
      void filesystem(candidate);
    }).toThrow(/unadmitted/u);

    checkouts.set('run-candidate', {
      cwd: candidateRoot,
      mode: 'candidate',
      baseRevisionId: '',
    });
    checkouts.set('run-candidate-2', {
      cwd: candidateRoot,
      mode: 'candidate',
      baseRevisionId: '',
    });
    const candidateWrite = await registry.invoke({
      toolCallId: 'candidate-write',
      toolName: 'create_file',
      input: { targetFile: 'agent.txt', content: 'candidate\n' },
      runId: 'run-candidate',
      signal: new AbortController().signal,
    });
    expect(candidateWrite.isError).toBe(false);
    expect(await readFile(join(candidateRoot, 'agent.txt'), 'utf8')).toBe('candidate\n');
    checkouts.delete('run-candidate');
    expect(await Promise.resolve(filesystem(candidate))).toBeDefined();
    checkouts.delete('run-candidate-2');
    expect(() => {
      void filesystem(candidate);
    }).toThrow(/unadmitted/u);

    const live = {
      id: 'live',
      projectId: 'workspace',
      root: workspaceRoot,
      kind: 'live',
      branch: 'main',
      baseRevisionId: undefined,
    } as const;
    const [first, second] = await Promise.all([Promise.resolve(filesystem(live)), Promise.resolve(filesystem(live))]);
    expect(first).toBeInstanceOf(NodeFsProviderClient);
    expect(second).toBeInstanceOf(NodeFsProviderClient);
    if (!(first instanceof NodeFsProviderClient) || !(second instanceof NodeFsProviderClient)) {
      throw new TypeError('Expected daemon authority clients.');
    }
    const expected = new TextEncoder().encode('before\n');
    await first.writeFile('record.json', expected);
    const { events: watchEvents, unsubscribe } = await armDaemonWatch(first, second);
    const watchedWrite = await registry.invoke({
      toolCallId: 'live-watch-write',
      toolName: 'create_file',
      input: { targetFile: 'watched.txt', content: 'watched\n' },
      signal: new AbortController().signal,
    });
    expect(watchedWrite.isError).toBe(false);
    await vi.waitFor(
      () => {
        expect(watchEvents).toContainEqual({ type: 'change', path: 'watched.txt', kind: 'file' });
      },
      { timeout: 10_000 },
    );
    unsubscribe();
    const outcomes = await Promise.all([
      first.writeFileChecked({
        path: 'record.json',
        data: 'first\n',
        preconditions: [{ path: 'record.json', expected }],
      }),
      second.writeFileChecked({
        path: 'record.json',
        data: 'second\n',
        preconditions: [{ path: 'record.json', expected }],
      }),
    ]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual(['applied', 'conflict']);
    const committed = outcomes[0].status === 'applied' ? 'first\n' : 'second\n';

    const canonicalWorkspaceRoot = await realpath(workspaceRoot);
    const authorityRoot = join(
      temporaryDirectory,
      'filesystem-authority',
      createHash('sha256').update(canonicalWorkspaceRoot).digest('hex'),
    );
    await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });

    await daemon.close();
    const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
    await replacement.release();
    expect(await daemon.closed).toEqual({ cause: 'requested' });

    await expect(first.readFile('record.json', 'utf8')).rejects.toBeInstanceOf(Error);
    revisionsSpy.mockClear();
    const restarted = await startPairedAgentDaemon(temporaryDirectory, relay, events);
    await restarted.ready;
    const restartedRevisionCall = revisionsSpy.mock.calls.at(-1)?.[0];
    if (!restartedRevisionCall?.filesystem) {
      throw new TypeError('Expected restarted daemon filesystem composition.');
    }
    const restartedProvider = await Promise.resolve(restartedRevisionCall.filesystem(live));
    expect(await restartedProvider.readFile('record.json', 'utf8')).toBe(committed);
    await restarted.close();
    expect(await restarted.closed).toEqual({ cause: 'requested' });
  }, 30_000);

  it('should keep filesystem authority until revision shutdown settles', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-revision-drain-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    registrySpy.mockClear();
    const revisionCloseEntered = Promise.withResolvers<void>();
    const allowRevisionClose = Promise.withResolvers<void>();
    revisionsSpy.mockImplementationOnce((options) => {
      const tree = realCreateProjectRevisions(options);
      return {
        ...tree,
        record: (launcher) => {
          const recorded = tree.record(launcher);
          return {
            ...recorded,
            close: async (): Promise<void> => {
              revisionCloseEntered.resolve();
              await allowRevisionClose.promise;
              await recorded.close();
              throw new Error('revision close failed after drain');
            },
          };
        },
      };
    });
    const relay = await startRelay();
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);

    try {
      await daemon.ready;
      const registryResult = registrySpy.mock.results.at(-1);
      if (registryResult?.type !== 'return') {
        throw new TypeError('Expected the daemon tool registry.');
      }
      const write = await registryResult.value.invoke({
        toolCallId: 'revision-drain-write',
        toolName: 'create_file',
        input: { targetFile: 'pending.txt', content: 'accepted\n' },
        signal: new AbortController().signal,
      });
      expect(write.isError).toBe(false);

      const closing = daemon.close();
      await revisionCloseEntered.promise;
      const observeClose = async (): Promise<'closed'> => {
        await closing;
        return 'closed';
      };
      await expect(Promise.race([observeClose(), delay(50, 'pending')])).resolves.toBe('pending');

      const workspaceRoot = join(temporaryDirectory, 'workspace');
      const authorityRoot = join(
        temporaryDirectory,
        'filesystem-authority',
        createHash('sha256')
          .update(await realpath(workspaceRoot))
          .digest('hex'),
      );
      await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
        code: 'AUTHORITY_ALREADY_OWNED',
      });
      allowRevisionClose.resolve();
      await expect(closing).rejects.toThrow('revision close failed after drain');
      /* The launcher refused its own release, so it is not retired — and neither
       * is the authority its retried close cut still has to read through (C70).
       * Release on a settled shutdown is pinned by the checked-write case above.
       */
      await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
        code: 'AUTHORITY_ALREADY_OWNED',
      });
      const result = await daemon.closed;
      expect(result.cause).toBe('fatal');
      if (result.cause === 'fatal') {
        expect(result.error).toBeInstanceOf(AggregateError);
        expect(result.error.message).toBe('Tau Host shutdown did not release every accepted resource.');
      }
    } finally {
      allowRevisionClose.resolve();
      /* The launcher keeps refusing, so every re-attempt refuses with it. */
      await daemon.close().catch(() => undefined);
    }
  }, 30_000);

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

  it('forwards testModel as the host-owned geospecRunner decision, defaulting to on', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-test-model-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });
    const runtimeHost = {
      modulePath: fileURLToPath(new URL('fixtures/runtime-host-failing-child.mjs', import.meta.url)),
    };
    const relayUrl = new URL('http://127.0.0.1:1');

    registrySpy.mockClear();
    const withheld = startHostDaemon({
      relayUrl,
      runtimeHost,
      agent: { ...(await agentOptionsIn(join(temporaryDirectory, 'withheld'))), testModel: false },
      onEvent: () => undefined,
    });
    await withheld.ready;
    await withheld.close();
    expect(registrySpy).toHaveBeenLastCalledWith(expect.objectContaining({ geospecRunner: false }));

    registrySpy.mockClear();
    const offered = startHostDaemon({
      relayUrl,
      runtimeHost,
      agent: await agentOptionsIn(join(temporaryDirectory, 'offered')),
      onEvent: () => undefined,
    });
    await offered.ready;
    await offered.close();
    expect(registrySpy.mock.lastCall?.[0]?.geospecRunner).toBeUndefined();
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
    const ready = Buffer.from(readyFrame).toString();
    expect(JSON.parse(ready)).toMatchObject({
      type: 'ready',
      capabilities: { agent: { workspaceRoot: agent.workspaceRoot } },
    });
    /* Placement is not a mode any more (S11): the client learns where its chat
       works from the checkout registry, never from a capability array. */
    expect(ready).not.toContain('"revisions"');

    await daemon.close();
  }, 20_000);

  /* G0-2/W14: the runtime child executes project code the agent wrote, so the
   * daemon binds it the agent's view. The trusted planes beside it — the
   * parameter authority and the revisions engine — keep the working copy. */
  it('should bind the runtime child a masked view and keep the revisions filesystem raw', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-runtime-view-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const relay = await startRelay();
    registrySpy.mockClear();
    runtimeFileSystemOpens.length = 0;
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);
    await daemon.ready;

    const workspaceRoot = join(temporaryDirectory, 'workspace');
    await Promise.all([
      mkdir(join(workspaceRoot, '.git'), { recursive: true }),
      mkdir(join(workspaceRoot, '.tau'), { recursive: true }),
      mkdir(join(workspaceRoot, 'vendor', 'dep', '.git'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(workspaceRoot, '.git', 'config'), '[remote "origin"]\n'),
      writeFile(join(workspaceRoot, 'vendor', 'dep', '.git', 'config'), '[remote "vendored"]\n'),
      writeFile(join(workspaceRoot, '.tau', 'binding.json'), '{}\n'),
      writeFile(join(workspaceRoot, 'main.ts'), 'export const main = 1;\n'),
    ]);

    const runtimeClient = registrySpy.mock.lastCall?.[0]?.runtimeClient;
    if (!runtimeClient) {
      throw new TypeError('Expected the daemon to build its tool registry over a runtime client.');
    }
    await runtimeClient(workspaceRoot);

    const open = runtimeFileSystemOpens.at(-1);
    if (!open) {
      throw new TypeError('Expected the daemon to bind the runtime child a filesystem.');
    }
    const child = createFileSystemBridgeProxy(open());
    try {
      await expect(child.readFile('.git/config', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(child.readFile('vendor/dep/.git/config', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(child.exists('.tau/binding.json')).resolves.toBe(false);
      await expect(child.readFile('main.ts', 'utf8')).resolves.toBe('export const main = 1;\n');
    } finally {
      child.dispose();
    }

    /* The revisions engine owns `.git/**`, so its provider is still the checkout. */
    const { filesystem } = requiredDaemonComposition();
    const revisionProvider = await Promise.resolve(
      filesystem({
        id: 'live',
        projectId: 'workspace',
        root: workspaceRoot,
        kind: 'live',
        branch: 'main',
        baseRevisionId: undefined,
      }),
    );
    /* `toContain`, because the daemon's own `git init` writes its `[core]` block
     * into the same file this fixture seeded. */
    await expect(revisionProvider.readFile('.git/config', 'utf8')).resolves.toContain('[remote "origin"]');

    await daemon.close();
  }, 20_000);

  it('should retain candidate admission across overlapping revision and runtime shutdown', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-checkout-runtime-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const relay = await startRelay();
    registrySpy.mockClear();
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);
    await daemon.ready;

    const registryOptions = registrySpy.mock.lastCall?.[0];
    const runtimeClient = registryOptions?.runtimeClient;
    if (!runtimeClient) {
      throw new TypeError('Expected the daemon to build its tool registry over a runtime client.');
    }
    const { checkouts, filesystem, useFileSystem } = requiredDaemonComposition();
    const root = join(temporaryDirectory, 'checkouts', 'workspace', 'checkout-1');
    await mkdir(root, { recursive: true });
    const checkout = {
      id: 'checkout-1',
      projectId: 'workspace',
      root,
      kind: 'linked',
      branch: 'candidate',
      baseRevisionId: undefined,
    } as const;
    checkouts.set('run-1', { cwd: root, mode: 'candidate', baseRevisionId: '' });
    const provider = await Promise.resolve(filesystem(checkout));
    const client = requireShutdownRuntimeClient(await runtimeClient(root));
    expect(await runtimeClient(root)).toBe(client);
    const shutdownEntered = Promise.withResolvers<void>();
    const allowShutdown = Promise.withResolvers<void>();
    const actualShutdown = client.shutdown.bind(client);
    const shutdown = vi.spyOn(client, 'shutdown').mockImplementation(async (options) => {
      shutdownEntered.resolve();
      await allowShutdown.promise;
      await actualShutdown(options);
    });

    try {
      checkouts.delete('run-1');
      await shutdownEntered.promise;
      await useFileSystem(checkout, async (temporaryProvider) => {
        await temporaryProvider.writeFile('revision-settled-during-runtime-close.txt', 'settled\n');
      });
      expect(await readFile(join(root, 'revision-settled-during-runtime-close.txt'), 'utf8')).toBe('settled\n');
      expect(await Promise.resolve(filesystem(checkout))).toBeDefined();
      const closing = daemon.close();
      await expect(Promise.race([closing.then(() => 'closed'), delay(50, 'pending')])).resolves.toBe('pending');
      await provider.writeFile('during-runtime-close.txt', 'still admitted\n');
      allowShutdown.resolve();
      await closing;
      expect(shutdown).toHaveBeenCalledOnce();
      expect(await daemon.closed).toEqual({ cause: 'requested' });
      await expect(provider.readFile('during-runtime-close.txt', 'utf8')).rejects.toBeInstanceOf(Error);
    } finally {
      allowShutdown.resolve();
      await daemon.close();
    }
  }, 20_000);

  it('should reconnect the agent runtime after its socket closes while the child lives', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-runtime-reconnect-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const relay = await startRelay();
    registrySpy.mockClear();
    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);
    await daemon.ready;

    const runtimeClient = registrySpy.mock.lastCall?.[0]?.runtimeClient;
    if (!runtimeClient) {
      throw new TypeError('Expected the daemon to build its tool registry over a runtime client.');
    }
    const root = join(temporaryDirectory, 'workspace');
    try {
      const client = requireTerminableRuntimeClient(await runtimeClient(root));
      expect(await runtimeClient(root)).toBe(client);

      /* A dropped web socket with the child still alive terminates the client
       * and evicts nothing: `agentRuntimes` is cleared only on a child exit or
       * on the last candidate delete, so every later tool call would be handed
       * this same dead client. */
      client.terminate();
      const replacement = requireTerminableRuntimeClient(await runtimeClient(root));

      expect(replacement).not.toBe(client);
      expect(replacement.lifecycleState).not.toBe('terminated');

      /* Two tool calls waking from the same corpse share one reconnect: the
       * loser of that race would otherwise hold a live client no map can
       * reach, and nothing would ever terminate it. */
      replacement.terminate();
      const [first, second] = await Promise.all([runtimeClient(root), runtimeClient(root)]);

      expect(first).toBe(second);
      expect(requireTerminableRuntimeClient(first).lifecycleState).not.toBe('terminated');
    } finally {
      await daemon.close();
    }
  }, 20_000);

  /*
   * PH19 ruling 2 keeps the API's run directory free of content, so nothing it
   * receives may wait on a revision. The recorder's stream holds a terminal
   * marker until the turn's whole-tree capture is durable — a guarantee clients
   * need — and a reporter riding it both delays every directory update and
   * queues events for the length of the capture, past which the launcher's
   * fan-out errors the subscriber and the reporter never resubscribes.
   */
  it('reports runs from the launcher itself, never from the stream that waits for a revision', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-reporter-stream-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const relay = await startRelay();
    const subscriptions = { launcher: 0, recorded: 0 };
    revisionsSpy.mockImplementationOnce((options) => {
      const tree = realCreateProjectRevisions(options);
      return {
        ...tree,
        record: (launcher) => {
          const events = launcher.events.bind(launcher);
          /* Patched in place, not wrapped: the daemon holds this very object,
           * and counting subscriptions on a copy would not see the ones it
           * makes. */
          Object.assign(launcher, {
            events: (signal: AbortSignal) => {
              subscriptions.launcher += 1;
              return events(signal);
            },
          });
          const recorded = tree.record(launcher);
          return {
            ...recorded,
            events: (signal: AbortSignal) => {
              subscriptions.recorded += 1;
              return recorded.events(signal);
            },
          };
        },
      };
    });

    const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);
    await daemon.ready;
    /* Two on the launcher — the revision tree's own terminal-marker watch and
     * the run reporter — and none on the wrapper, which no client is listening
     * to yet. */
    expect(subscriptions).toEqual({ launcher: 2, recorded: 0 });

    await daemon.close();
  }, 20_000);

  /*
   * C67: a project `tau serve --ui` serves shows the Sync region, so *Connect
   * Tau Cloud* must be able to take. The daemon is already talking to the Tau
   * API — the relay it paired against — and that is the origin this project's
   * Hosted Remote hangs off; without it the connect actor throws
   * `INVALID_TRANSPORT` and the project can never be backed up.
   */
  it.runIf(hasGit)(
    'configures the Tau Cloud remote a served project connects to',
    async () => {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-connect-tau-'));
      process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
      process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
      const relay = await startRelay();
      let project: ReturnType<typeof realCreateProjectRevisions> | undefined;
      revisionsSpy.mockImplementationOnce((options) => {
        project = realCreateProjectRevisions(options);
        return project;
      });

      const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);
      await daemon.ready;
      await project!.channel.request({ command: 'connectRemote', kind: 'tau' });

      /* Git's own remotes list is the record (D29), so that is what is read —
       * and it is written before the registration this fixture's API never
       * answers, which is why nothing here waits for a `connected` phase. */
      const workspaceRoot = join(temporaryDirectory, 'workspace');
      await expect
        .poll(async () => readFile(join(workspaceRoot, '.git', 'config'), 'utf8').catch(() => ''), { timeout: 10_000 })
        .toContain(tauRemoteUrl(relay.url.origin, 'workspace'));

      await daemon.close();
    },
    30_000,
  );

  /*
   * C70: R13's pattern on the leg R13 did not cover.
   *
   * The close cut is the last thing that records what a served project changed,
   * and a store that refuses it rejects `launcher.close()`. A daemon that had
   * already dropped its launcher could never re-attempt that cut, so the bytes
   * were gone with the process; the ownership is retired only once the release
   * itself succeeded.
   */
  it.runIf(hasGit)(
    'keeps the project until its close cut succeeds, and re-attempts it',
    async () => {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-close-cut-'));
      process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
      process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
      const relay = await startRelay();
      let attempts = 0;
      revisionsSpy.mockImplementationOnce((options) => {
        const port = revisions.createProjectRevisionPort({
          workspaceRoot: options.workspaceRoot,
          projectId: 'workspace',
        });
        return realCreateProjectRevisions({
          ...options,
          port: {
            ...port,
            writeRevision: async () => {
              attempts += 1;
              throw new Error('the store is out of space');
            },
          },
        });
      });

      const daemon = await startPairedAgentDaemon(temporaryDirectory, relay, []);
      await daemon.ready;
      /* Something to record: a clean checkout has nothing to cut, and the
       * refusal under test is the cut's. */
      await writeFile(join(temporaryDirectory, 'workspace', 'part.ts'), 'export const part = 1;\n');

      await expect(daemon.close()).rejects.toThrow('out of space');
      const afterFirst = attempts;
      await expect(daemon.close()).rejects.toThrow('out of space');

      expect(afterFirst).toBeGreaterThan(0);
      expect(attempts).toBeGreaterThan(afterFirst);
    },
    60_000,
  );

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
