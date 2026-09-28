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
import { connectAgentWorkerChannel, createAgentChannelClient } from '@taucad/agent-host/channel-client';
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
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import type {
  AgentHostAdmissionConfig,
  AgentHostCapabilityReport,
  AgentHostExternalAgent,
  AgentHostExternalContext,
  AgentHostModel,
  AgentHostWorkerProtocol,
} from '#workers/agent-host.contract.js';
import {
  agentHostWorkerProtocolSchemas,
  createAgentHostCapabilityReport,
  parseAgentHostWorkerConnect,
} from '#workers/agent-host.contract.js';
import type { AgentHostTransport } from '#services/agent-host-transport.js';
import { createDaemonAgentHostTransport } from '#services/daemon-agent-host-client.js';
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
  /** The worker factory, for tests; the document's resident worker otherwise. */
  readonly createWorker?: (() => Worker) | undefined;
  readonly durability?: StorageDurabilityClass | undefined;
};

/** Page-side liveness bound on a worker that keeps alive every second (T9 E3, E4). Milliseconds. */
const workerLivenessTimeout = 3500;

const defaultCapabilityProbes = new Map<StorageDurabilityClass, Promise<BrowserAgentHostCapability>>();

/**
 * Probe the dedicated-worker capability placement needs before admission (RH-S10): the resident worker answers
 * `capabilities` on its control channel without opening a project host, bounded by the channel's liveness bound.
 *
 * @param options - The durability class to probe, and a worker factory for tests.
 * @returns The capability report; a worker that cannot answer reports no sync access handle.
 */
export const probeBrowserAgentHostCapability = async (
  options: BrowserAgentHostCapabilityProbeOptions = {},
): Promise<BrowserAgentHostCapability> => {
  const durability = options.durability ?? 'exclusive-append';
  const staticReport = getBrowserAgentHostCapability(durability);
  const withoutSync = createAgentHostCapabilityReport({ ...staticReport.checks, syncAccessHandle: true }, durability);
  if (!withoutSync.supported) {
    return staticReport;
  }
  const probe = async (): Promise<BrowserAgentHostCapability> => {
    try {
      return await residentAgentWorker(options.createWorker).capabilities(durability);
    } catch {
      return createAgentHostCapabilityReport({ ...staticReport.checks, syncAccessHandle: false }, durability);
    }
  };
  if (options.createWorker !== undefined) {
    return probe();
  }
  const memo = defaultCapabilityProbes.get(durability) ?? probe();
  defaultCapabilityProbes.set(durability, memo);
  return memo;
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

/** A refusal of retry class `wait`: the chat's previous attempt has ended and is being settled (W8 TS-S6). */
const isSettlingRefusal = (error: unknown): error is AgentHostWorkerError =>
  error instanceof AgentHostWorkerError &&
  error.code === 'CHAT_RUN_LIVE' &&
  (error.details?.['state'] === 'settling' || error.details?.['state'] === 'terminal');

/**
 * Send a command again while the host refuses it because the chat's previous attempt is settling (W8.r1 item 6).
 *
 * `CHAT_RUN_LIVE` naming a `settling` or already `terminal` run is retry class `wait`: the attempt's settlement row
 * is durable and its acknowledge follows it, so the command is admitted once that lands. The re-send backs off from
 * 20 ms to 250 ms; any other refusal, an abort, or the settlement bound passing ends it with the last refusal.
 *
 * @param send - One send of the command; a refusal rejects with its {@link AgentHostWorkerError}.
 * @param signal - Stops re-sending once aborted.
 * @param bound - The settlement bound, in milliseconds.
 * @returns What the admitted send resolved with.
 * @internal
 */
export const resendWhileSettling = async <Result>(
  send: () => Promise<Result>,
  signal?: AbortSignal,
  bound = 30_000,
): Promise<Result> => {
  const deadline = Date.now() + bound;
  /* Read afresh after each wait: a stop can land during it. */
  const aborted = (): boolean => signal?.aborted === true;
  const attempt = async (backoffMilliseconds: number): Promise<Result> => {
    let refusal: AgentHostWorkerError;
    try {
      return await send();
    } catch (error) {
      if (!isSettlingRefusal(error) || aborted() || Date.now() + backoffMilliseconds > deadline) {
        throw error;
      }
      refusal = error;
    }
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, backoffMilliseconds);
    });
    /* A stop during the back-off sends nothing more: the last refusal is the answer (W8.r1 round 5). */
    if (aborted()) {
      throw refusal;
    }
    return attempt(Math.min(backoffMilliseconds * 2, 250));
  };
  return attempt(20);
};

/** The commands the page re-sends while the previous attempt settles; `start` recovers in the transport. */
const waitingCommands: ReadonlySet<HostCommand['type']> = new Set(['resolve-interrupt', 'resume', 'cancel']);

export type AgentHostClientOptions = {
  readonly openFileSystemBridge: () => FileSystemBridgeConnection;
  readonly openProjectRootBridge: () => FileSystemBridgeConnection;
  readonly computeMode?: 'off' | 'memory' | 'durable' | undefined;
  readonly openComputeStorePort?: (() => MessagePort) | undefined;
  /**
   * A port into the file-manager worker's revision root for this project, which backs the `revisions` tool. The
   * composition passes it only once that project's revision client has opened (RV9-F1); without it the tool is absent.
   */
  readonly openRevisionsPort?: (() => MessagePort | undefined) | undefined;
  /**
   * This end of a placement session brokered into the file-manager worker's revision root (`connectPlacement`, W8
   * TS-S5), asked for at every provide, so a replaced host gets a new session. A provide it answers `undefined` for is
   * refused `REVISIONS_UNAVAILABLE`: no turn runs unplaced (D13).
   */
  readonly openPlacementPort: () => MessagePort | undefined;
  readonly projectStorage: ProjectFileSystemConfig;
  readonly durability: StorageDurabilityClass;
  readonly authority: { readonly projectId: string; readonly workspaceId: string };
  readonly gatewayBaseUrl: string;
  readonly systemPrompt: string;
  readonly systemPromptBlocks: AgentHostAdmissionConfig['systemPromptBlocks'];
  /** Absent while the model catalog is unavailable; see `AgentHostWorkerInitializeRequest.model`. */
  readonly model?: AgentHostModel | undefined;
  readonly runtimeConfig: UiRuntimeConfigInput;
  readonly testingEnabled?: boolean | undefined;
  /** The worker factory, for tests; the document's resident worker otherwise. */
  readonly createWorker?: (() => Worker) | undefined;
  readonly runIdleTimeout?: number | undefined;
  /**
   * The signed-in account the session cookie funds, read at every provide (W11 GI-Q6). The session's user by default;
   * `undefined` when nobody is signed in or the session cannot be read.
   */
  readonly principal?: (() => Promise<string | undefined>) | undefined;
};

/** The signed-in user, as the auth client reads the session; `undefined` when there is none or it cannot be read. */
const sessionPrincipal = async (): Promise<string | undefined> => {
  try {
    const { authClient } = await import('#lib/auth-client.js');
    const { data } = await authClient.getSession();
    return data?.user.id;
  } catch {
    return undefined;
  }
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
      /** A claim was asked for a run no driver in this host holds; its outcome arrives as rows (RH-R1). */
      readonly takeover?: boolean | undefined;
    }
  >;
  /** One read of the chat's durable rows; a refusal means the reader resets to cursor 0, never a clamp. */
  read(input: AgentHostReadInput): Promise<ReadAnswer>;
  /**
   * Follow one chat's durable rows from `cursor`: one outstanding long-poll read at a time (SC-R14).
   * ponytail: rows are handed over one by one, in the push shape the page projection folds; W9 replaces it.
   *
   * `onEnded` hears the follow stop for any reason but its own unsubscribe: no later row reaches `listener`.
   */
  subscribe(
    input: { readonly chatId: string; readonly cursor: number },
    listener: (chatId: string, event: AgentLogEvent) => void,
    onEnded?: () => void,
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
};

/** What an `attach` answer names: the chat's run, whether it asked for the run's claim, and the log's end then. */
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
    const send = async (): Promise<Exclude<CommandAnswer, { readonly status: 'refused' }>> => {
      const answer = await guarded(async () => transport.execute(command), 'WORKER_PROTOCOL_FAILED');
      if (answer.status === 'refused') {
        throw new AgentHostWorkerError(answer.code, answer.message, answer.details);
      }
      return answer;
    };
    return waitingCommands.has(command.type) ? resendWhileSettling(send) : send();
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
  const consume = (run: (signal: AbortSignal) => Promise<void>, onEnded?: () => void): (() => void) => {
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
        if (!operation.signal.aborted) {
          onEnded?.();
        }
      }
    };
    void drive();
    return () => {
      operation.abort();
    };
  };

  const follow: AgentHostClient['subscribe'] = ({ chatId, cursor: from }, listener, onEnded) =>
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
    }, onEnded);

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
      let attached: Attached | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Retry the read-only attachment, never the admission.
          attached = await attachCommand(initial.chatId);
          break;
        } catch (error) {
          if (!(error instanceof AgentHostWorkerError) || error.code !== 'COMMAND_TIMEOUT') {
            throw error;
          }
          if (attempt === 2) {
            throw new AgentHostWorkerError(
              'RUN_IDLE_TIMEOUT',
              `Agent host control connection for run ${initial.runId} did not answer three liveness probes.`,
            );
          }
        }
      }
      if (!attached) {
        throw new AgentHostWorkerError(
          'RUN_IDLE_TIMEOUT',
          `Agent host replay for run ${initial.runId} did not return.`,
        );
      }
      const { snapshot } = attached;
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
    subscribe: follow,
    subscribeLive,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      /* Closing a client only detaches it (D17): the host keeps running what it started. */
      disposeSubscriptions();
      transport.close();
    },
  };
};

/** One worker incarnation and its control channel, with the project hosts provided to it. */
type Incarnation = {
  readonly worker: Worker;
  readonly channel: Channel<AgentHostWorkerProtocol>;
  readonly ready: Promise<void>;
  /** The host incarnation each project has in this worker; one provide at a time, which concurrent connects share. */
  readonly provided: Map<string, Promise<string>>;
  /** Each host incarnation's current bridges, disposed when that host is replaced, released or rebridged, or the worker dies. */
  readonly bridges: Map<string, () => void>;
  /**
   * Host incarnations released or replaced and still draining their runs (T3), by `hostId`: they keep their bridges,
   * and take fresh ones on a rebridge, until their release answers.
   */
  readonly retiring: Map<string, Readonly<{ projectId: string; options: AgentHostClientOptions }>>;
  dead: boolean;
};

/** What a project's clients last gave for it (how to open its bridges, and its defaults), and how many are open. */
type ProjectRegistration = { options: AgentHostClientOptions; clients: number };

/** The document's resident agent-host worker (RH-S8), as the page drives it. @internal */
export type ResidentAgentWorker = Readonly<{
  /**
   * Open one stream on the project's host, providing the host first when this worker has none. `closed` reports that
   * the client asking has closed, which ends its attempts (W6.r1 round 3).
   */
  connect: (projectId: string, closed?: () => boolean) => Promise<MessagePort>;
  capabilities: (durability: StorageDurabilityClass) => Promise<BrowserAgentHostCapability>;
  /**
   * Count one client of a project and remember its latest bridges and defaults. The returned release, called once,
   * sends `release` for the project's host when it was the last client (T3, RH-R4).
   */
  acquire: (options: AgentHostClientOptions) => () => void;
  /** Swap fresh bridges into every open project host, as after a file-manager restart; no host closes (RV1-F1). */
  reprovide: () => Promise<void>;
}>;

/**
 * The page's side of the resident worker: one worker per document, replaced when W4's liveness bound expires on its
 * control channel or it closes with a code (RH-R14). A Worker `error` event is logged only (D-088). The replacement
 * is started on the next use, re-sent `init`, and given every project host again as its clients redial; each client's
 * outbox re-sends its unanswered commands by key.
 *
 * @param createWorker - Creates the worker.
 * @returns The page-side handle.
 */
const createResidentAgentWorker = (createWorker: () => Worker): ResidentAgentWorker => {
  const tabId = randomUuid();
  const projects = new Map<string, ProjectRegistration>();
  let current: Incarnation | undefined;

  const retire = (live: Incarnation, reason: string): void => {
    if (live.dead) {
      return;
    }
    live.dead = true;
    if (current === live) {
      current = undefined;
    }
    console.warn('[agent-host] the resident worker is gone; the next use starts another', reason);
    /* Terminate before starting another, and dispose every bridge the old one held (RH-R14). */
    live.channel.close();
    live.worker.terminate();
    for (const dispose of live.bridges.values()) {
      dispose();
    }
    live.bridges.clear();
  };

  const boot = (): Incarnation => {
    const worker = createWorker();
    const { port1, port2 } = new MessageChannel();
    const sessionId = randomUuid();
    worker.postMessage(parseAgentHostWorkerConnect({ type: 'agent-host/connect', sessionId, port: port1 }), [port1]);
    const channel = connectAgentWorkerChannel<AgentHostWorkerProtocol>(port2, {
      sessionKey: sessionId,
      protocolSchemas: agentHostWorkerProtocolSchemas,
      label: 'agent-host-main',
      livenessTimeout: workerLivenessTimeout,
    });
    worker.addEventListener('error', (event) => {
      console.error('[agent-host] resident worker error', event.message);
    });
    const live: Incarnation = {
      worker,
      channel,
      ready: (async (): Promise<void> => {
        await channel.call('init', { tabId });
      })(),
      provided: new Map(),
      bridges: new Map(),
      retiring: new Map(),
      dead: false,
    };
    channel.onClose((info) => {
      retire(live, info.code);
    });
    if (typeof document !== 'undefined') {
      const report = (): void => {
        if (!live.dead) {
          // async-iife: bootstrap -- a visibility report is best effort; a dead worker is retired by its channel.
          void (async (): Promise<void> => {
            try {
              await channel.call('visibility', { visible: document.visibilityState === 'visible' });
            } catch {
              /* The worker is going; its replacement is told on boot. */
            }
          })();
        }
      };
      document.addEventListener('visibilitychange', report);
      channel.onClose(() => {
        document.removeEventListener('visibilitychange', report);
      });
      report();
    }
    return live;
  };

  const incarnation = async (): Promise<Incarnation> => {
    current ??= boot();
    const live = current;
    try {
      await live.ready;
    } catch (error) {
      retire(live, 'init failed');
      throw toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
    }
    return live;
  };

  const registrationOf = (projectId: string): AgentHostClientOptions => {
    const registration = projects.get(projectId);
    if (registration === undefined) {
      throw new AgentHostWorkerError('PROJECT_HOST_UNAVAILABLE', `No client registered project ${projectId}.`);
    }
    return registration.options;
  };

  /** Open the bridges one host incarnation is given: both filesystems, and the compute store when durable. */
  const openBridges = (options: AgentHostClientOptions) => {
    const computeMode = options.computeMode ?? 'memory';
    const bridge = options.openFileSystemBridge();
    let projectRootBridge: FileSystemBridgeConnection;
    try {
      projectRootBridge = options.openProjectRootBridge();
    } catch (error) {
      bridge.dispose();
      throw error;
    }
    const dispose = (): void => {
      bridge.dispose();
      projectRootBridge.dispose();
    };
    const computeStorePort = computeMode === 'durable' ? options.openComputeStorePort?.() : undefined;
    if (computeMode === 'durable' && !computeStorePort) {
      dispose();
      throw new AgentHostWorkerError(
        'COMPUTE_AUTHORITY_UNAVAILABLE',
        'Durable compute requires the project authority.',
      );
    }
    return {
      computeMode,
      fileSystemPort: bridge.port,
      projectRootPort: projectRootBridge.port,
      computeStorePort,
      transferables: [bridge.port, projectRootBridge.port, ...(computeStorePort ? [computeStorePort] : [])],
      dispose,
    };
  };

  /** Give the live worker a new host incarnation for the project, with fresh bridges (RH-R4). */
  const provideTo = async (live: Incarnation, projectId: string): Promise<string> => {
    const options = registrationOf(projectId);
    const principal = await (options.principal ?? sessionPrincipal)();
    const placementPort = options.openPlacementPort();
    if (placementPort === undefined) {
      throw Object.assign(
        new Error(
          "This project's revision root is not open, so the agent host cannot place turns. Reopen the project.",
        ),
        { code: 'REVISIONS_UNAVAILABLE' },
      );
    }
    const { computeMode, fileSystemPort, projectRootPort, computeStorePort, transferables, dispose } =
      openBridges(options);
    const revisionsPort = options.openRevisionsPort?.();
    const hostId = randomUuid();
    live.bridges.set(hostId, dispose);
    try {
      const answer = await live.channel.call('provide', {
        value: {
          projectId,
          hostId,
          fileSystemPort,
          projectRootPort,
          computeMode,
          computeStorePort,
          revisionsPort,
          placementPort,
          projectStorage: options.projectStorage,
          authority: options.authority,
          gatewayBaseUrl: options.gatewayBaseUrl,
          systemPrompt: options.systemPrompt,
          systemPromptBlocks: options.systemPromptBlocks,
          model: options.model,
          runtimeConfig: options.runtimeConfig,
          testingEnabled: options.testingEnabled,
          ...(principal === undefined ? {} : { principal }),
        },
        transferables: [...transferables, ...(revisionsPort ? [revisionsPort] : []), placementPort],
      });
      /* The replaced incarnation drains its runs on its own bridges (T3); only its bridges go, once it has closed, so a
       * late close never takes the new host's (I31, RH-A26). */
      if (answer.replaced !== undefined) {
        void retireIn(live, { projectId, hostId: answer.replaced }, options);
      }
      return hostId;
    } catch (error) {
      live.bridges.delete(hostId);
      dispose();
      revisionsPort?.close();
      placementPort.close();
      throw toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
    }
  };

  /** The project's host in this worker: the provide in flight or done, or a new one. A failed provide is forgotten. */
  const openingIn = async (live: Incarnation, projectId: string): Promise<string> => {
    const existing = live.provided.get(projectId);
    if (existing !== undefined) {
      return existing;
    }
    const opening = provideTo(live, projectId);
    live.provided.set(projectId, opening);
    // async-iife: bootstrap -- forget a provide that failed, so the next use provides again; its caller sees the error.
    void (async (): Promise<void> => {
      try {
        await opening;
      } catch {
        if (live.provided.get(projectId) === opening) {
          live.provided.delete(projectId);
        }
      }
    })();
    return opening;
  };

  /**
   * Release one host incarnation in the live worker, which answers once the host drained its runs and closed (T3);
   * only then do its bridges go. Until then it is rebridged with the rest (W6.r1 round 3).
   */
  const retireIn = async (
    live: Incarnation,
    { projectId, hostId }: Readonly<{ projectId: string; hostId: string }>,
    options: AgentHostClientOptions,
  ): Promise<void> => {
    live.retiring.set(hostId, { projectId, options });
    try {
      await live.channel.call('release', { projectId, hostId });
    } catch {
      /* The worker is gone and was retired with every bridge. */
    }
    live.retiring.delete(hostId);
    live.bridges.get(hostId)?.();
    live.bridges.delete(hostId);
  };

  /**
   * Swap fresh bridges into the host the project has now (RV1-F1). The worker answers `needs` for a host that is gone,
   * and those bridges are disposed; a swapped host's previous bridges go only once the worker holds the new ones.
   */
  const rebridgeIn = async (
    live: Incarnation,
    { projectId, hostId }: Readonly<{ projectId: string; hostId: string }>,
    options: AgentHostClientOptions,
  ): Promise<void> => {
    const { fileSystemPort, projectRootPort, computeStorePort, transferables, dispose } = openBridges(options);
    try {
      const answer = await live.channel.call('rebridge', {
        value: { projectId, hostId, fileSystemPort, projectRootPort, computeStorePort },
        transferables,
      });
      if (answer.status === 'rebridged') {
        const previous = live.bridges.get(hostId);
        live.bridges.set(hostId, dispose);
        previous?.();
        return;
      }
    } catch (error) {
      dispose();
      throw toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
    }
    dispose();
  };

  /** Release the project's host in the live worker, by incarnation, then dispose that host's bridges (T3, I31). */
  const releaseHost = async (projectId: string, options: AgentHostClientOptions): Promise<void> => {
    const live = current;
    const opening = live?.provided.get(projectId);
    if (live === undefined || opening === undefined) {
      return;
    }
    /* Forgotten first: a client that comes next provides a new incarnation instead of connecting to this one. */
    live.provided.delete(projectId);
    let hostId: string;
    try {
      hostId = await opening;
    } catch {
      /* The provide failed and disposed its bridges. */
      return;
    }
    await retireIn(live, { projectId, hostId }, options);
  };

  return {
    acquire: (options) => {
      const { projectId } = options.authority;
      const registration = projects.get(projectId);
      if (registration === undefined) {
        projects.set(projectId, { options, clients: 1 });
      } else {
        registration.options = options;
        registration.clients += 1;
      }
      let released = false;
      return () => {
        const open = projects.get(projectId);
        if (released || open === undefined) {
          return;
        }
        released = true;
        open.clients -= 1;
        if (open.clients > 0) {
          return;
        }
        projects.delete(projectId);
        /* A client's close never waits on the worker; `releaseHost` settles on its own. */
        void releaseHost(projectId, open.options);
      };
    },
    connect: async (projectId, closed = () => false) => {
      for (let attempt = 0; ; attempt += 1) {
        /* A closed client provides nothing more: its late provide would replace the host another client runs on. */
        if (closed()) {
          throw new AgentHostWorkerError('PROJECT_HOST_UNAVAILABLE', `The client of project ${projectId} closed.`);
        }
        // oxlint-disable-next-line no-await-in-loop -- a worker that lost the host is given it again.
        const live = await incarnation();
        const opening = openingIn(live, projectId);
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const hostId = await opening;
        const { port1, port2 } = new MessageChannel();
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const answer = await live.channel
          .call('connect', { value: { projectId, hostId, port: port1 }, transferables: [port1] })
          .catch((error: unknown) => {
            port2.close();
            throw toWorkerError(error, 'WORKER_PROTOCOL_FAILED');
          });
        if (answer.status === 'connected') {
          return port2;
        }
        port2.close();
        /* Forget only the incarnation this `needs` named: a newer one another client provided meanwhile stays. */
        if (live.provided.get(projectId) === opening) {
          live.provided.delete(projectId);
        }
        if (attempt > 0) {
          throw new AgentHostWorkerError(
            'PROJECT_HOST_UNAVAILABLE',
            `The agent host could not open project ${projectId}.`,
          );
        }
      }
    },
    capabilities: async (durability) => {
      const live = await incarnation();
      return live.channel.call('capabilities', { durability });
    },
    reprovide: async () => {
      const live = current;
      if (live === undefined || live.dead) {
        return;
      }
      await Promise.allSettled([
        ...[...live.provided].map(async ([projectId, opening]) =>
          rebridgeIn(live, { projectId, hostId: await opening }, registrationOf(projectId)),
        ),
        ...[...live.retiring].map(async ([hostId, { projectId, options }]) =>
          rebridgeIn(live, { projectId, hostId }, options),
        ),
      ]);
    },
  };
};

const residents = new WeakMap<() => Worker, ResidentAgentWorker>();

/**
 * The document's resident agent-host worker, started on first use (RH-S8).
 *
 * @param createWorker - The worker factory; tests pass their own and get their own resident.
 * @returns The resident worker for that factory.
 * @internal
 */
export const residentAgentWorker = (createWorker: () => Worker = createBrowserAgentWorker): ResidentAgentWorker => {
  const existing = residents.get(createWorker);
  if (existing !== undefined) {
    return existing;
  }
  const created = createResidentAgentWorker(createWorker);
  residents.set(createWorker, created);
  return created;
};

/**
 * Swap fresh bridges into every project host of the document's resident worker, after the file manager reconnects
 * (RV1-F1): a host whose bridges died with the old file-manager worker carries on over the new ones, runs included.
 *
 * @returns Once every open project host was answered.
 */
export const reprovideAgentHostProjects = async (): Promise<void> => residentAgentWorker().reprovide();

/**
 * The resident-worker transport: one stream on the project's host per client, over the agent channel client, whose
 * outbox re-sends unanswered commands by key after a redial (SC-R6, SC-R7).
 *
 * @param options - Everything the worker needs to open this project's host.
 * @returns A transport over one stream of the resident worker.
 */
const createAgentHostWorkerTransport = (options: AgentHostClientOptions): AgentHostTransport => {
  const capability = createAgentHostCapabilityReport(
    { ...getBrowserAgentHostCapability(options.durability).checks, syncAccessHandle: true },
    options.durability,
  );
  if (!capability.supported) {
    throw new AgentHostWorkerError(capability.reason, `Browser agent host is unavailable: ${capability.reason}`);
  }
  if (options.model !== undefined && !isBrowserAgentHostProviderKind(options.model.providerKind)) {
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
  const resident = residentAgentWorker(options.createWorker);
  const release = resident.acquire(options);
  const { projectId } = options.authority;
  let closed = false;
  const client = createAgentChannelClient({
    connect: async () => resident.connect(projectId, () => closed),
    livenessTimeout: workerLivenessTimeout,
    sessionKey: `agent-host:${projectId}`,
  });
  const transport = createDaemonAgentHostTransport(client);
  return {
    ...transport,
    close: () => {
      closed = true;
      transport.close();
      release();
    },
    worker: {
      /* A stream's close is the channel's own (D17); nothing to ask the worker. */
      close: async () => undefined,
    },
  };
};

/**
 * Main-thread client for one project's host in the document's resident agent-host worker.
 *
 * @param options - Bridge, model and prompt configuration for the project.
 * @returns A host client over one stream of the resident worker.
 * @public
 */
export const createBrowserAgentHostClient = (options: AgentHostClientOptions): AgentHostClient =>
  createAgentHostClient(createAgentHostWorkerTransport(options), options);
