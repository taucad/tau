// @vitest-environment node
/**
 * The page side of the resident agent-host worker (W6 RH-S8–RH-S10): one worker per document, driven over a control
 * channel, with one agent-wire stream per client. The fake worker speaks the real control protocol and serves each
 * stream with `serveAgentChannel` over a scripted launcher.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { AgentLiveEvent, AgentLogEvent, ChannelServerHandle, HostRunSnapshot } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { serveAgentChannel } from '@taucad/agent-host/launcher';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import { agentWireVersion } from '@taucad/agent-host/wire';
import type { CommandAnswer, HostCommand, ReadAnswer, ReadInput } from '@taucad/agent-host/wire';
import {
  AgentHostWorkerError,
  createAgentHostClient,
  createBrowserAgentHostClient,
  getBrowserAgentHostCapability,
  probeBrowserAgentHostCapability,
  resendWhileSettling,
  residentAgentWorker,
} from '#services/agent-host-client.js';
import type { AgentHostTransport } from '#services/agent-host-transport.js';
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
    readonly controller: ReadableStreamDefaultController<AgentLiveEvent>;
  }>();

  private readonly pendingLive: AgentLiveEvent[] = [];
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

  public emitLive(event: AgentLiveEvent): void {
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
    const scripted: Pick<AgentLauncher, 'execute' | 'read' | 'liveEvents'> = {
      execute: async (command: HostCommand) => this.command(command),
      read: async (input: ReadInput) => this.read(input),
      liveEvents: ({ chatId, signal }) => this.listenLive(chatId, signal),
    };
    return scripted as AgentLauncher;
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
      cursor: request.cursor,
      nextCursor: request.cursor + events.length,
      endCursor: rows.length,
      events,
    };
  }

  private listenLive(chatId: string, signal: AbortSignal): AsyncIterable<AgentLiveEvent> {
    return new ReadableStream<AgentLiveEvent>({
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
    }) as unknown as AsyncIterable<AgentLiveEvent>;
  }
}

const liveDelta = (chatId: string, runId: string, delta: string): AgentLiveEvent => ({
  type: 'text-delta',
  chatId,
  runId,
  messageId: `message-${runId}`,
  contentIndex: 0,
  delta,
});

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

const createTestClient = (
  createWorker: () => Worker,
  overrides: Partial<Parameters<typeof createBrowserAgentHostClient>[0]> = {},
) => {
  stubPlatform();
  // A bridge is opened per host incarnation, so a replacement gets fresh ports.
  const openBridge = (): FileSystemBridgeConnection =>
    ({ port: new MessageChannel().port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection;
  return createBrowserAgentHostClient({
    ...baseOptions,
    systemPromptBlocks: promptBlocks(),
    openFileSystemBridge: openBridge,
    openProjectRootBridge: openBridge,
    openPlacementPort: () => new MessageChannel().port1,
    createWorker,
    principal: async () => undefined,
    ...overrides,
  });
};

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

const workerOf =
  (worker: FakeResidentWorker): (() => Worker) =>
  () =>
    worker as unknown as Worker;

describe('createBrowserAgentHostClient', () => {
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

  it('provides the project host once and drives start, steer, cancel, resume and live events over one stream', async () => {
    const worker = new FakeResidentWorker();
    const openComputeStorePort = vi.fn();
    const client = createTestClient(workerOf(worker), { computeMode: 'off', openComputeStorePort });
    const events: unknown[] = [];
    const liveEvents: unknown[] = [];
    const unsubscribe = client.subscribe({ chatId: 'chat-1', cursor: 0 }, (_chatId, event) => {
      events.push(event);
    });
    const unsubscribeLive = client.subscribeLive?.('chat-1', (_chatId, event) => {
      liveEvents.push(event);
    });

    worker.emitLive(liveDelta('chat-1', 'run-1', 'live'));

    await expect(
      client.start({ chatId: 'chat-1', runId: 'run-1', trigger: 'submit', message: 'Build it.' }),
    ).resolves.toMatchObject({ chatId: 'chat-1', runId: 'run-1', state: 'completed' });
    await expect(client.steer('run-1', 'Use 20 mm.')).resolves.toMatchObject({ runId: 'run-1' });
    await expect(client.cancel('run-1')).resolves.toMatchObject({ state: 'cancelled' });
    await expect(client.resume('chat-1', 'resumed-run')).resolves.toMatchObject({ runId: 'resumed-run' });

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
    expect(commands.map((request) => request.name)).toEqual([
      'start',
      'attach',
      'steer',
      'attach',
      'cancel',
      'attach',
      'resume',
      'attach',
    ]);
    expect(new Set(commands.map((request) => request.args['commandId'])).size).toBe(commands.length);
    await expect.poll(() => events).toHaveLength(4);
    expect(liveEvents).toEqual([liveDelta('chat-1', 'run-1', 'live')]);

    unsubscribe();
    unsubscribeLive?.();
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

    await first.start({ chatId: 'chat-a', runId: 'run-a', trigger: 'submit', message: 'A.' });
    await second.start({ chatId: 'chat-b', runId: 'run-b', trigger: 'submit', message: 'B.' });

    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.requests.filter((request) => request.name === 'provide')).toHaveLength(1);
    expect(worker.requests.filter((request) => request.name === 'connect')).toHaveLength(2);
    await first.close();
    await second.close();
  });

  it('reads with the wire bounds and never asks a worker for more than one page', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    await client.start({ chatId: 'chat-bounds', runId: 'run-bounds', trigger: 'submit', message: 'Build.' });

    await expect(client.read({ chatId: 'chat-bounds', cursor: 0 })).resolves.toMatchObject({
      status: 'batch',
      events: [{ runId: 'run-bounds', state: 'completed' }],
    });
    const reads = worker.requests.filter((request) => request.name === 'read').map((request) => request.args);
    expect(reads.at(-1)).toEqual({ chatId: 'chat-bounds', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await client.close();
  });

  /* Offline the catalog names no model; opening a chat still attaches and replays its log. */
  it('should provide the project host without a default model row while the catalog is unavailable', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker), { model: undefined });

    await client.attach({ chatId: 'chat-offline', cursor: 0 });

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

  /* W8.r1 item 6: a decision, a resume or a cancel refused while the previous attempt settles is retry class `wait`,
   * re-sent until the host admits it; a live run's refusal is thrown at once. */
  it.each([
    ['resolve-interrupt', 'settling'],
    ['resume', 'terminal'],
    ['cancel', 'settling'],
  ] as const)('should re-send a %s refused CHAT_RUN_LIVE{%s} until it is admitted', async (verb, state) => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    await client.start({ chatId: 'chat-1', runId: 'run-1', trigger: 'submit', message: 'Build.' });
    worker.refusals.set(verb, {
      code: 'CHAT_RUN_LIVE',
      message: `Chat chat-1 has a ${state} run; send the command again after it ends.`,
      details: { state, runId: 'run-1' },
    });
    const sent = (): number => worker.requests.filter((request) => request.name === verb).length;

    const answered =
      verb === 'resolve-interrupt'
        ? client.resolveInterrupt('chat-1', 'run-1', { interruptId: 'interrupt-1', outcome: 'approved' })
        : verb === 'resume'
          ? client.resume('chat-1', 'run-1')
          : client.cancel('run-1');
    await vi.waitFor(() => {
      expect(sent()).toBeGreaterThanOrEqual(3);
    });
    worker.refusals.delete(verb);

    await expect(answered).resolves.toMatchObject({ chatId: 'chat-1' });
    expect(sent()).toBeGreaterThanOrEqual(4);
    await client.close();
  });

  /* W8.r1 round 5 (MU35): a stop during the back-off sends nothing more and rejects with the last refusal. */
  it('should send nothing more once aborted during the settling back-off', async () => {
    vi.useFakeTimers();
    try {
      const refusal = new AgentHostWorkerError('CHAT_RUN_LIVE', 'Chat chat-1 has a settling run.', {
        state: 'settling',
      });
      const send = vi.fn(async (): Promise<string> => {
        throw refusal;
      });
      const stop = new AbortController();

      const answered = expect(resendWhileSettling(send, stop.signal)).rejects.toBe(refusal);
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledOnce();
      stop.abort();
      await vi.advanceTimersByTimeAsync(1000);

      await answered;
      expect(send).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  /* W8.r1 round 5 (MU36): the re-send stops at the 30 s settlement bound, with the last refusal. */
  it('should give up re-sending at the 30 s settlement bound', async () => {
    vi.useFakeTimers();
    try {
      const refusal = new AgentHostWorkerError('CHAT_RUN_LIVE', 'Chat chat-1 has a settling run.', {
        state: 'settling',
      });
      const send = vi.fn(async (): Promise<string> => {
        throw refusal;
      });

      const answered = expect(resendWhileSettling(send)).rejects.toBe(refusal);
      await vi.advanceTimersByTimeAsync(29_000);
      expect(send.mock.calls.length).toBeLessThan(124);
      await vi.advanceTimersByTimeAsync(2000);

      await answered;
      /* 20, 40, 80 and 160 ms, then 250 ms until the next wait would pass 30 s. */
      expect(send.mock.calls.length).toBeGreaterThanOrEqual(120);
      expect(send.mock.calls.length).toBeLessThanOrEqual(125);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should throw a CHAT_RUN_LIVE refusal naming a running run without re-sending it', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));
    await client.start({ chatId: 'chat-1', runId: 'run-1', trigger: 'submit', message: 'Build.' });
    worker.refusals.set('cancel', {
      code: 'CHAT_RUN_LIVE',
      message: 'Chat chat-1 has a running run; send the command again after it ends.',
      details: { state: 'running', runId: 'run-1' },
    });

    await expect(client.cancel('run-1')).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE' });
    expect(worker.requests.filter((request) => request.name === 'cancel')).toHaveLength(1);
    await client.close();
  });

  it('throws a refusal with its code and details', async () => {
    const worker = new FakeResidentWorker();
    worker.refusals.set('resume', {
      code: 'RESUME_UNAVAILABLE',
      message: 'Run run-9 is not this chat’s current run.',
      details: { currentRunId: 'run-1' },
    });
    const client = createTestClient(workerOf(worker));

    await expect(client.resume('chat-1', 'run-9')).rejects.toMatchObject({
      name: 'AgentHostWorkerError',
      code: 'RESUME_UNAVAILABLE',
      details: { currentRunId: 'run-1' },
    });
    await client.close();
  });

  it('renews the run idle lease from live activity and settles through terminal replay', async () => {
    const worker = new FakeResidentWorker();
    worker.deferRunCompletion = true;
    /* ponytail: real timers, since the fake worker's MessageChannel delivery is not on a fakeable clock; the heartbeat
     * is 20x inside the bound, and the wait spans 3.5 bounds, so only a stall over 100 ms fails it. */
    const client = createTestClient(workerOf(worker), { runIdleTimeout: 100 });
    const completion = client.start({
      chatId: 'chat-live-lease',
      runId: 'run-live-lease',
      trigger: 'submit',
      message: 'Build slowly.',
    });
    await vi.waitFor(() => {
      expect(worker.requests.some((request) => request.name === 'attach')).toBe(true);
    });
    worker.dropRunningAttach = true;
    const heartbeatId = globalThis.setInterval(() => {
      worker.emitLive(liveDelta('chat-live-lease', 'run-live-lease', '.'));
    }, 5);
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 350);
    });
    worker.complete('chat-live-lease');
    globalThis.clearInterval(heartbeatId);

    await expect(completion).resolves.toMatchObject({ runId: 'run-live-lease', state: 'completed' });
    await client.close();
  });

  it('finds a terminal durable snapshot after the terminal stream event is lost', async () => {
    const worker = new FakeResidentWorker();
    worker.deferRunCompletion = true;
    const client = createTestClient(workerOf(worker), { runIdleTimeout: 5 });
    const completion = client.start({
      chatId: 'chat-lost-terminal',
      runId: 'run-lost-terminal',
      trigger: 'submit',
      message: 'Build quietly.',
    });
    await vi.waitFor(() => {
      expect(worker.requests.some((request) => request.name === 'attach')).toBe(true);
    });
    worker.complete('chat-lost-terminal', false);

    await expect(completion).resolves.toMatchObject({ runId: 'run-lost-terminal', state: 'completed' });
    expect(worker.requests.filter((request) => request.name === 'attach').length).toBeGreaterThan(1);
    await client.close();
  });

  it('retries one timed-out liveness attachment but fails after three', async () => {
    const check = async (timeouts: number): Promise<void> => {
      let attaches = 0;
      const execute = vi.fn(async (command: HostCommand): Promise<CommandAnswer> => {
        if (command.type !== 'attach') {
          return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 0 };
        }
        attaches += 1;
        if (attaches > 1 && attaches <= timeouts + 1) {
          throw new AgentHostWorkerError('COMMAND_TIMEOUT', 'The attachment did not answer.');
        }
        const snapshot: HostRunSnapshot = {
          chatId: 'chat-probe',
          runId: 'run-probe',
          turnId: 'turn-probe',
          state: attaches === 1 ? 'running' : 'completed',
          messages: [],
        };
        return {
          commandId: command.commandId,
          generation: 1,
          status: 'applied',
          effect: 'not-applied',
          details: { snapshot, endCursor: 0 },
        };
      });
      const transport: AgentHostTransport = {
        ready: Promise.resolve(),
        execute,
        read: async ({ signal }) =>
          new Promise<ReadAnswer>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                reject(new Error('Read stopped.'));
              },
              { once: true },
            );
          }),
        async *liveEvents() {
          yield* [];
        },
        close: () => undefined,
      };
      const client = createAgentHostClient(transport, { runIdleTimeout: 1 });
      try {
        const completion = client.start({
          chatId: 'chat-probe',
          runId: 'run-probe',
          trigger: 'submit',
          message: 'Build slowly.',
        });
        await (timeouts === 1
          ? expect(completion).resolves.toMatchObject({ state: 'completed' })
          : expect(completion).rejects.toMatchObject({ code: 'RUN_IDLE_TIMEOUT' }));
        expect(attaches).toBe(timeouts === 1 ? 3 : 4);
        expect(execute.mock.calls.filter(([command]) => command.type === 'start')).toHaveLength(1);
      } finally {
        await client.close();
      }
    };
    await check(1);
    await check(3);
  });
});

/* RH-A16 (RH-R14): the page treats the worker as dead only on the control channel's liveness bound or its coded
 * close; a Worker `error` event is logged only (D-088). */
describe('resident worker death', () => {
  it('should not report death on a worker error event', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = vi.fn(workerOf(worker));
    const client = createTestClient(createWorker);
    await client.start({ chatId: 'chat-error', runId: 'run-1', trigger: 'submit', message: 'Build.' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    worker.raiseError();

    await expect(client.cancel('run-1')).resolves.toMatchObject({ state: 'cancelled' });
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(createWorker).toHaveBeenCalledOnce();
    await client.close();
  });

  it('should report PEER_UNRESPONSIVE when keepalives stop', async () => {
    const frozen = new FakeResidentWorker();
    const replacement = new FakeResidentWorker();
    const workers = [frozen, replacement];
    const client = createTestClient(() => workers.shift() as unknown as Worker);
    await client.start({ chatId: 'chat-dead', runId: 'run-1', trigger: 'submit', message: 'Build.' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    frozen.freeze();

    /* Past the liveness bound the old worker is terminated, and the unanswered command reaches the replacement. */
    const cancelled = client.cancel('run-1');
    await vi.waitFor(
      () => {
        expect(frozen.terminate).toHaveBeenCalled();
      },
      { timeout: 8000 },
    );
    expect(warn).toHaveBeenCalledWith(expect.any(String), 'PEER_UNRESPONSIVE');
    await expect(cancelled).resolves.toMatchObject({ state: 'cancelled' });
    expect(replacement.requests.map((request) => request.name)).toEqual(
      expect.arrayContaining(['init', 'provide', 'connect', 'cancel']),
    );
    await client.close();
  }, 15_000);

  it('should not replace the worker when its tab thaws after a freeze', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = vi.fn(workerOf(worker));
    const client = createTestClient(createWorker);
    await client.start({ chatId: 'chat-thaw', runId: 'run-1', trigger: 'submit', message: 'Build.' });

    worker.freeze();
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 1000);
    });
    worker.thaw();

    await expect(client.cancel('run-1')).resolves.toMatchObject({ state: 'cancelled' });
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
    await client.start({ chatId: 'chat-reprovide', runId: 'run-1', trigger: 'submit', message: 'Build.' });

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
    await expect(client.cancel('run-1')).resolves.toMatchObject({ state: 'cancelled' });
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
    await client.start({ chatId: 'chat-drain', runId: 'run-1', trigger: 'submit', message: 'Build.' });
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
    await client.start({ chatId: 'chat-gone', runId: 'run-1', trigger: 'submit', message: 'Build.' });
    /* The worker lost the host (a newer provide from elsewhere replaced it). */
    worker.registerHost('project-one', 'someone-else');

    await residentAgentWorker(createWorker).reprovide();

    expect(bridges.counts()).toEqual([0, 0, 1, 1]);
    await client.close();
  });
});

/* RH-R4, T3: a project host lives while a client of the project does; the last close releases the incarnation. */
describe('releasing project hosts', () => {
  it('should release the project host by its incarnation when the last client closes', async () => {
    const worker = new FakeResidentWorker();
    const createWorker = workerOf(worker);
    const bridges = trackedBridges();
    const options = { openFileSystemBridge: bridges.open, openProjectRootBridge: bridges.open };
    const first = createTestClient(createWorker, options);
    const second = createTestClient(createWorker, options);
    await first.start({ chatId: 'chat-a', runId: 'run-a', trigger: 'submit', message: 'A.' });
    await second.start({ chatId: 'chat-b', runId: 'run-b', trigger: 'submit', message: 'B.' });
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
        await first.start({ chatId: 'chat-a', runId: 'run-a', trigger: 'submit', message: 'A.' });
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
    await expect(second.attach({ chatId: 'chat-b', cursor: 0 })).resolves.toMatchObject({ status: 'batch' });
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
    await first.start({ chatId: 'chat-a', runId: 'run-a', trigger: 'submit', message: 'A.' });
    await first.close();
    await vi.waitFor(() => {
      expect(requestsNamed(worker, 'release')).toHaveLength(1);
    });

    await residentAgentWorker(createWorker).reprovide();
    expect(requestsNamed(worker, 'rebridge')).toEqual([]);

    const next = createTestClient(createWorker);
    await next.start({ chatId: 'chat-b', runId: 'run-b', trigger: 'submit', message: 'B.' });
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

    await expect(
      client.start({ chatId: 'chat-unplaced', runId: 'run-1', trigger: 'submit', message: 'Build.' }),
    ).rejects.toMatchObject({ code: 'REVISIONS_UNAVAILABLE' });
    expect(requestsNamed(worker, 'provide')).toEqual([]);
    await client.close();
  });
});

/* W11 GI-Q6 (W6.r1 finding 16): the browser host funds a turn for the signed-in account and knows which one. */
describe('the funding principal', () => {
  it('should provide the signed-in account as the project host principal', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker), { principal: async () => 'user-signed-in' });

    await client.start({ chatId: 'chat-principal', runId: 'run-1', trigger: 'submit', message: 'Build.' });

    expect(requestsNamed(worker, 'provide')[0]?.args).toMatchObject({ principal: 'user-signed-in' });
    await client.close();
  });

  it('should provide no principal when no account is signed in', async () => {
    const worker = new FakeResidentWorker();
    const client = createTestClient(workerOf(worker));

    await client.start({ chatId: 'chat-anonymous', runId: 'run-1', trigger: 'submit', message: 'Build.' });

    expect(requestsNamed(worker, 'provide')[0]?.args).not.toHaveProperty('principal');
    await client.close();
  });
});
