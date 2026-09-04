import { ResourceQueue } from '@taucad/filesystem';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { FileSystemBridgeConnection, FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { rpcClientErrorCode } from '@taucad/chat';
import type { CaptureImagesRpcInput, CaptureImagesRpcResult } from '@taucad/chat';
import { applyClientTextMutation, createExactReplacementPlan, toRpcError } from '@taucad/chat/rpc';
import type {
  RpcDirectoryEntry,
  RpcFileStat,
  RpcFileSystem,
  RpcGraphicsClient,
  RpcGraphicsExportGeometryResult,
  RpcImageClient,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import { createChatToolRegistry } from '@taucad/agent-tools/registry';
import { buildCaptureExportOptions, canonicalCaptureViews, captureFilesToDataUrls } from '@taucad/agent-tools/capture';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { HashedGeometryResult } from '@taucad/runtime';
import { fromFsLike } from '@taucad/runtime/filesystem';
import type { FsLike } from '@taucad/runtime/filesystem';
import type { ExportFile, FileStat } from '@taucad/types';
import type { LengthSymbol } from '@taucad/units';
import { getErrno } from '@taucad/utils/error';
import { randomUuid } from '@taucad/utils/id';
import { assertRootedPath } from '@taucad/utils/path';
import { z } from 'zod';
import { createGatewayModelTransport, createTauAgentHost } from '@taucad/agent-host';
import type {
  AgentLiveEvent,
  AgentLogEvent,
  DurableEventLog,
  EventLogBatch,
  HostRunSnapshot,
  InterruptRequest,
  InterruptResolution,
  StorageDurabilityClass,
  TauAgentHost,
} from '@taucad/agent-host';
import { createOpfsEventLog, createProviderEventLog } from '@taucad/agent-host/browser';
import { createPaseoClientCache } from '#lib/paseo/paseo-client.js';
import { createPaseoRunnerPort } from '#lib/paseo/paseo-runner.js';
import { createDefaultKernelOptions } from '#constants/kernel-worker.constants.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import type { SkillResolver } from '#lib/skill-resolver.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.definition.js';
import type { HeadlessImageJob, HeadlessImageService } from '#services/headless-image.service.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import type {
  AgentHostWorkerAttachResponse,
  AgentHostWorkerCallRequest,
  AgentHostWorkerCallResponse,
  AgentHostWorkerCommand,
  AgentHostWorkerEvent,
  AgentHostWorkerInitializeRequest,
  AgentHostWorkerLiveEvent,
  AgentHostWorkerResultResponse,
  AgentHostWorkerTailResponse,
  ForwardedAgentHostResponse,
} from '#workers/agent-host.contract.js';
import {
  agentHostTailBatchLimit,
  agentHostWorkerCommandSchema,
  agentLiveEventSchema,
  eventLogBatchSchema,
  forwardedAgentHostResponseSchema,
} from '#workers/agent-host.contract.js';
import {
  acquireChatLeaderLease,
  agentHostAuthorityName,
  agentHostProtocolVersion,
  createFollowerRecoveryMonitor,
  recoverAttachedRun,
} from '#workers/agent-host-leader.js';
import type { AgentHostLockRequest, ChatLeaderLease } from '#workers/agent-host-leader.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import type { GeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';

type ProjectFileSystemBridge = Pick<
  FileSystemBridgeProxy,
  | 'readFile'
  | 'writeFile'
  | 'appendFile'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'mkdir'
  | 'unlink'
  | 'rmdir'
  | 'rename'
  | 'exists'
  | 'hello'
  | 'dispose'
>;

type LeaderBroadcast =
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'command';
      readonly senderId: string;
      readonly targetGeneration?: string | undefined;
      readonly replay: boolean;
      readonly command: AgentHostWorkerCommand;
    }
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'response';
      readonly targetId: string;
      readonly generation: string;
      readonly response: ForwardedResponse;
    }
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'leader';
      readonly senderId: string;
      readonly generation: string;
    }
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'cursor';
      readonly senderId: string;
      readonly generation: string;
      readonly endCursor: number;
    }
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'tail-request' | 'tail-ack';
      readonly senderId: string;
      readonly targetGeneration: string;
      readonly cursor: number;
    }
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'tail';
      readonly targetId: string;
      readonly generation: string;
      readonly batch: EventLogBatch;
    }
  | {
      readonly version: typeof agentHostProtocolVersion;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly chatId: string;
      readonly type: 'live-event';
      readonly senderId: string;
      readonly generation: string;
      readonly event: AgentLiveEvent;
    };

type ForwardedResponse = ForwardedAgentHostResponse;

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
  readonly paseoClients: { readonly close: () => Promise<void> };
  readonly runtimeClient: AppRuntimeClient;
  readonly imageService: HeadlessImageService;
  readonly geoSpecClient: GeoSpecWorkerRpcClient;
  readonly providerBasePath: string;
  readonly projectId: string;
  readonly workspaceId: string;
};

type SettledGeometry = Extract<HashedGeometryResult, { readonly success: true }>['data'];

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
    const fileHandle = (await root.getFileHandle(probeName, { create: true })) as FileSystemFileHandle & {
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

const createRelayedFileSystemBridge = (
  proxy: ProjectFileSystemBridge,
  createPort: (handlers: FileSystemProvider) => FileSystemBridgeConnection,
): (() => FileSystemBridgeConnection) => {
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

  const provider: FileSystemProvider = {
    id: 'agent-host-workspace-relay',
    capabilities: payload.capabilities,
    readFile,
    writeFile: proxy.writeFile.bind(proxy),
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
  return () => createPort(provider);
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const channels = new Map<string, BroadcastChannel>();
const leadership = new Map<string, LeadershipState>();
const leadershipAttempts = new Map<string, Promise<boolean>>();
const takeoverAttempts = new Map<string, Promise<HostRunSnapshot>>();
const forwarded = new Map<string, ReturnType<typeof Promise.withResolvers<ForwardedResponse>>>();
const leaderGenerations = new Map<string, string>();
const followerCursors = new Map<string, number>();
const followerMonitors = new Map<string, ReturnType<typeof createFollowerRecoveryMonitor>>();
const followerRecoveries = new Set<string>();
const followerRetryIds = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
const tailInFlight = new Set<string>();
const backgroundTasks = new Set<Promise<void>>();
const eventStreams = new Set<ReadableStreamDefaultController<AgentHostWorkerEvent>>();
const liveEventStreams = new Set<ReadableStreamDefaultController<AgentHostWorkerLiveEvent>>();
let session: WorkerSession | undefined;
let closing = false;

const leaderHeartbeatInterval = 1000;
const followerHeartbeatTimeout = 3500;
const followerTailTimeout = 2000;

const listenTo = <Event>(
  controllers: Set<ReadableStreamDefaultController<Event>>,
  signal: AbortSignal,
): AsyncIterable<Event> => {
  let cleanup = (): void => undefined;
  return new ReadableStream<Event>({
    start(controller) {
      let active = true;
      const close = (): void => {
        if (!active) {
          return;
        }
        active = false;
        controllers.delete(controller);
        controller.close();
        signal.removeEventListener('abort', close);
      };
      cleanup = close;
      controllers.add(controller);
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

/** Durable event stream consumed by the worker's @taucad/rpc listen handler. */
export const listenAgentHostWorkerEvents = (signal: AbortSignal): AsyncIterable<AgentHostWorkerEvent> =>
  listenTo(eventStreams, signal);

/** Ephemeral delta stream consumed by the worker's @taucad/rpc listen handler. */
export const listenAgentHostWorkerLiveEvents = (signal: AbortSignal): AsyncIterable<AgentHostWorkerLiveEvent> =>
  listenTo(liveEventStreams, signal);

const codedErrorSchema = z.object({ code: z.string() });
const errorCode = (error: unknown): string => codedErrorSchema.safeParse(error).data?.code ?? 'AGENT_HOST_ERROR';

const errorResponse = (requestId: string, error: unknown): ForwardedAgentHostResponse & { readonly type: 'error' } => ({
  type: 'error',
  requestId,
  code: errorCode(error),
  message: error instanceof Error ? error.message : String(error),
});

const broadcastBaseSchema = {
  version: z.literal(agentHostProtocolVersion),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  chatId: z.string().min(1),
};
const leaderBroadcastSchema = z.union([
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('command'),
    senderId: z.string().min(1),
    targetGeneration: z.string().optional(),
    replay: z.boolean(),
    command: agentHostWorkerCommandSchema,
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('response'),
    targetId: z.string().min(1),
    generation: z.string().min(1),
    response: forwardedAgentHostResponseSchema,
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
    type: z.enum(['tail-request', 'tail-ack']),
    senderId: z.string().min(1),
    targetGeneration: z.string().min(1),
    cursor: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('tail'),
    targetId: z.string().min(1),
    generation: z.string().min(1),
    batch: eventLogBatchSchema,
  }),
  z.strictObject({
    ...broadcastBaseSchema,
    type: z.literal('live-event'),
    senderId: z.string().min(1),
    generation: z.string().min(1),
    event: agentLiveEventSchema,
  }),
]);

const responseBelongsToChat = (response: ForwardedResponse, chatId: string): boolean => {
  if (response.type === 'tail') {
    return response.chatId === chatId;
  }
  if (response.type === 'attach') {
    return response.chatId === chatId && (response.snapshot?.chatId ?? chatId) === chatId;
  }
  return response.type === 'result' ? response.snapshot.chatId === chatId : true;
};

const validatedBroadcast = (value: unknown, active: WorkerSession, chatId: string): LeaderBroadcast | undefined => {
  const parsed = leaderBroadcastSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  const message = parsed.data as LeaderBroadcast;
  if (
    message.projectId !== active.projectId ||
    message.workspaceId !== active.workspaceId ||
    message.chatId !== chatId
  ) {
    return undefined;
  }
  switch (message.type) {
    case 'command': {
      return message.command.chatId === chatId ? message : undefined;
    }
    case 'response': {
      return responseBelongsToChat(message.response, chatId) ? message : undefined;
    }
    case 'leader':
    case 'cursor': {
      return message;
    }
    case 'live-event': {
      return message.event.chatId === chatId ? message : undefined;
    }
    case 'tail-request':
    case 'tail-ack': {
      return message;
    }
    case 'tail': {
      return message;
    }
  }
};

const requireStoragePathSegment = (value: string, label: string): string => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw Object.assign(new Error(`${label} must be one storage path segment.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return value;
};

const createRuntimeFsLike = (proxy: ProjectFileSystemBridge): FsLike => {
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

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw abortError(signal);
  }
};

const createRpcFileSystem = (options: {
  readonly proxy: ProjectFileSystemBridge;
  readonly mutations: ResourceQueue;
  readonly signal?: AbortSignal | undefined;
}): RpcFileSystem => {
  const { proxy, mutations, signal } = options;
  const bytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
    const value = await proxy.readFile(assertRootedPath(path));
    return new Uint8Array(value);
  };
  const stat = async (path: string): Promise<RpcFileStat> => {
    const value = await proxy.stat(assertRootedPath(path));
    const date = new Date(value.mtimeMs).toISOString();
    if (value.type === 'dir') {
      return { size: value.size, isDirectory: true, createdAt: date, modifiedAt: date };
    }
    return value.contentKind === 'text'
      ? {
          size: value.size,
          isDirectory: false,
          createdAt: date,
          modifiedAt: date,
          contentKind: 'text',
          lineCount: value.lineCount,
        }
      : {
          size: value.size,
          isDirectory: false,
          createdAt: date,
          modifiedAt: date,
          contentKind: 'binary',
        };
  };
  const writeIfUnchanged = async (
    path: string,
    expected: Uint8Array<ArrayBuffer>,
    replacement: Uint8Array<ArrayBuffer>,
  ) =>
    mutations.queueFor(path, async () => {
      const currentBytes = await bytes(path);
      const unchanged =
        currentBytes.byteLength === expected.byteLength &&
        currentBytes.every((byte, index) => byte === expected[index]);
      if (!unchanged) {
        return { status: 'conflict', currentBytes } as const;
      }
      assertNotAborted(signal);
      await proxy.writeFile(path, new Uint8Array(replacement));
      return { status: 'committed', committedBytes: await bytes(path) } as const;
    });
  const directoryEntry = async (parent: string, name: string): Promise<RpcDirectoryEntry> => {
    const value = await proxy.stat(assertRootedPath(parent ? `${parent}/${name}` : name));
    const modifiedAt = value.mtimeMs > 0 ? new Date(value.mtimeMs).toISOString() : undefined;
    if (value.type === 'dir') {
      return { name, type: 'dir', size: value.size, ...(modifiedAt ? { modifiedAt } : {}) };
    }
    return {
      name,
      type: 'file',
      size: value.size,
      ...(value.contentKind === 'text'
        ? { contentKind: 'text', lineCount: value.lineCount }
        : { contentKind: 'binary' }),
      ...(modifiedAt ? { modifiedAt } : {}),
    };
  };

  return {
    async readFile(path) {
      return textDecoder.decode(await bytes(path));
    },
    async writeFile(path, content) {
      await mutations.queueFor(path, async () => {
        assertNotAborted(signal);
        await proxy.writeFile(assertRootedPath(path), textEncoder.encode(content));
      });
    },
    async writeBinaryFile(path, data) {
      await mutations.queueFor(path, async () => {
        assertNotAborted(signal);
        await proxy.writeFile(assertRootedPath(path), new Uint8Array(data));
      });
    },
    async deleteFile(path) {
      await mutations.queueFor(path, async () => {
        const target = assertRootedPath(path);
        const value = await proxy.stat(target);
        assertNotAborted(signal);
        await (value.type === 'dir' ? proxy.rmdir(target, { recursive: true }) : proxy.unlink(target));
      });
    },
    async readdir(path) {
      const parent = assertRootedPath(path);
      const names = await proxy.readdir(parent);
      return Promise.all(names.map(async (name) => directoryEntry(parent, name)));
    },
    async exists(path) {
      return proxy.exists(assertRootedPath(path));
    },
    async appendFile(path, content) {
      await mutations.queueFor(path, async () => {
        let existing = '';
        try {
          existing = textDecoder.decode(await bytes(path));
        } catch (error) {
          if (getErrno(error) !== 'ENOENT') {
            throw error;
          }
        }
        assertNotAborted(signal);
        await proxy.writeFile(assertRootedPath(path), textEncoder.encode(existing + content));
      });
    },
    // oxlint-disable-next-line max-params -- RpcFileSystem owns this four-argument compatibility signature.
    async editFile(path, oldString, newString, replaceAll) {
      const result = await applyClientTextMutation({
        targetFile: path,
        fileSystem: { stat, readFileBytes: bytes, writeFileIfUnchanged: writeIfUnchanged },
        plan: createExactReplacementPlan({ oldString, newString, replaceAll }),
      });
      if (!result.ok) {
        throw Object.assign(new Error(result.message), { code: result.errorCode });
      }
      return {
        occurrences: result.occurrences,
        ...(result.staleRecovered ? { staleRecovered: true } : {}),
        diffStats: result.diffStats,
      };
    },
    stat,
  };
};

const failureMessage = (result: HashedGeometryResult): string =>
  result.success ? 'Unknown render failure' : result.issues.map((issue) => issue.message).join('; ') || 'Render failed';

const requireCaptureFiles = (
  files: Awaited<ReturnType<HeadlessImageService['export']>>,
  options: { readonly count: number; readonly mimeType: 'image/png' | 'image/webp' },
): ExportFile[] => {
  if (
    !files ||
    files.length !== options.count ||
    files.some((file) => file.mimeType !== options.mimeType || file.bytes.length === 0)
  ) {
    throw new Error(`Image capture expected ${options.count} non-empty ${options.mimeType} artifact(s)`);
  }
  return files;
};

const createRuntimeRpcClients = (options: {
  readonly runtimeClient: AppRuntimeClient;
  readonly imageService: HeadlessImageService;
  readonly lengthSymbol: LengthSymbol;
}) => {
  const { runtimeClient } = options;
  let connected: Promise<void> | undefined;
  const connect = async (): Promise<void> => {
    connected ??= runtimeClient.connect();
    await connected;
  };
  /*
   * One runtime-client transaction at a time. The client tracks exactly one
   * pending render (`runtime-client-core.ts`, "Tracks only the latest public
   * preview Promise"): a second render supersedes the first, whose retry then
   * supersedes the second, and the two loops spin against each other forever.
   * pi runs a turn's tool calls in parallel (`executeToolCallsParallel`), so any
   * turn holding two render-driven tools — the recorded transcript's
   * `screenshot` × 2 is the first one Tau has scripted — livelocks the run with
   * no error and no progress. Serializing also keeps an export bound to the
   * render it was issued for, instead of to whichever render landed last.
   */
  const runtime = new ResourceQueue();
  const withRuntime = async <T>(operation: () => Promise<T>): Promise<T> =>
    runtime.queueFor('runtime-client', async () => {
      await connect();
      return operation();
    });
  const renderNow = async (targetFile: string) => {
    let result = await runtimeClient.render({
      source: { path: assertRootedPath(targetFile) },
      parameters: {},
      content: { includeEdges: true },
    });
    while (result.superseded) {
      // oxlint-disable-next-line no-await-in-loop -- a superseded render must retry against the newest file generation.
      result = await runtimeClient.render({
        source: { path: assertRootedPath(targetFile) },
        parameters: {},
        content: { includeEdges: true },
      });
    }
    return result.geometry;
  };
  const render = async (targetFile: string) => withRuntime(async () => renderNow(targetFile));
  const kernelClient: RpcRuntimeClient = {
    async getKernelResult(targetFile) {
      try {
        const result = await render(targetFile);
        return result.success
          ? { success: true, status: 'ready', kernelIssues: result.issues }
          : { success: true, status: 'error', kernelIssues: result.issues };
      } catch (error) {
        return toRpcError(error);
      }
    },
  };
  const graphics: RpcGraphicsClient = {
    async exportGeometry({ targetFile, format }) {
      try {
        // Render and export are one transaction: the export reads whatever the
        // client rendered last, so a sibling tool's render must not land between.
        return await withRuntime(async (): Promise<RpcGraphicsExportGeometryResult> => {
          const rendered = await renderNow(targetFile);
          if (!rendered.success) {
            return { success: false, errorCode: rpcClientErrorCode.unknown, message: failureMessage(rendered) };
          }
          const route = bestRouteForActiveKernel(runtimeClient, format, runtimeClient.activeKernelId);
          if (!route) {
            return {
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: `Export format ${format} is not available for ${targetFile}`,
            };
          }
          const result = await exportWithRuntimeValidatedInput(runtimeClient, route);
          return result.success
            ? { success: true, files: result.data }
            : {
                success: false,
                errorCode: rpcClientErrorCode.unknown,
                message: result.issues.map((issue) => issue.message).join('; ') || 'Geometry export failed',
              };
        });
      } catch (error) {
        return toRpcError(error);
      }
    },
  };

  const captureGeometry = async (
    geometry: SettledGeometry,
    input: CaptureImagesRpcInput,
  ): Promise<CaptureImagesRpcResult> => {
    if (geometry.format === 'webrtc') {
      return {
        success: false,
        errorCode: rpcClientErrorCode.unknown,
        message: 'Live WebRTC geometry cannot be captured headlessly',
      };
    }
    const size = 1600;
    if (geometry.format === 'svg') {
      if (input.mode === 'multi_angle') {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: 'Planar SVG drawings have one canonical view',
        };
      }
      const files = requireCaptureFiles(
        await options.imageService.export({
          kind: 'capture',
          identity: `agent-host:${input.targetFile}:${geometry.hash}:drawing`,
          sourceFormat: 'svg',
          sourcePath: input.targetFile,
          content: geometry.content,
          format: 'png',
          exportOptions: {
            width: size,
            height: size,
            margin: 0.1,
            background: '#242424',
            axes: true,
            scaleBar: true,
            lengthSymbol: options.lengthSymbol,
          },
        }),
        { count: 1, mimeType: 'image/png' },
      );
      return { success: true, images: [{ view: 'drawing', dataUrl: captureFilesToDataUrls(files)[0]! }] };
    }

    const exportOptions: Extract<
      HeadlessImageJob,
      { readonly sourceFormat: 'glb'; readonly format: 'webp' }
    >['exportOptions'] = buildCaptureExportOptions({
      mode: input.mode,
      size,
      ...(input.includeEdges === undefined ? {} : { includeEdges: input.includeEdges }),
    });
    const files = requireCaptureFiles(
      await options.imageService.export({
        kind: 'capture',
        identity: `agent-host:${input.targetFile}:${geometry.hash}:${input.mode}`,
        sourceFormat: 'glb',
        sourcePath: input.targetFile,
        geometryHash: geometry.hash,
        content: geometry.content,
        format: 'webp',
        exportOptions,
      }),
      { count: input.mode === 'multi_angle' ? canonicalCaptureViews.length : 1, mimeType: 'image/webp' },
    );
    const dataUrls = captureFilesToDataUrls(files);
    const images: Extract<CaptureImagesRpcResult, { readonly success: true }>['images'] =
      input.mode === 'multi_angle'
        ? canonicalCaptureViews.map((view, index) => ({ view: view.id, dataUrl: dataUrls[index]! }))
        : [{ view: 'isometric', dataUrl: dataUrls[0]! }];
    return { success: true, images };
  };

  const images: RpcImageClient = {
    async captureImages(input) {
      try {
        const result = await render(input.targetFile);
        if (!result.success) {
          return { success: false, errorCode: rpcClientErrorCode.unknown, message: failureMessage(result) };
        }
        return await captureGeometry(result.data, input);
      } catch (error) {
        return toRpcError(error);
      }
    },
  };

  return { kernelClient, graphics, images };
};

const broadcastBinding = (active: WorkerSession, chatId: string) =>
  ({
    version: agentHostProtocolVersion,
    projectId: active.projectId,
    workspaceId: active.workspaceId,
    chatId,
  }) as const;

const publishEvent = async (active: WorkerSession, chatId: string, event: AgentLogEvent): Promise<void> => {
  for (const controller of eventStreams) {
    controller.enqueue({ chatId, event });
  }
  const state = leadership.get(chatId);
  if (!state) {
    return;
  }
  const { endCursor } = await active.host.readEvents({ chatId, cursor: Number.MAX_SAFE_INTEGER, limit: 1 });
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
  for (const controller of liveEventStreams) {
    controller.enqueue({ chatId: event.chatId, event });
  }
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
            const tau = await project.getDirectoryHandle('.tau', { create: true });
            const chats = await tau.getDirectoryHandle('chats', { create: true });
            const chat = await chats.getDirectoryHandle(chatPath, { create: true });
            return await createOpfsEventLog({ fileHandle: await chat.getFileHandle('events.jsonl', { create: true }) });
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
        await publishEvent(active, chatId, durableEvent);
      }
      return outcome;
    },
    read: async () => log.read(),
    readBatch: async (input) => log.readBatch(input),
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
  chatId: string,
  completion: Promise<unknown>,
): Promise<HostRunSnapshot> => {
  const admitted = await active.host.waitForAdmission(chatId);
  if (!admitted) {
    await completion;
    return active.host.snapshot(chatId);
  }
  trackTask(
    async () => {
      await completion;
    },
    () => undefined,
  );
  return admitted;
};

const executeCommand = async (
  command: AgentHostWorkerCommand,
  replay = false,
  takeover = false,
): Promise<AgentHostWorkerResultResponse | AgentHostWorkerTailResponse | AgentHostWorkerAttachResponse> => {
  const active = session;
  if (!active) {
    throw Object.assign(new Error('Agent host worker session is not initialized.'), {
      code: 'SESSION_NOT_INITIALIZED',
    });
  }
  if (command.type === 'tail') {
    return {
      type: 'tail',
      requestId: command.requestId,
      chatId: command.chatId,
      batch: await active.host.readEvents(command),
    };
  }
  if (command.type === 'attach') {
    const chatPath = requireStoragePathSegment(command.chatId, 'chatId');
    const abandonedLock = `.tau/chats/${chatPath}/events.jsonl.lock`;
    // Winning this workspace's native Web Lock proves its prior worker is gone;
    // only the provider advisory marker can have survived the abrupt reload.
    if (takeover && active.durability !== 'exclusive-append' && (await active.projectRoot.exists(abandonedLock))) {
      await active.projectRoot.unlink(abandonedLock);
    }
    const firstBatch = await active.host.readEvents(command);
    let batch = firstBatch;
    let snapshot: HostRunSnapshot | undefined;
    if (firstBatch.endCursor > 0) {
      if (takeover) {
        const current = takeoverAttempts.get(command.chatId);
        const attempt =
          current ??
          recoverAttachedRun({
            snapshot: async () => active.host.snapshot(command.chatId),
            resume: async () => acknowledgeRun(active, command.chatId, active.host.resume(command.chatId)),
          });
        takeoverAttempts.set(command.chatId, attempt);
        try {
          await attempt;
        } finally {
          if (takeoverAttempts.get(command.chatId) === attempt) {
            takeoverAttempts.delete(command.chatId);
          }
        }
        batch = await active.host.readEvents(command);
        snapshot = await active.host.snapshot(command.chatId);
      } else {
        snapshot = await active.host.snapshot(command.chatId);
      }
    }
    const state = leadership.get(command.chatId);
    if (!state) {
      throw Object.assign(new Error(`This tab lost leadership while attaching ${command.chatId}.`), {
        code: 'LEADERSHIP_LOST',
      });
    }
    return {
      type: 'attach',
      requestId: command.requestId,
      chatId: command.chatId,
      batch,
      leadership: { role: 'leader', generation: state.lease.generation },
      ...(snapshot ? { snapshot } : {}),
      takeover:
        takeover &&
        snapshot !== undefined &&
        snapshot.state !== 'completed' &&
        snapshot.state !== 'failed' &&
        snapshot.state !== 'cancelled',
    };
  }
  if (replay && command.type === 'start') {
    try {
      const prior = await active.host.snapshot(command.chatId);
      if (prior.runId === command.runId) {
        if (prior.state !== 'completed' && prior.state !== 'failed' && prior.state !== 'cancelled') {
          await acknowledgeRun(active, command.chatId, active.host.resume(command.chatId));
        }
        return {
          type: 'result',
          requestId: command.requestId,
          operation: command.type,
          snapshot: await active.host.snapshot(command.chatId),
        };
      }
    } catch {
      // The command was not durably admitted; replay it below.
    }
  }
  switch (command.type) {
    case 'start': {
      const config = command.config
        ? {
            systemPrompt: command.config.systemPrompt,
            systemPromptBlocks: command.config.systemPromptBlocks,
            model: command.config.model,
            toolChoice: command.config.toolChoice,
            allowedTools: command.config.allowedTools,
            ...(command.config.snapshot === undefined ? {} : { snapshot: command.config.snapshot }),
            ...(command.config.contextPayload ? { clientContext: command.config.contextPayload } : {}),
            ...(command.config.contextMessages ? { contextMessages: command.config.contextMessages } : {}),
          }
        : undefined;
      const base = {
        chatId: command.chatId,
        runId: command.runId,
        message: command.message,
        ...(config ? { config } : {}),
      };
      const completion = active.host.admit(
        command.trigger === 'submit'
          ? { ...base, trigger: 'submit' }
          : { ...base, trigger: command.trigger, retainedMessageIds: command.retainedMessageIds },
      );
      return {
        type: 'result',
        requestId: command.requestId,
        operation: command.type,
        snapshot: await acknowledgeRun(active, command.chatId, completion),
      };
    }
    case 'resume': {
      return {
        type: 'result',
        requestId: command.requestId,
        operation: command.type,
        snapshot: await acknowledgeRun(active, command.chatId, active.host.resume(command.chatId)),
      };
    }
    case 'steer': {
      await active.host.steer({ runId: command.runId, message: command.message });
      break;
    }
    case 'cancel': {
      await active.host.cancel({ runId: command.runId });
      break;
    }
    case 'resolve-interrupt': {
      await active.host.resolveInterrupt(command);
      break;
    }
  }
  const snapshot: HostRunSnapshot = await active.host.snapshot(command.chatId);
  return { type: 'result', requestId: command.requestId, operation: command.type, snapshot };
};

const postForwardedResponse = async (options: {
  readonly channel: BroadcastChannel;
  readonly senderId: string;
  readonly command: AgentHostWorkerCommand;
  readonly replay: boolean;
}): Promise<void> => {
  const { channel, senderId, command, replay } = options;
  const active = session;
  const state = leadership.get(command.chatId);
  if (!active || !state) {
    return;
  }
  let response: ForwardedResponse;
  try {
    response = await executeCommand(command, replay);
  } catch (error) {
    response = errorResponse(command.requestId, error);
  }
  channel.postMessage({
    ...broadcastBinding(active, command.chatId),
    type: 'response',
    targetId: senderId,
    generation: state.lease.generation,
    response,
  } satisfies LeaderBroadcast);
};

const sendTailBatch = async (options: {
  readonly channel: BroadcastChannel;
  readonly targetId: string;
  readonly chatId: string;
  readonly cursor: number;
}): Promise<void> => {
  const { channel, targetId, chatId, cursor } = options;
  const active = session;
  const state = leadership.get(chatId);
  if (!active || !state) {
    return;
  }
  const batch = await active.host.readEvents({ chatId, cursor, limit: agentHostTailBatchLimit });
  channel.postMessage({
    ...broadcastBinding(active, chatId),
    type: 'tail',
    targetId,
    generation: state.lease.generation,
    batch,
  } satisfies LeaderBroadcast);
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
      tailInFlight.delete(chatId);
      leaderGenerations.delete(chatId);
      scheduleFollowerRecovery(chatId);
    },
  });
  followerMonitors.set(chatId, monitor);
  return monitor;
};

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
    tailInFlight.delete(chatId);
  }
  leaderGenerations.set(chatId, generation);
};

const beginFollowerTail = (chatId: string, generation: string): void => {
  tailInFlight.add(chatId);
  followerMonitorFor(chatId).beginTail(generation);
};

const settleFollowerTail = (chatId: string, generation: string): boolean => {
  if (!followerMonitorFor(chatId).settleTail(generation)) {
    return false;
  }
  tailInFlight.delete(chatId);
  return true;
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
  const channel = new BroadcastChannel(agentHostAuthorityName({ ...active, chatId }));
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const current = session;
    if (!current) {
      return;
    }
    const message = validatedBroadcast(event.data, current, chatId);
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
      const knownGeneration = leaderGenerations.get(chatId);
      if (message.targetId !== current.tabId || (knownGeneration && knownGeneration !== message.generation)) {
        return;
      }
      observeFollowerLeader(chatId, message.generation);
      const pending = forwarded.get(message.response.requestId);
      if (pending) {
        forwarded.delete(message.response.requestId);
        pending.resolve(message.response);
      }
      return;
    }
    if (message.type === 'cursor') {
      if (message.senderId === current.tabId) {
        return;
      }
      observeFollowerLeader(chatId, message.generation);
      const cursor = followerCursors.get(chatId) ?? 0;
      if (cursor < message.endCursor && !tailInFlight.has(chatId)) {
        beginFollowerTail(chatId, message.generation);
        channel.postMessage({
          ...broadcastBinding(current, chatId),
          type: 'tail-request',
          senderId: current.tabId,
          targetGeneration: message.generation,
          cursor,
        } satisfies LeaderBroadcast);
      }
      return;
    }
    if (message.type === 'live-event') {
      if (message.senderId !== current.tabId) {
        observeFollowerLeader(chatId, message.generation);
      }
      if (message.senderId !== current.tabId && leaderGenerations.get(chatId) === message.generation) {
        for (const controller of liveEventStreams) {
          controller.enqueue({ chatId, event: message.event });
        }
      }
      return;
    }
    if (message.type === 'tail') {
      if (message.targetId !== current.tabId || leaderGenerations.get(chatId) !== message.generation) {
        return;
      }
      observeFollowerLeader(chatId, message.generation);
      settleFollowerTail(chatId, message.generation);
      for (const eventItem of message.batch.events) {
        for (const controller of eventStreams) {
          controller.enqueue({ chatId, event: eventItem });
        }
      }
      followerCursors.set(chatId, message.batch.nextCursor);
      if (message.batch.nextCursor < message.batch.endCursor) {
        beginFollowerTail(chatId, message.generation);
        channel.postMessage({
          ...broadcastBinding(current, chatId),
          type: 'tail-ack',
          senderId: current.tabId,
          targetGeneration: message.generation,
          cursor: message.batch.nextCursor,
        } satisfies LeaderBroadcast);
      }
      return;
    }
    const state = leadership.get(chatId);
    if (!state) {
      return;
    }
    if (message.type === 'tail-request' || message.type === 'tail-ack') {
      if (message.targetGeneration === state.lease.generation) {
        trackTask(
          async () => sendTailBatch({ channel, targetId: message.senderId, chatId, cursor: message.cursor }),
          () => undefined,
        );
      }
      return;
    }
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Re-state the discriminant so the async callbacks retain the command member instead of widening it to any.
    if (message.type !== 'command') {
      return;
    }
    if (message.targetGeneration === undefined || message.targetGeneration === state.lease.generation) {
      const commandMessage = message;
      trackTask(
        async () =>
          postForwardedResponse({
            channel,
            senderId: commandMessage.senderId,
            command: commandMessage.command,
            replay: commandMessage.replay,
          }),
        (error) => {
          channel.postMessage({
            ...broadcastBinding(current, chatId),
            type: 'response',
            targetId: commandMessage.senderId,
            generation: state.lease.generation,
            response: errorResponse(commandMessage.command.requestId, error),
          } satisfies LeaderBroadcast);
        },
      );
    }
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
      workspaceId: active.workspaceId,
      chatId,
      requestLock,
      createGeneration: randomUuid,
    });
    if (!lease.isLeader) {
      return false;
    }
    followerMonitors.get(chatId)?.stop();
    followerMonitors.delete(chatId);
    tailInFlight.delete(chatId);
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
    announce();
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

const waitForForwardedResponse = async (
  active: WorkerSession,
  command: AgentHostWorkerCommand,
  replay: boolean,
): Promise<ForwardedResponse | undefined> => {
  const pending = Promise.withResolvers<ForwardedResponse>();
  forwarded.set(command.requestId, pending);
  channelFor(command.chatId).postMessage({
    ...broadcastBinding(active, command.chatId),
    type: 'command',
    senderId: active.tabId,
    targetGeneration: leaderGenerations.get(command.chatId),
    replay,
    command,
  } satisfies LeaderBroadcast);
  const deadline = new Promise<undefined>((resolve) => {
    globalThis.setTimeout(resolve, 2000);
  });
  const response = await Promise.race([pending.promise, deadline]);
  if (forwarded.get(command.requestId) === pending) {
    forwarded.delete(command.requestId);
  }
  return response;
};

const forwardCommand = async (command: AgentHostWorkerCommand): Promise<ForwardedResponse> => {
  const active = session;
  if (!active) {
    throw Object.assign(new Error('Agent host worker is not initialized.'), { code: 'SESSION_NOT_INITIALIZED' });
  }
  const first = await waitForForwardedResponse(active, command, false);
  if (first) {
    if (first.type === 'tail' || first.type === 'attach') {
      followerCursors.set(command.chatId, first.batch.nextCursor);
    }
    return first.type === 'attach'
      ? {
          ...first,
          leadership: { role: 'follower', generation: first.leadership.generation },
          takeover: false,
        }
      : first;
  }
  leaderGenerations.delete(command.chatId);
  if (await ensureLeadership(command.chatId)) {
    return executeCommand(command, true, command.type === 'attach');
  }
  const replay = await waitForForwardedResponse(active, command, true);
  if (!replay) {
    throw Object.assign(new Error(`No chat leader answered command ${command.requestId} before its deadline.`), {
      code: 'LEADER_RESPONSE_TIMEOUT',
    });
  }
  if (replay.type === 'tail' || replay.type === 'attach') {
    followerCursors.set(command.chatId, replay.batch.nextCursor);
  }
  return replay.type === 'attach'
    ? {
        ...replay,
        leadership: { role: 'follower', generation: replay.leadership.generation },
        takeover: false,
      }
    : replay;
};

const replayRecoveredBatch = async (options: {
  readonly active: WorkerSession;
  readonly chatId: string;
  readonly initial: EventLogBatch;
  readonly followerGeneration?: string;
}): Promise<void> => {
  const { active, chatId, followerGeneration } = options;
  let batch = options.initial;
  for (;;) {
    for (const eventItem of batch.events) {
      for (const controller of eventStreams) {
        controller.enqueue({ chatId, event: eventItem });
      }
    }
    followerCursors.set(chatId, batch.nextCursor);
    if (batch.nextCursor >= batch.endCursor) {
      return;
    }
    if (leadership.has(chatId)) {
      // oxlint-disable-next-line no-await-in-loop -- Durable cursor windows must be replayed in order.
      batch = await active.host.readEvents({ chatId, cursor: batch.nextCursor, limit: agentHostTailBatchLimit });
      continue;
    }
    if (followerGeneration) {
      beginFollowerTail(chatId, followerGeneration);
      channelFor(chatId).postMessage({
        ...broadcastBinding(active, chatId),
        type: 'tail-ack',
        senderId: active.tabId,
        targetGeneration: followerGeneration,
        cursor: batch.nextCursor,
      } satisfies LeaderBroadcast);
    }
    return;
  }
};

const recoverFollower = async (chatId: string): Promise<void> => {
  const active = session;
  if (!active || closing || leadership.has(chatId)) {
    return;
  }
  tailInFlight.delete(chatId);
  leaderGenerations.delete(chatId);
  const command: AgentHostWorkerCommand = {
    type: 'attach',
    chatId,
    cursor: followerCursors.get(chatId) ?? 0,
    limit: agentHostTailBatchLimit,
    requestId: randomUuid(),
    sessionId: active.sessionId,
  };
  const becameLeader = await ensureLeadership(chatId);
  const response = becameLeader ? await executeCommand(command, true, true) : await forwardCommand(command);
  if (response.type === 'error') {
    throw Object.assign(new Error(response.message), { code: response.code });
  }
  if (response.type !== 'attach') {
    throw new Error(`Follower recovery for ${chatId} returned ${response.type}.`);
  }
  const followerGeneration = response.leadership.role === 'follower' ? response.leadership.generation : undefined;
  if (followerGeneration) {
    observeFollowerLeader(chatId, followerGeneration);
  }
  await replayRecoveredBatch({ active, chatId, initial: response.batch, followerGeneration });
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
  const runtimeClient: AppRuntimeClient = createRuntimeClient(
    createDefaultKernelOptions({
      fileSystem: fromFsLike(createRuntimeFsLike(fileSystem)),
      runtimeConfig,
    }),
  );
  // Lazy: the headless-image graph eagerly resolves the resvg wasm URL at
  // module load, which only the full app build serves. Load it when the worker
  // actually boots a session so the boot path stays wasm-free.
  const headlessImageModule = await import('#services/headless-image.service.js');
  const imageService = new headlessImageModule.HeadlessImageService();
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const geoSpecClient = createGeoSpecWorkerRpcClient({
    openFileSystemBridge: createRelayedFileSystemBridge(fileSystem, createFileSystemBridgePort),
    runtimeConfig,
  });
  const runtimeRpc = createRuntimeRpcClients({
    runtimeClient,
    imageService,
    lengthSymbol: request.lengthSymbol,
  });
  const toolRegistry = createChatToolRegistry({
    fileSystemFor: (signal) => createRpcFileSystem({ proxy: fileSystem, mutations: fileSystemMutations, signal }),
    skillResolver,
    ...runtimeRpc,
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
  const paseoClients = createPaseoClientCache({ apiBaseUrl: request.gatewayBaseUrl });
  const host = createTauAgentHost({
    systemPrompt: request.systemPrompt,
    systemPromptBlocks: request.systemPromptBlocks,
    model: request.model,
    modelTransport: createGatewayModelTransport({ baseUrl: request.gatewayBaseUrl, model: request.model }),
    toolRegistry,
    /* SP-10: a Paseo turn is an external run of *this* host — the page holds the
     * E2EE session and the API is out of the data path. Registered on the same
     * seam the daemon registers its ACP adapters on, so admission, the durable
     * log, resume and the approval inbox stay where they are. */
    externalRunners: {
      paseo: createPaseoRunnerPort({
        clientFor: paseoClients.clientFor,
        createId: randomUuid,
        /* The page minted this at admission against a paired daemon: the
         * signing secret never leaves that daemon, so the browser cannot make
         * one itself. Absent means the agent runs without Tau tools, which the
         * selector row already told the user. */
        mcpServersFor: (turn) => {
          const url = turn.agent['mcpUrl'];
          const headers = turn.agent['mcpHeaders'];
          if (typeof url !== 'string' || headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
            return undefined;
          }
          return {
            tau: {
              type: 'http',
              url,
              headers: Object.fromEntries(
                Object.entries(headers).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
              ),
              alwaysLoad: true,
            },
          };
        },
      }),
    },
    openEventLog: async (chatId) => {
      if (!activeReference.current) {
        throw new Error('Agent host worker initialization is incomplete.');
      }
      return openProjectEventLog(activeReference.current, chatId);
    },
    interruptPort: {
      pause: async (interrupt) => {
        const settled = Promise.withResolvers<InterruptResolution>();
        interruptWaiters.set(interrupt.interruptId, { request: interrupt, settled });
        return settled.promise;
      },
      pending: async ({ runId }) =>
        [...interruptWaiters.values()].flatMap((entry) => (entry.request.runId === runId ? [entry.request] : [])),
      resume: async (resolution) => {
        const waiter = interruptWaiters.get(resolution.interruptId);
        if (!waiter) {
          throw Object.assign(new Error(`Interrupt ${resolution.interruptId} is not pending.`), {
            code: 'INTERRUPT_NOT_FOUND',
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
    paseoClients,
    runtimeClient,
    imageService,
    geoSpecClient,
    providerBasePath: request.projectStorage.providerBasePath,
    projectId: request.authority.projectId,
    workspaceId: request.authority.workspaceId,
  };
  activeReference.current = active;
  session = active;
};

const close = async (): Promise<void> => {
  if (closing) {
    return;
  }
  closing = true;
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
  try {
    await active?.host.close();
  } finally {
    await Promise.allSettled(active ? [active.geoSpecClient.close(), active.paseoClients.close()] : []);
    active?.imageService.dispose();
    active?.runtimeClient.terminate();
    active?.fileSystem.dispose();
    active?.projectRoot.dispose();
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
    followerRecoveries.clear();
    followerCursors.clear();
    tailInFlight.clear();
    leaderGenerations.clear();
  }
};

const withoutRequestId = (
  response: Exclude<ForwardedResponse, { readonly type: 'error' }>,
): AgentHostWorkerCallResponse => {
  const { requestId: _requestId, ...result } = response;
  return result;
};

/** Handle one validated Channel call after the lightweight worker bootstrap loads. */
export const handleAgentHostWorkerRequest = async (
  request: Exclude<AgentHostWorkerCallRequest, { readonly type: 'capabilities' }>,
  sessionId: string,
): Promise<AgentHostWorkerCallResponse> => {
  if (request.type === 'initialize') {
    await initialize(request, sessionId);
    return { type: 'initialized' };
  }
  if (request.type === 'close') {
    await close();
    return { type: 'closed' };
  }
  if (!session || session.sessionId !== sessionId) {
    throw Object.assign(new Error('Agent host worker session is not initialized.'), {
      code: 'SESSION_NOT_INITIALIZED',
    });
  }
  const command: AgentHostWorkerCommand = { ...request, requestId: randomUuid(), sessionId };
  const alreadyLeader = leadership.has(request.chatId);
  const isLeader = await ensureLeadership(request.chatId);
  const response = isLeader
    ? await executeCommand(command, false, request.type === 'attach' && !alreadyLeader)
    : await forwardCommand(command);
  if (response.type === 'error') {
    throw Object.assign(new Error(response.message), { code: response.code });
  }
  return withoutRequestId(response);
};
