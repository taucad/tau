import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import type { SourceLiveEvent, AgentLogEvent, Channel, StorageDurabilityClass } from '@taucad/agent-host';
import { isGatewayProviderKind } from '@taucad/agent-host';
import { connectAgentWorkerChannel, createAgentChannelClient } from '@taucad/agent-host/channel-client';
import { agentWireLimits } from '@taucad/agent-host/wire';
import type {
  AgentChannelAdmissionConfig,
  CatchUpFrame,
  CatchUpInput,
  CommandAnswer,
  HostCommand,
  ReadAnswer,
  ReadRequest,
} from '@taucad/agent-host/wire';
import { randomUuid } from '@taucad/utils/id';
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

/** One read of a chat's durable rows from the reader's own position (SC-R11, SC-R12). */
export type AgentHostReadInput = {
  readonly chatId: string;
  readonly cursor: number;
  /** The key of the row at `cursor - 1`, so an owner can refuse a reader on another history. */
  readonly last?: ReadRequest['last'] | undefined;
  /** Opaque incarnation of the authoritative bytes returned by the preceding batch. */
  readonly sourceGeneration?: ReadRequest['sourceGeneration'] | undefined;
  /** Exact host health observed with the preceding source and position. */
  readonly sourceHealth?: ReadRequest['sourceHealth'] | undefined;
};

/**
 * The transport-agnostic host client. One projection renders a run whether it
 * came from the dedicated browser worker or from a paired daemon's socket.
 *
 * @public
 */
export type AgentHostClient = {
  /** Execute one already-keyed command; the sender owns its id and any re-send decision. */
  hostCommand(command: HostCommand): Promise<CommandAnswer>;
  /** One read of the chat's durable rows; a refusal means the reader resets to cursor 0, never a clamp. */
  read(input: AgentHostReadInput): Promise<ReadAnswer>;
  /** One immutable capture; pages remain provisional until its final validation marker. */
  catchUp(input: CatchUpInput): AsyncIterable<CatchUpFrame>;
  /**
   * Follow one chat's durable rows from `cursor`: one outstanding long-poll read at a time (SC-R14).
   * ponytail: rows are handed over one by one, in the push shape the page projection folds; W9 replaces it.
   *
   * `onEnded` hears the follow stop for any reason but its own unsubscribe: no later row reaches `listener`.
   * `position` is the row's cursor in the log; it restarts at 0 when the follow starts over (SC-R12).
   */
  subscribe(
    input: AgentHostReadInput,
    listener: (chatId: string, event: AgentLogEvent, position?: number) => void,
    onEnded?: () => void,
    /** The exact read batch or refusal, for a projection that owns the cursor. */
    onAnswer?: (answer: ReadAnswer) => ReadRequest['last'] | void,
  ): () => void;
  /** Read-only, non-durable preview for one chat; it never admits, retries, or settles a run. */
  subscribeLive(
    chatId: string,
    listener: (chatId: string, event: SourceLiveEvent) => void,
    onEnded?: () => void,
  ): () => void;
  close(): Promise<void>;
};

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

/**
 * Project the page's admission config onto the wire's (drift items 2, 3).
 *
 * `testingEnabled` does not travel: a host's tool registry is its own (the
 * worker takes it at initialization, a daemon from its CLI). `model` does: the
 * wire field is optional so a headless daemon can run on its own default, but a
 * page that has picked a model expects that model.
 */
/** Project the page's explicit Tau admission onto the host command wire. @public */
export const wireAdmissionConfig = (config: AgentHostAdmissionConfig): AgentChannelAdmissionConfig => ({
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
/** Project an external agent's explicit selector and context onto the host command wire. @public */
export const externalAdmissionConfig = (
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

/**
 * The one agent-host client, over any transport.
 *
 * Nothing here knows whether it is talking to a dedicated worker or to a
 * daemon's socket: keyed commands, pulled reads, and close are properties of
 * the host protocol. The caller owns each gesture's command id and retry.
 *
 * @param transport - The wire to drive.
 * @returns A client whose answers the projection cannot distinguish by origin.
 * @public
 */
export const createAgentHostClient = (transport: AgentHostTransport): AgentHostClient => {
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

  const read = async (input: AgentHostReadInput, signal?: AbortSignal): Promise<ReadAnswer> =>
    guarded(
      async () =>
        transport.read({
          chatId: input.chatId,
          cursor: input.cursor,
          ...(input.last === undefined ? {} : { last: input.last }),
          ...(input.sourceGeneration === undefined ? {} : { sourceGeneration: input.sourceGeneration }),
          ...(input.sourceHealth === undefined ? {} : { sourceHealth: input.sourceHealth }),
          limit: agentWireLimits.batchRows,
          maxBytes: agentWireLimits.batchBytes,
          ...(signal === undefined ? {} : { signal }),
        }),
      'WORKER_PROTOCOL_FAILED',
    );

  /** Run one consumer for as long as its subscription lives; a failure other than the unsubscribe is the client's. */
  const consume = (run: (signal: AbortSignal) => Promise<void>, onEnded?: () => void): (() => void) => {
    const operation = new AbortController();
    streamSubscriptions.add(operation);
    const drive = async (): Promise<void> => {
      try {
        await transport.ready;
        await run(operation.signal);
      } catch (error) {
        if (!operation.signal.aborted && !(error instanceof AgentHostWorkerError && error.code === 'LEADERSHIP_LOST')) {
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

  const follow: AgentHostClient['subscribe'] = (...parameters) => {
    const [
      { chatId, cursor: from, last: initialLast, sourceGeneration: initialGeneration, sourceHealth: initialHealth },
      listener,
      onEnded,
      onAnswer,
    ] = parameters;
    return consume(async (signal) => {
      let cursor = from;
      let last = initialLast;
      let sourceGeneration = initialGeneration;
      let sourceHealth = initialHealth;
      while (!signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop -- one outstanding long-poll read per chat (SC-R14).
        const answer = await read({ chatId, cursor, last, sourceGeneration, sourceHealth }, signal);
        if (isAborted(signal)) {
          return;
        }
        const projectedLast = onAnswer?.(answer);
        if (answer.status === 'refused') {
          if (answer.reason === 'cursor-ahead' || answer.reason === 'identity-mismatch') {
            // SC-R12: never a clamp; the reader starts over, and the projection drops rows it already holds.
            cursor = 0;
            last = undefined;
            sourceGeneration = undefined;
            sourceHealth = undefined;
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
        for (const [index, event] of answer.events.entries()) {
          // ponytail: rows cross the wire unparsed; W9's projection reads them through the ledger's tolerant reader.
          listener(chatId, event as AgentLogEvent, cursor + index);
        }
        cursor = answer.nextCursor;
        last = projectedLast ?? last;
        sourceGeneration = answer.sourceGeneration;
        sourceHealth = answer.sourceHealth;
      }
    }, onEnded);
  };

  const disposeSubscriptions = (): void => {
    for (const subscription of streamSubscriptions) {
      subscription.abort();
    }
    streamSubscriptions.clear();
    offTransportClose?.();
  };

  return {
    hostCommand: async (command) => guarded(async () => transport.execute(command), 'WORKER_PROTOCOL_FAILED'),
    read: async (input) => read(input),
    catchUp: async function* catchUp(input) {
      const operation = new AbortController();
      const signal = input.signal === undefined ? operation.signal : AbortSignal.any([operation.signal, input.signal]);
      streamSubscriptions.add(operation);
      const release = (): void => {
        streamSubscriptions.delete(operation);
      };
      signal.addEventListener('abort', release, { once: true });
      try {
        await guarded(async () => transport.ready, 'WORKER_PROTOCOL_FAILED');
        signal.throwIfAborted();
        for await (const frame of transport.catchUp({ ...input, signal })) {
          signal.throwIfAborted();
          yield frame;
        }
      } catch (error) {
        if (!signal.aborted) {
          throw toWorkerError(error, 'WORKER_STREAM_FAILED');
        }
      } finally {
        signal.removeEventListener('abort', release);
        release();
      }
    },
    subscribe: follow,
    subscribeLive: (chatId, listener, onEnded) =>
      consume(async (signal) => {
        for await (const event of transport.liveEvents(chatId, signal)) {
          listener(chatId, event);
        }
      }, onEnded),
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
  /** Inspect an already-open project's leadership actor, without booting a worker or taking a lock. */
  stoppability: (projectId: string, chatId: string) => Promise<'stoppable' | 'other-build' | 'background-window'>;
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
    stoppability: async (projectId, chatId) => {
      const live = current;
      if (live === undefined || live.dead) {
        return 'background-window';
      }
      await live.ready;
      return live.channel.call('runStoppability', { projectId, chatId });
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

/** Inspect an existing browser host's chat leadership for a truthful pre-close prompt. @public */
export const readBrowserRunStoppability = async (
  projectId: string,
  chatId: string,
): Promise<'stoppable' | 'other-build' | 'background-window'> => residentAgentWorker().stoppability(projectId, chatId);

/**
 * Keep a browser project's existing host provided while its route is live. Short-lived command and observer clients
 * still close independently; the returned release ends the host only after the project session closes.
 *
 * @param options - The first real browser-host options for this project.
 * @returns An idempotent release of the project binding's host reference.
 */
export const retainBrowserAgentHostProject = (options: AgentHostClientOptions): (() => void) =>
  residentAgentWorker(options.createWorker).acquire(options);

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
  createAgentHostClient(createAgentHostWorkerTransport(options));
