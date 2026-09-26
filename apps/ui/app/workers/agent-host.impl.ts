import type { MachineActors } from '#lib/xstate.lib.js';
import { ResourceQueue } from '@taucad/filesystem';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { toRpcError } from '@taucad/chat/rpc';
import { createChatToolRegistry, createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createRuntimeAgentClients, createRuntimeParameterAgentClient } from '@taucad/agent-tools/runtime';
import type { RuntimeAgentClient } from '@taucad/agent-tools/runtime';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { ParameterManifest, ParameterResolutionOptions, ParameterSetTarget } from '@taucad/parameters';
import { loadParameterSnapshot, commitParameterChange } from '@taucad/parameters/authority';
import type { ParameterAuthority } from '@taucad/parameters/authority';
import { createActor, createCallbackLogic, createAsyncLogic, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { parameterSetMachine } from '@taucad/parameters/set-machine';
import { fromFsLike } from '@taucad/runtime/filesystem';
import { connectComputeStoreChannel } from '@taucad/runtime/host';
import type { FsLike } from '@taucad/runtime/filesystem';
import { parameterEntryPath } from '@taucad/types';
import type { FileStat } from '@taucad/types';
import { randomUuid } from '@taucad/utils/id';
import { Topic } from '@taucad/events';
import { assertRootedPath } from '@taucad/utils/path';
import { z } from 'zod';
import { createCommandOwner, createTauAgentHost } from '@taucad/agent-host';
import type {
  AgentLiveEvent,
  DurableEventLog,
  HostRunSnapshot,
  InterruptRequest,
  InterruptResolution,
  StorageDurabilityClass,
  TauAgentHost,
} from '@taucad/agent-host';
import {
  agentLiveEventSchema,
  commandAnswerSchema,
  commandPayloads,
  readAnswerSchema,
  readRequestSchema,
} from '@taucad/agent-host/wire';
import type {
  CommandAnswer,
  CommandPayload,
  CommandVerb,
  HostCommand,
  ReadAnswer,
  ReadInput,
  ReadRequest,
  RefusalCode,
} from '@taucad/agent-host/wire';
import { isRecord } from '@taucad/utils/schema';
import { createOpfsEventLog, createProviderAttachmentReader, createProviderEventLog } from '@taucad/agent-host/browser';
import { createConfiguredGatewayModelTransport } from '#cloud/gateway-model-transport.js';
import { createDefaultKernelOptions } from '#constants/kernel-worker.constants.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import type { SkillResolver } from '#lib/skill-resolver.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import type {
  AgentHostWorkerInitializeRequest,
  AgentHostWorkerProtocol,
  AgentHostWorkerSettlementRecord,
} from '#workers/agent-host.contract.js';
import { agentHostSettlementRecordSchema } from '#workers/agent-host.contract.js';
import {
  acquireChatLeaderLease,
  agentHostAuthorityName,
  agentHostProtocolVersion,
  awaitWhileLeaderLives,
  createFollowerRecoveryMonitor,
} from '#workers/agent-host-leader.js';
import type { AgentHostLockRequest, ChatLeaderLease } from '#workers/agent-host-leader.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import { systemSkillsOverlay } from '#workers/system-skills-overlay.js';
import type { GeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';

type ParameterActor = ActorRefFrom<typeof parameterSetMachine>;

type ProjectFileSystemBridge = Pick<
  FileSystemBridgeProxy,
  | 'readFile'
  | 'writeFile'
  | 'writeFileChecked'
  | 'appendFile'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'mkdir'
  | 'unlink'
  | 'rmdir'
  | 'rename'
  | 'exists'
  | 'watchReady'
  | 'hello'
  | 'dispose'
>;

type BroadcastBinding = {
  readonly version: typeof agentHostProtocolVersion;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly chatId: string;
};

/**
 * One command a follower forwards to its chat's leader: the page's key and payload, answered by the leader's own
 * command owner, so a local and a forwarded duplicate dedupe by key (S4 finding 3). `requestId` is the forward's own
 * correlation, where every build reads a return address (I32).
 */
type ForwardedCommand =
  | {
      readonly requestId: string;
      readonly sessionId: string;
      readonly commandId: string;
      readonly type: CommandVerb;
      readonly payload: unknown;
    }
  | {
      readonly requestId: string;
      readonly sessionId: string;
      readonly commandId: string;
      readonly type: 'record-settlement';
      readonly payload: AgentHostWorkerSettlementRecord;
    };

/**
 * A leader's answer to a forwarded command. `error` is the refusal shape every protocol version reads (W0.17, I32):
 * another build's refusal, and a leader fault the follower raises as a coded error. Every command it decided is an
 * `answer` (drift 9).
 */
type ForwardedResponse =
  | { readonly type: 'answer'; readonly requestId: string; readonly answer: CommandAnswer }
  | { readonly type: 'error'; readonly requestId: string; readonly code: string; readonly message: string };

type LeaderBroadcast = BroadcastBinding &
  (
    | {
        readonly type: 'command';
        readonly senderId: string;
        readonly targetGeneration?: string | undefined;
        readonly command: ForwardedCommand;
      }
    | {
        readonly type: 'response';
        readonly targetId: string;
        readonly generation: string;
        readonly response: ForwardedResponse;
      }
    | { readonly type: 'leader'; readonly senderId: string; readonly generation: string }
    | { readonly type: 'cursor'; readonly senderId: string; readonly generation: string; readonly endCursor: number }
    | {
        readonly type: 'tail-request';
        readonly senderId: string;
        readonly targetGeneration?: string | undefined;
        readonly requestId: string;
        readonly read: ReadRequest;
      }
    | {
        readonly type: 'tail';
        readonly targetId: string;
        readonly generation: string;
        readonly requestId: string;
        readonly answer: ReadAnswer;
      }
    | {
        readonly type: 'live-event';
        readonly senderId: string;
        readonly generation: string;
        readonly event: AgentLiveEvent;
      }
  );

type LeadershipState = {
  readonly lease: Extract<ChatLeaderLease, { readonly isLeader: true }>;
  readonly heartbeatId: ReturnType<typeof globalThis.setInterval>;
};

type WorkerSession = {
  readonly sessionId: string;
  readonly tabId: string;
  readonly fileSystem: ProjectFileSystemBridge;
  readonly projectRoot: ProjectFileSystemBridge;
  readonly durability: StorageDurabilityClass;
  /** Backend of the project's own storage — the only authority for log placement. */
  readonly storageBackend: string;
  readonly host: TauAgentHost;
  /** Answers every keyed command this worker leads, local or forwarded, from the chat's applied set (SC-R7). */
  readonly owner: (command: HostCommand) => Promise<CommandAnswer>;
  readonly runtimeClient: AppRuntimeClient;
  readonly parameterActors: ReadonlyMap<string, Promise<ParameterActor>>;
  readonly imageService: HeadlessImageService;
  readonly geoSpecClient: GeoSpecWorkerRpcClient;
  readonly computeDispose?: (() => void) | undefined;
  readonly providerBasePath: string;
  readonly projectId: string;
  readonly workspaceId: string;
};

/** OPFS sync access handles exist in workers and never on the main thread. */
const supportsOpfsSyncAccess = async (): Promise<boolean> => {
  const probeName = `.tau-agent-host-sync-probe-${randomUuid()}`;
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return false;
  }
  try {
    const fileHandle = (await root.getFileHandle(probeName, {
      create: true,
    })) as FileSystemFileHandle & {
      createSyncAccessHandle?: () => Promise<{ close: () => void }>;
    };
    try {
      if (typeof fileHandle.createSyncAccessHandle !== 'function') {
        return false;
      }
      const syncHandle = await fileHandle.createSyncAccessHandle();
      syncHandle.close();
      return true;
    } finally {
      await root.removeEntry(probeName);
    }
  } catch {
    return false;
  }
};

/**
 * The bridge reports the durability class of the context that *owns* the
 * provider, but this worker is the process that writes `events.jsonl`. Only
 * OPFS is context-dependent — a main-thread OPFS provider honestly probes
 * `stream-append` while this worker can hold an exclusive sync handle — so it
 * is the one class re-probed here. Every other backend is taken as reported:
 * a webaccess project must never be re-routed onto OPFS (charter PH22(b)).
 */
const resolveWorkerDurability = async (
  backend: string,
  reported: StorageDurabilityClass,
): Promise<StorageDurabilityClass> =>
  backend === 'opfs' && (await supportsOpfsSyncAccess()) ? 'exclusive-append' : reported;

const createProjectFileSystemProxy = async (port: MessagePort): Promise<ProjectFileSystemBridge> => {
  const { createTransferredFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const proxy = createTransferredFileSystemBridgeProxy(port);
  await proxy.ready;
  return proxy;
};

/**
 * The workspace bridge as a `FileSystemProvider`: the one rooted provider this
 * worker hands to the GeoSpec bridge port and to the shared tool filesystem.
 *
 * @param proxy - The worker's end of the workspace filesystem bridge.
 * @returns The provider every tool call and the GeoSpec bridge read through.
 * @internal
 */
export const createRelayedFileSystemProvider = (proxy: ProjectFileSystemBridge): FileSystemProvider => {
  const { payload } = proxy.hello;
  if (payload.state !== 'ready') {
    throw Object.assign(new Error(`Workspace filesystem bridge is ${payload.state}.`), {
      code: 'FILESYSTEM_BRIDGE_UNAVAILABLE',
    });
  }

  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? proxy.readFile(path, encoding) : proxy.readFile(path);
  }

  return {
    id: 'agent-host-workspace-relay',
    capabilities: payload.capabilities,
    readFile,
    writeFile: proxy.writeFile.bind(proxy),
    /* The agent's conditional write compares and writes in one step only where
     * the provider can; without this the browser leg fell back to a separate
     * read and write, and a person's edit between them was overwritten (W0.18).
     * A bridge served over a bare provider has no such method and its server
     * answers `Unknown method`, which ran nothing: that is
     * `CHECKED_WRITE_UNSUPPORTED`, the refusal the tool falls back on.
     * ponytail: matched on the rpc server's message, which carries no code; the
     * bridge hello advertising checked writes would remove the match. */
    writeFileChecked: async (input) => {
      try {
        return await proxy.writeFileChecked(input);
      } catch (error) {
        if (error instanceof Error && error.message === 'Unknown method: writeFileChecked') {
          throw Object.assign(new Error('This workspace bridge cannot compare and write in one step.'), {
            code: 'CHECKED_WRITE_UNSUPPORTED',
            applicationState: 'known-not-applied',
          });
        }
        throw error;
      }
    },
    appendFile: proxy.appendFile.bind(proxy),
    readdir: proxy.readdir.bind(proxy),
    stat: proxy.stat.bind(proxy),
    mkdir: proxy.mkdir.bind(proxy),
    unlink: proxy.unlink.bind(proxy),
    rmdir: async (path) => proxy.rmdir(path),
    rename: proxy.rename.bind(proxy),
    exists: proxy.exists.bind(proxy),
    lstat: proxy.lstat.bind(proxy),
    dispose: () => undefined,
  };
};

const channels = new Map<string, BroadcastChannel>();
const leadership = new Map<string, LeadershipState>();
const leadershipAttempts = new Map<string, Promise<boolean>>();
const takeoverAttempts = new Map<string, Promise<HostRunSnapshot | undefined>>();
/** Chats this worker leads whose first attach has not run yet: that attach is the takeover (I4, I7). */
const takeovers = new Set<string>();
const forwarded = new Map<string, ReturnType<typeof Promise.withResolvers<ForwardedResponse>>>();
const forwardedReads = new Map<string, ReturnType<typeof Promise.withResolvers<ReadAnswer>>>();
/**
 * Wakes follower reads parked until the leader's cursor moves, the leader changes, or this worker leads (SC-R14):
 * the chat whose reads wake, or every chat.
 */
const readWakes = new Topic<string | undefined>({ name: 'agent-host:read-wakes' });
const leaderGenerations = new Map<string, string>();
const followerMonitors = new Map<string, ReturnType<typeof createFollowerRecoveryMonitor>>();
const followerRecoveries = new Set<string>();
const followerRetryIds = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
const backgroundTasks = new Set<Promise<void>>();
const liveEventStreams = new Set<{
  readonly chatId: string;
  readonly controller: ReadableStreamDefaultController<AgentLiveEvent>;
}>();
let session: WorkerSession | undefined;
let closing = false;

const leaderHeartbeatInterval = 1000;
const followerHeartbeatTimeout = 3500;
// ponytail: T9 C3, the forwarded read's answer bound; W6 deletes it with this carrier.
const followerTailTimeout = 2000;

/** One chat's live deltas, consumed by the worker's @taucad/rpc listen handler (SC-R15). */
export const listenAgentHostWorkerLiveEvents = (chatId: string, signal: AbortSignal): AsyncIterable<AgentLiveEvent> => {
  let cleanup = (): void => undefined;
  return new ReadableStream<AgentLiveEvent>({
    start(controller) {
      const entry = { chatId, controller };
      let active = true;
      const close = (): void => {
        if (!active) {
          return;
        }
        active = false;
        liveEventStreams.delete(entry);
        controller.close();
        signal.removeEventListener('abort', close);
      };
      cleanup = close;
      liveEventStreams.add(entry);
      if (signal.aborted) {
        close();
      } else {
        signal.addEventListener('abort', close, { once: true });
      }
    },
    cancel: () => {
      cleanup();
    },
  });
};

const enqueueLiveEvent = (event: AgentLiveEvent): void => {
  for (const stream of liveEventStreams) {
    if (stream.chatId === event.chatId) {
      stream.controller.enqueue(event);
    }
  }
};

const codedErrorSchema = z.object({ code: z.string() });
const errorCode = (error: unknown): string => codedErrorSchema.safeParse(error).data?.code ?? 'AGENT_HOST_ERROR';

/**
 * A command the leader refused because it addressed an older generation.
 *
 * The refusal is decided before the command runs, which is what makes one
 * re-address safe: unlike `LEADERSHIP_LOST`, which a leader raises partway
 * through work it may already have done, nothing has happened here.
 */
const leaderGenerationStaleCode = 'LEADER_GENERATION_STALE' satisfies RefusalCode;

const refusedAnswer = (commandId: string, code: RefusalCode, message: string): CommandAnswer => ({
  commandId,
  generation: 0,
  status: 'refused',
  effect: 'not-applied',
  code,
  message,
});

const faultResponse = (requestId: string, error: unknown): ForwardedResponse => ({
  type: 'error',
  requestId,
  code: errorCode(error),
  message: error instanceof Error ? error.message : String(error),
});

const chatIdOf = (payload: unknown): string | undefined => {
  const chatId = isRecord(payload) ? payload['chatId'] : undefined;
  return typeof chatId === 'string' && chatId.length > 0 ? chatId : undefined;
};

const broadcastBaseSchema = {
  version: z.literal(agentHostProtocolVersion),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  chatId: z.string().min(1),
};
const commandVerbs = Object.keys(commandPayloads) as [CommandVerb, ...CommandVerb[]];
const forwardEnvelope = { requestId: z.string().min(1), sessionId: z.string().min(1), commandId: z.string().min(1) };
/* The payload is the command owner's to read: an unreadable one is answered `COMMAND_UNREADABLE` (SC-R4). */
const forwardedCommandSchema = z.union([
  z.strictObject({ ...forwardEnvelope, type: z.enum(commandVerbs), payload: z.unknown() }),
  z.strictObject({
    ...forwardEnvelope,
    type: z.literal('record-settlement'),
    payload: agentHostSettlementRecordSchema,
  }),
]);
const leaderBroadcastSchema = z.union([
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('command'),
    senderId: z.string().min(1),
    targetGeneration: z.string().optional(),
    command: forwardedCommandSchema,
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('response'),
    targetId: z.string().min(1),
    generation: z.string().min(1),
    response: z.union([
      z.strictObject({ type: z.literal('answer'), requestId: z.string().min(1), answer: commandAnswerSchema }),
      z.strictObject({
        type: z.literal('error'),
        requestId: z.string().min(1),
        code: z.string().min(1),
        message: z.string(),
      }),
    ]),
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('leader'),
    senderId: z.string().min(1),
    generation: z.string().min(1),
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('cursor'),
    senderId: z.string().min(1),
    generation: z.string().min(1),
    endCursor: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('tail-request'),
    senderId: z.string().min(1),
    targetGeneration: z.string().optional(),
    requestId: z.string().min(1),
    read: readRequestSchema,
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('tail'),
    targetId: z.string().min(1),
    generation: z.string().min(1),
    requestId: z.string().min(1),
    answer: readAnswerSchema,
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('live-event'),
    senderId: z.string().min(1),
    generation: z.string().min(1),
    event: agentLiveEventSchema,
  }),
]);

/** What every build's frame keeps, whatever its protocol version (I32). */
const frameEnvelopeSchema = z.object({ version: z.number(), projectId: z.string(), chatId: z.string() });

/** A refusal addressed to a follower, readable by a peer of any protocol version. */
const refusalFrameSchema = z.object({
  type: z.literal('response'),
  targetId: z.string().min(1),
  response: z.strictObject({
    type: z.literal('error'),
    requestId: z.string().min(1),
    code: z.string().min(1),
    message: z.string(),
  }),
});

/** Who a command frame of another build is from, read loosely: every build nests `command.requestId` (W0.17, I32). */
const commandReturnAddressSchema = z.object({
  type: z.literal('command'),
  senderId: z.string().min(1),
  command: z.object({ requestId: z.string().min(1) }),
});

const validatedBroadcast = (
  value: unknown,
  active: WorkerSession,
  chatId: string,
): LeaderBroadcast | 'foreign' | 'unreadable' | undefined => {
  const parsed = leaderBroadcastSchema.safeParse(value);
  if (!parsed.success) {
    /* The channel is the chat's lock identity, shared by every build: a frame
     * of another protocol version is answered, not dropped (W0.17, I32). */
    const envelope = frameEnvelopeSchema.safeParse(value).data;
    if (envelope === undefined || envelope.projectId !== active.projectId || envelope.chatId !== chatId) {
      return undefined;
    }
    if (envelope.version !== agentHostProtocolVersion) {
      return 'foreign';
    }
    /* A frame claiming *this* protocol and failing its schema is a defect; a command in it is still answered (I15),
     * since the follower's wait is bounded only by this leader's heartbeat (W10 finding 3). */
    console.error('[agentHost] a leader frame this protocol cannot read', chatId, parsed.error.issues);
    return 'unreadable';
  }
  const message = parsed.data as LeaderBroadcast;
  /* Not the checkout: the channel and the lock are the chat's, whichever
   * checkout a tab's turn is on (W0.17). */
  if (message.projectId !== active.projectId || message.chatId !== chatId) {
    return undefined;
  }
  if (message.type === 'live-event') {
    return message.event.chatId === chatId ? message : undefined;
  }
  return message;
};

const requireStoragePathSegment = (value: string, label: string): string => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw Object.assign(new Error(`${label} must be one storage path segment.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return value;
};

/**
 * The runtime's filesystem, adapted from the view the executor reads.
 *
 * The kernel runs project code the agent wrote, so its source is the agent's
 * composed view and not the bridge proxy (W14) — these members are all it needs,
 * and a view has no `hello` or `watchReady` to give it.
 */
type RuntimeFsSource = Pick<
  ComposedView,
  'readFile' | 'writeFile' | 'mkdir' | 'readdir' | 'unlink' | 'rmdir' | 'rename' | 'stat' | 'lstat'
>;

const createRuntimeFsLike = (proxy: RuntimeFsSource): FsLike => {
  const nativeStat = (stat: FileStat) => ({
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    isDirectory: () => stat.type === 'dir',
  });
  return {
    promises: {
      readFile: proxy.readFile.bind(proxy),
      writeFile: proxy.writeFile.bind(proxy),
      mkdir: proxy.mkdir.bind(proxy),
      readdir: proxy.readdir.bind(proxy),
      unlink: proxy.unlink.bind(proxy),
      rmdir: proxy.rmdir.bind(proxy),
      rename: proxy.rename.bind(proxy),
      stat: async (path) => nativeStat(await proxy.stat(path)),
      lstat: async (path) => nativeStat(await proxy.lstat(path)),
    },
  };
};

const createRuntimeRpcClients = (options: {
  readonly runtimeClient: AppRuntimeClient;
  readonly imageService: HeadlessImageService;
}) => {
  const { runtimeClient } = options;
  const runtime: RuntimeAgentClient = runtimeClient;
  return createRuntimeAgentClients({
    runtime,
    exportImage: async (job) => options.imageService.export(job),
    mapRuntimeError: (error) => toRpcError(error),
  });
};

const broadcastBinding = (active: WorkerSession, chatId: string) =>
  ({
    version: agentHostProtocolVersion,
    projectId: active.projectId,
    workspaceId: active.workspaceId,
    chatId,
  }) as const;

const publishEvent = async (active: WorkerSession, chatId: string): Promise<void> => {
  const state = leadership.get(chatId);
  if (!state) {
    return;
  }
  // ponytail: one read per append for the end cursor (HD-12); W6's carrier publishes it from the append.
  const { endCursor } = await active.host.readEvents({
    chatId,
    cursor: Number.MAX_SAFE_INTEGER,
    limit: 1,
  });
  channelFor(chatId).postMessage({
    ...broadcastBinding(active, chatId),
    type: 'cursor',
    senderId: active.tabId,
    generation: state.lease.generation,
    endCursor,
  } satisfies LeaderBroadcast);
};

const publishLiveEvent = (active: WorkerSession, event: AgentLiveEvent): void => {
  const state = leadership.get(event.chatId);
  if (!state) {
    return;
  }
  enqueueLiveEvent(event);
  channelFor(event.chatId).postMessage({
    ...broadcastBinding(active, event.chatId),
    type: 'live-event',
    senderId: active.tabId,
    generation: state.lease.generation,
    event,
  } satisfies LeaderBroadcast);
};

const openProjectEventLog = async (active: WorkerSession, chatId: string): Promise<DurableEventLog> => {
  const state = leadership.get(chatId);
  if (!state) {
    throw Object.assign(new Error(`This tab does not hold the event-log lease for ${chatId}.`), {
      code: 'NOT_CHAT_LEADER',
    });
  }
  const chatPath = requireStoragePathSegment(chatId, 'chatId');
  // The OPFS-root leg reaches past the project's own filesystem bridge, so it
  // is admissible only for a project that genuinely lives in OPFS.
  const log =
    active.storageBackend === 'opfs' && active.durability === 'exclusive-append'
      ? await (async () => {
          try {
            const root = await navigator.storage.getDirectory();
            const project = await root.getDirectoryHandle(
              requireStoragePathSegment(active.providerBasePath, 'providerBasePath'),
              { create: false },
            );
            const tau = await project.getDirectoryHandle('.tau', {
              create: true,
            });
            const chats = await tau.getDirectoryHandle('chats', {
              create: true,
            });
            const chat = await chats.getDirectoryHandle(chatPath, {
              create: true,
            });
            return await createOpfsEventLog({
              fileHandle: await chat.getFileHandle('events.jsonl', {
                create: true,
              }),
              access: 'write',
            });
          } catch (error) {
            throw Object.assign(new Error(`Project event storage for ${chatId} is not writable.`), {
              code: 'STORAGE_NOT_WRITABLE',
              cause: error,
            });
          }
        })()
      : await createProviderEventLog({
          fileSystem: active.projectRoot,
          // Bridge paths are root-relative (a leading slash fails assertRootedPath).
          filePath: `.tau/chats/${chatPath}/events.jsonl`,
          access: 'write',
          // One append fence per project's log, shared by every tab of this origin (D5, EQ2).
          lockName: `tau-log-append:${active.projectId}/${chatPath}`,
        });
  return {
    append: async (event) => {
      if (
        leadership.get(chatId)?.lease.generation !== state.lease.generation ||
        event.leaderEpoch !== state.lease.generation
      ) {
        throw Object.assign(new Error(`Leadership for ${chatId} changed before append.`), { code: 'LEADERSHIP_LOST' });
      }
      const durableEvent =
        event.type === 'run.lifecycle' && event.state === 'admitted'
          ? { ...event, storageDurability: active.durability }
          : event;
      const outcome = await log.append(durableEvent);
      if (outcome.appended) {
        await publishEvent(active, chatId);
      }
      return outcome;
    },
    read: async () => log.read(),
    readBatch: async (input) => log.readBatch(input),
    messages: async () => log.messages(),
    historyIntact: async () => log.historyIntact(),
    anomalies: async () => log.anomalies(),
    close: async () => log.close(),
  };
};

const trackTask = (operation: () => Promise<void>, onError: (error: unknown) => void): void => {
  const run = async (): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      onError(error);
    } finally {
      backgroundTasks.delete(task);
    }
  };
  const task = run();
  backgroundTasks.add(task);
};

const acknowledgeRun = async (
  active: WorkerSession,
  run: { readonly chatId: string; readonly runId?: string | undefined },
  completion: Promise<unknown>,
): Promise<HostRunSnapshot> => {
  const { chatId, runId } = run;
  /* A refused admission is an answer, not a race to lose: `waitForAdmission`
   * asks the *chat* what is running, so a command the host refused — because
   * the chat's previous run has not ended — used to be answered with that
   * previous run's snapshot, and the caller reported a run-id mismatch while
   * the real reason was swallowed with the rejected promise. The run id makes
   * the answer this command's own: two admissions racing on one chat can no
   * longer be answered with each other's snapshot. */
  const admitted = await Promise.race([active.host.waitForAdmission(chatId, runId), completion.then(() => undefined)]);
  if (!admitted) {
    await completion;
    return active.host.snapshot(chatId);
  }
  trackTask(
    async () => {
      await completion;
    },
    /* The caller was answered at admission and the run's own failure row is
     * durable, so there is nobody left to reject to — but a run that died after
     * its admission is a fact this worker must not discard in silence. */
    (error) => {
      console.error('[agentHost] run failed after it was admitted', chatId, runId, error);
    },
  );
  return admitted;
};

const requireSession = (): WorkerSession => {
  const active = session;
  if (!active) {
    throw Object.assign(new Error('Agent host worker session is not initialized.'), {
      code: 'SESSION_NOT_INITIALIZED' satisfies RefusalCode,
    });
  }
  return active;
};

/** The run's state after a verb, for an answer that recorded nothing. */
const stateOf = async (active: WorkerSession, chatId: string): Promise<Readonly<Record<string, unknown>>> => {
  const run = await active.host.describeRun(chatId);
  return run ? { state: run.state, runId: run.runId } : { state: 'none' };
};

/**
 * The attach answer: the chat's run, whether this attach took it over from a
 * dead driver, and the log's end *before* the run was read, so a reader
 * following from it misses no row.
 */
const attachDetails = async (active: WorkerSession, chatId: string): Promise<Readonly<Record<string, unknown>>> => {
  const takeover = takeovers.delete(chatId);
  const chatPath = requireStoragePathSegment(chatId, 'chatId');
  const abandonedLock = `.tau/chats/${chatPath}/events.jsonl.lock`;
  // Winning this workspace's native Web Lock proves its prior worker is gone;
  // only the provider advisory marker can have survived the abrupt reload.
  if (takeover && active.durability !== 'exclusive-append' && (await active.projectRoot.exists(abandonedLock))) {
    await active.projectRoot.unlink(abandonedLock);
  }
  const { position } = await active.host.ledger(chatId);
  let snapshot: HostRunSnapshot | undefined;
  if (position.cursor > 0) {
    if (takeover) {
      /* I4: a takeover *records* what it found, it never drives it. Resuming
       * here re-asked the provider for a turn the person had already paid
       * for, on a run no page owned — no lease, no revision, no settlement —
       * and it fired on the next gesture's attach, not on any decision. The
       * host decides what the record is: an abandoned run fails with
       * `RUN_ABANDONED` so the saved-turn card can offer Resume, a paused run
       * is left paused for the interrupt this batch republishes, and a run
       * this host is still driving is left alone. */
      const current = takeoverAttempts.get(chatId);
      const attempt = current ?? active.host.markAbandoned(chatId);
      takeoverAttempts.set(chatId, attempt);
      try {
        snapshot = await attempt;
      } catch (error) {
        /* A run that cannot be recorded must not make the chat unopenable:
         * the client still needs the transcript it attached for. The
         * leadership check below turns a lost lease into its own refusal. */
        console.error('[agentHost] could not record an abandoned run', chatId, error);
        snapshot = await active.host.describeRun(chatId);
      } finally {
        if (takeoverAttempts.get(chatId) === attempt) {
          takeoverAttempts.delete(chatId);
        }
      }
    } else {
      /* Non-throwing: `snapshot`'s `NO_RUN_ADMITTED` escaping here made a chat
       * whose log holds records but no run impossible to open at all. */
      snapshot = await active.host.describeRun(chatId);
    }
  }
  if (!leadership.has(chatId)) {
    throw Object.assign(new Error(`This tab lost leadership while attaching ${chatId}.`), {
      code: 'LEADERSHIP_LOST' satisfies RefusalCode,
    });
  }
  return {
    ...(snapshot ? { snapshot } : {}),
    /* This attach took the chat over from a dead driver *and* the run it
     * found still wants the attaching page: one it has just recorded as
     * abandoned, or one left non-terminal (paused on a person, or still
     * driven by this host). The page rebuilds from the log either way. */
    takeover:
      takeover &&
      snapshot !== undefined &&
      (snapshot.failure?.code === 'RUN_ABANDONED' ||
        (snapshot.state !== 'completed' && snapshot.state !== 'failed' && snapshot.state !== 'cancelled')),
    endCursor: position.cursor,
  };
};

/**
 * Narrow the wire's admission onto the host's. The browser host configures its
 * own prompt and model at initialization, so an admission that names neither
 * runs on them.
 */
const admissionConfig = (
  config: NonNullable<CommandPayload<'start'>['config']>,
): NonNullable<Parameters<TauAgentHost['admit']>[0]['config']> => ({
  systemPrompt: config.systemPrompt,
  ...(config.systemPromptBlocks ? { systemPromptBlocks: config.systemPromptBlocks } : {}),
  ...(config.model ? { model: config.model } : {}),
  toolChoice: config.toolChoice,
  ...(config.allowedTools ? { allowedTools: config.allowedTools } : {}),
  ...(config.snapshot === undefined ? {} : { snapshot: config.snapshot }),
  ...(config.contextPayload ? { clientContext: config.contextPayload } : {}),
  ...(config.contextMessages ? { contextMessages: config.contextMessages } : {}),
});

/**
 * Today's command logic per verb, behind the command owner: the owner answers a
 * key the chat's log already applied before this runs, and turns a coded throw
 * into a refusal (SC-R7–SC-R9). `commandId` is stamped on each verb's decision
 * row, so a re-send finds it.
 */
const executeCommand = async (
  active: WorkerSession,
  command: HostCommand,
): Promise<Readonly<Record<string, unknown>> | undefined> => {
  const { chatId } = command.payload;
  const { commandId } = command;
  switch (command.type) {
    case 'attach': {
      return attachDetails(active, chatId);
    }
    case 'start': {
      const { payload } = command;
      if (payload.config?.agent) {
        /* An external agent is a *daemon* placement (W4-ACP): this worker
         * registers no external runner, so running the turn on Tau instead
         * would silently answer with a model and tools the user did not pick. */
        throw Object.assign(new Error(`This browser host runs no ${payload.config.agent.kind} agents.`), {
          code: 'EXTERNAL_AGENT_UNAVAILABLE' satisfies RefusalCode,
        });
      }
      /* Only the command id replays, and the owner answers it before this runs: a run id the log already holds
       * under another key is the host's to refuse (`RUN_ID_TAKEN`, or `CHAT_RUN_LIVE` while it runs). */
      const base = {
        chatId,
        runId: payload.runId,
        message: payload.message,
        commandId,
        ...(payload.config ? { config: admissionConfig(payload.config) } : {}),
      };
      const completion = active.host.admit(
        payload.trigger === 'submit'
          ? { ...base, trigger: 'submit' }
          : { ...base, trigger: payload.trigger, retainedMessageIds: payload.retainedMessageIds ?? [] },
      );
      await acknowledgeRun(active, { chatId, runId: payload.runId }, completion);
      return undefined;
    }
    case 'resume': {
      await acknowledgeRun(active, { chatId }, active.host.resume(chatId, { commandId }));
      return undefined;
    }
    case 'steer': {
      await active.host.steer({ runId: command.payload.runId, message: command.payload.message });
      // ponytail: a steer is delivered to the live session, not recorded; W7 writes its row (I18).
      return { delivery: 'queued' };
    }
    case 'cancel': {
      await active.host.cancel({ runId: command.payload.runId, commandId });
      return stateOf(active, chatId);
    }
    case 'interrupt': {
      // Drift 6: one verb on both legs; the browser raises no interrupt until M1 (W7).
      throw Object.assign(new Error('This browser host does not raise interrupts.'), {
        code: 'COMMAND_UNSUPPORTED' satisfies RefusalCode,
      });
    }
    case 'resolve-interrupt': {
      const { payload } = command;
      await active.host.resolveInterrupt({
        runId: payload.runId,
        interruptId: payload.interruptId,
        outcome: payload.outcome,
        commandId,
        ...(payload.optionId === undefined ? {} : { optionId: payload.optionId }),
        ...(payload.payload === undefined ? {} : { payload: payload.payload }),
      });
      return stateOf(active, chatId);
    }
  }
};

/** Answer one command this worker leads: a verb through the owner, a settlement through the host. */
const leaderAnswer = async (
  active: WorkerSession,
  chatId: string,
  command: ForwardedCommand,
): Promise<CommandAnswer> => {
  if (chatIdOf(command.payload) !== chatId) {
    return refusedAnswer(command.commandId, 'COMMAND_UNREADABLE', `The command does not address chat ${chatId}.`);
  }
  if (command.type === 'record-settlement') {
    await active.host.recordSettlement({ chatId, runId: command.payload.event.runId, event: command.payload.event });
    return { commandId: command.commandId, generation: 0, status: 'applied', effect: 'not-applied', details: {} };
  }
  return active.owner({ type: command.type, commandId: command.commandId, payload: command.payload } as HostCommand);
};

const postResponse = (options: {
  readonly channel: BroadcastChannel;
  readonly active: WorkerSession;
  readonly chatId: string;
  readonly generation: string;
  readonly targetId: string;
  readonly response: ForwardedResponse;
}): void => {
  options.channel.postMessage({
    ...broadcastBinding(options.active, options.chatId),
    type: 'response',
    targetId: options.targetId,
    generation: options.generation,
    response: options.response,
  } satisfies LeaderBroadcast);
};

/**
 * Answer a frame of another protocol version (W0.17, I32), or a command frame of this one it cannot read (I15).
 *
 * A refusal addressed to this tab settles the command it answers; a command
 * this tab leads for is refused with `LEADER_VERSION_MISMATCH` (or
 * `COMMAND_UNREADABLE`), so its follower learns it within one round trip
 * instead of waiting on a leader that stays alive.
 */
const answerForeignFrame = (options: {
  readonly channel: BroadcastChannel;
  readonly active: WorkerSession;
  readonly chatId: string;
  readonly frame: unknown;
  /** The frame claims this protocol and fails it: its command is refused unreadable, not version-mismatched. */
  readonly unreadable?: boolean;
}): void => {
  const refusal = refusalFrameSchema.safeParse(options.frame).data;
  if (refusal !== undefined) {
    const pending = refusal.targetId === options.active.tabId ? forwarded.get(refusal.response.requestId) : undefined;
    if (pending) {
      forwarded.delete(refusal.response.requestId);
      pending.resolve(refusal.response);
    }
    return;
  }
  const state = leadership.get(options.chatId);
  const address = commandReturnAddressSchema.safeParse(options.frame).data;
  if (!state || !address) {
    return;
  }
  postResponse({
    channel: options.channel,
    active: options.active,
    chatId: options.chatId,
    generation: state.lease.generation,
    targetId: address.senderId,
    response: {
      type: 'error',
      requestId: address.command.requestId,
      ...(options.unreadable === true
        ? {
            code: 'COMMAND_UNREADABLE' satisfies RefusalCode,
            message: `The leader of chat ${options.chatId} could not read that command.`,
          }
        : {
            code: 'LEADER_VERSION_MISMATCH' satisfies RefusalCode,
            message: `Chat ${options.chatId} is led by a tab running another version of Tau (protocol ${String(agentHostProtocolVersion)}). Reload this tab.`,
          }),
    },
  });
};

const followerMonitorFor = (chatId: string) => {
  const current = followerMonitors.get(chatId);
  if (current) {
    return current;
  }
  const monitor = createFollowerRecoveryMonitor({
    heartbeatTimeout: followerHeartbeatTimeout,
    tailTimeout: followerTailTimeout,
    onStale: () => {
      leaderGenerations.delete(chatId);
      wakeReads(chatId);
      scheduleFollowerRecovery(chatId);
    },
  });
  followerMonitors.set(chatId, monitor);
  return monitor;
};

/** Wake every read parked on this chat; each re-decides who answers it and reads again. */
function wakeReads(chatId: string | undefined): void {
  readWakes.emit(chatId);
}

const observeFollowerLeader = (chatId: string, generation: string): void => {
  if (leadership.has(chatId)) {
    return;
  }
  const retryId = followerRetryIds.get(chatId);
  if (retryId !== undefined) {
    globalThis.clearTimeout(retryId);
    followerRetryIds.delete(chatId);
  }
  if (followerMonitorFor(chatId).observeLeader(generation)) {
    wakeReads(chatId);
  }
  leaderGenerations.set(chatId, generation);
};

function channelFor(chatId: string): BroadcastChannel {
  const existing = channels.get(chatId);
  if (existing) {
    return existing;
  }
  const active = session;
  if (!active) {
    throw new Error('Agent host worker is not initialized.');
  }
  const channel = new BroadcastChannel(agentHostAuthorityName({ projectId: active.projectId, chatId }));
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const current = session;
    if (!current) {
      return;
    }
    const message = validatedBroadcast(event.data, current, chatId);
    if (message === 'foreign' || message === 'unreadable') {
      answerForeignFrame({ channel, active: current, chatId, frame: event.data, unreadable: message === 'unreadable' });
      return;
    }
    if (!message) {
      return;
    }
    if (message.type === 'leader') {
      if (message.senderId !== current.tabId) {
        observeFollowerLeader(chatId, message.generation);
      }
      return;
    }
    if (message.type === 'response') {
      if (message.targetId !== current.tabId) {
        return;
      }
      /* Only learn a generation this follower still believes in: a late answer
       * from a leader that has since been replaced must not re-arm the monitor
       * on a dead heartbeat. The answer itself is kept either way — it is
       * addressed to this tab, for a request id this tab minted and is waiting
       * on, and discarding it left that request pending forever whenever
       * leadership rolled over while a command was in flight. */
      const knownGeneration = leaderGenerations.get(chatId);
      if (!knownGeneration || knownGeneration === message.generation) {
        observeFollowerLeader(chatId, message.generation);
      }
      const pending = forwarded.get(message.response.requestId);
      if (pending) {
        forwarded.delete(message.response.requestId);
        pending.resolve(message.response);
      }
      return;
    }
    if (message.type === 'cursor') {
      if (message.senderId !== current.tabId) {
        observeFollowerLeader(chatId, message.generation);
        wakeReads(chatId);
      }
      return;
    }
    if (message.type === 'live-event') {
      if (message.senderId !== current.tabId) {
        observeFollowerLeader(chatId, message.generation);
      }
      if (message.senderId !== current.tabId && leaderGenerations.get(chatId) === message.generation) {
        enqueueLiveEvent(message.event);
      }
      return;
    }
    if (message.type === 'tail') {
      if (message.targetId !== current.tabId) {
        return;
      }
      if (leaderGenerations.get(chatId) === message.generation) {
        observeFollowerLeader(chatId, message.generation);
        followerMonitorFor(chatId).settleTail(message.generation);
      }
      const pending = forwardedReads.get(message.requestId);
      if (pending) {
        forwardedReads.delete(message.requestId);
        pending.resolve(message.answer);
      }
      return;
    }
    const state = leadership.get(chatId);
    if (!state) {
      return;
    }
    if (message.type === 'tail-request') {
      if (message.targetGeneration !== undefined && message.targetGeneration !== state.lease.generation) {
        return;
      }
      trackTask(
        async () => {
          /* Answered at once: the follower parks on this leader's cursor frames,
           * so a long poll here would only hold a request the leader cannot see
           * abandoned (SC-R14 on the forwarding leg). Refused, never clamped. */
          const answer = await current.host.read({ ...message.read, signal: AbortSignal.abort() });
          channel.postMessage({
            ...broadcastBinding(current, chatId),
            type: 'tail',
            targetId: message.senderId,
            generation: state.lease.generation,
            requestId: message.requestId,
            answer,
          } satisfies LeaderBroadcast);
        },
        (error) => {
          console.error('[agentHost] could not answer a forwarded read', chatId, error);
        },
      );
      return;
    }
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Re-state the discriminant so the async callbacks retain the command member instead of widening it to any.
    if (message.type !== 'command') {
      return;
    }
    const { command, senderId } = message;
    const respond = (answer: CommandAnswer): void => {
      postResponse({
        channel,
        active: current,
        chatId,
        generation: state.lease.generation,
        targetId: senderId,
        response: { type: 'answer', requestId: command.requestId, answer },
      });
    };
    if (message.targetGeneration !== undefined && message.targetGeneration !== state.lease.generation) {
      /* Leadership rolled over between the follower's last heartbeat and its
       * send. Nothing has run yet — the refusal is decided before any work —
       * so the follower can re-learn the leader and send this same command,
       * with its same key, once more. */
      respond(
        refusedAnswer(
          command.commandId,
          leaderGenerationStaleCode,
          `Chat ${chatId} is led by a newer generation; re-address this command.`,
        ),
      );
      return;
    }
    if (message.workspaceId !== current.workspaceId && (command.type === 'start' || command.type === 'resume')) {
      /* One chat log, but this worker's files are its own checkout's: a turn
       * placed on another checkout cannot run here (W0.17). */
      respond(
        refusedAnswer(
          command.commandId,
          'LEADER_WORKSPACE_MISMATCH',
          `Chat ${chatId} is running on another checkout in another tab. Finish or stop it there first.`,
        ),
      );
      return;
    }
    trackTask(
      async () => {
        if (!leadership.has(chatId)) {
          /* Leadership ended between accepting this command and running it: nothing ran here, so it is
           * re-addressable. */
          respond(
            refusedAnswer(
              command.commandId,
              leaderGenerationStaleCode,
              `Chat ${chatId} changed leader before this command ran.`,
            ),
          );
          return;
        }
        respond(await leaderAnswer(current, chatId, command));
      },
      (error) => {
        postResponse({
          channel,
          active: current,
          chatId,
          generation: state.lease.generation,
          targetId: senderId,
          response: faultResponse(command.requestId, error),
        });
      },
    );
  });
  channels.set(chatId, channel);
  return channel;
}

const requestLock: AgentHostLockRequest = async (name, options, callback) =>
  navigator.locks.request(name, options, async (lock) => callback(lock ?? undefined));

const ensureLeadership = async (chatId: string): Promise<boolean> => {
  if (leadership.has(chatId)) {
    return true;
  }
  const current = leadershipAttempts.get(chatId);
  if (current) {
    return current;
  }
  channelFor(chatId);
  const acquire = async (): Promise<boolean> => {
    const active = session;
    if (!active) {
      throw new Error('Agent host worker is not initialized.');
    }
    const lease = await acquireChatLeaderLease({
      projectId: active.projectId,
      chatId,
      requestLock,
      createGeneration: randomUuid,
    });
    if (!lease.isLeader) {
      return false;
    }
    followerMonitors.get(chatId)?.stop();
    followerMonitors.delete(chatId);
    active.host.assumeLeadership(chatId, lease.generation);
    const announce = (): void => {
      channelFor(chatId).postMessage({
        ...broadcastBinding(active, chatId),
        type: 'leader',
        senderId: active.tabId,
        generation: lease.generation,
      } satisfies LeaderBroadcast);
    };
    const state: LeadershipState = {
      lease,
      heartbeatId: globalThis.setInterval(announce, leaderHeartbeatInterval),
    };
    leadership.set(chatId, state);
    leaderGenerations.set(chatId, lease.generation);
    takeovers.add(chatId);
    announce();
    // Parked follower reads of this chat are this worker's to answer now.
    wakeReads(chatId);
    trackTask(
      async () => {
        try {
          await lease.completion;
        } catch {
          // Lock-manager failure and normal release both invalidate this generation.
        }
        if (leadership.get(chatId) !== state) {
          return;
        }
        globalThis.clearInterval(state.heartbeatId);
        leadership.delete(chatId);
        leaderGenerations.delete(chatId);
        takeovers.delete(chatId);
        await active.host.relinquish(chatId);
      },
      () => undefined,
    );
    return true;
  };
  const attempt = acquire();
  leadershipAttempts.set(chatId, attempt);
  try {
    return await attempt;
  } finally {
    leadershipAttempts.delete(chatId);
  }
};

/** Forward one command to the chat's leader and wait while the leader it addressed lives (T9 C4, W0.14). */
const forwardOnce = async (
  active: WorkerSession,
  chatId: string,
  command: ForwardedCommand,
): Promise<ForwardedResponse | undefined> => {
  const pending = Promise.withResolvers<ForwardedResponse>();
  forwarded.set(command.requestId, pending);
  const targetGeneration = leaderGenerations.get(chatId);
  channelFor(chatId).postMessage({
    ...broadcastBinding(active, chatId),
    type: 'command',
    senderId: active.tabId,
    targetGeneration,
    command,
  } satisfies LeaderBroadcast);
  /* Liveness, not a work bound: a `start` is answered at admission time, which
   * includes preparing the turn, so a constant deadline re-sent a command the
   * leader was still working on. Only the addressed generation's liveness
   * counts (W0.14). */
  const response = await awaitWhileLeaderLives({
    response: pending.promise,
    generation: targetGeneration,
    lastSeen: () => followerMonitors.get(chatId)?.lastSeen(),
    heartbeatTimeout: followerHeartbeatTimeout,
  });
  if (forwarded.get(command.requestId) === pending) {
    forwarded.delete(command.requestId);
  }
  return response;
};

const isStaleRefusal = (response: ForwardedResponse): boolean =>
  response.type === 'answer'
    ? response.answer.status === 'refused' && response.answer.code === leaderGenerationStaleCode
    : response.code === leaderGenerationStaleCode;

const forwardedAnswer = (response: ForwardedResponse): CommandAnswer => {
  if (response.type === 'answer') {
    return response.answer;
  }
  throw Object.assign(new Error(response.message), { code: response.code });
};

/**
 * Hand one command to the chat's leader, or lead the chat and answer it here.
 *
 * Every re-address carries the same key, so the leader's owner answers a
 * command that already landed `replayed` instead of running it twice.
 */
const forwardCommand = async (
  active: WorkerSession,
  chatId: string,
  command: ForwardedCommand,
): Promise<CommandAnswer> => {
  const first = await forwardOnce(active, chatId, command);
  /* A stale-generation refusal takes the same recovery as no answer at all: the
   * leader ran nothing, and the re-send below carries no target generation (or
   * the one just learned), which the current leader accepts. */
  if (first && !isStaleRefusal(first)) {
    return forwardedAnswer(first);
  }
  leaderGenerations.delete(chatId);
  if (await ensureLeadership(chatId)) {
    return leaderAnswer(active, chatId, command);
  }
  const replay = await forwardOnce(active, chatId, { ...command, requestId: randomUuid() });
  if (!replay) {
    // The leader may have run it before it went silent: the effect is unknown, and the re-send is by key.
    return {
      commandId: command.commandId,
      generation: 0,
      status: 'refused',
      effect: 'unknown',
      code: 'PEER_UNRESPONSIVE' satisfies RefusalCode,
      message: `No leader of chat ${chatId} answered before it went silent; re-send this command.`,
    };
  }
  return forwardedAnswer(replay);
};

/** Park one follower read until something could change its answer (SC-R14). */
const parkRead = (chatId: string, signal: AbortSignal | undefined): { promise: Promise<void>; cancel(): void } => {
  const woken = Promise.withResolvers<void>();
  const stop = new AbortController();
  const wake = (): void => {
    stop.abort();
    signal?.removeEventListener('abort', wake);
    woken.resolve();
  };
  readWakes.subscribe(
    (woke) => {
      if (woke === undefined || woke === chatId) {
        wake();
      }
    },
    { signal: stop.signal },
  );
  signal?.addEventListener('abort', wake, { once: true });
  return { promise: woken.promise, cancel: wake };
};

/** Forward one read to the leader over the tail frames: refused or batched there, never clamped (SC-R12). */
const forwardRead = async (active: WorkerSession, request: ReadRequest): Promise<ReadAnswer | undefined> => {
  const { chatId } = request;
  const requestId = randomUuid();
  const pending = Promise.withResolvers<ReadAnswer>();
  forwardedReads.set(requestId, pending);
  const targetGeneration = leaderGenerations.get(chatId);
  if (targetGeneration !== undefined) {
    followerMonitorFor(chatId).beginTail(targetGeneration);
  }
  channelFor(chatId).postMessage({
    ...broadcastBinding(active, chatId),
    type: 'tail-request',
    senderId: active.tabId,
    targetGeneration,
    requestId,
    read: request,
  } satisfies LeaderBroadcast);
  try {
    return await awaitWhileLeaderLives({
      response: pending.promise,
      generation: targetGeneration,
      lastSeen: () => followerMonitors.get(chatId)?.lastSeen(),
      heartbeatTimeout: followerHeartbeatTimeout,
    });
  } finally {
    forwardedReads.delete(requestId);
  }
};

/**
 * One long-poll read (SC-R14): the leader's own host parks it until the next
 * durable row; a follower forwards it and parks until the leader's cursor
 * frames show a row past it, the leader changes, or the reader lets go.
 */
const readChat = async ({ signal, ...request }: ReadInput): Promise<ReadAnswer> => {
  const { chatId } = request;
  const stopped = (): boolean => signal?.aborted === true || closing;
  for (;;) {
    const active = requireSession();
    // oxlint-disable-next-line no-await-in-loop -- leadership is re-decided on every wake.
    if (await ensureLeadership(chatId)) {
      // oxlint-disable-next-line no-await-in-loop -- the host's long poll.
      const answer = await active.host.read({ ...request, ...(signal === undefined ? {} : { signal }) });
      if (answer.status === 'refused' && answer.reason === 'owner-fenced' && !stopped()) {
        // The lease was let go under this read: whoever leads now answers it.
        continue;
      }
      return answer;
    }
    // Parked before the forward, so a cursor frame between its answer and the park is not lost.
    const parked = parkRead(chatId, signal);
    // oxlint-disable-next-line no-await-in-loop -- one forwarded read at a time per reader.
    const answer = await forwardRead(active, request);
    if (answer === undefined) {
      parked.cancel();
      leaderGenerations.delete(chatId);
      continue;
    }
    if (answer.status === 'refused' || answer.events.length > 0 || stopped()) {
      parked.cancel();
      return answer;
    }
    // oxlint-disable-next-line no-await-in-loop -- the park is the long poll.
    await parked.promise;
    if (stopped()) {
      return answer;
    }
  }
};

const recoverFollower = async (chatId: string): Promise<void> => {
  const active = session;
  if (!active || closing || leadership.has(chatId)) {
    return;
  }
  leaderGenerations.delete(chatId);
  if (await ensureLeadership(chatId)) {
    // The takeover is recorded now, not on the next page gesture (I4); pages read the result themselves.
    await active.owner({ type: 'attach', commandId: randomUuid(), payload: { chatId } });
  }
  wakeReads(chatId);
};

function scheduleFollowerRecovery(chatId: string): void {
  if (closing || leadership.has(chatId) || followerRecoveries.has(chatId) || followerRetryIds.has(chatId)) {
    return;
  }
  followerRecoveries.add(chatId);
  trackTask(
    async () => {
      try {
        await recoverFollower(chatId);
      } finally {
        followerRecoveries.delete(chatId);
      }
    },
    () => {
      if (closing || leadership.has(chatId)) {
        return;
      }
      const retryId = globalThis.setTimeout(() => {
        followerRetryIds.delete(chatId);
        scheduleFollowerRecovery(chatId);
      }, followerHeartbeatTimeout);
      followerRetryIds.set(chatId, retryId);
    },
  );
}

const initialize = async (request: AgentHostWorkerInitializeRequest, sessionId: string): Promise<void> => {
  if (session) {
    if (session.sessionId === sessionId) {
      return;
    }
    throw Object.assign(new Error('Agent host worker already has a different session.'), { code: 'SESSION_CONFLICT' });
  }
  if (!request.authority.projectId || !request.authority.workspaceId) {
    throw Object.assign(new Error('Project and workspace authority are required.'), { code: 'AUTHORITY_INVALID' });
  }
  const runtimeConfig = uiRuntimeConfigSchema.parse(request.runtimeConfig);
  if ((request.computeMode === 'durable') !== Boolean(request.computeStorePort)) {
    throw Object.assign(new Error('Durable compute mode and its private store port must be supplied together.'), {
      code: 'COMPUTE_AUTHORITY_INVALID',
    });
  }
  const computeConnection = request.computeStorePort ? connectComputeStoreChannel(request.computeStorePort) : undefined;
  const compute = computeConnection
    ? ({ mode: 'durable', store: computeConnection.store } as const)
    : request.computeMode === 'off'
      ? ({ mode: 'off' } as const)
      : ({ mode: 'memory' } as const);
  const [fileSystem, projectRoot] = await Promise.all([
    createProjectFileSystemProxy(request.fileSystemPort),
    createProjectFileSystemProxy(request.projectRootPort),
  ]);
  const projectRootCapabilities = projectRoot.hello.payload;
  if (
    projectRootCapabilities.state !== 'ready' ||
    !projectRootCapabilities.capabilities.writable ||
    !projectRootCapabilities.capabilities.durability
  ) {
    fileSystem.dispose();
    projectRoot.dispose();
    throw Object.assign(new Error('The project filesystem bridge is not writable or did not declare durability.'), {
      code: 'STORAGE_NOT_WRITABLE',
    });
  }
  const storageBackend = request.projectStorage.backend;
  const durability = await resolveWorkerDurability(storageBackend, projectRootCapabilities.capabilities.durability);
  const fileSystemMutations = new ResourceQueue();
  const skillResolver = createSkillResolver({
    readFile: async (path) => {
      const content = await fileSystem.readFile(assertRootedPath(path));
      return new Uint8Array(content);
    },
    listDirectory: async (path) => {
      const root = assertRootedPath(path);
      const names = await fileSystem.readdir(root);
      return Promise.all(
        names.map(async (name) => {
          const value = await fileSystem.stat(assertRootedPath(root ? `${root}/${name}` : name));
          return { name, isFolder: value.type === 'dir' };
        }),
      );
    },
  });
  /* One function composes every view on every host (charter D1): the bundles,
   * the registry mask and provenance are all inside it, so this worker only
   * adapts the RPC shape over it. The agent view is what the *executors* of
   * project code read too — the kernel runtime below and the GeoSpec runner's
   * port — because the code they run is code the agent wrote (CI1, W14). */
  const workspaceProvider = createRelayedFileSystemProvider(fileSystem);
  const agentView = composeView(
    { filesystem: workspaceProvider },
    { consumer: 'agent', policy: tauPathPolicy, overlays: [systemSkillsOverlay()] },
  );
  const recordView = composeView({ filesystem: workspaceProvider }, { consumer: 'user', policy: tauPathPolicy });
  const runtimeClient: AppRuntimeClient = createRuntimeClient(
    createDefaultKernelOptions({
      fileSystem: fromFsLike(createRuntimeFsLike(agentView)),
      runtimeConfig,
      compute,
    }),
  );
  // Lazy: the headless-image graph eagerly resolves the resvg wasm URL at
  // module load, which only the full app build serves. Load it when the worker
  // actually boots a session so the boot path stays wasm-free.
  const headlessImageModule = await import('#services/headless-image.service.js');
  const imageService = new headlessImageModule.HeadlessImageService();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const geoSpecClient = createGeoSpecWorkerRpcClient({
    openFileSystemBridge: () => createFileSystemBridgePort(agentView),
    runtimeConfig,
  });
  const runtimeRpc = createRuntimeRpcClients({
    runtimeClient,
    imageService,
  });
  const parameterActors = new Map<string, Promise<ParameterActor>>();
  const parameterActorFor = async (targetFile: string): Promise<ParameterActor> => {
    const existing = parameterActors.get(targetFile);
    if (existing) {
      return existing;
    }
    const pending = (async (): Promise<ParameterActor> => {
      const sidecar = parameterEntryPath(targetFile);
      const target = {
        authority: `browser:${request.authority.workspaceId}:${request.authority.projectId}`,
        root: request.authority.projectId,
        entry: targetFile,
      } as const;
      let observer: Readonly<{ changed(): void; failed(error: unknown): void }> | undefined;
      const handleWatch = (event: Readonly<{ type: string }>): void => {
        if (event.type === 'reset') {
          observer?.failed(Object.assign(new Error('Parameter watch reset.'), { code: 'WATCH_RESET' }));
        } else {
          observer?.changed();
        }
      };
      let prearmed: ReturnType<ProjectFileSystemBridge['watchReady']> | undefined = projectRoot.watchReady(
        { paths: [sidecar] },
        handleWatch,
      );
      await prearmed.ready;
      const manifest = async (
        _target: ParameterSetTarget,
        signal: AbortSignal,
        resolution?: ParameterResolutionOptions,
      ): Promise<ParameterManifest> => {
        const result = await runtimeClient.resolveParameters({
          source: { path: targetFile },
          ...(resolution === undefined ? {} : { resolution }),
          signal,
        });
        if (!result.success) {
          throw Object.assign(
            new Error(result.issues.map(({ message }) => message).join('; ') || 'Parameter resolution failed.'),
            { code: result.issues[0]?.code ?? 'PARAMETER_RESOLUTION_FAILED' },
          );
        }
        return result.data;
      };
      const authority: ParameterAuthority = {
        path: () => sidecar,
        read: async (_target, signal) => {
          signal.throwIfAborted();
          return (await projectRoot.exists(sidecar)) ? projectRoot.readFile(sidecar) : null;
        },
        writeChecked: async ({ signal, ...write }) => {
          signal?.throwIfAborted();
          return projectRoot.writeFileChecked(write);
        },
      };
      const observe = (changed: () => void, failed: (error: unknown) => void): (() => void) => {
        observer = { changed, failed };
        let active = true;
        let watch = prearmed;
        prearmed = undefined;
        if (!watch) {
          watch = projectRoot.watchReady({ paths: [sidecar] }, handleWatch);
          const activeWatch = watch;
          const reportReady = async (): Promise<void> => {
            try {
              await activeWatch.ready;
            } catch (error) {
              if (active) {
                failed(error);
              }
            }
          };
          // async-iife: report a late watch-open failure to the authority observer.
          void reportReady();
        }
        const activeWatch = watch;
        const reportClosed = async (): Promise<void> => {
          await activeWatch.closed;
          if (active) {
            failed(Object.assign(new Error('Parameter watch closed.'), { code: 'WATCH_CLOSED' }));
          }
        };
        // async-iife: a live authority treats an unexpected watch close as failure.
        void reportClosed();
        return () => {
          active = false;
          observer = undefined;
          activeWatch.unsubscribe();
        };
      };
      const actor = createActor(
        parameterSetMachine.provide({
          actors: {
            /* An agent edits the source between reads, so every load re-resolves; the manifest is
             * admitted only once per revision, and the sidecar bytes decide what changed. */
            loadParameterSet: createAsyncLogic({
              run: async ({ input, signal }) =>
                loadParameterSnapshot({
                  target,
                  authority,
                  manifest,
                  ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
                  signal,
                }),
            }),
            commitParameterSet: createAsyncLogic({
              run: async ({ input: change, signal }) => commitParameterChange({ change, authority, signal }),
            }),
            observeParameterSet: createCallbackLogic(({ sendBack }) =>
              observe(
                () => {
                  sendBack({ type: 'watch.changed' });
                },
                (error) => {
                  sendBack({
                    type: 'watch.error',
                    message: error instanceof Error ? error.message : 'Observation failed.',
                  });
                },
              ),
            ),
          } satisfies Partial<MachineActors<typeof parameterSetMachine>>,
        }),
        { input: { target } },
      );
      actor.start();
      return actor;
    })();
    parameterActors.set(targetFile, pending);
    try {
      return await pending;
    } catch (error) {
      if (parameterActors.get(targetFile) === pending) {
        parameterActors.delete(targetFile);
      }
      throw error;
    }
  };
  const parameters = createRuntimeParameterAgentClient({
    mapRuntimeError: (error) => toRpcError(error),
    parameterActorFor,
  });
  const toolRegistry = createChatToolRegistry({
    fileSystemFor: (signal) =>
      createProviderRpcFileSystem({ provider: agentView, mutations: fileSystemMutations, signal }),
    recordFileSystemFor: (signal) =>
      createProviderRpcFileSystem({ provider: recordView, mutations: fileSystemMutations, signal }),
    skillResolver,
    ...runtimeRpc,
    parameters,
    geospec: geoSpecClient,
    testingEnabled: request.testingEnabled ?? false,
  });
  const activeReference: { current?: WorkerSession } = {};
  let cachedSkillFingerprint = '';
  let cachedSkills: Awaited<ReturnType<SkillResolver['getPromptSkillListing']>> = [];
  const interruptWaiters = new Map<
    string,
    {
      readonly request: InterruptRequest;
      readonly settled: {
        readonly promise: Promise<InterruptResolution>;
        readonly resolve: (resolution: InterruptResolution) => void;
      };
    }
  >();
  const host = createTauAgentHost({
    systemPrompt: request.systemPrompt,
    systemPromptBlocks: request.systemPromptBlocks,
    model: request.model,
    modelTransport: createConfiguredGatewayModelTransport({
      baseUrl: request.gatewayBaseUrl,
      /* The project every receipt from this worker attributes to. It is the
       * same id `GET /v1/projects` lists, so the usage page can name it; the
       * worker refuses to initialize without one (above). */
      projectId: request.authority.projectId,
      model: request.model,
    }),
    toolRegistry,
    openEventLog: async (chatId) => {
      if (!activeReference.current) {
        throw new Error('Agent host worker initialization is incomplete.');
      }
      return openProjectEventLog(activeReference.current, chatId);
    },
    // Chat attachments live beside the log in the project's own `.tau/chats`.
    attachments: createProviderAttachmentReader(projectRoot),
    interruptPort: {
      pause: async (interrupt) => {
        const settled = Promise.withResolvers<InterruptResolution>();
        interruptWaiters.set(interrupt.interruptId, {
          request: interrupt,
          settled,
        });
        return settled.promise;
      },
      pending: async ({ runId }) =>
        [...interruptWaiters.values()].flatMap((entry) => (entry.request.runId === runId ? [entry.request] : [])),
      resume: async (resolution) => {
        const waiter = interruptWaiters.get(resolution.interruptId);
        if (!waiter) {
          throw Object.assign(new Error(`Interrupt ${resolution.interruptId} is not pending.`), {
            code: 'INTERRUPT_NOT_PENDING' satisfies RefusalCode,
          });
        }
        interruptWaiters.delete(resolution.interruptId);
        waiter.settled.resolve(resolution);
      },
    },
    clientContext: async () => {
      const discovered = await skillResolver.getPromptSkillListing();
      const fingerprint = JSON.stringify(
        discovered.map((skill) => [skill.name, skill.description, skill.fingerprint ?? '']),
      );
      if (fingerprint !== cachedSkillFingerprint) {
        cachedSkillFingerprint = fingerprint;
        cachedSkills = discovered;
      }
      return {
        skills: cachedSkills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          ...(skill.fingerprint ? { fingerprint: skill.fingerprint } : {}),
        })),
      };
    },
    onLiveEvent: (event) => {
      if (!activeReference.current) {
        throw new Error('Agent host worker initialization is incomplete.');
      }
      publishLiveEvent(activeReference.current, event);
    },
  });
  const active: WorkerSession = {
    sessionId,
    tabId: sessionId,
    fileSystem,
    projectRoot,
    durability,
    storageBackend,
    host,
    owner: createCommandOwner({
      ledger: async (chatId) => host.ledger(chatId),
      effect: async (command) => executeCommand(active, command),
    }),
    runtimeClient,
    parameterActors,
    imageService,
    geoSpecClient,
    computeDispose: computeConnection?.dispose,
    providerBasePath: request.projectStorage.providerBasePath,
    projectId: request.authority.projectId,
    workspaceId: request.authority.workspaceId,
  };
  activeReference.current = active;
  session = active;
};

const releaseSession = async (): Promise<void> => {
  takeoverAttempts.clear();
  for (const monitor of followerMonitors.values()) {
    monitor.stop();
  }
  followerMonitors.clear();
  for (const retryId of followerRetryIds.values()) {
    globalThis.clearTimeout(retryId);
  }
  followerRetryIds.clear();
  const active = session;
  session = undefined;
  const failures: unknown[] = [];
  if (active) {
    try {
      await active.host.close();
    } catch (error) {
      failures.push(error);
    }
    const parameterResults = await Promise.allSettled(
      [...active.parameterActors.entries()].map(async ([targetFile, pending]) => {
        const client = await pending;
        client.send({ type: 'close' });
        const state = await waitFor(client, (state) => state.status === 'done' || state.matches({ open: 'uncertain' }));
        if (state.status !== 'done') {
          throw new Error(`Parameter write for ${targetFile} remains uncertain.`);
        }
      }),
    );
    for (const result of parameterResults) {
      if (result.status === 'rejected') {
        failures.push(result.reason as unknown);
      }
    }
    const geospecResult = await Promise.allSettled([active.geoSpecClient.close()]);
    for (const result of geospecResult) {
      if (result.status === 'rejected') {
        failures.push(result.reason as unknown);
      }
    }
    active.imageService.dispose();
    active.runtimeClient.terminate();
    active.computeDispose?.();
    active.fileSystem.dispose();
    active.projectRoot.dispose();
    const states = [...leadership.values()];
    for (const state of states) {
      globalThis.clearInterval(state.heartbeatId);
      state.lease.release();
    }
    const leaseCompletions: Array<Promise<void>> = [];
    for (const state of states) {
      leaseCompletions.push(state.lease.completion);
    }
    await Promise.allSettled(leaseCompletions);
    leadership.clear();
    for (const channel of channels.values()) {
      channel.close();
    }
    channels.clear();
    for (const pending of forwarded.values()) {
      pending.reject(new Error('Agent host worker closed.'));
    }
    forwarded.clear();
    for (const pending of forwardedReads.values()) {
      pending.reject(new Error('Agent host worker closed.'));
    }
    forwardedReads.clear();
    wakeReads(undefined);
    takeovers.clear();
    followerRecoveries.clear();
    leaderGenerations.clear();
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Browser agent host could not release every session resource.');
  }
};

const close = async (): Promise<void> => {
  if (closing) {
    return;
  }
  closing = true;
  try {
    await releaseSession();
  } finally {
    /* The flag guards a *re-entrant* close, not the worker's whole lifetime.
     * Leaving it latched made `close` permanently a no-op, so the next
     * `initialize` kept the released session and refused the new one with
     * SESSION_CONFLICT — invisible in a real worker, which terminates after
     * closing, and fatal to anything that reuses the module. A throw from the
     * disposal below used to re-latch exactly that wedge, so it is cleared
     * here rather than on the happy path. */
    closing = false;
  }
};

/** Answer one keyed command from the page: here when this worker leads its chat, else through the leader. */
const commandFromPage = async (active: WorkerSession, command: HostCommand): Promise<CommandAnswer> => {
  const chatId = chatIdOf(command.payload);
  if (chatId === undefined) {
    // No chat to lead: the owner reads the payload and refuses it (SC-R4).
    return active.owner(command);
  }
  if (await ensureLeadership(chatId)) {
    return active.owner(command);
  }
  return forwardCommand(active, chatId, {
    requestId: randomUuid(),
    sessionId: active.sessionId,
    commandId: command.commandId,
    type: command.type,
    payload: command.payload,
  });
};

/** Record one settlement in the chat's log, here or through its leader. ponytail: W8 deletes the verb (drift 7). */
const recordSettlementFromPage = async (
  active: WorkerSession,
  record: AgentHostWorkerSettlementRecord,
): Promise<void> => {
  const command = {
    requestId: randomUuid(),
    sessionId: active.sessionId,
    commandId: randomUuid(),
    type: 'record-settlement',
    payload: record,
  } as const;
  const answer = (await ensureLeadership(record.chatId))
    ? await leaderAnswer(active, record.chatId, command)
    : await forwardCommand(active, record.chatId, command);
  if (answer.status === 'refused') {
    throw Object.assign(new Error(answer.message), { code: answer.code });
  }
};

/** Handle one validated Channel call after the lightweight worker bootstrap loads. */
export const handleAgentHostWorkerCall = async (
  name: Exclude<keyof AgentHostWorkerProtocol['calls'], 'capabilities'>,
  args: unknown,
  caller: { readonly sessionId: string; readonly signal?: AbortSignal | undefined },
): Promise<unknown> => {
  const { sessionId, signal } = caller;
  if (name === 'initialize') {
    await initialize(args as AgentHostWorkerInitializeRequest, sessionId);
    return undefined;
  }
  if (name === 'close') {
    await close();
    return undefined;
  }
  const active = session;
  if (!active || active.sessionId !== sessionId) {
    throw Object.assign(new Error('Agent host worker session is not initialized.'), {
      code: 'SESSION_NOT_INITIALIZED' satisfies RefusalCode,
    });
  }
  if (name === 'read') {
    return readChat({ ...(args as ReadRequest), ...(signal === undefined ? {} : { signal }) });
  }
  if (name === 'record-settlement') {
    await recordSettlementFromPage(active, args as AgentHostWorkerSettlementRecord);
    return undefined;
  }
  const { commandId, payload } = args as { readonly commandId: string; readonly payload: unknown };
  // The method name is the verb; the owner parses the payload strictly (SC-R1, SC-R4).
  return commandFromPage(active, { type: name, commandId, payload } as HostCommand);
};
