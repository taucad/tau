import { assign, assertEvent, setup, enqueueActions } from 'xstate';
import type { FileEntry, FileSystemBackend } from '@taucad/types';
import { safeDispose } from '@taucad/utils/dispose';
import FileManagerWorker from '#machines/file-manager.worker.js?worker';
import { getProjectFileSystemConfig, getWorkspace, checkHandlePermission } from '#filesystem/handle-store.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { normalizePath } from '@taucad/utils/path';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { SharedPool } from '@taucad/memory';
import { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { createDomVisibilityProvider } from '@taucad/fs-client/visibility-provider';
import { bundledTypesWorkspaceRootSegment } from '#lib/bundled-types-tree.constants.js';
import type { FileManagerProxy, FileManagerProtocol } from '#machines/file-manager.machine.types.js';
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

/**
 * Why webaccess can't be initialized when the FM machine enters the
 * `webAccessUnavailable` recovery state. Drives the copy/recovery surface
 * rendered by `ProjectUnavailableOverlay` (R8) and the legacy
 * `chat-error-service-unavailable` component.
 *
 * - `missing` — the bound workspace doesn't exist in the handle store (the
 *   user deleted/forgot it, or the project was created on another device).
 * - `permission` — the workspace's handle is intact but the browser
 *   revoked read/write permission. A user-gesture `Grant Access` flow
 *   recovers without a re-pick.
 */
export type WorkspaceUnavailableReason = 'missing' | 'permission';

type FileManagerContext = {
  worker: Worker | undefined;
  proxy: (FileManagerProxy & { listen?: (event: string, handler: (data: unknown) => void) => () => void }) | undefined;
  bridgeDispose?: () => void;
  filePoolBuffer: SharedArrayBuffer | undefined;
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
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
   * `docs/policy/filesystem-policy.md` Rule 13b.
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
};

// ============ Lifecycle Actors ============

type WorkerConnectedEvent = {
  type: 'workerConnected';
  worker: Worker;
  proxy: FileManagerProxy & { listen?: (event: string, handler: (data: unknown) => void) => () => void };
  bridgeDispose: () => void;
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
  initialEntries: FileEntry[];
  contentService: FileContentService;
  treeService: FileTreeService;
  workerChangeChannel: WorkerChangeChannel;
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
    const initT0 = performance.now();
    console.debug(`[FileManager] connectWorkerActor: start +${initT0.toFixed(0)}ms`);

    safeDispose(() => context.proxy?.dispose());
    safeDispose(context.bridgeDispose);
    context.contentService?.dispose();
    context.treeService?.dispose();
    context.workerChangeChannel?.dispose();

    const { createBridgeProxy, createFileSystemBridge, waitForWorkerReady } =
      await import('@taucad/runtime/transport-internals');

    if (context.worker && !context.sharedWorker) {
      safeDispose(() => context.worker?.terminate());
    }

    const worker = context.sharedWorker ?? new FileManagerWorker({ name: `fm-root` });
    console.debug(`[FileManager] worker created +${(performance.now() - initT0).toFixed(1)}ms`);

    // Crash-aware error/messageerror/envelope listeners. Listeners are
    // installed before any await so a synchronous load failure (404 served as
    // HTML, COEP block, SyntaxError) is captured and surfaced through the
    // XState `error` transition instead of being silently swallowed. The
    // listeners stay attached after readiness so post-init crashes are at
    // least visible in the console (the `crashSignal` Promise is only racy
    // during the connect phase — `armed` is flipped to `false` afterwards
    // so its callback no longer rejects).
    let armed = true;
    let rejectOnCrash!: (error: Error) => void;
    const crashSignal = new Promise<never>((_resolve, reject) => {
      rejectOnCrash = reject;
    });
    // Suppress unhandled-rejection warnings if `crashSignal` never wins the race.
    // The handler is intentionally inert because errors are already reported
    // via `console.error` inside `reportAndMaybeReject`.
    const noop = (): void => {
      /* Swallowed by design — see comment above. */
    };
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then) -- attaching a catch handler to a Promise we may never await
    crashSignal.catch(noop);

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
        console.debug(`[FileManager] worker ready +${(performance.now() - initT0).toFixed(1)}ms`);
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
    if (inheritedPoolBuffer) {
      console.debug(`[FileManager] filePool SAB inherited from parent +${(performance.now() - initT0).toFixed(1)}ms`);
    } else {
      try {
        filePoolBuffer = new SharedArrayBuffer(filePoolBytes);
        worker.postMessage({ type: 'filePool', buffer: filePoolBuffer });
        console.debug(`[FileManager] filePool SAB allocated +${(performance.now() - initT0).toFixed(1)}ms`);
      } catch {
        console.debug('[FileManager] SharedArrayBuffer unavailable, skipping file pool');
      }
    }

    const { port, dispose: bridgeDispose } = createFileSystemBridge(worker);
    console.debug(`[FileManager] bridge created, port transferred +${(performance.now() - initT0).toFixed(1)}ms`);
    const proxy = createBridgeProxy<FileManagerProtocol>(port);
    console.debug(`[FileManager] proxy created +${(performance.now() - initT0).toFixed(1)}ms`);

    return { type: 'workerConnected', worker, proxy, bridgeDispose, filePoolBuffer };
  },
);

type ProjectConfigLookup = Awaited<ReturnType<typeof getProjectFileSystemConfig>>;

const initializeServicesActor = fromSafeAsync<
  WorkerInitializedEvent | WebAccessUnavailableEvent,
  { context: FileManagerContext }
>(async ({ input, signal }) => {
  const { context } = input;
  const proxy = context.proxy!;
  const initT0 = performance.now();
  console.debug(`[FileManager] initializeServicesActor: start +${initT0.toFixed(0)}ms`);

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
    // the user (Rule 13b in `docs/policy/filesystem-policy.md`).
    const requestedWorkspaceId = projectConfig?.backend === 'webaccess' ? projectConfig.workspaceId : undefined;

    const entry = requestedWorkspaceId ? await getWorkspace(requestedWorkspaceId) : undefined;
    if (!entry) {
      return {
        type: 'webAccessUnavailable',
        reason: 'missing',
        activeWorkspaceId: requestedWorkspaceId,
        activeWorkspaceName: undefined,
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

    if (context.projectId) {
      const projectPrefix = `/projects/${context.projectId}`;
      // Single discriminated mount call — the directory handle and stable
      // workspace id are passed atomically (Audit R2). The worker never
      // observes an "active handle" between two RPCs.
      await proxy.mount(projectPrefix, {
        backend: 'webaccess',
        directoryHandle: entry.handle,
        workspaceId: entry.workspace.workspaceId,
        preservePath: true,
      });
    }
  } else if (context.projectId) {
    const projectPrefix = `/projects/${context.projectId}`;
    await proxy.mount(projectPrefix, { backend, preservePath: true });
  }

  let initialEntries: FileEntry[] = [];
  try {
    const rootPath = context.rootDirectory;
    const absolutePath = normalizePath(rootPath);
    const rootNodes = await proxy.readDirectory(absolutePath);
    for (const node of rootNodes) {
      initialEntries.push({
        path: node.name,
        name: node.name,
        type: node.children === undefined ? 'file' : 'dir',
        size: node.size,
        mtimeMs: node.mtimeMs,
        isLoaded: false,
      });
    }
  } catch (error) {
    console.debug('[FileManager] Initial tree hydration failed (empty filesystem?):', error);
    initialEntries = [];
  }

  const filePool = context.filePoolBuffer ? new SharedPool(context.filePoolBuffer) : undefined;

  const paths = new WorkspacePathResolver(context.rootDirectory);
  const refreshGuard = new RefreshGenerationGuard();
  const workerChangeChannel = new WorkerChangeChannel({
    transport: { listen: proxy.listen! },
    paths,
  });
  const visibilityProvider = createDomVisibilityProvider();

  const contentService = new FileContentService({
    proxy,
    paths,
    channel: workerChangeChannel,
    refreshGuard,
    cacheOptions: {
      maxEntries: fileCacheMaxEntries,
      maxTotalBytes: fileCacheMaxTotalBytes,
      maxSingleFileBytes: fileCacheMaxSingleFileBytes,
    },
    filePool,
  });

  const treeService = new FileTreeService({
    proxy,
    paths,
    channel: workerChangeChannel,
    visibility: visibilityProvider,
    initialEntries,
  });

  treeService.connectToContentService(contentService);

  // Eagerly load `/node_modules` + each package directory through the regular
  // treeService so the file tree renders the bundled-types subtree without
  // user interaction (cmd+click was the smoking gun before R1). The mount is
  // populated by the FM worker before `workerReady`, so these listings always
  // see the full set of kernel typings.
  try {
    const rootEntries = await treeService.listDirectory(bundledTypesWorkspaceRootSegment, { signal });
    await Promise.all(
      rootEntries
        .filter((entry) => entry.isFolder)
        .map(async (entry) =>
          treeService.listDirectory(`${bundledTypesWorkspaceRootSegment}/${entry.name}`, { signal }),
        ),
    );
  } catch (error) {
    console.debug('[FileManager] eager node_modules listing failed:', error);
  }

  console.debug('[FileManager] initializeServicesActor: success');
  return {
    type: 'workerInitialized',
    configuredBackend: backend,
    activeWorkspaceId,
    activeWorkspaceName,
    initialEntries,
    contentService,
    treeService,
    workerChangeChannel,
  };
});

const fileManagerActors = {
  connectWorkerActor,
  initializeServicesActor,
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
   * `docs/policy/filesystem-policy.md` Rule 13b.
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
};

export const fileManagerMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type assertion required
    context: {} as FileManagerContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type assertion required
    events: {} as FileManagerEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type assertion required
    input: {} as FileManagerInput,
  },
  actors: fileManagerActors,
  actions: {
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          console.error('[FileManager] error:', event.error);
          return event.error;
        }
        return undefined;
      },
    }),

    clearError: assign({ error: undefined }),

    destroyWorkerAndServices: assign(({ context }) => {
      if (context.projectId && context.proxy) {
        const projectPrefix = `/projects/${context.projectId}`;
        context.proxy.unmount(projectPrefix);
      }

      context.contentService?.dispose();
      context.treeService?.dispose();
      context.workerChangeChannel?.dispose();
      safeDispose(() => context.proxy?.dispose());
      safeDispose(context.bridgeDispose);

      if (!context.sharedWorker) {
        safeDispose(() => context.worker?.terminate());
      }

      return {
        proxy: undefined,
        bridgeDispose: undefined,
        worker: context.sharedWorker ? context.worker : undefined,
        contentService: undefined,
        treeService: undefined,
        workerChangeChannel: undefined,
      };
    }),

    updateRootAndReset: assign({
      rootDirectory({ event }) {
        assertEvent(event, 'setRoot');
        return event.path;
      },
      projectId({ event }) {
        assertEvent(event, 'setRoot');
        return event.projectId;
      },
      error: undefined,
      // Workspace identity is a per-init *output* of `initializeServicesActor`;
      // it must NEVER survive a project transition. Clearing here closes the
      // class of cross-project corruption bugs (see
      // `docs/research/fm-workspace-binding-scope.md` Findings 1 & 3).
      activeWorkspaceId: undefined,
      activeWorkspaceName: undefined,
      unavailableReason: undefined,
    }),

    updateWorkerFromConnect: assign({
      worker({ event }) {
        assertEvent(event, 'workerConnected');
        return event.worker;
      },
      proxy({ event }) {
        assertEvent(event, 'workerConnected');
        return event.proxy;
      },
      bridgeDispose({ event }) {
        assertEvent(event, 'workerConnected');
        return event.bridgeDispose;
      },
      filePoolBuffer({ event }) {
        assertEvent(event, 'workerConnected');
        return event.filePoolBuffer;
      },
    }),

    updateBackendFromInit: assign({
      backendType({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.configuredBackend;
      },
      activeWorkspaceId({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.activeWorkspaceId;
      },
      activeWorkspaceName({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.activeWorkspaceName;
      },
      unavailableReason: undefined,
      contentService({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.contentService;
      },
      treeService({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.treeService;
      },
      workerChangeChannel({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.workerChangeChannel;
      },
    }),

    recordWebAccessUnavailable: assign({
      backendType: 'webaccess',
      unavailableReason({ event }) {
        assertEvent(event, 'webAccessUnavailable');
        return event.reason;
      },
      activeWorkspaceId({ event }) {
        assertEvent(event, 'webAccessUnavailable');
        return event.activeWorkspaceId;
      },
      activeWorkspaceName({ event }) {
        assertEvent(event, 'webAccessUnavailable');
        return event.activeWorkspaceName;
      },
    }),

    updateBackendType: assign({
      backendType({ event }) {
        assertEvent(event, 'setBackendType');
        return event.backendType;
      },
    }),

    startPolling({ context }) {
      if (context.backendType === 'webaccess') {
        context.treeService?.startPolling();
      }
    },

    stopPolling({ context }) {
      context.treeService?.stopChangeDetection();
    },

    unmountProjectMount({ context }) {
      if (context.projectId && context.proxy) {
        const projectPrefix = `/projects/${context.projectId}`;
        // Fire-and-forget: the worker side is synchronous-ish (mount table
        // ops) and `reloadWorkspace` is followed immediately by a fresh
        // `initializeServicesActor` run that will re-mount.
        context.proxy.unmount(projectPrefix);
      }
    },
  },
  guards: {
    isRootChanged({ context, event }) {
      assertEvent(event, 'setRoot');
      return event.path !== context.rootDirectory || event.projectId !== context.projectId;
    },
    isWebAccessUnavailable({ context }) {
      return context.unavailableReason !== undefined;
    },
  },
}).createMachine({
  id: 'fileManager',
  entry: enqueueActions(({ enqueue, context, self }) => {
    if (context.shouldInitializeOnStart) {
      enqueue.sendTo(self, { type: 'initialize' });
    }
  }),
  context: ({ input }) => ({
    worker: undefined,
    proxy: undefined,
    // Seed with the parent's SAB when nested so the connect actor's gate
    // observes a non-undefined buffer and skips re-allocation.
    filePoolBuffer: input.sharedFilePoolBuffer,
    contentService: undefined,
    treeService: undefined,
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
  }),
  initial: 'initializing',
  exit: ['stopPolling', 'destroyWorkerAndServices'],
  states: {
    initializing: {
      on: {
        initialize: { target: 'connectingWorker' },
      },
    },

    connectingWorker: {
      entry: ['clearError'],
      on: {
        setRoot: {
          target: 'connectingWorker',
          guard: 'isRootChanged',
          actions: ['stopPolling', 'destroyWorkerAndServices', 'updateRootAndReset'],
        },
        workerConnected: {
          actions: ['updateWorkerFromConnect'],
        },
      },
      invoke: {
        src: 'connectWorkerActor',
        input({ context }) {
          return { context };
        },
        onDone: 'initializingServices',
        onError: {
          target: 'error',
          actions: ['setError'],
        },
      },
    },

    initializingServices: {
      on: {
        setRoot: {
          target: 'connectingWorker',
          guard: 'isRootChanged',
          actions: ['stopPolling', 'destroyWorkerAndServices', 'updateRootAndReset'],
        },
        workerInitialized: {
          actions: ['updateBackendFromInit'],
        },
        webAccessUnavailable: {
          actions: ['recordWebAccessUnavailable'],
        },
      },
      invoke: {
        src: 'initializeServicesActor',
        input({ context }) {
          return { context };
        },
        onDone: [
          // The actor returns either `workerInitialized` (success) or
          // `webAccessUnavailable` (recoverable). XState fires the matching
          // assignment action above before `onDone`, so we route by reading
          // the freshly-stored `unavailableReason`.
          { guard: 'isWebAccessUnavailable', target: 'webAccessUnavailable' },
          { target: 'ready' },
        ],
        onError: {
          target: 'error',
          actions: ['setError'],
        },
      },
    },

    ready: {
      entry: ['startPolling'],
      exit: ['stopPolling'],
      on: {
        setRoot: {
          target: 'connectingWorker',
          guard: 'isRootChanged',
          actions: ['stopPolling', 'destroyWorkerAndServices', 'updateRootAndReset'],
        },

        setBackendType: {
          actions: ['updateBackendType'],
        },

        reloadWorkspace: {
          target: 'initializingServices',
          // Unmount the existing project mount before re-initializing so the
          // worker doesn't briefly hold both the old and new webaccess
          // providers (R11 / Finding 9). Falls through cleanly when the
          // mount didn't exist (e.g. recovery branch).
          actions: ['stopPolling', 'unmountProjectMount', 'clearError'],
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
        setRoot: {
          target: 'connectingWorker',
          guard: 'isRootChanged',
          actions: ['stopPolling', 'destroyWorkerAndServices', 'updateRootAndReset'],
        },
        reloadWorkspace: {
          target: 'initializingServices',
          actions: ['unmountProjectMount', 'clearError'],
        },
      },
    },

    error: {
      entry({ context }) {
        console.error('[FileManager] state → error', context.error);
      },
      on: {
        setRoot: {
          target: 'connectingWorker',
          actions: ['destroyWorkerAndServices', 'updateRootAndReset'],
        },
        initialize: {
          target: 'connectingWorker',
        },
        reloadWorkspace: {
          target: 'connectingWorker',
          actions: ['clearError'],
        },
      },
    },
  },
});

export type FileManagerMachine = typeof fileManagerMachine;
