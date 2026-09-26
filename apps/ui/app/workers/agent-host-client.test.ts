// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { AgentLiveEvent, AgentLogEvent, ChannelServerHandle, HostRunSnapshot } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { agentWireVersion } from '@taucad/agent-host/wire';
import type { CommandAnswer, ReadAnswer, ReadRequest } from '@taucad/agent-host/wire';
import {
  createBrowserAgentHostClient,
  getBrowserAgentHostCapability,
  probeBrowserAgentHostCapability,
} from '#services/agent-host-client.js';
import type { AgentHostWorkerProtocol } from '#workers/agent-host.contract.js';
import {
  agentHostSettlementRecordSchema,
  agentHostWorkerProtocolSchemas,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';

type ErrorListener = (event: ErrorEvent) => void;

type FakeRequest = { readonly name: string; readonly args: Record<string, unknown> };

const hang = async (signal: AbortSignal, what: string): Promise<never> =>
  new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason instanceof Error ? signal.reason : new Error(`${what} aborted.`));
      },
      { once: true },
    );
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

/** A worker speaking the keyed page↔worker protocol: verbs answer by key, rows are read, never pushed. */
class FakeAgentHostWorker {
  public dropCommands = false;
  public dropClose = false;
  public dropRunningAttach = false;
  public dropStartResponse = false;
  public deferRunCompletion = false;
  public closeError: Error | undefined;
  public readonly refusals = new Map<
    string,
    { readonly code: string; readonly message: string; readonly details?: Record<string, unknown> }
  >();
  public readonly requests: FakeRequest[] = [];
  public readonly postMessage = vi.fn((value: unknown, _transfer?: Transferable[]) => {
    const connection = parseAgentHostWorkerConnect(value);
    this.server = serveAgentWorkerChannel<AgentHostWorkerProtocol>(connection.port, {
      sessionKey: connection.sessionId,
      protocolSchemas: agentHostWorkerProtocolSchemas,
      hello: { wire: agentWireVersion, build: 'fake' },
      impl: {
        // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
        call: async (_context, name, args, signal) => {
          const result = await this.answer(name, args as unknown as Record<string, unknown>, signal);
          return result as AgentHostWorkerProtocol['calls'][typeof name]['result'];
        },
        // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
        listen: (_context, _name, args, signal) => this.listenLive(args.chatId, signal),
      },
    });
  });

  public readonly terminate = vi.fn(() => this.server?.dispose());
  private errorListener: ErrorListener | undefined;
  private server: ChannelServerHandle<AgentHostWorkerProtocol> | undefined;
  private readonly rows = new Map<string, AgentLogEvent[]>();
  private readonly waiters = new Set<() => void>();
  private readonly liveControllers = new Set<{
    readonly chatId: string;
    readonly controller: ReadableStreamDefaultController<AgentLiveEvent>;
  }>();
  private readonly pendingLive: AgentLiveEvent[] = [];
  private readonly snapshots = new Map<string, HostRunSnapshot>();

  public addEventListener(type: 'error', listener: ErrorListener): void;
  public addEventListener(_type: 'error', listener: ErrorListener): void {
    this.errorListener = listener;
  }

  public removeEventListener(type: 'error', listener: ErrorListener): void;
  public removeEventListener(_type: 'error', listener: ErrorListener): void {
    if (this.errorListener === listener) {
      this.errorListener = undefined;
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

  public crash(message = 'worker crashed'): void {
    this.errorListener?.({ message } as ErrorEvent);
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

  private async answer(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    this.requests.push({ name, args });
    if (name === 'capabilities') {
      return {
        supported: true,
        checks: { worker: true, webLocks: true, broadcastChannel: true, opfs: true, syncAccessHandle: true },
      };
    }
    if (name === 'initialize' || name === 'record-settlement') {
      return null;
    }
    if (name === 'close') {
      if (this.closeError) {
        throw this.closeError;
      }
      return this.dropClose ? hang(signal, 'Close') : null;
    }
    if (this.dropCommands) {
      return hang(signal, 'Command');
    }
    if (name === 'read') {
      return this.read(args as unknown as ReadRequest, signal);
    }
    const commandId = args['commandId'] as string;
    const payload = args['payload'] as { readonly chatId: string; readonly runId?: string };
    const refusal = this.refusals.get(name);
    if (refusal) {
      return { commandId, generation: 1, status: 'refused', effect: 'not-applied', ...refusal } satisfies CommandAnswer;
    }
    const snapshot = this.snapshots.get(payload.chatId);
    if (name === 'attach') {
      if (this.dropRunningAttach && snapshot?.state === 'running') {
        return hang(signal, 'Attach');
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
      } satisfies CommandAnswer;
    }
    const runId = payload.runId ?? 'resumed-run';
    const state = name === 'cancel' ? 'cancelled' : this.deferRunCompletion ? 'running' : 'completed';
    this.snapshots.set(payload.chatId, { chatId: payload.chatId, runId, turnId: `turn-${runId}`, state, messages: [] });
    const cursor = this.append(payload.chatId, runId, state);
    if (name === 'start' && this.dropStartResponse) {
      return hang(signal, 'Start response');
    }
    return { commandId, generation: 1, status: 'applied', effect: 'durable', cursor } satisfies CommandAnswer;
  }

  /** A long poll: parked until a row exists past the cursor, or the reader lets go. */
  private async read(request: ReadRequest, signal: AbortSignal): Promise<ReadAnswer> {
    const rowsOf = (): AgentLogEvent[] => this.rows.get(request.chatId) ?? [];
    while (rowsOf().length <= request.cursor && !signal.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- one park per append.
      await new Promise<void>((resolve) => {
        const wake = (): void => {
          this.waiters.delete(wake);
          resolve();
        };
        this.waiters.add(wake);
        signal.addEventListener('abort', wake, { once: true });
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
    });
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
});

const createTestClient = (
  worker: FakeAgentHostWorker,
  overrides: Partial<Parameters<typeof createBrowserAgentHostClient>[0]> = {},
) => {
  vi.stubGlobal('Worker', vi.fn());
  vi.stubGlobal('BroadcastChannel', vi.fn());
  vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
  // A bridge is opened per worker, so a replacement worker gets fresh ports.
  const openBridge = (): FileSystemBridgeConnection =>
    ({ port: new MessageChannel().port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection;
  return createBrowserAgentHostClient({
    openFileSystemBridge: openBridge,
    openProjectRootBridge: openBridge,
    projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
    durability: 'exclusive-append',
    authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
    gatewayBaseUrl: 'https://api.tau.test',
    systemPrompt: 'Build CAD.',
    systemPromptBlocks: [
      { type: 'text', text: 'static' },
      { type: 'text', text: 'workspace' },
      { type: 'text', text: 'dynamic' },
    ],
    model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
    runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
    createWorker: () => worker as unknown as Worker,
    ...overrides,
  });
};

describe('createBrowserAgentHostClient', () => {
  it('keeps the capability seam closed when OPFS is unavailable', () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: {} });

    expect(getBrowserAgentHostCapability()).toEqual({
      supported: false,
      reason: 'STORAGE_NOT_WRITABLE',
      checks: {
        worker: true,
        webLocks: true,
        broadcastChannel: true,
        opfs: false,
        syncAccessHandle: false,
      },
    });
  });

  it('returns one pre-placement capability report including the worker sync-access probe', async () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
    const worker = new FakeAgentHostWorker();

    await expect(probeBrowserAgentHostCapability({ createWorker: () => worker as unknown as Worker })).resolves.toEqual(
      {
        supported: true,
        checks: {
          worker: true,
          webLocks: true,
          broadcastChannel: true,
          opfs: true,
          syncAccessHandle: true,
        },
      },
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('does not require OPFS checks for a provider-backed durability class', () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: {} });

    expect(getBrowserAgentHostCapability('transactional-rewrite')).toMatchObject({ supported: true });
  });

  it('shares one default functional capability probe across placement consumers', async () => {
    const worker = new FakeAgentHostWorker();
    const workerConstructor = vi.fn(function workerConstructor() {
      return worker;
    });
    vi.stubGlobal('Worker', workerConstructor);
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });

    const first = probeBrowserAgentHostCapability();
    const second = probeBrowserAgentHostCapability();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ supported: true }),
      expect.objectContaining({ supported: true }),
    ]);
    expect(workerConstructor).toHaveBeenCalledOnce();
  });

  it.each(['ollama', 'tau'] as const)(
    'refuses the unsupported %s provider wire before creating worker resources',
    (providerKind) => {
      vi.stubGlobal('Worker', vi.fn());
      vi.stubGlobal('BroadcastChannel', vi.fn());
      vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
      const openFileSystemBridge = vi.fn();
      const openProjectRootBridge = vi.fn();

      expect(() =>
        createBrowserAgentHostClient({
          openFileSystemBridge,
          openProjectRootBridge,
          projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
          durability: 'exclusive-append',
          authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
          gatewayBaseUrl: 'https://api.tau.test',
          systemPrompt: 'Build CAD.',
          systemPromptBlocks: [
            { type: 'text', text: 'static' },
            { type: 'text', text: 'workspace' },
            { type: 'text', text: 'dynamic' },
          ],
          model: { id: `${providerKind}-model`, providerKind, contextWindow: 200_000 },
          runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
        }),
      ).toThrow(expect.objectContaining({ code: 'MODEL_PROVIDER_UNSUPPORTED' }));
      expect(openFileSystemBridge).not.toHaveBeenCalled();
      expect(openProjectRootBridge).not.toHaveBeenCalled();
    },
  );

  it('accepts the Anthropic provider wire before creating the worker', async () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
    const worker = new FakeAgentHostWorker();
    const channel = new MessageChannel();
    const projectRootChannel = new MessageChannel();
    const client = createBrowserAgentHostClient({
      openFileSystemBridge: () => ({ port: channel.port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection,
      openProjectRootBridge: () =>
        ({ port: projectRootChannel.port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection,
      projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
      durability: 'exclusive-append',
      authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
      gatewayBaseUrl: 'https://api.tau.test',
      systemPrompt: 'Build CAD.',
      systemPromptBlocks: [
        { type: 'text', text: 'static' },
        { type: 'text', text: 'workspace' },
        { type: 'text', text: 'dynamic' },
      ],
      model: { id: 'anthropic-model', providerKind: 'anthropic', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      createWorker: () => worker as unknown as Worker,
    });

    await expect(client.close()).resolves.toBeUndefined();
    // The Worker leg transfers only the dedicated Channel port; bridge ports are then carried by
    // the validated initialize call, preserving the same two zero-copy transfers without treating Worker as a Port.
    expect(worker.postMessage.mock.calls[0]?.[0]).toMatchObject({ type: 'agent-host/connect' });
    expect(worker.postMessage.mock.calls[0]?.[1]).toHaveLength(1);
    const initializeRequest = worker.requests[0];
    expect(initializeRequest?.name).toBe('initialize');
    expect(initializeRequest?.args['fileSystemPort']).toBeInstanceOf(MessagePort);
    expect(initializeRequest?.args['projectRootPort']).toBeInstanceOf(MessagePort);
  });

  it('transfers workspace and project-root ports and drives start, steer, cancel, resume, events, and close', async () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
    const worker = new FakeAgentHostWorker();
    const bridgeDispose = vi.fn();
    const projectRootDispose = vi.fn();
    const channel = new MessageChannel();
    const projectRootChannel = new MessageChannel();
    const openComputeStorePort = vi.fn();
    const events: unknown[] = [];
    const client = createBrowserAgentHostClient({
      openFileSystemBridge: () =>
        ({ port: channel.port1, dispose: bridgeDispose }) as unknown as FileSystemBridgeConnection,
      openProjectRootBridge: () =>
        ({ port: projectRootChannel.port1, dispose: projectRootDispose }) as unknown as FileSystemBridgeConnection,
      computeMode: 'off',
      openComputeStorePort,
      projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
      durability: 'exclusive-append',
      authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
      gatewayBaseUrl: 'https://api.tau.test',
      systemPrompt: 'Build CAD.',
      systemPromptBlocks: [
        { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
        { type: 'text', text: 'workspace', cacheControl: { type: 'ephemeral' } },
        { type: 'text', text: 'dynamic' },
      ],
      model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      createWorker: () => worker as unknown as Worker,
    });
    const liveEvents: unknown[] = [];
    const unsubscribe = client.subscribe({ chatId: 'chat-1', cursor: 0 }, (_chatId, event) => {
      events.push(event);
    });
    const unsubscribeLive = client.subscribeLive?.('chat-1', (_chatId, event) => {
      liveEvents.push(event);
    });
    expect(unsubscribeLive).toBeDefined();

    worker.emitLive(liveDelta('chat-1', 'run-1', 'live'));

    await expect(
      client.start({
        chatId: 'chat-1',
        runId: 'run-1',
        trigger: 'submit',
        message: 'Build it.',
        config: {
          systemPrompt: 'admission prompt',
          systemPromptBlocks: [
            { type: 'text', text: 'static' },
            { type: 'text', text: 'workspace' },
            { type: 'text', text: 'dynamic' },
          ],
          model: { id: 'retry-model', providerKind: 'openai', contextWindow: 64_000 },
          toolChoice: 'none',
          allowedTools: [],
        },
      }),
    ).resolves.toMatchObject({ chatId: 'chat-1', runId: 'run-1', state: 'completed' });
    await expect(client.steer('run-1', 'Use 20 mm.')).resolves.toMatchObject({ runId: 'run-1' });
    await expect(client.cancel('run-1')).resolves.toMatchObject({ state: 'cancelled' });
    await expect(client.resume('chat-1', 'resumed-run')).resolves.toMatchObject({ runId: 'resumed-run' });
    await expect(client.attach({ chatId: 'chat-1', cursor: 0 })).resolves.toMatchObject({
      status: 'batch',
      cursor: 0,
      nextCursor: 4,
      takeover: false,
      snapshot: { runId: 'resumed-run' },
    });

    // Every application request is a Channel call by verb; Worker.postMessage carries only the bootstrap transfer.
    const [initialize, start] = worker.requests;
    expect(initialize).toMatchObject({
      name: 'initialize',
      args: {
        computeMode: 'off',
        projectStorage: { providerBasePath: 'project-one' },
        authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
        model: { providerKind: 'openai' },
        systemPromptBlocks: [{ text: 'static' }, { text: 'workspace' }, { text: 'dynamic' }],
      },
    });
    expect(initialize?.args['fileSystemPort']).toBeInstanceOf(MessagePort);
    expect(initialize?.args['projectRootPort']).toBeInstanceOf(MessagePort);
    expect(initialize?.args['computeStorePort']).toBeUndefined();
    expect(openComputeStorePort).not.toHaveBeenCalled();
    expect(start).toMatchObject({
      name: 'start',
      args: {
        /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.stringMatching` is typed `any` by vitest. */
        commandId: expect.stringMatching(/^req_/u),
        payload: {
          chatId: 'chat-1',
          runId: 'run-1',
          config: { model: { id: 'retry-model' }, toolChoice: 'none', allowedTools: [] },
        },
      },
    });
    // One key per gesture (SC-R6), and every command answer is followed by one attach for the snapshot.
    const commands = worker.requests.filter((request) => request.name !== 'read' && request.name !== 'initialize');
    expect(commands.map((request) => request.name)).toEqual([
      'start',
      'attach',
      'steer',
      'attach',
      'cancel',
      'attach',
      'resume',
      'attach',
      'attach',
    ]);
    expect(new Set(commands.map((request) => request.args['commandId'])).size).toBe(commands.length);
    await expect.poll(() => events).toHaveLength(4);
    expect(liveEvents).toEqual([liveDelta('chat-1', 'run-1', 'live')]);

    unsubscribe();
    unsubscribeLive?.();
    await client.close();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(bridgeDispose).toHaveBeenCalledOnce();
    expect(projectRootDispose).toHaveBeenCalledOnce();
  });

  it('reads with the wire bounds and never asks a worker for more than one page', async () => {
    const worker = new FakeAgentHostWorker();
    const client = createTestClient(worker);
    await client.start({ chatId: 'chat-bounds', runId: 'run-bounds', trigger: 'submit', message: 'Build.' });

    await expect(client.read({ chatId: 'chat-bounds', cursor: 0 })).resolves.toMatchObject({
      status: 'batch',
      events: [{ runId: 'run-bounds', state: 'completed' }],
    });
    const reads = worker.requests.filter((request) => request.name === 'read').map((request) => request.args);
    expect(reads.at(-1)).toEqual({ chatId: 'chat-bounds', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await client.close();
  });

  /* D2's command deadline is gone: an unanswered command is not guessed at, it is re-sent by its key to the worker that
   * replaces a dead one, whose applied set answers a re-send that already landed (SC-R6, SC-R7). */
  it('re-sends an unanswered command by its key to the worker that replaces a crashed one', async () => {
    const crashed = new FakeAgentHostWorker();
    crashed.dropStartResponse = true;
    const replacement = new FakeAgentHostWorker();
    const workers = [crashed, replacement];
    const client = createTestClient(crashed, { createWorker: () => workers.shift() as unknown as Worker });

    const completion = client.start({
      chatId: 'chat-lost-response',
      runId: 'run-lost-response',
      trigger: 'submit',
      message: 'Build.',
    });
    await vi.waitFor(() => {
      expect(crashed.requests.some((request) => request.name === 'start')).toBe(true);
    });
    crashed.crash();

    await expect(completion).resolves.toMatchObject({ runId: 'run-lost-response', state: 'completed' });
    const keyOf = (worker: FakeAgentHostWorker): unknown =>
      worker.requests.find((request) => request.name === 'start')?.args['commandId'];
    expect(keyOf(replacement)).toBe(keyOf(crashed));
    expect(crashed.terminate).toHaveBeenCalled();
    await client.close();
  });

  it('throws a refusal with its code and details', async () => {
    const worker = new FakeAgentHostWorker();
    worker.refusals.set('resume', {
      code: 'RESUME_UNAVAILABLE',
      message: 'Run run-9 is not this chat’s current run.',
      details: { currentRunId: 'run-1' },
    });
    const client = createTestClient(worker);

    await expect(client.resume('chat-1', 'run-9')).rejects.toMatchObject({
      name: 'AgentHostWorkerError',
      code: 'RESUME_UNAVAILABLE',
      details: { currentRunId: 'run-1' },
    });
    await client.close();
  });

  it('fails a command still waiting on the worker when the client closes', async () => {
    const worker = new FakeAgentHostWorker();
    const client = createTestClient(worker, { closeTimeout: 5 });
    await client.start({ chatId: 'chat-closing', runId: 'run-closing', trigger: 'submit', message: 'Build.' });
    worker.dropCommands = true;

    const steering = client.steer('run-closing', 'nudge');
    await vi.waitFor(() => {
      expect(worker.requests.some((request) => request.name === 'steer')).toBe(true);
    });
    await client.close();

    await expect(steering).rejects.toMatchObject({ code: 'CLIENT_CLOSED' });
  });

  it('renews the run idle lease from live activity and settles through terminal replay', async () => {
    const worker = new FakeAgentHostWorker();
    worker.deferRunCompletion = true;
    const client = createTestClient(worker, { runIdleTimeout: 30 });
    const completion = client.start({
      chatId: 'chat-live-lease',
      runId: 'run-live-lease',
      trigger: 'submit',
      message: 'Build slowly.',
    });
    const observeCompletion = async (): Promise<unknown> => {
      try {
        return await completion;
      } catch (error) {
        return error;
      }
    };
    const completionOutcome = observeCompletion();
    await vi.waitFor(() => {
      expect(worker.requests.some((request) => request.name === 'attach')).toBe(true);
    });
    worker.dropRunningAttach = true;
    const heartbeatId = globalThis.setInterval(() => {
      worker.emitLive(liveDelta('chat-live-lease', 'run-live-lease', '.'));
    }, 5);
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 80);
    });
    worker.complete('chat-live-lease');
    globalThis.clearInterval(heartbeatId);

    await expect(completionOutcome).resolves.toMatchObject({ runId: 'run-live-lease', state: 'completed' });
    await client.close();
  });

  it('finds a terminal durable snapshot after the terminal stream event is lost', async () => {
    const worker = new FakeAgentHostWorker();
    worker.deferRunCompletion = true;
    const client = createTestClient(worker, { runIdleTimeout: 5 });
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

  it('forces worker and bridge disposal when graceful close misses its deadline', async () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
    const worker = new FakeAgentHostWorker();
    worker.dropClose = true;
    const bridgeDispose = vi.fn();
    const projectRootDispose = vi.fn();
    const channel = new MessageChannel();
    const projectRootChannel = new MessageChannel();
    const client = createBrowserAgentHostClient({
      openFileSystemBridge: () =>
        ({ port: channel.port1, dispose: bridgeDispose }) as unknown as FileSystemBridgeConnection,
      openProjectRootBridge: () =>
        ({ port: projectRootChannel.port1, dispose: projectRootDispose }) as unknown as FileSystemBridgeConnection,
      projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
      durability: 'exclusive-append',
      authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
      gatewayBaseUrl: 'https://api.tau.test',
      systemPrompt: 'Build CAD.',
      systemPromptBlocks: [
        { type: 'text', text: 'static' },
        { type: 'text', text: 'workspace' },
        { type: 'text', text: 'dynamic' },
      ],
      model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      createWorker: () => worker as unknown as Worker,
      closeTimeout: 5,
    });

    const closing = client.close();
    const outcome = await Promise.race([
      closing.then(() => 'closed'),
      new Promise<'pending'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('pending');
        }, 50);
      }),
    ]);
    try {
      expect(outcome).toBe('closed');
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(bridgeDispose).toHaveBeenCalledOnce();
      expect(projectRootDispose).toHaveBeenCalledOnce();
    } finally {
      worker.terminate();
      await closing;
    }
  });

  it('propagates a real protocol-close failure after disposing local resources', async () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
    const worker = new FakeAgentHostWorker();
    worker.closeError = Object.assign(new Error('event log close failed'), { code: 'EVENT_LOG_CLOSE_FAILED' });
    const channel = new MessageChannel();
    const projectRootChannel = new MessageChannel();
    const client = createBrowserAgentHostClient({
      openFileSystemBridge: () => ({ port: channel.port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection,
      openProjectRootBridge: () =>
        ({ port: projectRootChannel.port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection,
      projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
      durability: 'exclusive-append',
      authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
      gatewayBaseUrl: 'https://api.tau.test',
      systemPrompt: 'Build CAD.',
      systemPromptBlocks: [
        { type: 'text', text: 'static' },
        { type: 'text', text: 'workspace' },
        { type: 'text', text: 'dynamic' },
      ],
      model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      createWorker: () => worker as unknown as Worker,
    });

    await expect(client.close()).rejects.toMatchObject({ code: 'EVENT_LOG_CLOSE_FAILED' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('suppresses close failure only when the worker is already known dead', async () => {
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('BroadcastChannel', vi.fn());
    vi.stubGlobal('navigator', { locks: {}, storage: { getDirectory: vi.fn() } });
    const worker = new FakeAgentHostWorker();
    const channel = new MessageChannel();
    const projectRootChannel = new MessageChannel();
    const client = createBrowserAgentHostClient({
      openFileSystemBridge: () => ({ port: channel.port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection,
      openProjectRootBridge: () =>
        ({ port: projectRootChannel.port1, dispose: vi.fn() }) as unknown as FileSystemBridgeConnection,
      projectStorage: { projectId: 'project-one', backend: 'opfs', providerBasePath: 'project-one' },
      durability: 'exclusive-append',
      authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
      gatewayBaseUrl: 'https://api.tau.test',
      systemPrompt: 'Build CAD.',
      systemPromptBlocks: [
        { type: 'text', text: 'static' },
        { type: 'text', text: 'workspace' },
        { type: 'text', text: 'dynamic' },
      ],
      model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      createWorker: () => worker as unknown as Worker,
    });

    worker.crash();
    await expect(client.close()).resolves.toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe('the browser worker settlement contract', () => {
  /* A failed turn names why with a code as well as a sentence (blueprint P4);
     the settlement schema is strict, so a field it does not know refuses the
     whole durable write — and a refused settlement is a turn that never
     settles. */
  it('accepts a failed-turn settlement that carries its code', () => {
    const settlement = {
      chatId: 'chat-1',
      event: {
        type: 'turn.failed',
        turnId: 'turn-1',
        runId: 'run-1',
        chatId: 'chat-1',
        reason: 'The checkout did not settle the cut in time.',
        code: 'CUT_TIMED_OUT',
      },
    };

    expect(agentHostSettlementRecordSchema.safeParse(settlement)).toMatchObject({ success: true });
  });
});
