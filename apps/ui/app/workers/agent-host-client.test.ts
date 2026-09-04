// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { ChannelServerHandle, HostRunSnapshot } from '@taucad/agent-host';
import { serveAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import {
  createBrowserAgentHostClient,
  getBrowserAgentHostCapability,
  probeBrowserAgentHostCapability,
} from '#services/agent-host-client.js';
import type {
  AgentHostWorkerCallRequest,
  AgentHostWorkerEvent,
  AgentHostWorkerLiveEvent,
  AgentHostWorkerProtocol,
} from '#workers/agent-host.contract.js';
import { agentHostWorkerProtocolSchemas, parseAgentHostWorkerConnect } from '#workers/agent-host.contract.js';

type ErrorListener = (event: ErrorEvent) => void;

class FakeAgentHostWorker {
  public dropCommands = false;
  public dropClose = false;
  public dropRunningAttach = false;
  public dropStartResponse = false;
  public deferRunCompletion = false;
  public closeError: Error | undefined;
  public readonly requests: AgentHostWorkerCallRequest[] = [];
  public readonly postMessage = vi.fn((value: unknown, _transfer?: Transferable[]) => {
    const connection = parseAgentHostWorkerConnect(value);
    this.server = serveAgentWorkerChannel<AgentHostWorkerProtocol>(connection.port, {
      sessionKey: connection.sessionId,
      protocolSchemas: agentHostWorkerProtocolSchemas,
      impl: {
        // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
        call: async (_context, _name, request, signal) => {
          this.requests.push(request);
          if (request.type === 'capabilities') {
            return {
              type: 'capabilities',
              report: {
                supported: true,
                checks: {
                  worker: true,
                  webLocks: true,
                  broadcastChannel: true,
                  opfs: true,
                  syncAccessHandle: true,
                },
              },
            };
          }
          if (request.type === 'initialize') {
            return { type: 'initialized' };
          }
          if (request.type === 'close') {
            if (this.closeError) {
              throw this.closeError;
            }
            if (this.dropClose) {
              return new Promise((_resolve, reject) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    reject(signal.reason instanceof Error ? signal.reason : new Error('Close aborted.'));
                  },
                  { once: true },
                );
              });
            }
            return { type: 'closed' };
          }
          if (this.dropCommands) {
            return new Promise((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  reject(signal.reason instanceof Error ? signal.reason : new Error('Command aborted.'));
                },
                { once: true },
              );
            });
          }
          if (request.type === 'tail' || request.type === 'attach') {
            const batch = { cursor: request.cursor, nextCursor: request.cursor, endCursor: request.cursor, events: [] };
            const snapshot = this.snapshots.get(request.chatId);
            if (request.type === 'attach' && this.dropRunningAttach && snapshot?.state === 'running') {
              return new Promise((_resolve, reject) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    reject(signal.reason instanceof Error ? signal.reason : new Error('Attach aborted.'));
                  },
                  { once: true },
                );
              });
            }
            return request.type === 'attach'
              ? {
                  type: 'attach',
                  chatId: request.chatId,
                  batch,
                  leadership: { role: 'leader', generation: 'generation-1' },
                  ...(snapshot ? { snapshot } : {}),
                  takeover: false,
                }
              : { type: 'tail', chatId: request.chatId, batch };
          }
          const runId = request.type === 'resume' ? 'resumed-run' : request.runId;
          const state = request.type === 'cancel' ? 'cancelled' : this.deferRunCompletion ? 'running' : 'completed';
          const snapshot: HostRunSnapshot = {
            chatId: request.chatId,
            runId,
            turnId: `turn-${runId}`,
            state,
            messages: [],
          };
          this.snapshots.set(request.chatId, snapshot);
          this.emit({
            type: 'event',
            chatId: request.chatId,
            event: {
              version: 1,
              type: 'run.lifecycle',
              leaderEpoch: 'epoch-1',
              sequence: 0,
              recordedAt: '2026-09-01T00:00:00.000Z',
              runId,
              state,
            },
          });
          if (request.type === 'start' && this.dropStartResponse) {
            return new Promise((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  reject(signal.reason instanceof Error ? signal.reason : new Error('Start response aborted.'));
                },
                { once: true },
              );
            });
          }
          return {
            type: 'result',
            operation: request.type,
            snapshot,
          };
        },
        // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
        listen: (_context, name, _args, signal) =>
          (name === 'events'
            ? this.listenTo(this.eventControllers, this.pendingEvents, signal)
            : this.listenTo(this.liveEventControllers, this.pendingLiveEvents, signal)) as AsyncIterable<
            AgentHostWorkerProtocol['listens'][typeof name]['event']
          >,
      },
    });
  });

  public readonly terminate = vi.fn(() => this.server?.dispose());
  private errorListener: ErrorListener | undefined;
  private server: ChannelServerHandle<AgentHostWorkerProtocol> | undefined;
  private readonly eventControllers = new Set<ReadableStreamDefaultController<AgentHostWorkerEvent>>();
  private readonly liveEventControllers = new Set<ReadableStreamDefaultController<AgentHostWorkerLiveEvent>>();
  private readonly pendingEvents: AgentHostWorkerEvent[] = [];
  private readonly pendingLiveEvents: AgentHostWorkerLiveEvent[] = [];
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

  public emit(
    response:
      | ({ readonly type: 'event' } & AgentHostWorkerEvent)
      | ({ readonly type: 'live-event' } & AgentHostWorkerLiveEvent),
  ): void {
    if (response.type === 'event') {
      const event: AgentHostWorkerEvent = { chatId: response.chatId, event: response.event };
      if (this.eventControllers.size === 0) {
        this.pendingEvents.push(event);
        return;
      }
      for (const controller of this.eventControllers) {
        controller.enqueue(event);
      }
      return;
    }
    const event: AgentHostWorkerLiveEvent = { chatId: response.chatId, event: response.event };
    if (this.liveEventControllers.size === 0) {
      this.pendingLiveEvents.push(event);
      return;
    }
    for (const controller of this.liveEventControllers) {
      controller.enqueue(event);
    }
  }

  public crash(message = 'worker crashed'): void {
    this.errorListener?.({ message } as ErrorEvent);
  }

  public complete(chatId: string, emit = true): void {
    const current = this.snapshots.get(chatId);
    if (!current) {
      throw new Error(`No fake run exists for ${chatId}.`);
    }
    const snapshot: HostRunSnapshot = { ...current, state: 'completed' };
    this.snapshots.set(chatId, snapshot);
    if (emit) {
      this.emit({
        type: 'event',
        chatId,
        event: {
          version: 1,
          type: 'run.lifecycle',
          leaderEpoch: 'epoch-1',
          sequence: 1,
          recordedAt: '2026-09-01T00:00:01.000Z',
          runId: snapshot.runId,
          state: 'completed',
        },
      });
    }
  }

  private listenTo<Event>(
    controllers: Set<ReadableStreamDefaultController<Event>>,
    pending: Event[],
    signal: AbortSignal,
  ): AsyncIterable<Event> {
    return new ReadableStream<Event>({
      start: (controller) => {
        controllers.add(controller);
        for (const event of pending.splice(0)) {
          controller.enqueue(event);
        }
        signal.addEventListener(
          'abort',
          () => {
            controllers.delete(controller);
            controller.close();
          },
          { once: true },
        );
      },
      cancel: () => undefined,
    });
  }
}

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
  const channel = new MessageChannel();
  const projectRootChannel = new MessageChannel();
  return createBrowserAgentHostClient({
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
    lengthSymbol: 'mm',
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
          lengthSymbol: 'mm',
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
      lengthSymbol: 'mm',
      createWorker: () => worker as unknown as Worker,
    });

    await expect(client.close()).resolves.toBeUndefined();
    // The Worker leg transfers only the dedicated Channel port; bridge ports are then carried by
    // the validated initialize call, preserving the same two zero-copy transfers without treating Worker as a Port.
    expect(worker.postMessage.mock.calls[0]?.[0]).toMatchObject({ type: 'agent-host/connect' });
    expect(worker.postMessage.mock.calls[0]?.[1]).toHaveLength(1);
    const initializeRequest = worker.requests[0];
    expect(initializeRequest?.type).toBe('initialize');
    if (initializeRequest?.type !== 'initialize') {
      throw new Error('Expected initialize request.');
    }
    expect(initializeRequest.fileSystemPort).toBeInstanceOf(MessagePort);
    expect(initializeRequest.projectRootPort).toBeInstanceOf(MessagePort);
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
    const events: unknown[] = [];
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
        { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
        { type: 'text', text: 'workspace', cacheControl: { type: 'ephemeral' } },
        { type: 'text', text: 'dynamic' },
      ],
      model: { id: 'fixture-model', providerKind: 'openai', contextWindow: 200_000 },
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      lengthSymbol: 'mm',
      createWorker: () => worker as unknown as Worker,
    });
    const liveEvents: unknown[] = [];
    const unsubscribe = client.subscribe((_chatId, event) => {
      events.push(event);
    });
    const unsubscribeLive = client.subscribeLive?.((_chatId, event) => {
      liveEvents.push(event);
    });
    expect(unsubscribeLive).toBeDefined();

    worker.emit({
      type: 'live-event',
      chatId: 'chat-1',
      event: {
        type: 'text-delta',
        chatId: 'chat-1',
        runId: 'run-1',
        messageId: 'message-1',
        contentIndex: 0,
        delta: 'live',
      },
    });

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
    await expect(client.resume('chat-1')).resolves.toMatchObject({ runId: 'resumed-run' });
    await expect(client.attach({ chatId: 'chat-1', cursor: 0, limit: 16 })).resolves.toMatchObject({
      cursor: 0,
      leadership: { role: 'leader', generation: 'generation-1' },
      takeover: false,
    });
    await expect(client.tail({ chatId: 'chat-1', cursor: 0, limit: 17 })).rejects.toMatchObject({
      code: 'TAIL_WINDOW_INVALID',
    });

    // Assertions follow protocol meaning: application requests are Channel calls, while Worker.postMessage
    // is now reserved for the one bootstrap transfer.
    const initialize = worker.requests[0];
    const start = worker.requests[1];
    expect(initialize).toMatchObject({
      type: 'initialize',
      projectStorage: { providerBasePath: 'project-one' },
      authority: { projectId: 'project-one', workspaceId: 'workspace-one' },
      model: { providerKind: 'openai' },
      systemPromptBlocks: [{ text: 'static' }, { text: 'workspace' }, { text: 'dynamic' }],
    });
    if (initialize?.type !== 'initialize') {
      throw new Error('Expected initialize request.');
    }
    expect(initialize.fileSystemPort).toBeInstanceOf(MessagePort);
    expect(initialize.projectRootPort).toBeInstanceOf(MessagePort);
    expect(start).toMatchObject({
      type: 'start',
      chatId: 'chat-1',
      runId: 'run-1',
      config: { model: { id: 'retry-model' }, toolChoice: 'none', allowedTools: [] },
    });
    expect(events).toHaveLength(4);
    expect(liveEvents).toEqual([
      {
        type: 'text-delta',
        chatId: 'chat-1',
        runId: 'run-1',
        messageId: 'message-1',
        contentIndex: 0,
        delta: 'live',
      },
    ]);

    unsubscribe();
    unsubscribeLive?.();
    await client.close();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(bridgeDispose).toHaveBeenCalledOnce();
    expect(projectRootDispose).toHaveBeenCalledOnce();
  });

  it('bounds a command response deadline when the worker stops answering', async () => {
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
      lengthSymbol: 'mm',
      createWorker: () => worker as unknown as Worker,
      commandTimeout: 5,
    });
    // Register a run first so a control command can target it.
    const started = await client.start({
      chatId: 'chat-timeout',
      runId: 'run-registered',
      trigger: 'submit',
      message: 'Register.',
    });
    worker.dropCommands = true;

    // Control commands stay deadline-bounded.
    await expect(client.steer(started.runId, 'nudge')).rejects.toMatchObject({
      code: 'COMMAND_TIMEOUT',
    });
    const startAttempt = client.start({
      chatId: 'chat-timeout-two',
      runId: 'run-timeout',
      trigger: 'submit',
      message: 'Build it.',
    });
    const attachAttempt = client.attach({ chatId: 'chat-timeout-two', cursor: 0, limit: 16 });
    const outcomes = await Promise.all(
      [startAttempt, attachAttempt].map(async (attempt) =>
        Promise.race([
          attempt.then(
            () => 'resolved',
            (error: unknown) => (error instanceof Error && 'code' in error ? error.code : 'rejected'),
          ),
          new Promise<'pending'>((resolve) => {
            globalThis.setTimeout(() => {
              resolve('pending');
            }, 50);
          }),
        ]),
      ),
    );
    expect(outcomes).toEqual(['COMMAND_TIMEOUT', 'COMMAND_TIMEOUT']);
    worker.dropCommands = false;
    await client.close();
    await startAttempt.catch(() => undefined);
    await attachAttempt.catch(() => undefined);
  });

  it('settles from durable replay when the admission response is lost', async () => {
    const worker = new FakeAgentHostWorker();
    worker.dropStartResponse = true;
    const client = createTestClient(worker, { commandTimeout: 5 });

    await expect(
      client.start({ chatId: 'chat-lost-response', runId: 'run-lost-response', trigger: 'submit', message: 'Build.' }),
    ).resolves.toMatchObject({ runId: 'run-lost-response', state: 'completed' });
    expect(worker.requests.filter((request) => request.type === 'attach')).not.toHaveLength(0);
    await client.close();
  });

  it('renews the run idle lease from live activity and settles through terminal replay', async () => {
    const worker = new FakeAgentHostWorker();
    worker.deferRunCompletion = true;
    const client = createTestClient(worker, { commandTimeout: 10, runIdleTimeout: 30 });
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
      expect(worker.requests.some((request) => request.type === 'attach')).toBe(true);
    });
    worker.dropRunningAttach = true;
    const heartbeatId = globalThis.setInterval(() => {
      worker.emit({
        type: 'live-event',
        chatId: 'chat-live-lease',
        event: {
          type: 'text-delta',
          chatId: 'chat-live-lease',
          runId: 'run-live-lease',
          messageId: 'message-live-lease',
          contentIndex: 0,
          delta: '.',
        },
      });
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
    const client = createTestClient(worker, { commandTimeout: 5, runIdleTimeout: 5 });
    const completion = client.start({
      chatId: 'chat-lost-terminal',
      runId: 'run-lost-terminal',
      trigger: 'submit',
      message: 'Build quietly.',
    });
    await vi.waitFor(() => {
      expect(worker.requests.some((request) => request.type === 'attach')).toBe(true);
    });
    worker.complete('chat-lost-terminal', false);

    await expect(completion).resolves.toMatchObject({ runId: 'run-lost-terminal', state: 'completed' });
    expect(worker.requests.filter((request) => request.type === 'attach').length).toBeGreaterThan(1);
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
      lengthSymbol: 'mm',
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
      lengthSymbol: 'mm',
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
      lengthSymbol: 'mm',
      createWorker: () => worker as unknown as Worker,
    });

    worker.crash();
    await expect(client.close()).resolves.toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
