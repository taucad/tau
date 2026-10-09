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
import workbenchBundles from '@taucad/workbench/agent/resources.js';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { connectMachineChannel, defineMachine } from '@taucad/runtime/machine';
import type { MachineArtifactReference } from '@taucad/runtime/machine';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createFileSystemBridgeProxy } from '@taucad/runtime/filesystem';
import type { FileSystemBridgeConnection } from '@taucad/runtime/filesystem';
import type * as runtimeFilesystem from '@taucad/runtime/filesystem';
import { z } from 'zod';

import { startHostDaemon } from '#host-daemon.js';
import type { HostDaemonEvent } from '#host-daemon.js';
import { writeHostCredential } from '#credential-store.js';
import * as revisions from '#revisions.js';
import * as agentTools from '#agent-tools.js';
import * as agentServer from '#agent-server.js';
import * as machineHost from '#machine-host.js';
import * as projectHosts from '#project-host.js';
import type { HostJobWorkerFactory } from '#job-worker.js';

/* Observe the filesystem the daemon binds to its runtime child, without changing
 * it: the captured thunk is the connection that child's bridge opens. */
const runtimeFileSystemOpens = vi.hoisted(() => [] as Array<() => FileSystemBridgeConnection>);
vi.mock('@taucad/runtime/filesystem', async (importOriginal) => {
  const original = await importOriginal<typeof runtimeFilesystem>();
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
/* Observe the artifact reader the daemon hands its machine runtime, without changing it. */
const machineRuntimeSpy = vi.spyOn(machineHost, 'createNodeMachineRuntime');
/* Captured before the spy replaces it: a case that counts subscriptions still
 * has to build the real revision tree around the real launcher. */
const realCreateProjectRevisions = revisions.createProjectRevisions;
const revisionsSpy = vi.spyOn(revisions, 'createProjectRevisions');
/* Observe the launcher the daemon serves on its agent channel, without changing it. */
const agentServerSpy = vi.spyOn(agentServer, 'startAgentServer');
/* Observe the credential port and model transport the daemon gives its project host. */
const projectHostSpy = vi.spyOn(projectHosts, 'createProjectHost');

let temporaryDirectory: string | undefined;
const originalWorkingDirectory = process.cwd();
const resources: Array<{ close(): void }> = [];

afterEach(async () => {
  delete process.env['TAU_CONFIG_DIR'];
  delete process.env['TAU_SECRET_VAULT'];
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

const fixtureConfiguration = defineConfiguration({
  id: 'fixture.configuration',
  version: '1',
  schema: z.strictObject({}),
  ui: { version: 1, rjsf: {} },
});

/* The daemon only lists what `--machines` admitted; the host names no real provider. */
const fixtureMachine = defineMachine({
  id: 'fixture-printer',
  name: 'Fixture printer',
  version: '1',
  protocolVersion: 2,
  vendor: 'fixture',
  manifest: {
    version: 3,
    identity: {
      typeId: 'fixture.printer',
      vendor: 'fixture',
      model: 'fixture-printer',
      displayName: 'Fixture printer',
    },
    connection: { transport: 'network', exclusive: false, opening: 'nothing', identity: 'authenticated' },
    axes: [],
    components: [{ id: 'controller', label: 'Controller', kind: 'controller' }],
    processes: [
      {
        type: 'fff',
        version: 1,
        geometry: {
          unit: 'mm',
          buildVolume: { x: 200, y: 200, z: 200 },
          enclosure: { outer: { x: 300, y: 300, z: 400 }, enclosed: false, doors: [] },
          kinematics: 'cartesian-bedslinger',
          bedMotion: 'y',
          origin: 'front-left',
          toolheadHome: { x: 1, y: 1, z: 200 },
          materialSystemMount: 'none',
        },
        filamentDiameter: { value: 1.75, unit: 'mm' },
        bed: { maximumTemperature: { value: 100, unit: 'Cel' }, plates: [{ id: 'smooth', label: 'Smooth plate' }] },
        chamber: { enclosed: false, heated: false },
        speedProfiles: [],
        slicing: {
          recommended: {
            layerHeight: { value: 0.2, unit: 'mm' },
            walls: 2,
            infillPercent: 15,
            nozzleTemperature: { value: 210, unit: 'Cel' },
            bedTemperature: { value: 60, unit: 'Cel' },
          },
          presets: [
            { id: 'fast', label: 'Fast', layerHeight: { value: 0.28, unit: 'mm' } },
            { id: 'standard', label: 'Standard', layerHeight: { value: 0.2, unit: 'mm' } },
            { id: 'fine', label: 'Fine', layerHeight: { value: 0.12, unit: 'mm' } },
          ],
        },
      },
    ],
    actions: [],
    holds: [],
    jobs: { type: 'unsupported' },
    stop: { motion: 'halts', spindle: 'none', heaters: 'off', position: 'may-be-lost', recovery: [] },
    observations: [],
    qualifications: [],
  },
  bindingConfiguration: fixtureConfiguration,
  submissionConfiguration: fixtureConfiguration,
  async *discover() {
    yield* [];
  },
  async connect() {
    throw new Error('The fixture printer does not connect.');
  },
});

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
  /** Every plain HTTP request the daemon made: method, path and query, and its `authorization`. */
  readonly requests: Array<{ readonly line: string; readonly authorization: string | undefined }>;
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
  const requests: StubRelay['requests'] = [];
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
  httpServer.on('request', (request, response) => {
    requests.push({
      line: `${request.method ?? ''} ${request.url ?? ''}`,
      authorization: request.headers.authorization,
    });
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
    requests,
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
  it('forwards the published workbench skill into its real tool registry', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-workbench-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const relay = await startRelay();
    registrySpy.mockClear();
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });
    const daemon = startHostDaemon({
      relayUrl: relay.url,
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
      agent: await agentOptionsIn(temporaryDirectory),
      systemSkillBundles: workbenchBundles,
    });
    try {
      await daemon.ready;
      expect(registrySpy.mock.lastCall?.[0]?.systemSkillBundles).toEqual(workbenchBundles);
      const { registry } = requiredDaemonComposition();
      const activated = await registry.invoke({
        toolCallId: 'workbench-skill',
        toolName: 'use_skill',
        input: { skillName: 'workbench' },
        signal: new AbortController().signal,
      });
      expect(activated.isError).toBe(false);
      expect(JSON.stringify(activated.content)).toContain('Read before you rearrange');
    } finally {
      await daemon.close();
    }
  });

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
        toolName: 'evaluate_model',
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
        release: async (): Promise<void> => {
          revisionCloseEntered.resolve();
          await allowRevisionClose.promise;
          await tree.release();
          throw new Error('revision close failed after drain');
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

  it("should open the machine store under the config directory, serve the machines route and read only its own project's artifacts by digest", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-machines-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    /* The daemon picks the keychain on macOS; no test may touch a person's keychain. */
    process.env['TAU_SECRET_VAULT'] = 'memory';
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });

    const events: HostDaemonEvent[] = [];
    const agentOptions = await agentOptionsIn(temporaryDirectory);
    const projectId = 'proj_000000000000000000001';
    await writeFile(join(agentOptions.workspaceRoot, 'tau.json'), JSON.stringify({ id: projectId }));
    machineRuntimeSpy.mockClear();
    const daemon = startHostDaemon({
      relayUrl: new URL('http://127.0.0.1:1'),
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-failing-child.mjs', import.meta.url)) },
      agent: { ...agentOptions, machines: { providers: [fixtureMachine()] } },
      onEvent: (event) => events.push(event),
    });
    await daemon.ready;
    const agentReady = events.find(
      (event): event is Extract<HostDaemonEvent, { readonly type: 'agent' }> => event.type === 'agent',
    );
    const origin = new URL(agentReady?.url ?? 'http://127.0.0.1:0');
    /* The per-user store every Tau host on this computer shares, not a workspace's. */
    expect(JSON.parse(await readFile(join(temporaryDirectory, 'machines', 'store.json'), 'utf8'))).toMatchObject({
      version: 1,
    });

    /* `tau serve --machines`: the probe answers, the socket upgrades, the host
     * lists what the flag admitted — and the tool registry was offered the
     * same facet, with the served project's id for `request_job`. */
    const probe = await fetch(new URL('/machines', origin), { headers: { authorization: `Bearer ${agentToken}` } });
    expect(probe.status).toBe(204);
    const socket = new WebSocket(new URL('/machines', origin).href.replace('http:', 'ws:'), {
      headers: { authorization: `Bearer ${agentToken}` },
    });
    /* Wrapped before `open`, as the browser transport does: the host greets
     * the socket the instant the upgrade completes, and `ws` drops a frame
     * that lands with no listener. */
    const client = connectMachineChannel(socket);
    try {
      const providers = await client.listProviders({});
      expect(providers.map((provider) => provider.id)).toEqual(['fixture-printer']);
      await expect(client.list({})).resolves.toMatchObject({ entries: [] });
    } finally {
      client.close();
    }
    expect(registrySpy.mock.calls.at(-1)?.[0]).toMatchObject({ projectId, machines: { available: true } });

    const readArtifact = machineRuntimeSpy.mock.calls.at(-1)?.[0].readArtifact;
    if (readArtifact === undefined) {
      throw new Error('The daemon composed no machine runtime.');
    }
    const digestOf = (bytes: Uint8Array<ArrayBuffer>): string =>
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const plate = new TextEncoder().encode('sliced plate');
    await writeFile(join(agentOptions.workspaceRoot, 'plate.gcode.3mf'), plate);
    /* A candidate turn slices into its checkout, which this daemon keeps under its config directory. */
    const candidateSlice = new TextEncoder().encode('candidate slice');
    const candidateArtifacts = join(
      temporaryDirectory,
      'checkouts',
      'workspace',
      'candidate-1',
      '.tau',
      'artifacts',
      'a1',
    );
    await mkdir(candidateArtifacts, { recursive: true });
    await writeFile(join(candidateArtifacts, 'slice.gcode.3mf'), candidateSlice);
    const artifact = (overrides: Partial<Record<'projectId' | 'path' | 'digest', string>>): MachineArtifactReference =>
      // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- plain fixture data; the reader reads only the project, path and digest.
      ({
        projectId,
        path: 'plate.gcode.3mf',
        digest: digestOf(plate),
        length: plate.byteLength,
        ...overrides,
      }) as MachineArtifactReference;
    const { signal } = new AbortController();
    const read = await readArtifact(artifact({}), signal);
    expect(Buffer.from(read).toString('utf8')).toBe('sliced plate');
    const fromCheckout = await readArtifact(
      artifact({ path: '.tau/artifacts/a1/slice.gcode.3mf', digest: digestOf(candidateSlice) }),
      signal,
    );
    expect(Buffer.from(fromCheckout).toString('utf8')).toBe('candidate slice');
    await expect(readArtifact(artifact({ digest: `sha256:${'0'.repeat(64)}` }), signal)).rejects.toThrow(
      'MACHINE_ARTIFACT_NOT_FOUND',
    );
    await expect(readArtifact(artifact({ path: 'missing.gcode.3mf' }), signal)).rejects.toThrow(
      'MACHINE_ARTIFACT_NOT_FOUND',
    );
    /* The same path and bytes, named by another project, are never this root's to hand out. */
    await expect(readArtifact(artifact({ projectId: 'proj_000000000000000000002' }), signal)).rejects.toThrow(
      'MACHINE_ARTIFACT_NOT_FOUND',
    );

    await daemon.close();
    expect(await daemon.closed).toEqual({ cause: 'requested' });
  }, 20_000);

  it('should warn and keep serving without machines while another Tau app owns the machine store', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-machines-owned-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.env['TAU_SECRET_VAULT'] = 'memory';
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
    });
    /* The desktop app, say, already holds the store's writer lock. */
    const authorityRoot = join(temporaryDirectory, 'machines', 'authority');
    await mkdir(authorityRoot, { recursive: true, mode: 0o700 });
    const owner = await acquireNodeAuthorityWriter({ authorityRoot });
    try {
      const events: HostDaemonEvent[] = [];
      registrySpy.mockClear();
      const daemon = startHostDaemon({
        relayUrl: new URL('http://127.0.0.1:1'),
        runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-failing-child.mjs', import.meta.url)) },
        agent: { ...(await agentOptionsIn(temporaryDirectory)), machines: { providers: [fixtureMachine()] } },
        onEvent: (event) => events.push(event),
      });
      await daemon.ready;
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'warning',
          code: 'MACHINE_STORE_OWNED_ELSEWHERE',
          message: expect.stringContaining('machines.unavailable (owned-elsewhere)') as string,
        }),
      );
      const agentReady = events.find(
        (event): event is Extract<HostDaemonEvent, { readonly type: 'agent' }> => event.type === 'agent',
      );
      const origin = new URL(agentReady?.url ?? 'http://127.0.0.1:0');
      /* No machines route and no machine tools; the agent channel still answers. */
      const probe = await fetch(new URL('/machines', origin), { headers: { authorization: `Bearer ${agentToken}` } });
      expect(probe.status).toBe(404);
      expect(registrySpy.mock.calls.at(-1)?.[0].machines).toBeUndefined();
      const agent = new WebSocket(new URL('/agent', origin).href.replace('http:', 'ws:'), {
        headers: { authorization: `Bearer ${agentToken}` },
      });
      const hello = once(agent, 'message');
      try {
        await once(agent, 'open');
        await expect(Promise.race([hello, delay(5000, 'no-hello')])).resolves.not.toBe('no-hello');
      } finally {
        agent.close();
      }
      await expect(Promise.race([daemon.closed, delay(50).then(() => 'still-running')])).resolves.toBe('still-running');

      await daemon.close();
      expect(await daemon.closed).toEqual({ cause: 'requested' });
    } finally {
      await owner.release();
    }
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
  /* RH-A14 (RH-S6): the relay revoked the stored credential; until pairing returns a new one the daemon admits no
   * Tau run on it, so the served launcher refuses a start with HOST_NOT_PAIRED. */
  it('should refuse start with HOST_NOT_PAIRED while the daemon re-pairs', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-repair-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'revoked-credential-value-that-never-enters-a-url',
    });

    /* A relay that rejects the stored credential and then never approves the new pairing. */
    const httpServer = createServer((request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'http://relay.invalid');
      if (request.method === 'POST' && pathname === '/v1/agents/pairings') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            deviceCode: 'device-code-0123456789',
            userCode: 'ABCD-1234',
            verificationUri: 'https://tau.example/pair',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            pollInterval: 250,
          }),
        );
        return;
      }
      if (request.method === 'POST' && pathname === '/v1/agents/pairings/token') {
        response.writeHead(202).end();
        return;
      }
      response.writeHead(404).end();
    });
    resources.push(httpServer);
    httpServer.on('upgrade', (_request, socket) => {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new TypeError('Expected a TCP relay address.');
    }
    const events: HostDaemonEvent[] = [];
    agentServerSpy.mockClear();
    const daemon = startHostDaemon({
      relayUrl: new URL(`http://127.0.0.1:${String(address.port)}`),
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
      agent: { ...(await agentOptionsIn(temporaryDirectory)), testModel: false },
      onEvent: (event) => events.push(event),
    });
    await daemon.ready;
    await vi.waitFor(
      () => {
        expect(events).toContainEqual(expect.objectContaining({ type: 'pairing', userCode: 'ABCD-1234' }));
      },
      { timeout: 10_000 },
    );
    const launcher = agentServerSpy.mock.calls.at(-1)?.[0].launcher;
    if (launcher === undefined) {
      throw new TypeError('Expected the daemon to serve its launcher.');
    }

    await expect(
      launcher.execute({
        type: 'start',
        commandId: 'start-while-repairing',
        payload: {
          trigger: 'submit',
          chatId: 'chat-repair',
          runId: 'run-repair',
          message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
        },
      }),
    ).resolves.toMatchObject({ status: 'refused', effect: 'not-applied', code: 'HOST_NOT_PAIRED' });

    await daemon.close();
    expect(await daemon.closed).toEqual({ cause: 'requested' });
  }, 30_000);

  /* W6.r1 round 3 (GI-Q6): the account the pairing exchange returned, stored with the credential, is the principal
   * the daemon's credential port and its funded transport name. */
  it('should name the stored account as the principal of its credential and funded transport', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-principal-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    const relay = await startRelay();
    await writeHostCredential({
      v: 1,
      deviceId: 'device-1',
      credential: 'secret-credential-value-that-never-enters-a-url',
      accountId: 'account-1',
    });
    projectHostSpy.mockClear();
    const daemon = startHostDaemon({
      relayUrl: relay.url,
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
      agent: { ...(await agentOptionsIn(temporaryDirectory)), tauCloudEnabled: true },
    });
    await daemon.ready;
    const options = projectHostSpy.mock.calls.at(-1)?.[0];
    if (options === undefined) {
      throw new TypeError('Expected the daemon to open a project host.');
    }

    await vi.waitFor(() => {
      expect(options.credential()).toMatchObject({ mode: 'paired', principal: 'account-1' });
    });
    const { funding } = options.modelTransport as { readonly funding?: { principal: () => Promise<unknown> } };
    await expect(funding?.principal()).resolves.toBe('account-1');

    await daemon.close();
  }, 30_000);

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
   * D21: a cloud host serves the clone its entrypoint made, as the project that
   * clone is, and backs it up with the push credential it was provisioned —
   * over that project's git routes, from the remote the clone already has,
   * without the *Connect Tau Cloud* registration a push credential cannot make.
   */
  it.runIf(hasGit)(
    'syncs a cloned Tau Cloud project over its own git route with the push credential',
    async () => {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-cloud-clone-'));
      process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
      process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
      const relay = await startRelay();
      const projectId = 'proj-cloud';
      const pushCredential = 'taugit_push-credential-for-proj-cloud';
      const workspaceRoot = join(temporaryDirectory, projectId);
      await mkdir(workspaceRoot);
      execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: workspaceRoot });
      execFileSync('git', ['remote', 'add', 'tau', tauRemoteUrl(relay.url.origin, projectId)], { cwd: workspaceRoot });
      await writeHostCredential({ v: 1, deviceId: 'agent_cloud', credential: 'device-credential-for-the-relay-only' });

      const agentOptions = await agentOptionsIn(temporaryDirectory);
      const daemon = startHostDaemon({
        relayUrl: relay.url,
        runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
        agent: { ...agentOptions, workspaceRoot, tauApiToken: pushCredential },
      });
      await daemon.ready;

      await expect
        .poll(() => relay.requests.find((request) => request.line.includes('/info/refs')), { timeout: 15_000 })
        .toEqual({
          line: `GET /v1/git/${projectId}.git/info/refs?service=git-upload-pack`,
          authorization: `Bearer ${pushCredential}`,
        });
      expect(relay.requests.filter((request) => request.line.startsWith('PUT /v1/projects'))).toEqual([]);
      expect(relay.requests.map((request) => request.authorization)).not.toContain(
        'Bearer device-credential-for-the-relay-only',
      );

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
   * The API closes a route with 4003 when the device behind it is revoked —
   * the code the control socket already treats as final. The session ends with
   * it, now, rather than idling its other routes until the 15 s reap.
   */
  it('ends the whole session as REVOKED when the relay closes one route with 4003', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-revoked-route-'));
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
    const agentSocket = await relay.route(routePath('session-1', 'agent'));

    const runtimeSocket = await relay.route(routePath('session-1', 'runtime'));
    runtimeSocket.close(4003, 'device revoked');
    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: 'session',
        sessionId: 'session-1',
        state: 'disconnected',
        code: 'REVOKED',
      });
    });
    expect(agentSocket.readyState).not.toBe(WebSocket.OPEN);

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

    /* The page closed one route; session-1's other routes stay open, so its drain
     * (and its `disconnected` event) cannot finish. The slot must free anyway.
     * A loaded runner can take longer than any fixed delay to deliver the close,
     * so re-offer on BUSY and require the accept before session-1 disconnects. */
    const agentSocket = await relay.route(routePath('session-1', 'agent'));
    agentSocket.close(1000, 'page closed');
    const session2Frames = (): unknown[] =>
      relay.controlFrames.filter((frame) => (frame as { sessionId?: string }).sessionId === 'session-2');
    await vi.waitFor(
      async () => {
        const answered = session2Frames().length;
        control.send(JSON.stringify(agentOffer(relay.url, 'session-2')));
        await vi.waitFor(() => {
          expect(session2Frames().length).toBeGreaterThan(answered);
        });
        expect(session2Frames().at(-1)).toEqual({ v: 1, type: 'accept', sessionId: 'session-2' });
      },
      { timeout: 10_000, interval: 20 },
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'session', sessionId: 'session-1', state: 'disconnected' }),
    );

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

  /*
   * FX7 D3: a provisioned (cloud) host was never paired, so a refused device
   * credential means it was revoked. It exits rather than offering a pairing
   * code from a container that still holds a clone; a paired laptop keeps
   * re-pairing as before.
   */
  const revokeAndClose = async (pair: boolean | undefined) => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-daemon-revoked-'));
    process.env['TAU_CONFIG_DIR'] = temporaryDirectory;
    process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));
    await writeHostCredential({ v: 1, deviceId: 'device-1', credential: 'revoked-credential-value-32-chars-min' });
    const relay = await startRelay();
    const daemon = startHostDaemon({
      relayUrl: relay.url,
      runtimeHost: { modulePath: fileURLToPath(new URL('fixtures/runtime-host-proof-child.mjs', import.meta.url)) },
      ...(pair === undefined ? {} : { pair }),
    });
    await daemon.ready;
    const control = await relay.control;
    control.close(4401, 'device revoked');
    const closed = await daemon.closed;
    await daemon.close().catch(() => undefined);
    return { closed, pairingRequests: relay.requests.filter(({ line }) => line.includes('/v1/agents/pairings')) };
  };

  it('should exit on a refused credential and never pair when it is a provisioned host', async () => {
    const { closed, pairingRequests } = await revokeAndClose(false);

    expect(closed.cause).toBe('fatal');
    expect(closed.cause === 'fatal' ? closed.error.message : '').toContain('revoked');
    expect(pairingRequests).toEqual([]);
  }, 15_000);

  it('should still start pairing on a refused credential when it is a paired host', async () => {
    const { pairingRequests } = await revokeAndClose(undefined);

    expect(pairingRequests.map(({ line }) => line)).toEqual(['POST /v1/agents/pairings']);
  }, 15_000);

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

    const secondRuntimeRoute = '/v1/agents/sessions/session-2/host/runtime';
    await vi.waitFor(() => {
      expect(routes.has(secondRuntimeRoute)).toBe(true);
    });

    firstControl.close(1012, 'relay restarting');
    const secondControl = await reconnectedControl.promise;
    const [secondReadyFrame] = (await once(secondControl, 'message')) as [Uint8Array<ArrayBuffer>];
    expect(JSON.parse(Buffer.from(secondReadyFrame).toString())).toMatchObject({ type: 'ready', deviceId: 'device-1' });
    // Its relay lives on its own socket, so losing control to a restart does not end the session.
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'session', sessionId: 'session-2', state: 'disconnected' }),
    );
    expect(routes.get(secondRuntimeRoute)?.readyState).toBe(WebSocket.OPEN);

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
