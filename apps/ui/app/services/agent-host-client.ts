import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type {
  AgentLiveEvent,
  AgentLogEvent,
  Channel,
  HostRunSnapshot,
  InterruptResolution,
  RunTrigger,
  StorageDurabilityClass,
  UserProviderMessage,
} from '@taucad/agent-host';
import { isGatewayProviderKind } from '@taucad/agent-host';
import { ChannelClosedError, connectAgentWorkerChannel } from '@taucad/agent-host/channel-client';
import { agentWireLimits } from '@taucad/agent-host/wire';
import type {
  AgentChannelAdmissionConfig,
  CommandAnswer,
  HostCommand,
  ReadAnswer,
  ReadRequest,
} from '@taucad/agent-host/wire';
import { generatePrefixedId, randomUuid } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { Topic } from '@taucad/events';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import type {
  AgentHostAdmissionConfig,
  AgentHostCapabilityReport,
  AgentHostExternalAgent,
  AgentHostExternalContext,
  AgentHostModel,
  AgentHostWorkerProtocol,
  AgentHostWorkerSettlementRecord,
} from '#workers/agent-host.contract.js';
import {
  agentHostWorkerProtocolSchemas,
  createAgentHostCapabilityReport,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import type { AgentHostTransport, AgentHostTransportCloseReason } from '#services/agent-host-transport.js';
import { createBrowserAgentWorker } from '#services/browser-agent-worker.js';

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

/** Page-side liveness bound on a worker that keeps alive every second (T9 E3, E4). Milliseconds. */
const workerLivenessTimeout = 3500;

const connectWorker = (worker: Worker, sessionId: string): Channel<AgentHostWorkerProtocol> => {
  const channel = new MessageChannel();
  worker.postMessage(parseAgentHostWorkerConnect({ type: 'agent-host/connect', sessionId, port: channel.port1 }), [
    channel.port1,
  ]);
  return connectAgentWorkerChannel<AgentHostWorkerProtocol>(channel.port2, {
    sessionKey: sessionId,
    protocolSchemas: agentHostWorkerProtocolSchemas,
    label: 'agent-host-main',
    livenessTimeout: workerLivenessTimeout,
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
  const worker = (options.createWorker ?? createBrowserAgentWorker)();
  const channel = connectWorker(worker, randomUuid());
  const capabilityAbort = new AbortController();
  const capabilityTimeoutId = globalThis.setTimeout(() => {
    capabilityAbort.abort();
  }, options.capabilityProbeTimeout ?? 5000);
  try {
    return await channel.call('capabilities', { durability }, capabilityAbort.signal);
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
  /** The refusal's own fields, when the owner answered with some. */
  public readonly details?: Readonly<Record<string, unknown>> | undefined;

  public constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'AgentHostWorkerError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export type AgentHostClientOptions = {
  readonly openFileSystemBridge: () => FileSystemBridgeConnection;
  readonly openProjectRootBridge: () => FileSystemBridgeConnection;
  readonly computeMode?: 'off' | 'memory' | 'durable' | undefined;
  readonly openComputeStorePort?: (() => MessagePort) | undefined;
  readonly projectStorage: ProjectFileSystemConfig;
  readonly durability: StorageDurabilityClass;
  readonly authority: { readonly projectId: string; readonly workspaceId: string };
  readonly gatewayBaseUrl: string;
  readonly systemPrompt: string;
  readonly systemPromptBlocks: AgentHostAdmissionConfig['systemPromptBlocks'];
  readonly model: AgentHostModel;
  readonly runtimeConfig: UiRuntimeConfigInput;
  readonly testingEnabled?: boolean | undefined;
  readonly createWorker?: (() => Worker) | undefined;
  readonly initializationTimeout?: number | undefined;
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
  /** CAD context for that external agent (V12); meaningless without one. */
  readonly context?: AgentHostExternalContext | undefined;
};

export type AgentHostStartInput = AgentHostStartInputBase &
  (
    | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
    | { readonly trigger: Exclude<RunTrigger, 'submit'>; readonly retainedMessageIds: readonly string[] }
  );

/** One read of a chat's durable rows from the reader's own position (SC-R11, SC-R12). */
export type AgentHostReadInput = {
  readonly chatId: string;
  readonly cursor: number;
  /** The key of the row at `cursor - 1`, so an owner can refuse a reader on another history. */
  readonly last?: ReadRequest['last'] | undefined;
};

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
  /** Continue the chat's current run, `runId`; any other run is refused `RESUME_UNAVAILABLE`. */
  resume(chatId: string, runId: string): Promise<HostRunSnapshot>;
  resolveInterrupt(chatId: string, runId: string, resolution: InterruptResolution): Promise<HostRunSnapshot>;
  /** The `attach` command, then one read from `cursor`: the chat's run and its first page of rows. */
  attach(input: AgentHostReadInput): Promise<
    ReadAnswer & {
      readonly snapshot?: HostRunSnapshot | undefined;
      readonly takeover?: boolean | undefined;
    }
  >;
  /** One read of the chat's durable rows; a refusal means the reader resets to cursor 0, never a clamp. */
  read(input: AgentHostReadInput): Promise<ReadAnswer>;
  recordSettlement?(event: AgentHostWorkerSettlementRecord['event']): Promise<void>;
  /**
   * Follow one chat's durable rows from `cursor`: one outstanding long-poll read at a time (SC-R14).
   * ponytail: rows are handed over one by one, in the push shape the page projection folds; W9 replaces it.
   */
  subscribe(
    input: { readonly chatId: string; readonly cursor: number },
    listener: (chatId: string, event: AgentLogEvent) => void,
  ): () => void;
  /** One chat's live deltas. */
  subscribeLive?(chatId: string, listener: (chatId: string, event: AgentLiveEvent) => void): () => void;
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

/** Read through a call, so a check after an `await` is not narrowed by the one before it. */
const isAborted = (signal: AbortSignal): boolean => signal.aborted;

const terminalRunState = (state: HostRunSnapshot['state']): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';

/**
 * Project the page's admission config onto the wire's (drift items 2, 3).
 *
 * `testingEnabled` does not travel: a host's tool registry is its own (the
 * worker takes it at initialization, a daemon from its CLI). `model` does: the
 * wire field is optional so a headless daemon can run on its own default, but a
 * page that has picked a model expects that model.
 */
const wireAdmissionConfig = (config: AgentHostAdmissionConfig): AgentChannelAdmissionConfig => ({
  systemPrompt: config.systemPrompt,
  // Copied out of their readonly tuples; the wire shape is mutable by construction.
  systemPromptBlocks: [...config.systemPromptBlocks] as AgentChannelAdmissionConfig['systemPromptBlocks'],
  /* The page types any catalog provider; the wire names the gateway's, and the owner refuses the rest as unreadable. */
  model: config.model as AgentChannelAdmissionConfig['model'],
  toolChoice: typeof config.toolChoice === 'string' ? config.toolChoice : [...config.toolChoice],
  allowedTools: [...config.allowedTools],
  ...(config.snapshot === undefined ? {} : { snapshot: config.snapshot }),
  /* Client-authored payloads are deeply `readonly`; the wire shape is deeply
   * mutable. Same values, opposite variance — copied in, asserted once. */
  ...(config.contextPayload === undefined
    ? {}
    : { contextPayload: config.contextPayload as AgentChannelAdmissionConfig['contextPayload'] }),
  ...(config.contextMessages === undefined
    ? {}
    : { contextMessages: [...config.contextMessages] as AgentChannelAdmissionConfig['contextMessages'] }),
});

/**
 * The admission an external-agent turn carries (W4-ACP): the agent selector in
 * `config.agent`, and what the client *composed* (V12) — the CAD system prompt,
 * the skill index and the editor snapshot. Nothing a Tau turn negotiates
 * travels; `toolChoice` is required by the wire and inert here.
 */
const externalAdmissionConfig = (
  agent: AgentHostExternalAgent,
  context: AgentHostExternalContext | undefined,
): AgentChannelAdmissionConfig => ({
  agent: { ...agent, ...(agent.config === undefined ? {} : { config: { ...agent.config } }) },
  systemPrompt: context?.systemPrompt ?? '',
  toolChoice: 'auto',
  /* Same values, opposite variance — see {@link wireAdmissionConfig}. */
  ...(context?.contextPayload === undefined
    ? {}
    : { contextPayload: context.contextPayload as AgentChannelAdmissionConfig['contextPayload'] }),
  ...(context?.snapshot === undefined ? {} : { snapshot: context.snapshot }),
});

/** Deadlines the transport-agnostic core enforces on every wire. */
export type AgentHostClientCoreOptions = {
  readonly runIdleTimeout?: number | undefined;
  readonly closeTimeout?: number | undefined;
  /** Browser revision roots append their settlement through this client's log writer. */
  readonly recordSettlements?: boolean | undefined;
};

/** What an `attach` answer names: the chat's run, whether this attach took it over, and the log's end then. */
type Attached = {
  readonly snapshot?: HostRunSnapshot | undefined;
  readonly takeover: boolean;
  readonly endCursor: number;
};

/**
 * The one agent-host client, over any transport.
 *
 * Nothing here knows whether it is talking to a dedicated worker or to a
 * daemon's socket: keyed commands, pulled reads, the run-idle lease and the
 * close handshake are properties of the *host protocol*, not of the wire. Each
 * gesture mints one command id (SC-R6); the transport re-sends it by that key
 * after its wire is replaced, and the owner answers a re-send from its applied
 * set.
 *
 * @param transport - The wire to drive.
 * @param options - Idle and close deadlines.
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

  const guarded = async <Value>(operation: () => Promise<Value>, fallbackCode: string): Promise<Value> => {
    if (closed) {
      throw new AgentHostWorkerError('CLIENT_CLOSED', 'Agent host client is closed.');
    }
    if (transportFailure) {
      throw transportFailure;
    }
    try {
      await transport.ready;
      return await operation();
    } catch (error) {
      throw toWorkerError(error, fallbackCode);
    }
  };

  /** One gesture's key (SC-R6). */
  const gestureKey = (): string => generatePrefixedId(idPrefix.request);

  /** Send one keyed command; a refusal is thrown with its code and details. */
  const execute = async (command: HostCommand): Promise<Exclude<CommandAnswer, { readonly status: 'refused' }>> => {
    const answer = await guarded(async () => transport.execute(command), 'WORKER_PROTOCOL_FAILED');
    if (answer.status === 'refused') {
      throw new AgentHostWorkerError(answer.code, answer.message, answer.details);
    }
    return answer;
  };

  const attachCommand = async (chatId: string): Promise<Attached> => {
    const answer = await execute({ type: 'attach', commandId: gestureKey(), payload: { chatId } });
    const details = answer.effect === 'not-applied' ? answer.details : {};
    // ponytail: the owner's snapshot, read without a schema; W9's projection replaces it with the ledger.
    const snapshot = details['snapshot'] as HostRunSnapshot | undefined;
    /* A reattached page learns its run only here; without it `cancel` answers
     * `RUN_NOT_FOUND` and Stop never reaches the host (W0.3). */
    if (snapshot) {
      chatsByRun.set(snapshot.runId, snapshot.chatId);
    }
    return {
      snapshot,
      takeover: details['takeover'] === true,
      endCursor: typeof details['endCursor'] === 'number' ? details['endCursor'] : 0,
    };
  };

  const snapshotOf = async (chatId: string): Promise<HostRunSnapshot> => {
    const { snapshot } = await attachCommand(chatId);
    if (!snapshot) {
      throw new AgentHostWorkerError('NO_RUN_ADMITTED', `Chat ${chatId} has no run.`);
    }
    return snapshot;
  };

  const read = async (input: AgentHostReadInput, signal?: AbortSignal): Promise<ReadAnswer> =>
    guarded(
      async () =>
        transport.read({
          chatId: input.chatId,
          cursor: input.cursor,
          ...(input.last === undefined ? {} : { last: input.last }),
          limit: agentWireLimits.batchRows,
          maxBytes: agentWireLimits.batchBytes,
          ...(signal === undefined ? {} : { signal }),
        }),
      'WORKER_PROTOCOL_FAILED',
    );

  const chatFor = (runId: string): string => {
    const chatId = chatsByRun.get(runId);
    if (!chatId) {
      throw new AgentHostWorkerError('RUN_NOT_FOUND', `No chat is registered for run ${runId}.`);
    }
    return chatId;
  };

  /** Run one consumer for as long as its subscription lives; a failure other than the unsubscribe is the client's. */
  const consume = (run: (signal: AbortSignal) => Promise<void>): (() => void) => {
    const operation = new AbortController();
    streamSubscriptions.add(operation);
    const drive = async (): Promise<void> => {
      try {
        await transport.ready;
        await run(operation.signal);
      } catch (error) {
        if (!operation.signal.aborted) {
          transportFailure ??= toWorkerError(error, 'WORKER_STREAM_FAILED');
        }
      } finally {
        streamSubscriptions.delete(operation);
      }
    };
    void drive();
    return () => {
      operation.abort();
    };
  };

  const follow: AgentHostClient['subscribe'] = ({ chatId, cursor: from }, listener) =>
    consume(async (signal) => {
      let cursor = from;
      while (!signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop -- one outstanding long-poll read per chat (SC-R14).
        const answer = await read({ chatId, cursor }, signal);
        if (isAborted(signal)) {
          return;
        }
        if (answer.status === 'refused') {
          if (answer.reason === 'cursor-ahead' || answer.reason === 'identity-mismatch') {
            // SC-R12: never a clamp; the reader starts over, and the projection drops rows it already holds.
            cursor = 0;
            continue;
          }
          throw new AgentHostWorkerError(
            answer.reason === 'owner-fenced' ? 'LEADERSHIP_LOST' : 'COMMAND_UNREADABLE',
            `The agent host refused to read chat ${chatId} (${answer.reason}).`,
          );
        }
        // SC-R13: a batch that does not start at this reader's cursor is read again.
        if (answer.cursor !== cursor) {
          continue;
        }
        for (const event of answer.events) {
          // ponytail: rows cross the wire unparsed; W9's projection reads them through the ledger's tolerant reader.
          listener(chatId, event as AgentLogEvent);
        }
        cursor = answer.nextCursor;
      }
    });

  const subscribeLive = (chatId: string, listener: (chatId: string, event: AgentLiveEvent) => void): (() => void) =>
    consume(async (signal) => {
      for await (const event of transport.liveEvents(chatId, signal)) {
        listener(chatId, event);
      }
    });

  const waitForRunCompletion = async (initial: HostRunSnapshot, from: number): Promise<HostRunSnapshot> => {
    if (terminalRunState(initial.state)) {
      return initial;
    }
    let wake = Promise.withResolvers<'activity' | 'terminal'>();
    const signalActivity = (terminalEvent = false): void => {
      wake.resolve(terminalEvent ? 'terminal' : 'activity');
    };
    /* From the command's own first row: every row after it is this run's activity, and none is missed. */
    const unfollow = follow({ chatId: initial.chatId, cursor: from }, (_chatId, event) => {
      if (event.runId !== initial.runId) {
        return;
      }
      signalActivity(
        event.type === 'run.lifecycle' &&
          (event.state === 'completed' || event.state === 'failed' || event.state === 'cancelled'),
      );
    });
    const unsubscribeLiveEvents = subscribeLive(initial.chatId, (_chatId, event) => {
      if (event.runId === initial.runId) {
        signalActivity();
      }
    });
    const replaySnapshot = async (): Promise<HostRunSnapshot> => {
      const { snapshot } = await attachCommand(initial.chatId);
      if (!snapshot || snapshot.runId !== initial.runId) {
        throw new AgentHostWorkerError(
          'RUN_SNAPSHOT_MISSING',
          `Agent host replay did not return run ${initial.runId}.`,
        );
      }
      return snapshot;
    };
    try {
      let snapshot = initial;
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
        // oxlint-disable-next-line no-await-in-loop -- the next lease depends on this snapshot.
        snapshot = await replaySnapshot();
      }
      return snapshot;
    } finally {
      unfollow();
      unsubscribeLiveEvents();
    }
  };

  /**
   * Run one gesture that opens or continues a run, and wait it out.
   *
   * The answer is by key: a re-send after the wire was replaced answers
   * `replayed` from the owner's applied set, so nothing re-attaches at cursor 0
   * to guess whether the first send landed.
   */
  const runCommand = async (command: HostCommand, runId: string): Promise<HostRunSnapshot> => {
    const answer = await execute(command);
    const attached = await attachCommand(command.payload.chatId);
    const admitted = attached.snapshot;
    if (!admitted) {
      throw new AgentHostWorkerError('RUN_SNAPSHOT_MISSING', `Agent host did not return run ${runId}.`);
    }
    if (admitted.runId !== runId) {
      throw new AgentHostWorkerError(
        'RUN_SNAPSHOT_MISMATCH',
        `Agent host admitted ${admitted.runId} instead of ${runId}.`,
      );
    }
    return waitForRunCompletion(admitted, answer.effect === 'durable' ? answer.cursor : attached.endCursor);
  };

  const disposeSubscriptions = (): void => {
    for (const subscription of streamSubscriptions) {
      subscription.abort();
    }
    streamSubscriptions.clear();
    offTransportClose?.();
  };

  const { worker } = transport;

  return {
    async start(input) {
      chatsByRun.set(input.runId, input.chatId);
      const config = input.agent
        ? externalAdmissionConfig(input.agent, input.context)
        : input.config
          ? wireAdmissionConfig(input.config)
          : undefined;
      const base = {
        chatId: input.chatId,
        runId: input.runId,
        message: userMessage(input.message),
        ...(config ? { config } : {}),
      };
      return runCommand(
        {
          type: 'start',
          commandId: gestureKey(),
          payload:
            input.trigger === 'submit'
              ? { ...base, trigger: 'submit' }
              : { ...base, trigger: input.trigger, retainedMessageIds: [...input.retainedMessageIds] },
        },
        input.runId,
      );
    },
    async steer(runId, message) {
      const chatId = chatFor(runId);
      await execute({ type: 'steer', commandId: gestureKey(), payload: { chatId, runId, message } });
      return snapshotOf(chatId);
    },
    async cancel(runId) {
      const chatId = chatFor(runId);
      await execute({ type: 'cancel', commandId: gestureKey(), payload: { chatId, runId } });
      return snapshotOf(chatId);
    },
    resume: async (chatId, runId) =>
      runCommand({ type: 'resume', commandId: gestureKey(), payload: { chatId, runId } }, runId),
    async resolveInterrupt(chatId, runId, resolution) {
      await execute({
        type: 'resolve-interrupt',
        commandId: gestureKey(),
        payload: {
          chatId,
          runId,
          interruptId: resolution.interruptId,
          outcome: resolution.outcome,
          ...(resolution.optionId === undefined ? {} : { optionId: resolution.optionId }),
          ...(resolution.payload === undefined ? {} : { payload: resolution.payload }),
        },
      });
      return snapshotOf(chatId);
    },
    async attach(input) {
      const attached = await attachCommand(input.chatId);
      /* A read at the log's end is a long poll (SC-R14); the attach answers with what exists, so a reader already at
       * the end is handed the empty page instead of parking. */
      const answer: ReadAnswer =
        input.cursor === attached.endCursor
          ? {
              status: 'batch',
              chatId: input.chatId,
              cursor: input.cursor,
              nextCursor: input.cursor,
              endCursor: attached.endCursor,
              events: [],
            }
          : await read(input);
      return {
        ...answer,
        ...(attached.snapshot ? { snapshot: attached.snapshot } : {}),
        takeover: attached.takeover,
      };
    },
    read: async (input) => read(input),
    ...(options.recordSettlements && worker
      ? {
          recordSettlement: async (event: AgentHostWorkerSettlementRecord['event']) => {
            await guarded(
              async () => worker.recordSettlement({ chatId: event.chatId, event }),
              'WORKER_PROTOCOL_FAILED',
            );
          },
        }
      : {}),
    subscribe: follow,
    subscribeLive,
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
        if (transportDied() || !worker) {
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
          await Promise.race([worker.close(closeAbort.signal), deadline.promise]);
        } catch (error) {
          if (error !== timeoutError && !transportDied()) {
            throw toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
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

/** Worker replacements one transport may make before its death is final (T9 E7's budget). */
const workerRestartLimit = 3;

/** One worker and the channel to it; a replacement is another incarnation. */
type WorkerIncarnation = {
  readonly channel: Channel<AgentHostWorkerProtocol>;
  readonly ready: Promise<void>;
  dispose(): void;
};

type PendingCommand = {
  readonly command: HostCommand;
  readonly settle: PromiseWithResolvers<CommandAnswer>;
};

const aborted = async (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    const fail = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('The wait was aborted.'));
    };
    if (signal.aborted) {
      fail();
    } else {
      signal.addEventListener('abort', fail, { once: true });
    }
  });

/**
 * The dedicated-worker transport: one per-tab worker, initialized over the wire
 * with the two transferred filesystem bridge ports, and replaced when it dies.
 *
 * A worker that crashes, or stays silent past the liveness bound, is
 * terminated and replaced (at most {@link workerRestartLimit} times), and every
 * unanswered command is re-sent to the replacement with its key: the log's
 * applied set answers one that already landed `replayed` (SC-R6, SC-R7).
 * ponytail: W6 replaces this outbox and restart with the shared channel client's.
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
  const computeMode = options.computeMode ?? 'memory';
  const closeTopic = new Topic<AgentHostTransportCloseReason>({ name: 'agent-host-client:close' });
  const outbox = new Map<string, PendingCommand>();
  let current: WorkerIncarnation | undefined;
  let restarts = 0;
  let lastDeath: AgentHostTransportCloseReason | undefined;
  let death: AgentHostTransportCloseReason | undefined;
  let disposed = false;

  const finalError = (): AgentHostWorkerError =>
    death
      ? new AgentHostWorkerError(death.code, death.message)
      : new AgentHostWorkerError('CLIENT_CLOSED', 'Agent host client is closed.');

  const rejectOutbox = (error: unknown): void => {
    for (const [commandId, pending] of outbox) {
      outbox.delete(commandId);
      pending.settle.reject(error);
    }
  };

  /** The death is final: report it once, and fail everything still waiting on a worker. */
  const reportDeath = (reason: AgentHostTransportCloseReason): void => {
    if (death) {
      return;
    }
    death = reason;
    current?.dispose();
    current = undefined;
    closeTopic.emit(reason);
    closeTopic.dispose();
    rejectOutbox(finalError());
  };

  /**
   * Replace a dead worker: it is terminated, and every unanswered command goes to the replacement with its own key.
   * Called by whichever notices first — the worker's error, the channel's close, or a call the close rejected.
   */
  function retire(live: WorkerIncarnation, reason: AgentHostTransportCloseReason): void {
    if (current !== live || disposed || death) {
      return;
    }
    current = undefined;
    lastDeath = reason;
    live.dispose();
    for (const pending of outbox.values()) {
      void send(pending);
    }
  }

  const lost = (live: WorkerIncarnation, error: ChannelClosedError): void => {
    retire(live, { code: error.code, message: `The agent host worker's channel closed (${error.code}).` });
  };

  const boot = (): WorkerIncarnation => {
    const bridge = options.openFileSystemBridge();
    let projectRootBridge: FileSystemBridgeConnection;
    try {
      projectRootBridge = options.openProjectRootBridge();
    } catch (error) {
      bridge.dispose();
      throw error;
    }
    const computeStorePort = computeMode === 'durable' ? options.openComputeStorePort?.() : undefined;
    let worker: Worker;
    try {
      if (computeMode === 'durable' && !computeStorePort) {
        throw new AgentHostWorkerError(
          'COMPUTE_AUTHORITY_UNAVAILABLE',
          'Durable compute requires the project authority.',
        );
      }
      worker = (options.createWorker ?? createBrowserAgentWorker)();
    } catch (error) {
      bridge.dispose();
      projectRootBridge.dispose();
      throw error;
    }
    const channel = connectWorker(worker, randomUuid());
    let gone = false;
    const dispose = (): void => {
      if (gone) {
        return;
      }
      gone = true;
      worker.removeEventListener('error', onError);
      channel.close();
      worker.terminate();
      bridge.dispose();
      projectRootBridge.dispose();
    };
    function onError(event: ErrorEvent): void {
      retire(incarnation, { code: 'PEER_UNRESPONSIVE', message: event.message || 'Agent host worker crashed.' });
    }
    worker.addEventListener('error', onError);
    channel.onClose((info) => {
      retire(incarnation, { code: info.code, message: `The agent host worker's channel closed (${info.code}).` });
    });
    // Issued eagerly, before anything awaits readiness: the bridge ports are
    // transferred with it, and a later issue would race a command that queued.
    const initialize = channel.call('initialize', {
      value: {
        fileSystemPort: bridge.port,
        projectRootPort: projectRootBridge.port,
        computeMode,
        computeStorePort,
        projectStorage: options.projectStorage,
        authority: options.authority,
        gatewayBaseUrl: options.gatewayBaseUrl,
        systemPrompt: options.systemPrompt,
        systemPromptBlocks: options.systemPromptBlocks,
        model: options.model,
        runtimeConfig: options.runtimeConfig,
        testingEnabled: options.testingEnabled,
      },
      transferables: [bridge.port, projectRootBridge.port, ...(computeStorePort ? [computeStorePort] : [])],
    });
    const initializeWorker = async (): Promise<void> => {
      const deadline = Promise.withResolvers<never>();
      const initializationTimeoutId = globalThis.setTimeout(() => {
        deadline.reject(
          new AgentHostWorkerError('INITIALIZATION_TIMEOUT', 'Agent host worker initialization timed out.'),
        );
      }, options.initializationTimeout ?? 10_000);
      try {
        await Promise.race([initialize, deadline.promise]);
      } catch (error) {
        const failure = toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
        // A worker that cannot initialize is refused, not replaced: another one would refuse the same way.
        reportDeath({ code: failure.code, message: failure.message });
        throw failure;
      } finally {
        globalThis.clearTimeout(initializationTimeoutId);
      }
    };
    const incarnation: WorkerIncarnation = { channel, ready: initializeWorker(), dispose };
    return incarnation;
  };

  /** The live worker, replacing a dead one while the budget lasts. */
  const connection = async (): Promise<WorkerIncarnation> => {
    if (disposed || death) {
      throw finalError();
    }
    if (!current) {
      if (restarts >= workerRestartLimit) {
        reportDeath(lastDeath ?? { code: 'PEER_GONE', message: 'The agent host worker is gone.' });
        throw finalError();
      }
      restarts += 1;
      current = boot();
    }
    const live = current;
    await live.ready;
    return live;
  };

  /** Deliver one outbox entry to the live worker; a worker that dies under it leaves it for the replacement. */
  async function send(pending: PendingCommand): Promise<void> {
    const { type, commandId, payload } = pending.command;
    /** Settle this entry once, unless a re-send already settled or replaced it. */
    const settle = (outcome: () => void): void => {
      if (outbox.get(commandId) === pending) {
        outbox.delete(commandId);
        outcome();
      }
    };
    let live: WorkerIncarnation;
    try {
      live = await connection();
    } catch (error) {
      settle(() => {
        pending.settle.reject(error);
      });
      return;
    }
    const call = live.channel.call as (
      name: HostCommand['type'],
      args: Readonly<{ commandId: string; payload: unknown }>,
    ) => Promise<CommandAnswer>;
    try {
      const answer = await call(type, { commandId, payload });
      settle(() => {
        pending.settle.resolve(answer);
      });
    } catch (error) {
      if (error instanceof ChannelClosedError && !disposed && death === undefined) {
        // ponytail: kept; the replacement re-sends it with the same key (W6: the shared outbox).
        lost(live, error);
        return;
      }
      settle(() => {
        pending.settle.reject(error);
      });
    }
  }

  /* The first worker starts now, so its ports transfer before any command queues. */
  restarts = 1;
  current = boot();
  const firstReady = current.ready;

  return {
    ready: firstReady,
    execute: async (command, signal) => {
      let pending = outbox.get(command.commandId);
      if (pending === undefined) {
        pending = { command, settle: Promise.withResolvers<CommandAnswer>() };
        outbox.set(command.commandId, pending);
        void send(pending);
      }
      return signal === undefined ? pending.settle.promise : Promise.race([pending.settle.promise, aborted(signal)]);
    },
    read: async ({ signal, ...request }) => {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- a read the worker died under is read again on its replacement.
        const live = await connection();
        try {
          // oxlint-disable-next-line no-await-in-loop -- the same re-read.
          return await live.channel.call('read', request, signal);
        } catch (error) {
          if (!(error instanceof ChannelClosedError) || signal?.aborted === true || disposed) {
            throw error;
          }
          lost(live, error);
        }
      }
    },
    liveEvents: async function* liveEvents(chatId, signal) {
      while (!signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop -- one worker at a time.
        const live = await connection();
        try {
          yield* live.channel.listen('liveEvents', { chatId }, signal);
          if (current === live || isAborted(signal)) {
            return;
          }
        } catch (error) {
          if (isAborted(signal)) {
            return;
          }
          if (!(error instanceof ChannelClosedError) || disposed) {
            throw error;
          }
          lost(live, error);
        }
      }
    },
    worker: {
      close: async (signal) => {
        const live = current;
        if (live) {
          await live.channel.call('close', undefined, signal);
        }
      },
      recordSettlement: async (record) => {
        // ponytail: unkeyed and not re-sent, as today; W8 deletes the verb (drift 7).
        const live = await connection();
        await live.channel.call('record-settlement', record);
      },
    },
    onClose: (handler) => {
      if (death) {
        handler(death);
        return (): void => undefined;
      }
      return closeTopic.subscribe(handler);
    },
    close: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      current?.dispose();
      current = undefined;
      rejectOutbox(new AgentHostWorkerError('CLIENT_CLOSED', 'Agent host client is closed.'));
    },
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
  createAgentHostClient(createAgentHostWorkerTransport(options), { ...options, recordSettlements: true });
