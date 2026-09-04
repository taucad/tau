import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type {
  AgentLiveEvent,
  AgentLogEvent,
  Channel,
  EventLogBatch,
  HostRunSnapshot,
  InterruptResolution,
  RunTrigger,
  StorageDurabilityClass,
  UserProviderMessage,
  WithTransferables,
} from '@taucad/agent-host';
import { isGatewayProviderKind } from '@taucad/agent-host';
import { connectAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { randomUuid } from '@taucad/utils/id';
import type { LengthSymbol } from '@taucad/units';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import type {
  AgentHostAdmissionConfig,
  AgentHostCapabilityReport,
  AgentHostExternalAgent,
  AgentHostModel,
  AgentHostWorkerCallRequest,
  AgentHostWorkerCallResponse,
  AgentHostWorkerCommandInput,
  AgentHostWorkerProtocol,
} from '#workers/agent-host.contract.js';
import {
  agentHostTailBatchLimit,
  agentHostWorkerProtocolSchemas,
  createAgentHostCapabilityReport,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import type {
  AgentHostTransport,
  AgentHostTransportCloseReason,
  AgentHostTransportRequest,
  AgentHostTransportResponse,
  AgentHostTransportStreams,
} from '#services/agent-host-transport.js';

export type BrowserAgentHostCapability = AgentHostCapabilityReport;

/** Whether the browser agent host can route the selected provider through Tau's gateway. */
export const isBrowserAgentHostProviderKind = isGatewayProviderKind;

/** Additive flag seam for W3-PROJ: no route opts in unless this returns supported. */
export const getBrowserAgentHostCapability = (
  durability: StorageDurabilityClass = 'exclusive-append',
): BrowserAgentHostCapability => {
  const fileHandlePrototype =
    typeof FileSystemFileHandle === 'undefined'
      ? undefined
      : (FileSystemFileHandle.prototype as FileSystemFileHandle & { createSyncAccessHandle?: unknown });
  return createAgentHostCapabilityReport(
    {
      worker: typeof Worker !== 'undefined',
      webLocks: typeof navigator !== 'undefined' && 'locks' in navigator,
      broadcastChannel: typeof BroadcastChannel !== 'undefined',
      opfs:
        typeof navigator !== 'undefined' &&
        'storage' in navigator &&
        typeof navigator.storage.getDirectory === 'function',
      syncAccessHandle: typeof fileHandlePrototype?.createSyncAccessHandle === 'function',
    },
    durability,
  );
};

type BrowserAgentHostCapabilityProbeOptions = {
  readonly createWorker?: (() => Worker) | undefined;
  readonly durability?: StorageDurabilityClass | undefined;
  /** Milliseconds. */
  readonly capabilityProbeTimeout?: number | undefined;
};

const createDefaultWorker = (): Worker =>
  new Worker(new URL('../workers/agent-host.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tau-agent-host-worker',
  });

const connectWorker = (worker: Worker, sessionId: string): Channel<AgentHostWorkerProtocol> => {
  const channel = new MessageChannel();
  worker.postMessage(parseAgentHostWorkerConnect({ type: 'agent-host/connect', sessionId, port: channel.port1 }), [
    channel.port1,
  ]);
  return connectAgentWorkerChannel<AgentHostWorkerProtocol>(channel.port2, {
    sessionKey: sessionId,
    protocolSchemas: agentHostWorkerProtocolSchemas,
    label: 'agent-host-main',
  });
};

const runBrowserAgentHostCapabilityProbe = async (
  options: BrowserAgentHostCapabilityProbeOptions,
): Promise<BrowserAgentHostCapability> => {
  const durability = options.durability ?? 'exclusive-append';
  const staticReport = getBrowserAgentHostCapability(durability);
  const staticChecks = staticReport.checks;
  const withoutSync = createAgentHostCapabilityReport({ ...staticChecks, syncAccessHandle: true }, durability);
  if (!withoutSync.supported) {
    return staticReport;
  }
  const worker = (options.createWorker ?? createDefaultWorker)();
  const channel = connectWorker(worker, randomUuid());
  const capabilityAbort = new AbortController();
  const capabilityTimeoutId = globalThis.setTimeout(() => {
    capabilityAbort.abort();
  }, options.capabilityProbeTimeout ?? 5000);
  try {
    const response = await channel.call('request', { type: 'capabilities', durability }, capabilityAbort.signal);
    return response.type === 'capabilities'
      ? response.report
      : createAgentHostCapabilityReport({ ...staticChecks, syncAccessHandle: false }, durability);
  } catch {
    return createAgentHostCapabilityReport({ ...staticChecks, syncAccessHandle: false }, durability);
  } finally {
    globalThis.clearTimeout(capabilityTimeoutId);
    channel.close();
    worker.terminate();
  }
};

const defaultCapabilityProbes = new Map<StorageDurabilityClass, Promise<BrowserAgentHostCapability>>();

/** Run the functional dedicated-worker probe used by placement before admission. */
export const probeBrowserAgentHostCapability = async (
  options: BrowserAgentHostCapabilityProbeOptions = {},
): Promise<BrowserAgentHostCapability> => {
  if (options.createWorker !== undefined || options.capabilityProbeTimeout !== undefined) {
    return runBrowserAgentHostCapabilityProbe(options);
  }
  const durability = options.durability ?? 'exclusive-append';
  const probe = defaultCapabilityProbes.get(durability) ?? runBrowserAgentHostCapabilityProbe(options);
  defaultCapabilityProbes.set(durability, probe);
  try {
    return await probe;
  } catch (error) {
    defaultCapabilityProbes.delete(durability);
    throw error;
  }
};

export class AgentHostWorkerError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentHostWorkerError';
    this.code = code;
  }
}

export type AgentHostClientOptions = {
  readonly openFileSystemBridge: () => FileSystemBridgeConnection;
  readonly openProjectRootBridge: () => FileSystemBridgeConnection;
  readonly projectStorage: ProjectFileSystemConfig;
  readonly durability: StorageDurabilityClass;
  readonly authority: { readonly projectId: string; readonly workspaceId: string };
  readonly gatewayBaseUrl: string;
  readonly systemPrompt: string;
  readonly systemPromptBlocks: AgentHostAdmissionConfig['systemPromptBlocks'];
  readonly model: AgentHostModel;
  readonly runtimeConfig: UiRuntimeConfigInput;
  readonly lengthSymbol: LengthSymbol;
  readonly testingEnabled?: boolean | undefined;
  readonly createWorker?: (() => Worker) | undefined;
  readonly initializationTimeout?: number | undefined;
  readonly commandTimeout?: number | undefined;
  readonly runIdleTimeout?: number | undefined;
  readonly closeTimeout?: number | undefined;
};

type AgentHostStartInputBase = {
  readonly chatId: string;
  readonly runId: string;
  readonly message: string | UserProviderMessage;
  readonly config?: AgentHostAdmissionConfig | undefined;
  /**
   * External agent to run this turn (W4-ACP); absent = the host's own harness.
   * Only a daemon transport can honour it — the browser worker has no process
   * to spawn — and only a daemon-placed execution ever carries one.
   */
  readonly agent?: AgentHostExternalAgent | undefined;
};

export type AgentHostStartInput = AgentHostStartInputBase &
  (
    | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
    | { readonly trigger: Exclude<RunTrigger, 'submit'>; readonly retainedMessageIds: readonly string[] }
  );

/**
 * The transport-agnostic host client. One projection renders a run whether it
 * came from the dedicated browser worker or from a paired daemon's socket.
 *
 * @public
 */
export type AgentHostClient = {
  start(input: AgentHostStartInput): Promise<HostRunSnapshot>;
  steer(runId: string, message: string): Promise<HostRunSnapshot>;
  cancel(runId: string): Promise<HostRunSnapshot>;
  resume(chatId: string): Promise<HostRunSnapshot>;
  resolveInterrupt(chatId: string, runId: string, resolution: InterruptResolution): Promise<HostRunSnapshot>;
  attach(input: { readonly chatId: string; readonly cursor: number; readonly limit: number }): Promise<
    EventLogBatch & {
      readonly leadership?:
        | { readonly role: 'leader'; readonly generation: string }
        | { readonly role: 'follower'; readonly generation?: string | undefined }
        | undefined;
      readonly snapshot?: HostRunSnapshot | undefined;
      readonly takeover?: boolean | undefined;
    }
  >;
  tail(input: { readonly chatId: string; readonly cursor: number; readonly limit: number }): Promise<EventLogBatch>;
  subscribe(listener: (chatId: string, event: AgentLogEvent) => void): () => void;
  subscribeLive?(listener: (chatId: string, event: AgentLiveEvent) => void): () => void;
  close(): Promise<void>;
};

const userMessage = (message: AgentHostStartInput['message']): UserProviderMessage =>
  typeof message === 'string' ? { id: randomUuid(), role: 'user', content: message } : message;

/** Static + dynamic at minimum; the workspace block rides between them when it has content. */
const hasCacheablePromptBlocks = (blocks: readonly unknown[]): boolean => blocks.length >= 2;

const toWorkerError = (error: unknown, fallbackCode: string): AgentHostWorkerError => {
  if (error instanceof AgentHostWorkerError) {
    return error;
  }
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  return new AgentHostWorkerError(
    typeof code === 'string' ? code : fallbackCode,
    error instanceof Error ? error.message : String(error),
  );
};

const tailWindowError = (): AgentHostWorkerError =>
  new AgentHostWorkerError(
    'TAIL_WINDOW_INVALID',
    `Follower replay requires a cursor at or above zero and a limit from 1 to ${agentHostTailBatchLimit}.`,
  );

const validTailWindow = (input: { readonly cursor: number; readonly limit: number }): boolean =>
  Number.isSafeInteger(input.cursor) &&
  input.cursor >= 0 &&
  Number.isSafeInteger(input.limit) &&
  input.limit >= 1 &&
  input.limit <= agentHostTailBatchLimit;

const terminalRunState = (state: HostRunSnapshot['state']): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';
/** Deadlines the transport-agnostic core enforces on every wire. */
export type AgentHostClientCoreOptions = {
  readonly commandTimeout?: number | undefined;
  readonly runIdleTimeout?: number | undefined;
  readonly closeTimeout?: number | undefined;
};

/**
 * The one agent-host client, over any transport.
 *
 * Nothing here knows whether it is talking to a dedicated worker or to a
 * daemon's socket: command deadlines, durable replay, the run-idle lease and
 * the close handshake are properties of the *host protocol*, not of the wire.
 *
 * @param transport - The wire to drive.
 * @param options - Command, idle and close deadlines.
 * @returns A client whose answers the projection cannot distinguish by origin.
 * @public
 */
export const createAgentHostClient = (
  transport: AgentHostTransport,
  options: AgentHostClientCoreOptions = {},
): AgentHostClient => {
  const chatsByRun = new Map<string, string>();
  const streamSubscriptions = new Set<AbortController>();
  let closed = false;
  let transportFailure: AgentHostWorkerError | undefined;

  const offTransportClose = transport.onClose?.((reason) => {
    transportFailure ??= new AgentHostWorkerError(reason.code, reason.message);
  });
  /* A function, not a narrowed read: the wire can die *during* the close call,
   * and a value captured before it would suppress nothing. */
  const transportDied = (): boolean => transportFailure !== undefined;

  const call = async (
    request: AgentHostTransportRequest,
    signal?: AbortSignal,
  ): Promise<AgentHostTransportResponse> => {
    if (closed && request.type !== 'close') {
      throw new AgentHostWorkerError('CLIENT_CLOSED', 'Agent host client is closed.');
    }
    if (transportFailure) {
      throw transportFailure;
    }
    try {
      return await transport.call(request, signal);
    } catch (error) {
      throw toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
    }
  };

  const callCommand = async (request: AgentHostWorkerCommandInput): Promise<AgentHostTransportResponse> => {
    const commandAbort = new AbortController();
    const timeoutError = new AgentHostWorkerError('COMMAND_TIMEOUT', `Agent host command ${request.type} timed out.`);
    const commandTimeoutId = globalThis.setTimeout(() => {
      commandAbort.abort(timeoutError);
    }, options.commandTimeout ?? 15_000);
    try {
      return await call(request, commandAbort.signal);
    } catch (error) {
      if (commandAbort.signal.aborted) {
        throw timeoutError;
      }
      throw error;
    } finally {
      globalThis.clearTimeout(commandTimeoutId);
    }
  };

  const command = async (request: AgentHostWorkerCommandInput): Promise<HostRunSnapshot> => {
    await transport.ready;
    const response = await callCommand(request);
    if (response.type !== 'result') {
      throw new AgentHostWorkerError(
        'WORKER_PROTOCOL_INVALID',
        `Agent host returned ${response.type} for ${request.type}.`,
      );
    }
    chatsByRun.set(response.snapshot.runId, response.snapshot.chatId);
    return response.snapshot;
  };

  const chatFor = (runId: string): string => {
    const chatId = chatsByRun.get(runId);
    if (!chatId) {
      throw new AgentHostWorkerError('RUN_NOT_FOUND', `No chat is registered for run ${runId}.`);
    }
    return chatId;
  };

  const tail = async (input: { readonly chatId: string; readonly cursor: number; readonly limit: number }) => {
    await transport.ready;
    if (!validTailWindow(input)) {
      throw tailWindowError();
    }
    const response = await callCommand({ type: 'tail', ...input });
    if (response.type !== 'tail') {
      throw new AgentHostWorkerError('WORKER_PROTOCOL_INVALID', `Agent host returned ${response.type} for tail.`);
    }
    return response.batch;
  };

  const attach = async (input: {
    readonly chatId: string;
    readonly cursor: number;
    readonly limit: number;
  }): ReturnType<AgentHostClient['attach']> => {
    await transport.ready;
    if (!validTailWindow(input)) {
      throw tailWindowError();
    }
    const response = await callCommand({ type: 'attach', ...input });
    if (response.type !== 'attach') {
      throw new AgentHostWorkerError('WORKER_PROTOCOL_INVALID', `Agent host returned ${response.type} for attach.`);
    }
    return {
      ...response.batch,
      leadership: response.leadership,
      ...(response.snapshot ? { snapshot: response.snapshot } : {}),
      takeover: response.takeover,
    };
  };

  const subscribe = <Name extends keyof AgentHostTransportStreams>(
    name: Name,
    listener: (event: AgentHostTransportStreams[Name]) => void,
  ): (() => void) => {
    const operation = new AbortController();
    streamSubscriptions.add(operation);
    const consume = async (): Promise<void> => {
      try {
        await transport.ready;
        for await (const event of transport.listen(name, operation.signal)) {
          listener(event);
        }
      } catch (error) {
        if (!operation.signal.aborted) {
          transportFailure ??= toWorkerError(error, 'WORKER_STREAM_FAILED');
        }
      } finally {
        streamSubscriptions.delete(operation);
      }
    };
    void consume();
    return () => {
      operation.abort();
    };
  };

  const waitForRunCompletion = async (initial: HostRunSnapshot): Promise<HostRunSnapshot> => {
    if (terminalRunState(initial.state)) {
      return initial;
    }
    let cursor = 0;
    let wake = Promise.withResolvers<'activity' | 'terminal'>();
    const signalActivity = (terminalEvent = false): void => {
      wake.resolve(terminalEvent ? 'terminal' : 'activity');
    };
    const unsubscribeEvents = subscribe('events', ({ chatId, event }) => {
      if (chatId !== initial.chatId || event.runId !== initial.runId) {
        return;
      }
      signalActivity(
        event.type === 'run.lifecycle' &&
          (event.state === 'completed' || event.state === 'failed' || event.state === 'cancelled'),
      );
    });
    const unsubscribeLiveEvents = subscribe('liveEvents', ({ chatId, event }) => {
      if (chatId === initial.chatId && event.runId === initial.runId) {
        signalActivity();
      }
    });
    const replaySnapshot = async (): Promise<HostRunSnapshot> => {
      let attached: Awaited<ReturnType<AgentHostClient['attach']>>;
      try {
        attached = await attach({ chatId: initial.chatId, cursor, limit: agentHostTailBatchLimit });
      } catch (error) {
        if (error instanceof AgentHostWorkerError && error.code === 'COMMAND_TIMEOUT') {
          throw new AgentHostWorkerError(
            'RUN_IDLE_TIMEOUT',
            `Agent host run ${initial.runId} stopped answering liveness probes.`,
          );
        }
        throw error;
      }
      const { snapshot } = attached;
      cursor = attached.nextCursor;
      if (!snapshot || snapshot.runId !== initial.runId) {
        throw new AgentHostWorkerError(
          'RUN_SNAPSHOT_MISSING',
          `Agent host replay did not return run ${initial.runId}.`,
        );
      }
      return snapshot;
    };
    try {
      let snapshot = await replaySnapshot();
      while (!terminalRunState(snapshot.state)) {
        const activity = wake.promise;
        const idle = Promise.withResolvers<'idle'>();
        const idleTimeoutId = globalThis.setTimeout(() => {
          idle.resolve('idle');
        }, options.runIdleTimeout ?? 30_000);
        // oxlint-disable-next-line no-await-in-loop -- Each lease waits for the next activity-or-idle transition.
        const outcome = await Promise.race([activity, idle.promise]);
        globalThis.clearTimeout(idleTimeoutId);
        wake = Promise.withResolvers<'activity' | 'terminal'>();
        if (outcome === 'activity') {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- Replay cursors are sequential and the next lease depends on this snapshot.
        snapshot = await replaySnapshot();
      }
      return snapshot;
    } finally {
      unsubscribeEvents();
      unsubscribeLiveEvents();
    }
  };

  const runCommand = async (options_: {
    readonly chatId: string;
    readonly runId?: string | undefined;
    readonly execute: () => Promise<HostRunSnapshot>;
  }): Promise<HostRunSnapshot> => {
    let admitted: HostRunSnapshot;
    try {
      admitted = await options_.execute();
    } catch (error) {
      if (!(error instanceof AgentHostWorkerError) || error.code !== 'COMMAND_TIMEOUT') {
        throw error;
      }
      const replay = await attach({ chatId: options_.chatId, cursor: 0, limit: agentHostTailBatchLimit });
      if (!replay.snapshot || (options_.runId !== undefined && replay.snapshot.runId !== options_.runId)) {
        throw error;
      }
      admitted = replay.snapshot;
    }
    if (options_.runId !== undefined && admitted.runId !== options_.runId) {
      throw new AgentHostWorkerError(
        'RUN_SNAPSHOT_MISMATCH',
        `Agent host admitted ${admitted.runId} instead of ${options_.runId}.`,
      );
    }
    return waitForRunCompletion(admitted);
  };

  const disposeSubscriptions = (): void => {
    for (const subscription of streamSubscriptions) {
      subscription.abort();
    }
    streamSubscriptions.clear();
    offTransportClose?.();
  };

  return {
    async start(input) {
      chatsByRun.set(input.runId, input.chatId);
      const base = {
        type: 'start',
        chatId: input.chatId,
        runId: input.runId,
        message: userMessage(input.message),
        ...(input.config ? { config: input.config } : {}),
        ...(input.agent ? { agent: input.agent } : {}),
      } as const;
      return runCommand({
        chatId: input.chatId,
        runId: input.runId,
        execute: async () =>
          input.trigger === 'submit'
            ? command({ ...base, trigger: 'submit' })
            : command({ ...base, trigger: input.trigger, retainedMessageIds: input.retainedMessageIds }),
      });
    },
    steer: async (runId, message) => command({ type: 'steer', chatId: chatFor(runId), runId, message }),
    cancel: async (runId) => command({ type: 'cancel', chatId: chatFor(runId), runId }),
    resume: async (chatId) => runCommand({ chatId, execute: async () => command({ type: 'resume', chatId }) }),
    resolveInterrupt: async (chatId, runId, resolution) =>
      command({ type: 'resolve-interrupt', chatId, runId, ...resolution }),
    attach,
    tail,
    subscribe: (listener) =>
      subscribe('events', (response) => {
        listener(response.chatId, response.event);
      }),
    subscribeLive: (listener) =>
      subscribe('liveEvents', (response) => {
        listener(response.chatId, response.event);
      }),
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      try {
        // A failed readiness already surfaced through the call that awaited it —
        // close() must stay best-effort and never re-raise it.
        try {
          await transport.ready;
        } catch {
          return;
        }
        if (transportDied()) {
          return;
        }
        const closeAbort = new AbortController();
        const timeoutError = new AgentHostWorkerError('CLOSE_TIMEOUT', 'Agent host worker close timed out.');
        const deadline = Promise.withResolvers<never>();
        const closeTimeoutId = globalThis.setTimeout(() => {
          deadline.reject(timeoutError);
          closeAbort.abort(timeoutError);
        }, options.closeTimeout ?? 5000);
        try {
          const response = await Promise.race([call({ type: 'close' }, closeAbort.signal), deadline.promise]);
          if (response.type !== 'closed') {
            throw new AgentHostWorkerError(
              'WORKER_PROTOCOL_INVALID',
              'Agent host worker returned the wrong close result.',
            );
          }
        } catch (error) {
          if (error !== timeoutError && !transportDied()) {
            throw error;
          }
        } finally {
          globalThis.clearTimeout(closeTimeoutId);
        }
      } finally {
        disposeSubscriptions();
        transport.close();
      }
    },
  };
};

/**
 * The dedicated-worker transport: one per-tab worker, initialized over the wire
 * with the two transferred filesystem bridge ports.
 *
 * @param options - Everything the worker needs to admit a run in this project.
 * @returns A transport bound to a freshly created worker.
 */
const createAgentHostWorkerTransport = (options: AgentHostClientOptions): AgentHostTransport => {
  const capability = createAgentHostCapabilityReport(
    { ...getBrowserAgentHostCapability(options.durability).checks, syncAccessHandle: true },
    options.durability,
  );
  if (!capability.supported) {
    throw new AgentHostWorkerError(capability.reason, `Browser agent host is unavailable: ${capability.reason}`);
  }
  if (!isBrowserAgentHostProviderKind(options.model.providerKind)) {
    throw new AgentHostWorkerError(
      'MODEL_PROVIDER_UNSUPPORTED',
      `Browser host does not speak the ${options.model.providerKind} provider wire.`,
    );
  }
  if (!hasCacheablePromptBlocks(options.systemPromptBlocks)) {
    throw new AgentHostWorkerError(
      'PROMPT_BLOCKS_REQUIRED',
      'Browser host requires at least the static and dynamic system prompt blocks.',
    );
  }
  const bridge = options.openFileSystemBridge();
  let projectRootBridge: FileSystemBridgeConnection;
  try {
    projectRootBridge = options.openProjectRootBridge();
  } catch (error) {
    bridge.dispose();
    throw error;
  }
  let worker: Worker;
  try {
    worker = (options.createWorker ?? createDefaultWorker)();
  } catch (error) {
    bridge.dispose();
    projectRootBridge.dispose();
    throw error;
  }
  const sessionId = randomUuid();
  const channel = connectWorker(worker, sessionId);
  const closeHandlers = new Set<(reason: AgentHostTransportCloseReason) => void>();
  let death: AgentHostTransportCloseReason | undefined;
  let disposed = false;

  const reportDeath = (reason: AgentHostTransportCloseReason): void => {
    if (death) {
      return;
    }
    death = reason;
    for (const handler of closeHandlers) {
      handler(reason);
    }
    closeHandlers.clear();
  };

  const onError = (event: ErrorEvent): void => {
    reportDeath({ code: 'WORKER_CRASHED', message: event.message || 'Agent host worker crashed.' });
    channel.close(death?.message);
  };
  worker.addEventListener('error', onError);

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    worker.removeEventListener('error', onError);
    channel.close();
    worker.terminate();
    bridge.dispose();
    projectRootBridge.dispose();
  };

  const rawCall = async (
    request: AgentHostWorkerCallRequest,
    transferables?: readonly Transferable[],
    signal?: AbortSignal,
  ): Promise<AgentHostWorkerCallResponse> => {
    const args: AgentHostWorkerCallRequest | WithTransferables<AgentHostWorkerCallRequest> = transferables
      ? { value: request, transferables }
      : request;
    return channel.call('request', args, signal);
  };

  // Issued eagerly, before anything awaits readiness: the two bridge ports are
  // transferred with it, and a later issue would race a command that queued.
  const initialize = rawCall(
    {
      type: 'initialize',
      fileSystemPort: bridge.port,
      projectRootPort: projectRootBridge.port,
      projectStorage: options.projectStorage,
      authority: options.authority,
      gatewayBaseUrl: options.gatewayBaseUrl,
      systemPrompt: options.systemPrompt,
      systemPromptBlocks: options.systemPromptBlocks,
      model: options.model,
      runtimeConfig: options.runtimeConfig,
      lengthSymbol: options.lengthSymbol,
      testingEnabled: options.testingEnabled,
    },
    [bridge.port, projectRootBridge.port],
  );
  const initializeWorker = async (): Promise<void> => {
    const deadline = new AbortController();
    const initializationTimeoutId = globalThis.setTimeout(() => {
      deadline.abort();
    }, options.initializationTimeout ?? 10_000);
    try {
      const response = await Promise.race([
        initialize,
        new Promise<never>((_resolve, reject) => {
          deadline.signal.addEventListener(
            'abort',
            () => {
              reject(new AgentHostWorkerError('INITIALIZATION_TIMEOUT', 'Agent host worker initialization timed out.'));
            },
            { once: true },
          );
        }),
      ]);
      if (response.type !== 'initialized') {
        throw new AgentHostWorkerError(
          'WORKER_PROTOCOL_INVALID',
          'Agent host worker returned the wrong initialization result.',
        );
      }
    } catch (error) {
      dispose();
      throw error;
    } finally {
      globalThis.clearTimeout(initializationTimeoutId);
    }
  };

  return {
    ready: initializeWorker(),
    call: async (request, signal) => {
      if (death) {
        throw new AgentHostWorkerError(death.code, death.message);
      }
      const response = await rawCall(request, undefined, signal);
      if (response.type === 'capabilities' || response.type === 'initialized') {
        throw new AgentHostWorkerError(
          'WORKER_PROTOCOL_INVALID',
          `Agent host returned ${response.type} for ${request.type}.`,
        );
      }
      return response;
    },
    listen<Name extends keyof AgentHostTransportStreams>(
      name: Name,
      signal: AbortSignal,
    ): AsyncIterable<AgentHostTransportStreams[Name]> {
      /* The two stream names index the same two frame shapes on both types;
       * TypeScript cannot prove that through a generic index, so assert it once
       * here rather than widening the transport contract for every consumer. */
      return channel.listen(name, undefined, signal) as AsyncIterable<AgentHostTransportStreams[Name]>;
    },
    onClose: (handler) => {
      if (death) {
        handler(death);
        return (): void => undefined;
      }
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    close: dispose,
  };
};

/**
 * Main-thread client for the dedicated per-tab browser host worker.
 *
 * @param options - Worker, bridge, model and prompt configuration.
 * @returns A host client bound to a freshly created worker.
 * @public
 */
export const createBrowserAgentHostClient = (options: AgentHostClientOptions): AgentHostClient =>
  createAgentHostClient(createAgentHostWorkerTransport(options), options);
