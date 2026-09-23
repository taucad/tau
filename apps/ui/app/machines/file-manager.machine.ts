import { setup, types } from 'xstate';
import type { EnqueueObject, EventObject, SystemRegistry } from 'xstate';
import type { FileEntry, FileSystemBackend } from '@taucad/types';
import type { FileSystemBridgeConnection, RootedBridgeConsumer } from '@taucad/fs-bridge';
import type { ComputeBinding, ComputeStoreControl } from '@taucad/runtime';
import { connectComputeStoreChannel } from '@taucad/runtime/host';
import { safeDispose } from '@taucad/utils/dispose';
import FileManagerWorker from '#machines/file-manager.worker.js?worker';
import {
  getProjectFileSystemConfig,
  getWorkspace,
  getWorkspaceMetadata,
  checkHandlePermission,
  getHomeStorageBackend,
  getProjectRootConfigs,
} from '#filesystem/handle-store.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import { fileManagerWorkerName } from '#machines/file-manager-worker-name.js';
import type { WorkspaceRootSkip } from '#filesystem/handle-store.js';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { normalizePath } from '@taucad/utils/path';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { SharedPool } from '@taucad/memory';
import { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { ExternalPollTelemetry } from '@taucad/fs-client/file-tree-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { createDomVisibilityProvider } from '@taucad/fs-client/visibility-provider';
import { createComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { bundledTypesWorkspaceRootSegment, dependencyMountRoot } from '#lib/bundled-types-tree.constants.js';
import type { FileManagerProxy } from '#machines/file-manager.machine.types.js';
import {
  formatWorkerError,
  formatWorkerErrorEnvelope,
  isWorkerErrorEnvelope,
  toWorkerError,
} from '#machines/file-manager-worker-error.js';

const fileCacheMaxEntries = 500;
const fileCacheMaxTotalBytes = 128 * 1024 * 1024;
const fileCacheMaxSingleFileBytes = 1024 * 1024;

const filePoolBytes = 50 * 1024 * 1024;

const computeOpeners = (worker: Worker, admittedProjectId: string | undefined) => {
  const openComputeStorePort = (projectId: string): MessagePort => {
    if (!admittedProjectId || projectId !== admittedProjectId) {
      throw new Error('Compute store project authority does not match the active project.');
    }
    const channel = new MessageChannel();
    worker.postMessage({ type: 'computeStoreConnect', projectId, port: channel.port1 }, [channel.port1]);
    return channel.port2;
  };
  const openComputeBinding = (projectId: string) => {
    const connection = connectComputeStoreChannel(openComputeStorePort(projectId));
    return { compute: { mode: 'durable', store: connection.store } as const, dispose: connection.dispose };
  };
  const computeControl = <Name extends keyof ComputeStoreControl>(
    projectId: string,
    action: Name,
    input: Parameters<ComputeStoreControl[Name]>[0],
  ): ReturnType<ComputeStoreControl[Name]> => {
    if (!admittedProjectId || projectId !== admittedProjectId) {
      throw new Error('Compute control project authority does not match the active project.');
    }
    const channel = new MessageChannel();
    worker.postMessage({ type: 'computeStoreControl', projectId, action, ...input, port: channel.port1 }, [
      channel.port1,
    ]);
    return new Promise<Awaited<ReturnType<ComputeStoreControl[Name]>>>((resolve, reject) => {
      channel.port2.addEventListener('message', ({ data }: MessageEvent<{ result?: unknown; error?: string }>) => {
        channel.port2.close();
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.result as Awaited<ReturnType<ComputeStoreControl[Name]>>);
        }
      });
      channel.port2.start();
    }) as ReturnType<ComputeStoreControl[Name]>;
  };
  return { openComputeBinding, openComputeStorePort, computeControl };
};

/**
 * Why webaccess can't be initialized when the FM machine enters the
 * `webAccessUnavailable` recovery state. Drives the copy/recovery surface
 * rendered by `ProjectUnavailableOverlay` (R8) and the legacy
 * `chat-error-service-unavailable` component.
 *
 * - `missing` — the bound workspace metadata doesn't exist in this browser.
 * - `disconnected` — workspace identity remains but its directory handle was
 *   deliberately removed. Re-picking restores that exact identity.
 * - `permission` — the workspace's handle is intact but the browser
 *   revoked read/write permission. A user-gesture `Grant Access` flow
 *   recovers without a re-pick.
 */
export type WorkspaceUnavailableReason = 'missing' | 'disconnected' | 'permission';

/** The worker connection this machine holds: the authority's surface, its change stream, and its death. */
type FileManagerWorkerProxy = FileManagerProxy & {
  listen?: (event: string, handler: (data: unknown) => void) => () => void;
  /** Settles when the bridge channel closes, which is what a dead worker looks like (G2c-2). */
  closed: Promise<void>;
};

type FileManagerContext = {
  worker: Worker | undefined;
  proxy: FileManagerWorkerProxy | undefined;
  bridgeDispose?: () => void;
  openFileSystemBridge?: (root: string, consumer: RootedBridgeConsumer) => FileSystemBridgeConnection;
  openComputeBinding?: (projectId: string) => { compute: ComputeBinding; dispose: () => void };
  openComputeStorePort?: (projectId: string) => MessagePort;
  computeControl?: ReturnType<typeof computeOpeners>['computeControl'];
  filePoolBuffer: SharedArrayBuffer | undefined;
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
  /** The one composed client the file services and the Files pane both use. */
  viewClient: ComposedViewClient | undefined;
  disposeComposedView?: () => void;
  workerChangeChannel: WorkerChangeChannel | undefined;
  error: Error | undefined;
  rootDirectory: string;
  shouldInitializeOnStart: boolean;
  backendType: FileSystemBackend;
  /**
   * Why the current webaccess attempt failed, or `undefined` when
   * webaccess is healthy / the backend isn't webaccess. The dedicated
   * `webAccessUnavailable` state is the source of truth for the recovery
   * UI; this context field exposes the reason to `useFileManager`
   * consumers without forcing them to inspect the state value.
   */
  unavailableReason: WorkspaceUnavailableReason | undefined;
  /**
   * `workspaceId` resolved by the most recent `initializeServicesActor`
   * run for the current `projectId`. **Per-init output only** — this is
   * NEVER mutated by event handlers and is cleared by
   * `updateRootAndReset` on every project transition. The persistent
   * `ProjectFileSystemConfig.workspaceId` is the authority for the
   * project ↔ workspace binding; this field is a projection of it
   * surfaced to UI consumers (chat details, recovery overlay). See
   * `docs/policy/filesystem-authority-policy.md` Rule 11.
   */
  activeWorkspaceId: string | undefined;
  /**
   * Human label for `activeWorkspaceId`, derived from the workspace
   * store at init time so consumers read it straight from the FM
   * context rather than triggering a stale IDB read. Same lifecycle as
   * `activeWorkspaceId`: per-init output, cleared on every `setRoot`.
   */
  activeWorkspaceName: string | undefined;
  projectId: string | undefined;
  sharedWorker: Worker | undefined;
  onExternalPollTelemetry: ((aggregate: ExternalPollTelemetry) => void) | undefined;
  onRootSkipped: ((skip: WorkspaceRootSkip) => void) | undefined;
};

// ============ Lifecycle Actors ============

type WorkerConnectedEvent = {
  type: 'workerConnected';
  worker: Worker;
  proxy: FileManagerWorkerProxy;
  bridgeDispose: () => void;
  openFileSystemBridge: (root: string, consumer: RootedBridgeConsumer) => FileSystemBridgeConnection;
  openComputeBinding: (projectId: string) => { compute: ComputeBinding; dispose: () => void };
  openComputeStorePort: (projectId: string) => MessagePort;
  computeControl: ReturnType<typeof computeOpeners>['computeControl'];
  filePoolBuffer: SharedArrayBuffer | undefined;
};

/**
 * Emitted by `initializeServicesActor` on a successful (or non-webaccess)
 * init. Carries the resolved backend, workspace identity (when
 * applicable), and the freshly-built fs-client services.
 */
type WorkerInitializedEvent = {
  type: 'workerInitialized';
  configuredBackend: FileSystemBackend;
  activeWorkspaceId: string | undefined;
  activeWorkspaceName: string | undefined;
  contentService: FileContentService;
  treeService: FileTreeService;
  viewClient: ComposedViewClient;
  workerChangeChannel: WorkerChangeChannel;
  /** Releases the user's composed-view connection this init opened. */
  disposeComposedView: () => void;
};

/**
 * Emitted by `initializeServicesActor` when a webaccess project can't be
 * brought online. Routes the FM machine into the `webAccessUnavailable`
 * recovery state where the `ProjectUnavailableOverlay` (R8) takes over.
 */
type WebAccessUnavailableEvent = {
  type: 'webAccessUnavailable';
  reason: WorkspaceUnavailableReason;
  activeWorkspaceId: string | undefined;
  activeWorkspaceName: string | undefined;
};

const connectWorkerActor = fromSafeAsync<WorkerConnectedEvent, { context: FileManagerContext }>(
  async ({ input, signal }) => {
    const { context } = input;

    safeDispose(() => context.proxy?.dispose());
    safeDispose(context.bridgeDispose);
    context.contentService?.dispose();
    context.treeService?.dispose();
    context.workerChangeChannel?.dispose();
    context.disposeComposedView?.();

    const { createFileSystemBridge, createFileSystemBridgeProxy, openFileSystemBridge, waitForWorkerReady } =
      await import('@taucad/fs-bridge');

    if (context.worker && !context.sharedWorker) {
      safeDispose(() => context.worker?.terminate());
    }

    // The worker mounts `/` on Home's pinned engine while its module
    // evaluates, and the name is the only value that reaches it that early —
    // resolved here because `handle-store` owns the pin and runs on the main
    // thread only. Inherited workers already carry the mount, so nested file
    // managers never pay for the lookup.
    let worker = context.sharedWorker;
    if (!worker) {
      const homeBackend = await getHomeStorageBackend();
      worker = new FileManagerWorker({ name: fileManagerWorkerName(homeBackend) });
      // A node-backed Home needs its provider host before the worker can mount
      // `/`, so the brokered port is handed over immediately after construction
      // and the worker's module evaluation waits on it. One port per concern:
      // the runtime's kernel port is brokered separately.
      const bridge = homeBackend === 'node' ? desktopBridge() : undefined;
      if (bridge) {
        const deliverNodeFsPort = async (target: Worker): Promise<void> => {
          const nodeFsPort = await bridge.nodeFs.connect();
          target.postMessage({ type: 'nodeFsPort', port: nodeFsPort, homeRoot: bridge.nodeFs.homeRoot }, [nodeFsPort]);
        };
        // The services utility can die; main forks a fresh one on the next
        // `connect()`. The worker asks for a replacement once its channel
        // closes, so a host crash costs a resync instead of wedging the
        // filesystem for the rest of the session.
        const nodeWorker = worker;
        nodeWorker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
          if (event.data.type === 'nodeFsPortRequest') {
            void deliverNodeFsPort(nodeWorker);
          }
        });
        await deliverNodeFsPort(nodeWorker);
      }
    }

    // Crash-aware error/messageerror/envelope listeners. Listeners are
    // installed before any await so a synchronous load failure (404 served as
    // HTML, COEP block, SyntaxError) is captured and surfaced through the
    // XState `error` transition instead of being silently swallowed. The
    // listeners stay attached after readiness so post-init crashes are at
    // least visible in the console (the `crashSignal` Promise is only racy
    // during the connect phase — `armed` is flipped to `false` afterwards
    // so its callback no longer rejects).
    //
    // After readiness they stay logging, deliberately: a Worker `error` event
    // is an uncaught exception inside a worker that is still running, and
    // `messageerror` is one message that failed structured clone — neither
    // means the proxies are dead, and nested file managers share this worker
    // (`context.sharedWorker`), so treating one as fatal would tear down every
    // project view at once. Death arrives on `proxy.closed` instead, which
    // `ready` watches (G2c-2).
    let armed = true;
    let rejectOnCrash!: (error: Error) => void;
    const crashSignal = new Promise<never>((_resolve, reject) => {
      rejectOnCrash = reject;
    });
    // Suppress unhandled-rejection warnings if `crashSignal` never wins the race.
    // The handler is intentionally inert because errors are already reported
    // via `console.error` inside `reportAndMaybeReject`.
    const suppressUnhandledCrashSignal = async (): Promise<void> => {
      try {
        await crashSignal;
      } catch {
        /* Swallowed by design — see comment above. */
      }
    };
    void suppressUnhandledCrashSignal();

    const reportAndMaybeReject = (formatted: ReturnType<typeof formatWorkerError>): void => {
      const error = toWorkerError(formatted);
      console.error('[FileManager] worker error:', formatted.message, formatted);
      if (armed) {
        rejectOnCrash(error);
      }
    };

    const onWorkerError = (event: Event): void => {
      reportAndMaybeReject(formatWorkerError(event));
    };
    const onWorkerMessageError = (event: Event): void => {
      reportAndMaybeReject(formatWorkerError(event));
    };
    const onWorkerEnvelope = (event: MessageEvent<unknown>): void => {
      if (isWorkerErrorEnvelope(event.data)) {
        reportAndMaybeReject(formatWorkerErrorEnvelope(event.data));
      }
    };

    worker.addEventListener('error', onWorkerError);
    worker.addEventListener('messageerror', onWorkerMessageError);
    worker.addEventListener('message', onWorkerEnvelope);

    if (!context.sharedWorker) {
      try {
        await Promise.race([waitForWorkerReady(worker, signal), crashSignal]);
      } catch (error) {
        worker.removeEventListener('error', onWorkerError);
        worker.removeEventListener('messageerror', onWorkerMessageError);
        worker.removeEventListener('message', onWorkerEnvelope);
        // We only entered this branch when `context.sharedWorker` was undefined,
        // so the freshly-created worker is owned by us and must be terminated
        // here before re-throwing. Wrapped in `safeDispose` to mirror the rest
        // of the file's worker-teardown patterns.
        safeDispose(() => {
          worker.terminate();
        });
        throw error;
      }
    }
    armed = false;

    // Allocate the file-pool SharedArrayBuffer at most once per worker instance.
    // When `sharedWorker` is supplied, the parent FM has already allocated the
    // SAB and posted the `filePool` message to that worker; nested FMs reuse
    // the parent's SAB by reading it from `context.filePoolBuffer` so the
    // 50 MiB pool isn't duplicated per project route.
    const { filePoolBuffer: inheritedPoolBuffer } = context;
    let filePoolBuffer: SharedArrayBuffer | undefined = inheritedPoolBuffer;
    if (!inheritedPoolBuffer) {
      try {
        filePoolBuffer = new SharedArrayBuffer(filePoolBytes);
        worker.postMessage({ type: 'filePool', buffer: filePoolBuffer });
      } catch {
        filePoolBuffer = undefined;
      }
    }

    const bridge = createFileSystemBridge(worker);
    const { dispose: bridgeDispose } = bridge;
    const proxy = createFileSystemBridgeProxy(bridge);
    // Project roots are worker-global and every mutation re-syncs them (`syncProjectRoots`), so a
    // nested mount inherits the root mount's configuration instead of rebuilding it (W21).
    if (!context.sharedWorker) {
      await proxy.configureProjectRoots(await getProjectRootConfigs(context.onRootSkipped));
    }
    const previewPrefix = '/previews/';
    if (context.backendType === 'memory' && context.rootDirectory.startsWith(previewPrefix)) {
      await proxy.mount(context.rootDirectory, {
        backend: 'memory',
        storageRootKey: `memory:preview:${context.rootDirectory.slice(previewPrefix.length)}`,
        class: 'authored',
      });
    }
    const openBridge = (root: string, consumer: RootedBridgeConsumer): FileSystemBridgeConnection =>
      openFileSystemBridge(worker, { root, consumer });
    worker.postMessage({ type: 'computeStoreAdmission', projectId: context.projectId });
    const { openComputeBinding, openComputeStorePort, computeControl } = computeOpeners(worker, context.projectId);

    return {
      type: 'workerConnected',
      worker,
      proxy,
      bridgeDispose,
      openFileSystemBridge: openBridge,
      openComputeBinding,
      openComputeStorePort,
      computeControl,
      filePoolBuffer,
    };
  },
);

type ProjectConfigLookup = Awaited<ReturnType<typeof getProjectFileSystemConfig>>;

// oxlint-disable complexity -- cancellation-safe resource handoff adds one lifecycle path to the existing initializer.
const initializeServicesActor = fromSafeAsync<
  WorkerInitializedEvent | WebAccessUnavailableEvent,
  { context: FileManagerContext }
>(async ({ input, signal }) => {
  const { context } = input;
  const proxy = context.proxy!;

  let backend = context.backendType;
  let projectConfig: ProjectConfigLookup;
  if (context.projectId) {
    signal.throwIfAborted();
    projectConfig = await getProjectFileSystemConfig(context.projectId);
    backend = projectConfig?.backend ?? 'indexeddb';
  }

  let activeWorkspaceId: string | undefined;
  let activeWorkspaceName: string | undefined;

  if (backend === 'webaccess') {
    // The persistent `ProjectFileSystemConfig.workspaceId` is the only
    // authority for which workspace this project is bound to. The FM
    // machine never carries that identity as ambient context — callers
    // that want to re-bind must write the persistent record first (see
    // `bindProjectToWorkspace` on `useFileManager`) and then dispatch
    // `reloadWorkspace`. Missing/stale bindings surface
    // `WebAccessUnavailableEvent` so the recovery overlay can prompt
    // the user (Rule 11 in `docs/policy/filesystem-authority-policy.md`).
    const requestedWorkspaceId = projectConfig?.backend === 'webaccess' ? projectConfig.workspaceId : undefined;

    const entry = requestedWorkspaceId ? await getWorkspace(requestedWorkspaceId) : undefined;
    if (!entry) {
      const metadata = requestedWorkspaceId ? await getWorkspaceMetadata(requestedWorkspaceId) : undefined;
      return {
        type: 'webAccessUnavailable',
        reason: metadata ? 'disconnected' : 'missing',
        activeWorkspaceId: requestedWorkspaceId,
        activeWorkspaceName: metadata?.name,
      };
    }

    activeWorkspaceId = entry.workspace.workspaceId;
    activeWorkspaceName = entry.workspace.name;
    const permission = await checkHandlePermission(entry.handle);
    if (permission !== 'granted') {
      return {
        type: 'webAccessUnavailable',
        reason: 'permission',
        activeWorkspaceId,
        activeWorkspaceName,
      };
    }
  }

  const filePool = context.filePoolBuffer ? new SharedPool(context.filePoolBuffer) : undefined;

  const paths = new WorkspacePathResolver(context.rootDirectory);
  const refreshGuard = new RefreshGenerationGuard();
  const visibilityProvider = createDomVisibilityProvider();

  /*
   * One composition, read by both consumers (charter D1). The user's view is a
   * rooted bridge connection the file-manager worker composes; the agent's is
   * the same function over its own rooted provider.
   *
   * One connection, and it carries the changes too (charter D12): reads, writes,
   * porcelain, watch and `fileChanged` all ride this port, because the authority
   * suppresses a port's own events by port identity. Split them and the UI hears
   * its own writes back as somebody else's. Only the topology calls — mount,
   * project roots, discovery — stay on the workspace surface, which owns no
   * content.
   */
  const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  signal.throwIfAborted();
  const viewConnection = context.openFileSystemBridge!(context.rootDirectory, 'user');
  const viewProxy = createFileSystemBridgeProxy(viewConnection);
  /*
   * The dependency mount is the checkout's sibling, so no view of the checkout
   * lists it — but a mount is a root, and since W11 it is read through a rooted
   * `'user'` connection of its own rather than off the authority's global
   * surface, which carries no content at all any more (H3, EQ3). Its lifetime is
   * the project session's, exactly like the checkout's view.
   */
  const dependencyConnection = context.openFileSystemBridge!(dependencyMountRoot, 'user');
  const dependencyProxy = createFileSystemBridgeProxy(dependencyConnection);
  const disposeComposedView = (): void => {
    safeDispose(() => {
      viewProxy.dispose();
    });
    safeDispose(() => {
      dependencyProxy.dispose();
    });
  };
  let workerChangeChannel: WorkerChangeChannel | undefined;
  let contentService: FileContentService | undefined;
  let treeService: FileTreeService | undefined;
  let ownsConstructed = true;
  const disposeConstructed = (): void => {
    if (!ownsConstructed) {
      return;
    }
    ownsConstructed = false;
    safeDispose(() => contentService?.dispose());
    safeDispose(() => treeService?.dispose());
    safeDispose(() => workerChangeChannel?.dispose());
    disposeComposedView();
  };
  const disposeOnAbort = (): void => {
    disposeConstructed();
  };
  signal.addEventListener('abort', disposeOnAbort, { once: true });

  try {
    const initializedChangeChannel = new WorkerChangeChannel({ transport: { listen: viewProxy.listen } });
    workerChangeChannel = initializedChangeChannel;
    const client = createComposedViewClient({
      workspace: proxy,
      view: viewProxy,
      dependencies: dependencyProxy,
      paths,
    });

    /*
     * The first listing of the root, through the same composition every later
     * listing of it uses (CI3). Read off the raw workspace surface it showed the
     * control plane with no provenance, and `initialEntries` marks the root
     * resolved — so that listing was the one the tree kept (blueprint Finding 3).
     */
    let initialEntries: FileEntry[] = [];
    try {
      const absolutePath = normalizePath(context.rootDirectory);
      if (backend === 'webaccess') {
        await proxy.pollExternalChanges(absolutePath);
      }
      const rootNodes = await client.readDirectory(absolutePath);
      for (const node of rootNodes) {
        const common = {
          path: node.name,
          name: node.name,
          size: node.size,
          mtimeMs: node.mtimeMs,
          isLoaded: false,
          ...(node.provenance === undefined ? {} : { provenance: node.provenance }),
        };
        if (node.children !== undefined) {
          initialEntries.push({ ...common, type: 'dir', isDirectoryResolved: false });
        } else if (node.contentKind === 'text') {
          initialEntries.push({ ...common, type: 'file', contentKind: 'text', lineCount: node.lineCount });
        } else {
          initialEntries.push({ ...common, type: 'file', contentKind: 'binary' });
        }
      }
    } catch {
      initialEntries = [];
    }
    signal.throwIfAborted();

    const initializedContentService = new FileContentService({
      proxy: client,
      paths,
      channel: initializedChangeChannel,
      refreshGuard,
      cacheOptions: {
        maxEntries: fileCacheMaxEntries,
        maxTotalBytes: fileCacheMaxTotalBytes,
        maxSingleFileBytes: fileCacheMaxSingleFileBytes,
      },
      filePool,
    });
    contentService = initializedContentService;

    const initializedTreeService = new FileTreeService({
      proxy: client,
      paths,
      channel: initializedChangeChannel,
      visibility: visibilityProvider,
      initialEntries,
      onExternalPollTelemetry: context.onExternalPollTelemetry,
    });
    treeService = initializedTreeService;

    initializedTreeService.connectToContentService(initializedContentService);

    // The root listing carries the mount's own row; eagerly load each package
    // directory inside it through the regular treeService so the file tree renders
    // the bundled-types subtree without user interaction (cmd+click was the
    // smoking gun before R1). The mount is populated by the FM worker before
    // `workerReady`, so these listings always see the full set of kernel typings.
    try {
      const rootEntries = await initializedTreeService.listDirectory(bundledTypesWorkspaceRootSegment, { signal });
      await Promise.all(
        rootEntries
          .filter((entry) => entry.isFolder)
          .map(async (entry) =>
            initializedTreeService.listDirectory(`${bundledTypesWorkspaceRootSegment}/${entry.name}`, { signal }),
          ),
      );
    } catch {
      // Bundled types remain lazily loadable through the regular tree path.
    }
    signal.throwIfAborted();
    ownsConstructed = false;
    return {
      type: 'workerInitialized',
      configuredBackend: backend,
      activeWorkspaceId,
      activeWorkspaceName,
      contentService: initializedContentService,
      treeService: initializedTreeService,
      viewClient: client,
      workerChangeChannel: initializedChangeChannel,
      disposeComposedView,
    };
  } finally {
    signal.removeEventListener('abort', disposeOnAbort);
    disposeConstructed();
  }
});
// oxlint-enable complexity

/**
 * Fails when the worker behind this connection dies (G2c-2).
 *
 * The bridge channel treats a dead port as the bye frame the peer never sent,
 * so `closed` is the one signal that means the proxies `ready` published are
 * gone. Invoked by `ready`, which means XState cancels it — and any transition
 * it would have caused — the moment the machine leaves that state for another
 * reason.
 */
const watchProxyClosedActor = fromSafeAsync<void, { proxy: FileManagerContext['proxy'] }>(async ({ input }) => {
  await input.proxy?.closed;
  throw new Error('The file service for this project stopped.');
});

const fileManagerActors = {
  connectWorkerActor,
  initializeServicesActor,
  watchProxyClosedActor,
} as const;

// ============ Events ============

type FileManagerEventLifecycle =
  | { type: 'initialize' }
  | { type: 'setRoot'; path: string; projectId?: string }
  | { type: 'setBackendType'; backendType: FileSystemBackend }
  /**
   * Re-run `initializeServicesActor` against the current `projectId`. The
   * actor reads `ProjectFileSystemConfig` from IDB on every init, so the
   * caller writes the new persistent binding *before* dispatching this
   * event. No payload: the machine never carries workspace identity as
   * ambient state — it always projects from the persistent record.
   *
   * Emitted by `bindProjectToWorkspace` (the binding-transaction helper on
   * `useFileManager`) after `setProjectFileSystemConfig` resolves. See
   * `docs/policy/filesystem-authority-policy.md` Rule 11.
   */
  | { type: 'reloadWorkspace' };

type FileManagerEvent =
  | FileManagerEventLifecycle
  | WorkerConnectedEvent
  | WorkerInitializedEvent
  | WebAccessUnavailableEvent;

type FileManagerInput = {
  rootDirectory: string;
  shouldInitializeOnStart?: boolean;
  initialBackend?: FileSystemBackend;
  projectId?: string;
  sharedWorker?: Worker;
  /**
   * SharedArrayBuffer to reuse for the file-pool when nested under another
   * `FileManagerProvider`. Set to the parent FM's `filePoolBuffer` so the
   * nested machine skips its own allocation/post.
   */
  sharedFilePoolBuffer?: SharedArrayBuffer;
  onExternalPollTelemetry?: (aggregate: ExternalPollTelemetry) => void;
  /** Telemetry sink for workspaces the route snapshot had to skip (R13). */
  onRootSkipped?: (skip: WorkspaceRootSkip) => void;
};

type FileManagerEnqueue = EnqueueObject<FileManagerEvent, EventObject, SystemRegistry, typeof fileManagerActors>;
type FileManagerPatch = Partial<FileManagerContext>;

const setError = (error: unknown, enq: FileManagerEnqueue): FileManagerPatch => {
  if (error instanceof Error) {
    enq(() => {
      console.error('[FileManager] error:', error);
    });
    return { error };
  }
  return { error: undefined };
};

/** Release the service graph; the worker, proxy, bridge opener and authority are not touched. */
const disposeServices = (context: FileManagerContext): void => {
  context.contentService?.dispose();
  context.treeService?.dispose();
  context.workerChangeChannel?.dispose();
  context.disposeComposedView?.();
};

const destroyWorkerAndServices = (context: FileManagerContext, enq: FileManagerEnqueue): FileManagerPatch => {
  enq(() => {
    disposeServices(context);
    safeDispose(() => context.proxy?.dispose());
    safeDispose(context.bridgeDispose);

    if (!context.sharedWorker) {
      safeDispose(() => context.worker?.terminate());
    }
  });

  return {
    proxy: undefined,
    bridgeDispose: undefined,
    openFileSystemBridge: undefined,
    openComputeBinding: undefined,
    openComputeStorePort: undefined,
    computeControl: undefined,
    worker: context.sharedWorker ? context.worker : undefined,
    contentService: undefined,
    treeService: undefined,
    viewClient: undefined,
    workerChangeChannel: undefined,
    disposeComposedView: undefined,
  };
};

/** Reads the worker the destroy step left: only a shared worker survives a root change. */
const updateRootAndReset = (
  context: FileManagerContext,
  event: Extract<FileManagerEvent, { type: 'setRoot' }>,
  enq: FileManagerEnqueue,
): FileManagerPatch => {
  const { worker } = context;
  if (worker) {
    enq(() => {
      worker.postMessage({ type: 'computeStoreAdmission', projectId: event.projectId });
    });
  }
  const openers = worker ? computeOpeners(worker, event.projectId) : undefined;
  return {
    rootDirectory: event.path,
    projectId: event.projectId,
    openComputeBinding: openers?.openComputeBinding,
    openComputeStorePort: openers?.openComputeStorePort,
    computeControl: openers?.computeControl,
    error: undefined,
    // Workspace identity is a per-init *output* of `initializeServicesActor`;
    // it must NEVER survive a project transition. Clearing here closes the
    // class of cross-project corruption bugs (see
    // `docs/research/fm-workspace-binding-scope.md` Findings 1 & 3).
    activeWorkspaceId: undefined,
    activeWorkspaceName: undefined,
    unavailableReason: undefined,
  };
};

const stopPolling = (context: FileManagerContext, enq: FileManagerEnqueue): void => {
  const { treeService } = context;
  enq(() => {
    treeService?.stopPolling();
  });
};

const isRootChanged = (context: FileManagerContext, event: Extract<FileManagerEvent, { type: 'setRoot' }>): boolean =>
  event.path !== context.rootDirectory || event.projectId !== context.projectId;

/** Move to a new project root: stop, tear the worker graph down, then point at the new root. */
const changeRoot =
  (options: Readonly<{ whenChanged: boolean; stopPolling: boolean }>) =>
  (
    {
      context,
      event,
    }: Readonly<{ context: FileManagerContext; event: Extract<FileManagerEvent, { type: 'setRoot' }> }>,
    enq: FileManagerEnqueue,
  ) => {
    if (options.whenChanged && !isRootChanged(context, event)) {
      return undefined;
    }
    if (options.stopPolling) {
      stopPolling(context, enq);
    }
    const destroyed = destroyWorkerAndServices(context, enq);
    return {
      target: 'connectingWorker',
      context: { ...destroyed, ...updateRootAndReset({ ...context, ...destroyed }, event, enq) },
    };
  };

export const fileManagerMachine = setup({
  schemas: {
    context: types<FileManagerContext>(),
    events: eventSchemas<FileManagerEvent>(),
    input: types<FileManagerInput>(),
  },
  actors: fileManagerActors,
}).createMachine({
  id: 'fileManager',
  entry: ({ context, self }, enq) => {
    if (context.shouldInitializeOnStart) {
      enq.sendTo(self, { type: 'initialize' });
    }
  },
  context: ({ input }) => ({
    worker: undefined,
    proxy: undefined,
    openFileSystemBridge: undefined,
    openComputeBinding: undefined,
    openComputeStorePort: undefined,
    computeControl: undefined,
    // Seed with the parent's SAB when nested so the connect actor's gate
    // observes a non-undefined buffer and skips re-allocation.
    filePoolBuffer: input.sharedFilePoolBuffer,
    contentService: undefined,
    treeService: undefined,
    viewClient: undefined,
    workerChangeChannel: undefined,
    error: undefined,
    rootDirectory: input.rootDirectory,
    shouldInitializeOnStart: input.shouldInitializeOnStart ?? true,
    backendType: input.initialBackend ?? 'indexeddb',
    unavailableReason: undefined,
    activeWorkspaceId: undefined,
    activeWorkspaceName: undefined,
    projectId: input.projectId,
    sharedWorker: input.sharedWorker,
    onExternalPollTelemetry: input.onExternalPollTelemetry,
    onRootSkipped: input.onRootSkipped,
  }),
  initial: 'initializing',
  exit: ({ context }, enq) => {
    stopPolling(context, enq);
    return { context: destroyWorkerAndServices(context, enq) };
  },
  states: {
    initializing: {
      on: {
        initialize: { target: 'connectingWorker' },
      },
    },

    connectingWorker: {
      entry: () => ({ context: { error: undefined } }),
      on: {
        setRoot: changeRoot({ whenChanged: true, stopPolling: true }),
        workerConnected: {
          context: ({ event }) => ({
            worker: event.worker,
            proxy: event.proxy,
            bridgeDispose: event.bridgeDispose,
            openFileSystemBridge: event.openFileSystemBridge,
            openComputeBinding: event.openComputeBinding,
            openComputeStorePort: event.openComputeStorePort,
            computeControl: event.computeControl,
            filePoolBuffer: event.filePoolBuffer,
          }),
        },
      },
      invoke: {
        src: 'connectWorkerActor',
        input: ({ context }) => ({ context }),
        onDone: { target: 'initializingServices' },
        onError: ({ event }, enq) => ({ target: 'error', context: setError(event.error, enq) }),
      },
    },

    initializingServices: {
      on: {
        setRoot: changeRoot({ whenChanged: true, stopPolling: true }),
        workerInitialized: {
          context: ({ event }) => ({
            backendType: event.configuredBackend,
            activeWorkspaceId: event.activeWorkspaceId,
            activeWorkspaceName: event.activeWorkspaceName,
            unavailableReason: undefined,
            contentService: event.contentService,
            disposeComposedView: event.disposeComposedView,
            treeService: event.treeService,
            viewClient: event.viewClient,
            workerChangeChannel: event.workerChangeChannel,
          }),
        },
        webAccessUnavailable: {
          context: ({ event }) => ({
            backendType: 'webaccess',
            unavailableReason: event.reason,
            activeWorkspaceId: event.activeWorkspaceId,
            activeWorkspaceName: event.activeWorkspaceName,
          }),
        },
      },
      invoke: {
        src: 'initializeServicesActor',
        input: ({ context }) => ({ context }),
        // The actor returns either `workerInitialized` (success) or
        // `webAccessUnavailable` (recoverable). The matching assignment above
        // runs before `onDone`, so we route by reading the freshly-stored
        // `unavailableReason`.
        onDone: ({ context }) => ({
          target: context.unavailableReason === undefined ? 'ready' : 'webAccessUnavailable',
        }),
        onError: ({ event }, enq) => ({ target: 'error', context: setError(event.error, enq) }),
      },
    },

    ready: {
      entry: ({ context, self }, enq) => {
        const { treeService, backendType, sharedWorker, onRootSkipped } = context;
        enq(() => {
          if (backendType === 'webaccess') {
            treeService?.startPolling();
            return;
          }
          // Only the root mount observes other workspaces; a nested project mount polls its own
          // tree only when that project is itself webaccess, handled above (W21).
          if (treeService === undefined || sharedWorker) {
            return;
          }
          // async-iife: bootstrap — the root file manager also observes granted webaccess
          // workspaces even when its own mounted backend is IndexedDB.
          void (async () => {
            try {
              const configuration = await getProjectRootConfigs(onRootSkipped);
              const snapshot = self.getSnapshot();
              if (
                snapshot.matches('ready') &&
                snapshot.context.treeService === treeService &&
                configuration.roots.some(({ backend }) => backend === 'webaccess')
              ) {
                treeService.startPolling();
              }
            } catch {
              // Worker initialization remains usable if the handle registry cannot be enumerated.
            }
          })();
        });
      },
      exit: ({ context }, enq) => {
        stopPolling(context, enq);
      },
      invoke: {
        src: 'watchProxyClosedActor',
        input: ({ context }) => ({ proxy: context.proxy }),
        onError: ({ context, event }, enq) => ({
          target: 'error',
          context: { ...setError(event.error, enq), ...destroyWorkerAndServices(context, enq) },
        }),
      },
      on: {
        setRoot: changeRoot({ whenChanged: true, stopPolling: true }),

        setBackendType: { context: ({ event }) => ({ backendType: event.backendType }) },

        reloadWorkspace: ({ context }, enq) => {
          stopPolling(context, enq);
          // Keep the successful service identity published until its replacement
          // succeeds, but release the old service graph before constructing the
          // next one. The worker, proxy, bridge opener, and authority stay alive.
          enq(() => {
            disposeServices(context);
          });
          return { target: 'initializingServices', context: { error: undefined } };
        },
      },
    },

    /**
     * Recoverable terminal state entered when a webaccess project can't
     * resolve its workspace handle (missing entry or revoked permission).
     * The `ProjectUnavailableOverlay` (R8) renders inside the editor
     * shell, and the user recovers by either granting permission on the
     * existing handle or picking a different workspace — both flows
     * call `bindProjectToWorkspace` which writes the persistent record
     * and dispatches `reloadWorkspace`.
     */
    webAccessUnavailable: {
      on: {
        setRoot: changeRoot({ whenChanged: true, stopPolling: true }),
        reloadWorkspace: { target: 'initializingServices', context: { error: undefined } },
      },
    },

    error: {
      entry: ({ context }, enq) => {
        const { error } = context;
        enq(() => {
          console.error('[FileManager] state → error', error);
        });
      },
      on: {
        setRoot: changeRoot({ whenChanged: false, stopPolling: false }),
        initialize: { target: 'connectingWorker' },
        reloadWorkspace: { target: 'connectingWorker', context: { error: undefined } },
      },
    },
  },
});

export type FileManagerMachine = typeof fileManagerMachine;
