// @vitest-environment node
/**
 * The page side of the resident agent-host worker (W6 RH-S8–RH-S10): one worker per document, driven over a control
 * channel, with one agent-wire stream per client. The fake worker speaks the real control protocol and serves each
 * stream with `serveAgentChannel` over a scripted launcher.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { SourceLiveEvent, AgentLogEvent, ChannelServerHandle, HostRunSnapshot } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { serveAgentChannel } from '@taucad/agent-host/launcher';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import { agentWireVersion } from '@taucad/agent-host/wire';
import type { CatchUpFrame, CommandAnswer, HostCommand, ReadAnswer, ReadInput } from '@taucad/agent-host/wire';
import {
  createBrowserAgentHostClient,
  getBrowserAgentHostCapability,
  probeBrowserAgentHostCapability,
  retainBrowserAgentHostProject,
  residentAgentWorker,
} from '#services/agent-host-client.js';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import { agentHostWorkerProtocolSchemas, parseAgentHostWorkerConnect } from '#workers/agent-host.contract.js';

type FakeRequest = { readonly name: string; readonly args: Record<string, unknown> };
type ErrorListener = (event: ErrorEvent) => void;

/** An answer that never comes. */
const hang = async (): Promise<never> =>
  new Promise(() => {
    /* Never settles. */
  });

const lifecycleRow = (sequence: number, runId: string, state: HostRunSnapshot['state']): AgentLogEvent => ({
  version: 1,
  type: 'run.lifecycle',
  leaderEpoch: 'epoch-1',
  sequence,
  recordedAt: '2026-09-01T00:00:00.000Z',
  runId,
  state,
});

/** Every `MessagePort` inside a frame, so a relay can transfer them on. */
const portsIn = (value: unknown, found: MessagePort[] = []): MessagePort[] => {
  if (value instanceof MessagePort) {
    found.push(value);
  } else if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) {
      portsIn(nested, found);
    }
  }
  return found;
};

/**
 * A resident worker speaking the control protocol. Its control port passes through a gate a test can close, which
 * stands for a frozen worker: frames wait, and keepalives stop reaching the page.
 */
class FakeResidentWorker {
  public deferRunCompletion = false;
  /** Holds every `release` answer until it resolves, as a host draining its runs does (T3). */
  public holdRelease: Promise<void> | undefined;
  /** Holds the answer to the next `connect` until it resolves, judged against the hosts registered then. */
  public holdNextConnect: Promise<void> | undefined;
  public dropRunningAttach = false;
  public readonly refusals = new Map<
    string,
    { readonly code: string; readonly message: string; readonly details?: Record<string, unknown> }
  >();

  public readonly requests: FakeRequest[] = [];
  public readonly terminate = vi.fn(() => {
    this.control?.dispose('terminated');
    for (const stream of this.streams) {
      stream.dispose('terminated');
    }
  });

  public readonly postMessage = vi.fn((value: unknown, _transfer?: Transferable[]) => {
    const connection = parseAgentHostWorkerConnect(value);
    const inner = new MessageChannel();
    this.relay(connection.port, inner.port1);
    this.relay(inner.port1, connection.port);
    this.control = serveAgentWorkerChannel<AgentHostWorkerProtocol>(inner.port2, {
      sessionKey: connection.sessionId,
      protocolSchemas: agentHostWorkerProtocolSchemas,
      hello: { wire: agentWireVersion, build: 'fake' },
      keepaliveInterval: 200,
      impl: {
        // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
        call: async (_context, name, args) => {
          const result = this.onControl(name, args as unknown as Record<string, unknown>);
          return result as AgentHostWorkerProtocol['calls'][typeof name]['result'];
        },
        listen: () => {
          throw new Error('The control channel has no streams.');
        },
      },
    });
  });

  private frozen = false;
  private readonly held: Array<() => void> = [];
  private control: ChannelServerHandle<AgentHostWorkerProtocol> | undefined;
  private readonly streams = new Set<ReturnType<typeof serveAgentChannel>>();
  private readonly hosts = new Map<string, string>();
  /** Hosts whose release is held: still draining, so still rebridgeable. */
  private readonly draining = new Set<string>();
  private errorListener: ErrorListener | undefined;
  private readonly rows = new Map<string, AgentLogEvent[]>();
  private readonly waiters = new Set<() => void>();
  private readonly liveControllers = new Set<{
    readonly chatId: string;
    readonly controller: ReadableStreamDefaultController<SourceLiveEvent>;
  }>();

  private readonly pendingLive: SourceLiveEvent[] = [];
  private readonly snapshots = new Map<string, HostRunSnapshot>();

  public addEventListener(_type: 'error', listener: ErrorListener): void {
    this.errorListener = listener;
  }

  public removeEventListener(_type: 'error', listener: ErrorListener): void {
    if (this.errorListener === listener) {
      this.errorListener = undefined;
    }
  }

  /** A Worker `error` event: an uncaught exception in a worker that is still running (D-088). */
  public raiseError(message = 'uncaught'): void {
    this.errorListener?.({ message } as ErrorEvent);
  }

  /** Register a host the page did not provide, as a newer incarnation from elsewhere would be. */
  public registerHost(projectId: string, hostId: string): void {
    this.hosts.set(projectId, hostId);
  }

  public freeze(): void {
    this.frozen = true;
  }

  public thaw(): void {
    this.frozen = false;
    for (const deliver of this.held.splice(0)) {
      deliver();
    }
  }

  public emitLive(event: SourceLiveEvent): void {
    const listening = [...this.liveControllers].filter((entry) => entry.chatId === event.chatId);
    if (listening.length === 0) {
      this.pendingLive.push(event);
      return;
    }
    for (const { controller } of listening) {
      controller.enqueue(event);
    }
  }

  public complete(chatId: string, append = true): void {
    const current = this.snapshots.get(chatId);
    if (!current) {
      throw new Error(`No fake run exists for ${chatId}.`);
    }
    this.snapshots.set(chatId, { ...current, state: 'completed' });
    if (append) {
      this.append(chatId, current.runId, 'completed');
    }
  }

  private relay(from: MessagePort, to: MessagePort): void {
    from.addEventListener('message', (event: MessageEvent<unknown>) => {
      const deliver = (): void => {
        to.postMessage(event.data, portsIn(event.data));
      };
      if (this.frozen) {
        this.held.push(deliver);
      } else {
        deliver();
      }
    });
    from.start();
  }

  private onControl(name: string, args: Record<string, unknown>): unknown {
    this.requests.push({ name, args });
    switch (name) {
      case 'capabilities': {
        return {
          supported: true,
          checks: { worker: true, webLocks: true, broadcastChannel: true, opfs: true, syncAccessHandle: true },
        };
      }
      case 'provide': {
        const previous = this.hosts.get(args['projectId'] as string);
        this.hosts.set(args['projectId'] as string, args['hostId'] as string);
        return previous === undefined ? {} : { replaced: previous };
      }
      case 'release': {
        if (this.hosts.get(args['projectId'] as string) === args['hostId']) {
          this.hosts.delete(args['projectId'] as string);
        }
        const hostId = args['hostId'] as string;
        const held = this.holdRelease;
        if (held === undefined) {
          return null;
        }
        this.draining.add(hostId);
        return (async () => {
          await held;
          this.draining.delete(hostId);
          return null;
        })();
      }
      case 'rebridge': {
        const hostId = args['hostId'] as string;
        const known = this.hosts.get(args['projectId'] as string) === hostId || this.draining.has(hostId);
        return { status: known ? 'rebridged' : 'needs' };
      }
      case 'connect': {
        const held = this.holdNextConnect;
        if (held !== undefined) {
          this.holdNextConnect = undefined;
          return (async () => {
            await held;
            return this.onConnect(args);
          })();
        }
        return this.onConnect(args);
      }
      default: {
        return null;
      }
    }
  }

  private onConnect(args: Record<string, unknown>): unknown {
    if (this.hosts.get(args['projectId'] as string) !== args['hostId']) {
      return { status: 'needs' };
    }
    /* The stream passes through the same gate, so a frozen worker answers nothing on it either. */
    const inner = new MessageChannel();
    this.relay(args['port'] as MessagePort, inner.port1);
    this.relay(inner.port1, args['port'] as MessagePort);
    const stream = serveAgentChannel(inner.port2, this.launcher(), { build: 'fake', keepaliveInterval: 200 });
    this.streams.add(stream);
    return { status: 'connected' };
  }

  /** The scripted host each stream is served from. */
  private launcher(): AgentLauncher {
    const scripted: Pick<AgentLauncher, 'execute' | 'read' | 'catchUp' | 'liveEvents'> = {
      execute: async (command: HostCommand) => this.command(command),
      read: async (input: ReadInput) => this.read(input),
      catchUp: writerOwnedCatchUp,
      liveEvents: ({ chatId, signal }) => this.listenLive(chatId, signal),
    };
    return mock<AgentLauncher>(scripted);
  }

  private append(chatId: string, runId: string, state: HostRunSnapshot['state']): number {
    const rows = this.rows.get(chatId) ?? [];
    this.rows.set(chatId, rows);
    const cursor = rows.length;
    rows.push(lifecycleRow(cursor, runId, state));
    for (const wake of this.waiters) {
      wake();
    }
    return cursor;
  }

  private async command(command: HostCommand): Promise<CommandAnswer> {
    const { type: name, commandId } = command;
    const payload = command.payload as { readonly chatId: string; readonly runId?: string };
    this.requests.push({ name, args: { commandId, payload } });
    const refusal = this.refusals.get(name);
    if (refusal) {
      return { commandId, generation: 1, status: 'refused', effect: 'not-applied', ...refusal };
    }
    const snapshot = this.snapshots.get(payload.chatId);
    if (name === 'attach') {
      if (this.dropRunningAttach && snapshot?.state === 'running') {
        return hang();
      }
      return {
        commandId,
        generation: 1,
        status: 'applied',
        effect: 'not-applied',
        details: {
          ...(snapshot ? { snapshot } : {}),
          takeover: false,
          endCursor: this.rows.get(payload.chatId)?.length ?? 0,
        },
      };
    }
    const runId = payload.runId ?? 'resumed-run';
    const state = name === 'cancel' ? 'cancelled' : this.deferRunCompletion ? 'running' : 'completed';
    this.snapshots.set(payload.chatId, { chatId: payload.chatId, runId, turnId: `turn-${runId}`, state, messages: [] });
    const cursor = this.append(payload.chatId, runId, state);
    return { commandId, generation: 1, status: 'applied', effect: 'durable', cursor };
  }

  /** A long poll: parked until a row exists past the cursor, or the reader lets go. */
  private async read(input: ReadInput): Promise<ReadAnswer> {
    const { signal, ...request } = input;
    this.requests.push({ name: 'read', args: request });
    const failure = this.refusals.get('read');
    if (failure) {
      throw new Error(failure.message);
    }
    const rowsOf = (): AgentLogEvent[] => this.rows.get(request.chatId) ?? [];
    const aborted = (): boolean => signal?.aborted === true;
    while (rowsOf().length <= request.cursor && !aborted()) {
      // oxlint-disable-next-line no-await-in-loop -- one park per append.
      await new Promise<void>((resolve) => {
        const wake = (): void => {
          this.waiters.delete(wake);
          resolve();
        };
        this.waiters.add(wake);
        signal?.addEventListener('abort', wake, { once: true });
      });
    }
    const rows = rowsOf();
    const events = rows.slice(request.cursor, request.cursor + request.limit);
    return {
      status: 'batch',
      chatId: request.chatId,
      sourceGeneration: 'fixture-source',
      sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
      cursor: request.cursor,
      nextCursor: request.cursor + events.length,
      endCursor: rows.length,
      events,
    };
  }

  private listenLive(chatId: string, signal: AbortSignal): AsyncIterable<SourceLiveEvent> {
    return new ReadableStream<SourceLiveEvent>({
      start: (controller) => {
        const entry = { chatId, controller };
        this.liveControllers.add(entry);
        for (const event of this.pendingLive.filter((pending) => pending.chatId === chatId)) {
          this.pendingLive.splice(this.pendingLive.indexOf(event), 1);
          controller.enqueue(event);
        }
        signal.addEventListener(
          'abort',
          () => {
            this.liveControllers.delete(entry);
            controller.close();
          },
          { once: true },
        );
      },
      cancel: () => undefined,
    }) as unknown as AsyncIterable<SourceLiveEvent>;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stubPlatform = (): void => {
  vi.stubGlobal('Worker', vi.fn());
  vi.stubGlobal('BroadcastChannel', vi.fn());
  vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
};

const baseOptions = {
  projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
  durability: 'exclusive-append',
  authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
  gatewayBaseUrl: 'https://api.tau.test',
  systemPrompt: 'Build CAD.',
  model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
  runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
} as const;

const promptBlocks = (): Parameters<typeof createBrowserAgentHostClient>[0]['systemPromptBlocks'] => [
  { type: 'text', text: 'static' },
  { type: 'text', text: 'workspace' },
  { type: 'text', text: 'dynamic' },
];

const testOptions = (
  createWorker: () => Worker,
  overrides: Partial<Parameters<typeof createBrowserAgentHostClient>[0]> = {},
) => {
  stubPlatform();
  // A bridge is opened per host incarnation, so a replacement gets fresh ports.
  const openBridge = (): FileSystemBridgeConnection =>
    ({ port: new MessageChannel().port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection;
  return {
    ...baseOptions,
    systemPromptBlocks: promptBlocks(),
    openFileSystemBridge: openBridge,
    openProjectRootBridge: openBridge,
    openPlacementPort: () => new MessageChannel().port1,
    createWorker,
    principal: async () => undefined,
    ...overrides,
  };
};

const createTestClient = (
  createWorker: () => Worker,
  overrides: Partial<Parameters<typeof createBrowserAgentHostClient>[0]> = {},
) => createBrowserAgentHostClient(testOptions(createWorker, overrides));

/** A bridge opener that records each bridge's `dispose`, in opening order. */
const trackedBridges = () => {
  const disposals: Array<ReturnType<typeof vi.fn>> = [];
  const open = (): FileSystemBridgeConnection => {
    const dispose = vi.fn();
    disposals.push(dispose);
    return { port: new MessageChannel().port1, dispose } as unknown as FileSystemBridgeConnection;
  };
  return { disposals, open, counts: () => disposals.map((dispose) => dispose.mock.calls.length) };
};

const requestsNamed = (worker: FakeResidentWorker, name: string): FakeRequest[] =>
  worker.requests.filter((request) => request.name === name);

type TestClient = ReturnType<typeof createTestClient>;
// oxlint-disable-next-line eslint/max-params -- Test helper names the exact keyed Start fields.
const startRun = async (client: TestClient, chatId: string, runId: string, message: string) =>
  client.hostCommand({
    type: 'start',
    commandId: runId,
    payload: {
      chatId,
      runId,
      trigger: 'submit',
      message: { id: `user-${runId}`, role: 'user', content: message },
    },
  });
const cancelRun = async (client: TestClient, chatId: string, runId: string) =>
  client.hostCommand({ type: 'cancel', commandId: `cancel-${runId}`, payload: { chatId, runId } });
const attachChat = async (client: TestClient, chatId: string) =>
  client.hostCommand({ type: 'attach', commandId: `attach-${chatId}`, payload: { chatId } });

const workerOf =
  (worker: FakeResidentWorker): (() => Worker) =>
  () =>
    worker as unknown as Worker;

describe('createBrowserAgentHostClient', () => {
  it('forwards the required catch-up stream through the real resident channel and transport', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    try {
      const frames: CatchUpFrame[] = [];
      for await (const frame of client.catchUp({ chatId: 'chat-catch-up', limit: 2, maxBytes: 1024 })) {
        frames.push(frame);
      }
      expect(frames).toEqual([
        {
          type: 'refused',
          answer: {
            status: 'refused',
            chatId: 'chat-catch-up',
            reason: 'writer-owned',
          },
        },
      ]);
    } finally {
      await client.close();
    }
  });

  it('exposes only keyed commands and durable reads, with no page run map', async () => {
    const client = createTestClient(workerOf(new FakeResidentWorker()));
    expect(Object.keys(client).sort()).toEqual([
      'catchUp',
      'close',
      'hostCommand',
      'read',
      'subscribe',
      'subscribeLive',
    ]);
    await client.close();
  });

  it('forwards read-only live deltas without sending another host command', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    const seen: SourceLiveEvent[] = [];
    const stop = client.subscribeLive('chat-preview', (_chatId, event) => seen.push(event));
    const delta: SourceLiveEvent = {
      type: 'text-delta',
      chatId: 'chat-preview',
      runId: 'run-preview',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
      sourceGeneration: 'writer-preview',
    };
    worker.emitLive(delta);
    await vi.waitFor(() => {
      expect(seen).toEqual([delta]);
    });
    expect(requestsNamed(worker, 'start')).toHaveLength(0);
    stop();
    worker.emitLive({ ...delta, delta: ' later' });
    expect(seen).toEqual([delta]);
    await client.close();
  });

  it('forwards a sender-minted command id and returns the host refusal unchanged', async () => {
    const worker = new FakeResidentWorker();
    worker.refusals.set('cancel', {
      code: 'CHAT_RUN_LIVE',
      message: 'The earlier run is settling.',
      details: { state: 'settling' },
    });
    const client = createTestClient(workerOf(worker));
    const command = {
      type: 'cancel',
      commandId: 'gesture-stop-1',
      payload: { chatId: 'chat-1', runId: 'run-1' },
    } as const;

    await expect(client.hostCommand(command)).resolves.toMatchObject({
      commandId: 'gesture-stop-1',
      status: 'refused',
      code: 'CHAT_RUN_LIVE',
    });
    await expect(client.hostCommand(command)).resolves.toMatchObject({
      commandId: 'gesture-stop-1',
      status: 'refused',
    });
    expect(
      worker.requests.filter((request) => request.name === 'cancel').map((request) => request.args['commandId']),
    ).toEqual(['gesture-stop-1', 'gesture-stop-1']);
    await client.close();
  });

  it('keeps the approval and follow-up resume ids minted by the click', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    await startRun(client, 'chat-approval-id', 'run-approval-id', 'Print.');
    await client.hostCommand({
      type: 'resolve-interrupt',
      commandId: 'answer-1',
      payload: {
        chatId: 'chat-approval-id',
        runId: 'run-approval-id',
        interruptId: 'interrupt-1',
        outcome: 'approved',
      },
    });
    await client.hostCommand({
      type: 'resume',
      commandId: 'resume-1',
      payload: { chatId: 'chat-approval-id', runId: 'run-approval-id' },
    });

    expect(
      worker.requests
        .filter((request) => request.name === 'resolve-interrupt')
        .map((request) => request.args['commandId']),
    ).toEqual(['answer-1']);
    expect(
      worker.requests.filter((request) => request.name === 'resume').map((request) => request.args['commandId']),
    ).toEqual(['resume-1']);
    await client.close();
  });

  it('uses a start gesture’s run id as its stable command id on a re-send', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    await startRun(client, 'chat-replay-key', 'run-replay-key', 'Build.');
    await startRun(client, 'chat-replay-key', 'run-replay-key', 'Build.');

    expect(
      worker.requests.filter((request) => request.name === 'start').map((request) => request.args['commandId']),
    ).toEqual(['run-replay-key', 'run-replay-key']);
    await client.close();
  });

  it('keeps the capability seam closed when OPFS is unavailable', () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: {} });

    expect(getBrowserAgentHostCapability()).toEqual({
      supported: false,
      reason: 'STORAGE_NOT_WRITABLE',
      checks: { worker: true, webLocks: true, broadcastChannel: true, opfs: false, syncAccessHandle: false },
    });
  });

  /* RH-S10: the resident worker answers `capabilities` on its control channel; no probe worker is made and no
   * project host is opened. */
  it('should probe capabilities without constructing a worker', async () => {
    stubPlatform();
    const worker = new FakeResidentWorker();
    const createWorker = vi.fn(workerOf(worker));

    await expect(probeBrowserAgentHostCapability({ createWorker })).resolves.toMatchObject({ supported: true });
    await expect(probeBrowserAgentHostCapability({ createWorker })).resolves.toMatchObject({ supported: true });

    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(worker.requests.map((request) => request.name)).toEqual(['init', 'capabilities', 'capabilities']);
  });

  it('does not require OPFS checks for a provider-backed durability class', () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: {} });

    expect(getBrowserAgentHostCapability('transactional-rewrite')).toMatchObject({ supported: true });
  });

  it.each(['ollama', 'tau'] as const)(
    'refuses the unsupported %s provider wire before creating worker resources',
    (providerKind) => {
      stubPlatform();
      const openFileSystemBridge = vi.fn();
      const openProjectRootBridge = vi.fn();
      const createWorker = vi.fn();

      expect(() =>
        createBrowserAgentHostClient({
          ...baseOptions,
          systemPromptBlocks: promptBlocks(),
          openFileSystemBridge,
          openProjectRootBridge,
          openPlacementPort: () => undefined,
          model: { id: `${providerKind}-model`, providerKind, contextWindow: 200_000 },
          createWorker,
        }),
      ).toThrow(expect.objectContaining({ code: 'MODEL_PROVIDER_UNSUPPORTED' }));
      expect(openFileSystemBridge).not.toHaveBeenCalled();
      expect(openProjectRootBridge).not.toHaveBeenCalled();
      expect(createWorker).not.toHaveBeenCalled();
    },
  );

  it('provides the project host once and drives keyed commands and durable rows over one stream', async () => {
    const worker = new FakeResidentWorker();
    const openComputeStorePort = vi.fn();
    const client = createTestClient(workerOf(worker), {
      computeMode: 'off',
      openComputeStorePort,
    });
    const events: unknown[] = [];
    const positions: Array<number | undefined> = [];
    const answers: ReadAnswer[] = [];
    const unsubscribe = client.subscribe(
      { chatId: 'chat-1', cursor: 0 },
      (_chatId, event, position) => {
        events.push(event);
        positions.push(position);
      },
      undefined,
      (answer) => {
        answers.push(answer);
      },
    );
    await expect(startRun(client, 'chat-1', 'run-1', 'Build it.')).resolves.toMatchObject({ status: 'applied' });
    await expect(
      client.hostCommand({
        type: 'steer',
        commandId: 'steer-1',
        payload: { chatId: 'chat-1', runId: 'run-1', message: 'Use 20 mm.' },
      }),
    ).resolves.toMatchObject({ status: 'applied' });
    await expect(cancelRun(client, 'chat-1', 'run-1')).resolves.toMatchObject({ status: 'applied' });
    await expect(
      client.hostCommand({
        type: 'resume',
        commandId: 'resume-1',
        payload: { chatId: 'chat-1', runId: 'resumed-run' },
      }),
    ).resolves.toMatchObject({ status: 'applied' });

    const control = worker.requests.filter((request) => ['init', 'provide', 'connect'].includes(request.name));
    expect(control.map((request) => request.name)).toEqual(['init', 'provide', 'connect']);
    expect(control[1]).toMatchObject({
      name: 'provide',
      args: {
        projectId: 'project-one',
        computeMode: 'off',
        authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
        model: { providerKind: 'openai' },
      },
    });
    expect(control[1]?.args['fileSystemPort']).toBeInstanceOf(MessagePort);
    expect(control[1]?.args['placementPort']).toBeInstanceOf(MessagePort);
    expect(control[1]?.args['projectRootPort']).toBeInstanceOf(MessagePort);
    expect(openComputeStorePort).not.toHaveBeenCalled();
    const commands = worker.requests.filter(
      (request) => !['init', 'provide', 'connect', 'read', 'visibility'].includes(request.name),
    );
    expect(commands.map((request) => request.name)).toEqual(['start', 'steer', 'cancel', 'resume']);
    expect(new Set(commands.map((request) => request.args['commandId'])).size).toBe(commands.length);
    await expect.poll(() => events).toHaveLength(4);
    /* Each row carries its position in the log, which the page's projection folds at (PV-S7). */
    expect(positions).toEqual([0, 1, 2, 3]);
    expect(answers.filter((answer) => answer.status === 'batch' && answer.events.length > 0)).toHaveLength(4);
    unsubscribe();
    await client.close();
    /* A client's close only detaches (D17): the resident worker and its project host keep running. */
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  /* RH-S8: two clients of one project share the worker and the host; each is one stream. */
  it('should serve two chats of one project over two streams of one worker', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = vi.fn(workerOf(worker));
    const first = createTestClient(createWorker);
    const second = createTestClient(createWorker);

    await startRun(first, 'chat-a', 'run-a', 'A.');
    await startRun(second, 'chat-b', 'run-b', 'B.');

    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.requests.filter((request) => request.name === 'provide')).toHaveLength(1);
    expect(worker.requests.filter((request) => request.name === 'connect')).toHaveLength(2);
    await first.close();
    await second.close();
  });

  it('reads with the wire bounds and never asks a worker for more than one page', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    await startRun(client, 'chat-bounds', 'run-bounds', 'Build.');

    await expect(client.read({ chatId: 'chat-bounds', cursor: 0 })).resolves.toMatchObject({
      status: 'batch',
      events: [{ runId: 'run-bounds', state: 'completed' }],
    });
    const reads = worker.requests.filter((request) => request.name === 'read').map((request) => request.args);
    expect(reads.at(-1)).toEqual({ chatId: 'chat-bounds', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await client.close();
  });

  it('carries the folded row identity into the next long-poll read', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    const last = { leaderEpoch: 'epoch-1', sequence: 0 };
    const unsubscribe = client.subscribe(
      { chatId: 'chat-identity', cursor: 0 },
      () => undefined,
      undefined,
      (answer) => (answer.status === 'batch' && answer.events.length > 0 ? last : undefined),
    );
    await startRun(client, 'chat-identity', 'run-identity', 'Build.');

    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'read').at(-1)?.args).toMatchObject({
        chatId: 'chat-identity',
        cursor: 1,
        last,
        sourceGeneration: 'fixture-source',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
      });
    });
    unsubscribe();
    await client.close();
  });

  /* Offline the catalog names no model; opening a host still permits read-only attachment. */
  it('should provide the project host without a default model row while the catalog is unavailable', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker), { model: undefined });

    await attachChat(client, 'chat-offline');

    const provide = requestsNamed(worker, 'provide')[0];
    expect(provide?.args).toMatchObject({ authority: { projectId: 'project-one', workspaceId: 'workspace-one' } });
    expect(provide?.args).not.toHaveProperty('model', expect.anything());
    await client.close();
  });

  /* W8 TS-S6: the transport's wait for a settlement row ends on this fact, never on a clock. */
  it('should tell a follower its follow ended when a read fails, and not when it unsubscribes', async () => {
    const worker = new FakeResidentWorker();
    worker.refusals.set('read', { code: 'LEADERSHIP_LOST', message: 'Another tab leads this chat.' });
    const client = createTestClient(workerOf(worker));
    const ended = vi.fn();
    client.subscribe({ chatId: 'chat-ended', cursor: 0 }, () => undefined, ended);

    await vi.waitFor(() => {
      expect(ended).toHaveBeenCalledOnce();
    });

    worker.refusals.delete('read');
    const quiet = vi.fn();
    const unsubscribe = client.subscribe({ chatId: 'chat-quiet', cursor: 0 }, () => undefined, quiet);
    unsubscribe();
    await client.close();
    expect(quiet).not.toHaveBeenCalled();
  });

  it('returns a keyed host refusal once without a page-side settlement retry', async () => {
    const worker = new FakeResidentWorker();
    worker.refusals.set('cancel', {
      code: 'CHAT_RUN_LIVE',
      message: 'The run is settling.',
      details: { state: 'settling', runId: 'run-1' },
    });
    const client = createTestClient(workerOf(worker));
    await expect(cancelRun(client, 'chat-1', 'run-1')).resolves.toMatchObject({
      status: 'refused',
      code: 'CHAT_RUN_LIVE',
      details: { state: 'settling' },
    });
    expect(requestsNamed(worker, 'cancel')).toHaveLength(1);
    await client.close();
  });
});

/* RH-A16 (RH-R14): the page treats the worker as dead only on the control channel's liveness bound or its coded
 * close; a Worker `error` event is logged only (D-088). */
describe('resident worker death', () => {
  it('should not report death on a worker error event', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = vi.fn(workerOf(worker));
    const client = createTestClient(createWorker);
    await startRun(client, 'chat-error', 'run-1', 'Build.');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    worker.raiseError();

    await expect(cancelRun(client, 'chat-error', 'run-1')).resolves.toMatchObject({ status: 'applied' });
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(createWorker).toHaveBeenCalledOnce();
    await client.close();
  });

  it('should report PEER_UNRESPONSIVE when keepalives stop', async () => {
    const frozen = new FakeResidentWorker();
    const replacement = new FakeResidentWorker();
    const workers = [frozen, replacement];
    const client = createTestClient(() => workers.shift() as unknown as Worker);
    await startRun(client, 'chat-dead', 'run-1', 'Build.');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    frozen.freeze();

    /* Past the liveness bound the old worker is terminated, and the unanswered command reaches the replacement. */
    const cancelled = cancelRun(client, 'chat-dead', 'run-1');
    await vi.waitFor(
      () => {
        expect(frozen.terminate).toHaveBeenCalled();
      },
      { timeout: 8000 },
    );
    expect(warn).toHaveBeenCalledWith(expect.any(String), 'PEER_UNRESPONSIVE');
    await expect(cancelled).resolves.toMatchObject({ status: 'applied' });
    expect(replacement.requests.map((request) => request.name)).toEqual(
      expect.arrayContaining(['init', 'provide', 'connect', 'cancel']),
    );
    await client.close();
  }, 15_000);

  it('should not replace the worker when its tab thaws after a freeze', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = vi.fn(workerOf(worker));
    const client = createTestClient(createWorker);
    await startRun(client, 'chat-thaw', 'run-1', 'Build.');

    worker.freeze();
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 1000);
    });
    worker.thaw();

    await expect(cancelRun(client, 'chat-thaw', 'run-1')).resolves.toMatchObject({ status: 'applied' });
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(createWorker).toHaveBeenCalledOnce();
    await client.close();
  });
});

/* RV1-F1, RH-R4, I31: a file-manager reconnect gives each open host fresh bridges; the host and its runs stay. */
describe('re-brokering project hosts', () => {
  it('should give every open project host fresh bridges under the same host and dispose only the old ones', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const bridges = trackedBridges();
    const client = createTestClient(createWorker, {
      openFileSystemBridge: bridges.open,
      openProjectRootBridge: bridges.open,
    });
    await startRun(client, 'chat-reprovide', 'run-1', 'Build.');

    await residentAgentWorker(createWorker).reprovide();

    const provides = requestsNamed(worker, 'provide');
    const rebridges = requestsNamed(worker, 'rebridge');
    expect(provides).toHaveLength(1);
    expect(rebridges).toHaveLength(1);
    expect(rebridges[0]?.args).toMatchObject({ projectId: 'project-one', hostId: provides[0]?.args['hostId'] });
    expect(rebridges[0]?.args['fileSystemPort']).toBeInstanceOf(MessagePort);
    expect(rebridges[0]?.args['projectRootPort']).toBeInstanceOf(MessagePort);
    expect(bridges.counts()).toEqual([1, 1, 0, 0]);
    /* The same stream still reaches the same host. */
    await expect(cancelRun(client, 'chat-reprovide', 'run-1')).resolves.toMatchObject({ status: 'applied' });
    expect(requestsNamed(worker, 'connect')).toHaveLength(1);
    await client.close();
  });

  /* W6.r1 round 3: a file-manager restart during a drain gives the draining host fresh bridges; they go at its close. */
  it('should rebridge a released host that is still draining, and dispose its bridges once it closed', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const bridges = trackedBridges();
    const client = createTestClient(createWorker, {
      openFileSystemBridge: bridges.open,
      openProjectRootBridge: bridges.open,
    });
    await startRun(client, 'chat-drain', 'run-1', 'Build.');
    const drained = Promise.withResolvers<void>();
    worker.holdRelease = drained.promise;
    await client.close();
    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'release')).toHaveLength(1);
    });
    const hostId = requestsNamed(worker, 'provide')[0]?.args['hostId'];

    await residentAgentWorker(createWorker).reprovide();

    expect(requestsNamed(worker, 'rebridge').map(({ args }) => args['hostId'])).toEqual([hostId]);
    expect(bridges.counts()).toEqual([1, 1, 0, 0]);
    drained.resolve();
    await vi.waitFor(() => {
      expect(bridges.counts()).toEqual([1, 1, 1, 1]);
    });
  });

  it('should dispose the fresh bridges when the host they name is gone', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const bridges = trackedBridges();
    const client = createTestClient(createWorker, {
      openFileSystemBridge: bridges.open,
      openProjectRootBridge: bridges.open,
    });
    await startRun(client, 'chat-gone', 'run-1', 'Build.');
    /* The worker lost the host (a newer provide from elsewhere replaced it). */
    worker.registerHost('project-one', 'someone-else');

    await residentAgentWorker(createWorker).reprovide();

    expect(bridges.counts()).toEqual([0, 0, 1, 1]);
    await client.close();
  });
});

/* RH-R4, T3: a project host lives while a client of the project does; the last close releases the incarnation. */
describe('releasing project hosts', () => {
  it('should keep an accepted run on one host across a zero-client window until its project closes', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const bridges = trackedBridges();
    let principal = 'account-one';
    const options = testOptions(createWorker, {
      openFileSystemBridge: bridges.open,
      openProjectRootBridge: bridges.open,
      principal: async () => principal,
    });
    const releaseProject = retainBrowserAgentHostProject(options);
    const command = createBrowserAgentHostClient(options);
    await startRun(command, 'chat-a', 'run-a', 'A.');
    await command.close();

    expect(requestsNamed(worker, 'release')).toEqual([]);
    const observer = createBrowserAgentHostClient(options);
    await expect(attachChat(observer, 'chat-a')).resolves.toMatchObject({ status: 'applied' });
    expect(requestsNamed(worker, 'provide')).toHaveLength(1);
    await observer.close();
    expect(requestsNamed(worker, 'release')).toEqual([]);

    releaseProject();
    releaseProject();
    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'release')).toHaveLength(1);
      expect(bridges.counts()).toEqual([1, 1]);
    });
    principal = 'account-two';
    const nextProject = createBrowserAgentHostClient(options);
    await expect(attachChat(nextProject, 'chat-b')).resolves.toMatchObject({ status: 'applied' });
    expect(requestsNamed(worker, 'provide')).toHaveLength(2);
    expect(requestsNamed(worker, 'provide')[1]?.args).toMatchObject({ principal: 'account-two' });
    await nextProject.close();
    await vi.waitFor(() => {
      expect(bridges.counts()).toEqual([1, 1, 1, 1]);
    });
  });

  it('should release the project host by its incarnation when the last client closes', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const bridges = trackedBridges();
    const options = { openFileSystemBridge: bridges.open, openProjectRootBridge: bridges.open };
    const first = createTestClient(createWorker, options);
    const second = createTestClient(createWorker, options);
    await startRun(first, 'chat-a', 'run-a', 'A.');
    await startRun(second, 'chat-b', 'run-b', 'B.');
    const hostId = requestsNamed(worker, 'provide')[0]?.args['hostId'];

    await first.close();
    expect(requestsNamed(worker, 'release')).toEqual([]);
    await second.close();

    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'release')).toEqual([
        { name: 'release', args: { projectId: 'project-one', hostId } },
      ]);
    });
    await vi.waitFor(() => {
      expect(bridges.counts()).toEqual([1, 1]);
    });
  });

  /* W6.r1 round 3: a closed client's late `needs` never forgets, or replaces, the host another client now runs on. */
  it("should not replace another client's host when a closed client's connect answers needs", async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const connectHeld = Promise.withResolvers<void>();
    worker.holdNextConnect = connectHeld.promise;
    const first = createTestClient(createWorker);
    /* It rejects once the client closes: the close ends the run's wait, which is not what this case checks. */
    const startQuietly = async (): Promise<void> => {
      try {
        await startRun(first, 'chat-a', 'run-a', 'A.');
      } catch {
        /* See above. */
      }
    };
    const started = startQuietly();
    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'connect')).toHaveLength(1);
    });
    await first.close();
    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'release')).toHaveLength(1);
    });
    worker.deferRunCompletion = true;
    const second = createTestClient(createWorker);
    await expect(attachChat(second, 'chat-b')).resolves.toMatchObject({ status: 'applied' });
    const provides = (): unknown[] => requestsNamed(worker, 'provide').map(({ args }) => args['hostId']);
    expect(provides()).toHaveLength(2);

    connectHeld.resolve();
    await started;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(provides()).toHaveLength(2);
    await second.close();
  });

  it('should open a new host for a client that comes after the release and never rebridge the released one', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const first = createTestClient(createWorker);
    await startRun(first, 'chat-a', 'run-a', 'A.');
    await first.close();
    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'release')).toHaveLength(1);
    });

    await residentAgentWorker(createWorker).reprovide();
    expect(requestsNamed(worker, 'rebridge')).toEqual([]);

    const next = createTestClient(createWorker);
    await startRun(next, 'chat-b', 'run-b', 'B.');
    const provides = requestsNamed(worker, 'provide');
    expect(provides).toHaveLength(2);
    expect(provides[1]?.args['hostId']).not.toBe(provides[0]?.args['hostId']);
    await next.close();
  });
});

/* D13 (W8.r1 M1): a project host is provided only with its placement session, so no browser turn runs unplaced. */
describe('the placement session', () => {
  it('should refuse a start REVISIONS_UNAVAILABLE and provide nothing while the revision root has no placement port', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker), { openPlacementPort: () => undefined });

    await expect(startRun(client, 'chat-unplaced', 'run-1', 'Build.')).rejects.toMatchObject({
      code: 'REVISIONS_UNAVAILABLE',
    });
    expect(requestsNamed(worker, 'provide')).toEqual([]);
    await client.close();
  });
});

/* W11 GI-Q6 (W6.r1 finding 16): the browser host funds a turn for the signed-in account and knows which one. */
describe('the funding principal', () => {
  it('should provide the signed-in account as the project host principal', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker), { principal: async () => 'user-signed-in' });

    await startRun(client, 'chat-principal', 'run-1', 'Build.');

    expect(requestsNamed(worker, 'provide')[0]?.args).toMatchObject({ principal: 'user-signed-in' });
    await client.close();
  });

  it('should provide no principal when no account is signed in', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));

    await startRun(client, 'chat-anonymous', 'run-1', 'Build.');

    expect(requestsNamed(worker, 'provide')[0]?.args).not.toHaveProperty('principal');
    await client.close();
  });
});
