import { ENV } from '#environment.config.js';
import { createCallbackLogic, setup, types } from 'xstate';
import type { EnqueueObject, EventObject, SystemRegistry } from 'xstate';
import type { FileSystemBackend } from '@taucad/types';
import type { FileSystemBridgeConnection, RootedBridgeConsumer } from '@taucad/fs-bridge';
import type * as FileSystemBridgeModule from '@taucad/fs-bridge';
import type { ComputeBinding, ComputeStoreControl } from '@taucad/runtime';
import { fromComputeStoreChannel } from '@taucad/runtime/host';
import { safeDispose } from '@taucad/utils/dispose';
import { createFileManagerWorker } from '#machines/file-manager-worker.js';
import { reportWorkerFailures } from '#lib/worker-error-reporting.js';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';
import {
  getProjectFileSystemConfig,
  getWorkspace,
  getWorkspaceMetadata,
  checkHandlePermission,
  getHomeStorageBackend,
} from '@taucad/files-ui/filesystem/handle-store';
import type { ProjectRootConfigurationResult, RootStatus, SkippedConfigurationEntry } from '@taucad/filesystem';
import {
  reportFileServiceEntrySkipped,
  reportFileServiceRootUnavailable,
  reportFileServiceStartFailed,
  reportFileServiceStartedDegraded,
  reportableCode,
} from '#lib/file-service-reports.js';
import type { FileServiceErrorClass, FileServiceErrorPhase } from '#lib/file-service-reports.js';
import { readRootConfiguration } from '#runtime/root-configuration.js';
import { desktopBridge } from '@taucad/files-ui/filesystem/desktop-bridge';
import { fileManagerWorkerName } from '@taucad/files-ui/machines/file-manager-worker-name';
import type { ProjectRootConfigurationDegraded, WorkspaceRootSkip } from '@taucad/files-ui/filesystem/handle-store';
import { eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { readLocalProjectOpenPerformance } from '@taucad/ui-core/lib/project-open-performance';
import type { ProjectOpenPerformance } from '@taucad/ui-core/lib/project-open-performance';
import { normalizePath } from '@taucad/utils/path';
import { FileContentBudget } from '@taucad/fs-client/file-content-budget';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { ExternalPollTelemetry } from '@taucad/fs-client/file-tree-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { createDomVisibilityProvider } from '@taucad/fs-client/visibility-provider';
import { createComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { dependencyMountRoot } from '@taucad/ui-core/lib/bundled-types-tree.constants';
import type { FileManagerProxy } from '#machines/file-manager.machine.types.js';
import {
  formatWorkerError,
  formatWorkerErrorEnvelope,
  isWorkerErrorEnvelope,
  toWorkerError,
} from '@taucad/files-ui/machines/file-manager-worker-error';

const fileCacheMaxEntries = 500;
const fileCacheMaxTotalBytes = 128 * 1024 * 1024;
const fileCacheMaxSingleFileBytes = 1024 * 1024;
/*
 * One budget for the document, not one per mount (D-UI-07): the Home root and
 * every open project each hold a content service, and 128 MiB apiece multiplied
 * with the number of mounts.
 */
const documentFileContentBudget = new FileContentBudget({ maxTotalBytes: fileCacheMaxTotalBytes });

const computeOpeners = (worker: Worker, admittedProjectId: string | undefined) => {
  const openComputeStorePort = (projectId: string): MessagePort => {
    if (!admittedProjectId || projectId !== admittedProjectId) {
      throw new Error('Compute store project authority does not match the active project.');
    }
    const channel = new MessageChannel();
    worker.postMessage({ type: 'computeStoreConnect', projectId, port: channel.port1 }, [channel.port1]);
    return channel.port2;
  };
  /* The runtime transport opens one port per runtime binding and hands it to the kernel worker, so store
   * calls go worker to worker; this page relays none of them (geometry-cache blueprint T4). */
  const openComputeBinding = (projectId: string) => {
    let disposed = false;
    const store = fromComputeStoreChannel(() => {
      if (disposed) {
        throw new Error('Compute store binding was disposed.');
      }
      return openComputeStorePort(projectId);
    });
    return {
      compute: { mode: 'durable', store } as const,
      dispose: () => {
        disposed = true;
      },
    };
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
  /* W8 TS-S5: a port into this project's revision root for the resident agent host, as a placement session or a
   * `revisions` tool reader. The worker serves it only once the page's own revision port has opened the root. */
  const openRevisionSessionPort = (kind: 'placement' | 'reader', projectId: string): MessagePort => {
    if (!admittedProjectId || projectId !== admittedProjectId) {
      throw new Error('Revision session project authority does not match the active project.');
    }
    const channel = new MessageChannel();
    worker.postMessage(
      { type: kind === 'placement' ? 'placementConnect' : 'revisionsReaderConnect', projectId, port: channel.port1 },
      [channel.port1],
    );
    return channel.port2;
  };
  return { openComputeBinding, openComputeStorePort, computeControl, openRevisionSessionPort };
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
  openRevisionSessionPort?: ReturnType<typeof computeOpeners>['openRevisionSessionPort'];
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
  /** The one composed client the file services and the Files pane both use. */
  viewClient: ComposedViewClient | undefined;
  disposeComposedView?: () => void;
  workerChangeChannel: WorkerChangeChannel | undefined;
  error: Error | undefined;
  rootDirectory: string;
  shouldInitializeOnStart: boolean;
  hasInitializationRequest: boolean;
  backendType: FileSystemBackend | undefined;
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
  /** Whether this mount restarted its worker within the last liveness bound; a second death then shows the error. */
  restarted: boolean;
  onExternalPollTelemetry: ((aggregate: ExternalPollTelemetry) => void) | undefined;
  onRootSkipped: ((skip: WorkspaceRootSkip) => void) | undefined;
  /** Explicit local diagnostic recorder; absent in ordinary project opens. */
  openPerformance: ProjectOpenPerformance | undefined;
  /** The first effect or child failure no transition modelled; later ones are usually its consequences (D23). */
  fault: string | undefined;
  /** This page load started in safe mode (D0): the root configuration is Home alone. */
  safeMode: boolean;
  /** Each configured root's published status, in configuration order (blueprint D1); empty until configured. */
  rootStatuses: readonly RootStatus[];
  /** The configuration entries the authority skipped at the last configure (D1, B3). */
  skippedEntries: readonly SkippedConfigurationEntry[];
  /** The input that could not be read, so the start went on with Home alone (B5); `undefined` when none. */
  degraded: ProjectRootConfigurationDegraded | undefined;
  /** Where the last start failure happened (D3); kept until the next `ready`. */
  errorPhase: FileServiceErrorPhase | undefined;
  /** Whether the last start failure can be cured by retrying (D3); kept until the next `ready`. */
  errorClass: FileServiceErrorClass | undefined;
  /** The last start failure's code: an errno, a Tau code or an error name (D3); kept until the next `ready`. */
  errorCode: string | undefined;
  /** The machine retries a transient failure once by itself, after `transientRetry`; this marks one is due. */
  autoRetryPending: boolean;
  /** The one automatic retry was used since the last `ready`. */
  autoRetried: boolean;
  /** Times the start deadline passed since the last `ready`: the second is deterministic. */
  startDeadlineMisses: number;
  /** `file_service.start_failed` is reported once for each machine (D5). */
  startFailureReported: boolean;
};

// ============ Start failures (blueprint D3) ============

/** The start deadline over `connectingWorker` and `initializingServices` (B12). Milliseconds. @public */
export const fileManagerStartDeadlineMilliseconds = 20_000;

/** While the page is visible, roots that are not available are probed again this often (blueprint D1, B2). Milliseconds. */
const rootRecheckIntervalMilliseconds = 30_000;

/** The id of the pending timed re-check, so leaving `ready` cancels it. */
const rootRecheckTimerId = 'rootRecheckTimer';

/** Root states a probe can change by itself: the folder may come back, its access may return, or it may answer. */
const isRecheckableRoot = (root: RootStatus): boolean =>
  root.state === 'notFound' || root.state === 'permission' || root.state === 'unreachable';

/** A start that missed its deadline. @public */
export class FileServiceStartDeadlineError extends Error {
  public override readonly name = 'FileServiceStartDeadlineError';

  public get code(): string {
    return 'START_DEADLINE';
  }
}

/** What the start knows about a failure beyond the error itself: where it happened, and its code when the error has none. */
const failureNotes = new WeakMap<WeakKey, { phase?: FileServiceErrorPhase; code?: string }>();

const noteFailure = <T>(error: T, notes: { phase?: FileServiceErrorPhase; code?: string }): T => {
  if (typeof error === 'object' && error !== null && !failureNotes.has(error)) {
    failureNotes.set(error, notes);
  }
  return error;
};

/** The names that mean a local database cannot open, which retrying does not change (D3). */
const deterministicNames = new Set(['VersionError', 'DatabaseOpenTimeoutError', 'StorageUpgradeBlockedError']);

const failureCode = (error: unknown): string => {
  const noted = typeof error === 'object' && error !== null ? failureNotes.get(error)?.code : undefined;
  const own = (error as { code?: unknown } | undefined)?.code;
  if (typeof own === 'string') {
    return reportableCode(own);
  }
  if (noted !== undefined) {
    return noted;
  }
  if (error instanceof Error && error.name !== 'Error') {
    return reportableCode(error.name);
  }
  return 'UNKNOWN';
};

const failurePhase = (error: unknown, fallback: FileServiceErrorPhase): FileServiceErrorPhase =>
  (typeof error === 'object' && error !== null ? failureNotes.get(error)?.phase : undefined) ?? fallback;

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
  openRevisionSessionPort: ReturnType<typeof computeOpeners>['openRevisionSessionPort'];
  /** What configuring the roots reported, when this connection configured them (the root mount only). */
  configured?: ProjectRootConfigurationResult | undefined;
  /** The input that could not be read, so the configuration was Home alone (B5). */
  degraded?: ProjectRootConfigurationDegraded | undefined;
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

let fileSystemBridgeModule: Promise<typeof FileSystemBridgeModule> | undefined;

/**
 * The bridge module, loaded once: file managers that connect together (`rootFiles` and a lease the same backend
 * resolution reaches) share one import instead of racing two.
 */
const loadFileSystemBridge = async (): Promise<typeof FileSystemBridgeModule> => {
  /* A failed load is forgotten, so "Try again" fetches the chunk again instead of replaying the failure. */
  fileSystemBridgeModule ??= (async () => {
    try {
      return await import('@taucad/fs-bridge');
    } catch (error) {
      fileSystemBridgeModule = undefined;
      throw error;
    }
  })();
  return fileSystemBridgeModule;
};

/** Home's engine for the worker's name, a failure marked as the `resolveHome` phase. */
const resolveHomeBackend = async (): Promise<Awaited<ReturnType<typeof getHomeStorageBackend>>> => {
  try {
    return await getHomeStorageBackend();
  } catch (error) {
    throw noteFailure(error, { phase: 'resolveHome' });
  }
};

/** Rejects once `signal` aborts; never an unhandled rejection when nothing awaits it. */
const abortRejection = (signal: AbortSignal): Readonly<{ rejected: Promise<never> }> => {
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('The worker connection was stopped.'));
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  const suppressUnhandledAbort = async (): Promise<void> => {
    try {
      await aborted;
    } catch {
      /* Swallowed by design: the race that awaits it reports it. */
    }
  };
  void suppressUnhandledAbort();
  return { rejected: aborted };
};

/**
 * Configure the roots from the root configuration, Home first (D1): this rejects only when Home itself cannot be
 * admitted, and every other root becomes a status. Safe mode configures Home alone (D0). A failure releases the
 * connection through `release` and is marked as the `configureRoots` phase.
 */
const configureRoots = async (
  context: FileManagerContext,
  proxy: FileManagerWorkerProxy,
  release: () => void,
): Promise<{ configured: ProjectRootConfigurationResult; degraded: ProjectRootConfigurationDegraded | undefined }> => {
  try {
    const read = await readRootConfiguration({ safeMode: context.safeMode, onRootSkipped: context.onRootSkipped });
    return { configured: await proxy.configureProjectRoots(read.configuration), degraded: read.degraded };
  } catch (error) {
    release();
    throw noteFailure(error, { phase: 'configureRoots' });
  }
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
      await loadFileSystemBridge();

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
      const homeBackend = await resolveHomeBackend();
      worker = reportWorkerFailures(
        createFileManagerWorker({ name: fileManagerWorkerName(homeBackend) }),
        'file-manager',
      );
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
        // A refused replacement is answered too, so the worker can settle and ask again.
        const replaceNodeFsPort = async (): Promise<void> => {
          try {
            await deliverNodeFsPort(nodeWorker);
          } catch (error) {
            try {
              nodeWorker.postMessage({
                type: 'nodeFsPortError',
                message: error instanceof Error ? error.message : String(error),
              });
            } catch {
              // The worker may already be disposed while the desktop is closing.
            }
          }
        };
        nodeWorker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
          if (event.data.type === 'nodeFsPortRequest') {
            void replaceNodeFsPort();
          }
        });
        await deliverNodeFsPort(nodeWorker).catch((error: unknown) => {
          safeDispose(() => {
            nodeWorker.terminate();
          });
          throw noteFailure(error, { code: 'SERVICES_UNAVAILABLE' });
        });
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
      const span = context.openPerformance?.begin('worker.connect');
      /* A start that missed its deadline stops this actor; the wait ends with it so the worker is terminated below. */
      const aborted = abortRejection(signal).rejected;
      try {
        await Promise.race([waitForWorkerReady(worker, signal), crashSignal, aborted]);
        span?.finish('ok');
      } catch (error) {
        span?.finish(signal.aborted ? 'cancelled' : 'error');
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

    const bridge = createFileSystemBridge(worker);
    const { dispose: bridgeDispose } = bridge;
    const proxy = createFileSystemBridgeProxy(bridge);
    // Project roots are worker-global and every mutation re-syncs them (`syncProjectRoots`), so a
    // nested mount inherits the root mount's configuration instead of rebuilding it (W21).
    const { configured, degraded } = context.sharedWorker
      ? { configured: undefined, degraded: undefined }
      : await configureRoots(context, proxy, () => {
          safeDispose(() => {
            proxy.dispose();
          });
          safeDispose(bridgeDispose);
          safeDispose(() => {
            worker.terminate();
          });
        });
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
    const { openComputeBinding, openComputeStorePort, computeControl, openRevisionSessionPort } = computeOpeners(
      worker,
      context.projectId,
    );

    return {
      type: 'workerConnected',
      worker,
      proxy,
      bridgeDispose,
      openFileSystemBridge: openBridge,
      openComputeBinding,
      openComputeStorePort,
      computeControl,
      openRevisionSessionPort,
      configured,
      degraded,
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
  if (backend === undefined) {
    throw new Error('Home storage must be resolved before starting file services.');
  }
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
  const { createFileSystemBridgeProxy } = await loadFileSystemBridge();
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
    type AuthorityWatch = ReturnType<typeof viewProxy.watchReady>;
    /* An opt-in e2e diagnostic may wrap each actual registration, in any form. */
    const diagnose = (request: Parameters<typeof viewProxy.watchReady>[0], watch: AuthorityWatch): AuthorityWatch => {
      if (!ENV.TAU_DEBUG) {
        return watch;
      }
      const fixture = (
        globalThis as typeof globalThis & {
          __tauE2eObservationWatch?: {
            wrapViewWatch?(
              root: string,
              request: Parameters<typeof viewProxy.watchReady>[0],
              watch: AuthorityWatch,
            ): AuthorityWatch;
          };
        }
      ).__tauE2eObservationWatch;
      try {
        return fixture?.wrapViewWatch?.(context.rootDirectory, request, watch) ?? watch;
      } catch (error) {
        watch.unsubscribe();
        throw error;
      }
    };
    const initializedChangeChannel = new WorkerChangeChannel({
      transport: {
        listen: viewProxy.listen,
        closed: viewProxy.closed,
        /* The connection's one event channel (charter D14): every watch the
         * tree and the open documents register listens on it, so a committed
         * changeset reaches this connection once however many there are. */
        ...(typeof viewProxy.events === 'function'
          ? {
              events: (handler) => viewProxy.events(handler),
              observeWatch: diagnose,
            }
          : {}),
        /* The older forms, for a connection that serves no event channel: one
         * wire frame per committed changeset per watch (charter D6, S8). */
        ...(typeof viewProxy.watchChangeSets === 'function'
          ? {
              watchChangeSets: (request, handler) => diagnose(request, viewProxy.watchChangeSets(request, handler)),
            }
          : {}),
        watchReady: (request, handler) => diagnose(request, viewProxy.watchReady(request, handler)),
      },
    });
    workerChangeChannel = initializedChangeChannel;
    const client = createComposedViewClient({
      workspace: proxy,
      view: viewProxy,
      dependencies: dependencyProxy,
      paths,
    });

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
      budget: documentFileContentBudget,
    });
    contentService = initializedContentService;

    const initializedTreeService = new FileTreeService({
      proxy: client,
      paths,
      channel: initializedChangeChannel,
      visibility: visibilityProvider,
      onExternalPollTelemetry: context.onExternalPollTelemetry,
    });
    treeService = initializedTreeService;

    initializedTreeService.connectToContentService(initializedContentService);

    // Subscribe the resident tree before its first authoritative root listing.
    if (backend === 'webaccess') {
      await proxy.pollExternalChanges(normalizePath(context.rootDirectory));
    }
    // A project registered after worker boot answers ROOT_UNAVAILABLE until
    // configureProjectRoots runs; its tree stays unresolved rather than failing start-up.
    const authoritySpan = context.openPerformance?.begin('authority.ready');
    try {
      await viewProxy.ready;
      authoritySpan?.finish(viewProxy.hello.payload.state === 'unavailable' ? 'unavailable' : 'ok');
    } catch (error) {
      authoritySpan?.finish(signal.aborted ? 'cancelled' : 'error');
      throw error;
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
const watchProxyClosedActor = fromSafeAsync<
  void,
  { proxy: FileManagerContext['proxy']; worker?: FileManagerContext['worker'] }
>(async ({ input, signal }) => {
  /* The worker gives up on the services utility after its backoff (B7): that is this service stopping too. */
  const servicesUnavailable = new Promise<'servicesUnavailable'>((resolve) => {
    const onMessage = (event: MessageEvent<{ type?: string } | undefined>): void => {
      if (event.data?.type === 'nodeFsUnavailable') {
        resolve('servicesUnavailable');
      }
    };
    input.worker?.addEventListener('message', onMessage);
    signal.addEventListener('abort', () => {
      input.worker?.removeEventListener('message', onMessage);
    });
  });
  const ended = await Promise.race([input.proxy?.closed, servicesUnavailable]);
  if (ended === 'servicesUnavailable') {
    throw Object.assign(new Error('The services utility did not start.'), { code: 'SERVICES_UNAVAILABLE' });
  }
  throw new Error('The file service for this project stopped.');
});

/** The root mount hears every root's status change (D1), as the worker's `rootStatus` event. */
const watchRootStatusActor = createCallbackLogic<
  EventObject,
  { proxy: FileManagerContext['proxy']; isRootMount: boolean }
>(({ input, sendBack }) => {
  if (!input.isRootMount || typeof input.proxy?.listen !== 'function') {
    return;
  }
  const unsubscribe = input.proxy.listen('rootStatus', (roots) => {
    if (Array.isArray(roots)) {
      sendBack({ type: 'rootStatusChanged', roots: roots as RootStatus[] });
    }
  });
  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
});

/** The root mount re-checks lost roots when the window regains focus (blueprint D1, R4); a probe only re-reads. */
const recheckRootsOnFocusActor = createCallbackLogic<EventObject, { isRootMount: boolean }>(({ input, sendBack }) => {
  if (!input.isRootMount || typeof globalThis.addEventListener !== 'function') {
    return;
  }
  const onFocus = (): void => {
    sendBack({ type: 'recheckRoots', source: 'focus' });
  };
  globalThis.addEventListener('focus', onFocus);
  return () => {
    globalThis.removeEventListener('focus', onFocus);
  };
});

/** Keep the resident root projection observed without gating usable content services. */
const observeRootDirectoryActor = createCallbackLogic<
  EventObject,
  { context: Pick<FileManagerContext, 'treeService' | 'openPerformance'> }
>(({ input }) => {
  const tree = input.context.treeService;
  if (tree === undefined) {
    return;
  }
  const observation = tree.observeDirectory('');
  const span = input.context.openPerformance?.begin('tree.list');
  const report = (): void => {
    const snapshot = observation.getSnapshot();
    if (snapshot.value?.kind === 'ready') {
      span?.finish('ok', { directoryEntries: snapshot.value.entries.length });
    } else if (snapshot.value?.kind === 'error' || snapshot.status === 'error') {
      span?.finish('error');
    }
  };
  const unsubscribe = observation.subscribe(report);
  const lease = observation.acquire();
  report();
  return () => {
    unsubscribe();
    lease.release();
    span?.finish('cancelled');
  };
});

const fileManagerActors = {
  connectWorkerActor,
  initializeServicesActor,
  watchProxyClosedActor,
  watchRootStatusActor,
  recheckRootsOnFocusActor,
  observeRootDirectoryActor,
} as const;

// ============ Events ============

type FileManagerEventLifecycle =
  | { type: 'initialize' }
  | { type: 'resolveInitialBackend'; backend: Exclude<FileSystemBackend, 'webaccess'> }
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
  | { type: 'reloadWorkspace' }
  /** The worker published every root's status after a change (blueprint D1). */
  | { type: 'rootStatusChanged'; roots: readonly RootStatus[] }
  /**
   * Probe again the roots that are not available; all of them, or the keys named (blueprint D1). `focus` and `timer`
   * are the automatic re-checks (R4): they probe only while a root can come back, and `timer` arms the next one.
   */
  | { type: 'recheckRoots'; storageRootKeys?: readonly string[]; source?: 'focus' | 'timer' };

/** Events accepted by fileManagerMachine. @public */
export type FileManagerEvent =
  | FileManagerEventLifecycle
  | WorkerConnectedEvent
  | WorkerInitializedEvent
  | WebAccessUnavailableEvent;

/**
 * The file manager machine's public alphabet: every {@link FileManagerEvent} type, in the union's order. The totality
 * test samples each one and fails when this list and the union differ.
 *
 * @public
 */
export const fileManagerEventTypes = [
  'initialize',
  'resolveInitialBackend',
  'setRoot',
  'setBackendType',
  'reloadWorkspace',
  'workerConnected',
  'workerInitialized',
  'webAccessUnavailable',
  'rootStatusChanged',
  'recheckRoots',
] as const satisfies ReadonlyArray<FileManagerEvent['type']>;

const fileManagerStates = [
  'initializing',
  'connectingWorker',
  'initializingServices',
  'ready',
  'webAccessUnavailable',
  'error',
] as const;

/** Every state but the ones named, for a pair the machine answers in those states only. */
const fileManagerStatesExcept = (...answered: ReadonlyArray<(typeof fileManagerStates)[number]>) =>
  fileManagerStates.filter((state) => !answered.includes(state));

/**
 * The (state, event) pairs this machine leaves unanswered today (MC-R17): the totality baseline. A pair names a state
 * where some event of its type goes unanswered; a mixed pair's type is also answered there with other context (a
 * pair cannot say which), and the totality test checks that answer with its own row.
 *
 * - `initialize` once started, except from `error`, where it is the retry.
 * - `resolveInitialBackend` once started: the engine was chosen before the worker connected.
 * - `setRoot` to the current root, after `initializing` and outside `error`: nothing moves.
 * - `setBackendType` outside `ready`.
 * - `reloadWorkspace` before an init settles: `initializing` waits for `initialize`, and in `connectingWorker` and
 *   `initializingServices` the running init reads the persistent binding itself.
 * - `workerConnected` outside `connectingWorker`, `workerInitialized` and `webAccessUnavailable` outside
 *   `initializingServices`: an effect's report lands only while its invoke runs.
 *
 * @public
 */
export const fileManagerIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...fileManagerStatesExcept('initializing', 'error').map((state) => [state, 'initialize'] as const),
  ...fileManagerStatesExcept('initializing').map((state) => [state, 'resolveInitialBackend'] as const),
  ...fileManagerStatesExcept('initializing', 'error').map((state) => [state, 'setRoot'] as const),
  ...fileManagerStatesExcept('ready').map((state) => [state, 'setBackendType'] as const),
  ...(['initializing', 'connectingWorker', 'initializingServices'] as const).map(
    (state) => [state, 'reloadWorkspace'] as const,
  ),
  ...fileManagerStatesExcept('connectingWorker').map((state) => [state, 'workerConnected'] as const),
  ...fileManagerStatesExcept('initializingServices').flatMap((state) => [
    [state, 'workerInitialized'] as const,
    [state, 'webAccessUnavailable'] as const,
  ]),
  ...fileManagerStatesExcept('ready').flatMap((state) => [
    [state, 'rootStatusChanged'] as const,
    [state, 'recheckRoots'] as const,
  ]),
];

type FileManagerInput = {
  rootDirectory: string;
  shouldInitializeOnStart?: boolean;
  projectId?: string;
  sharedWorker?: Worker;
  onExternalPollTelemetry?: (aggregate: ExternalPollTelemetry) => void;
  /** Telemetry sink for workspaces the route snapshot had to skip (R13). */
  onRootSkipped?: (skip: WorkspaceRootSkip) => void;
  /** Explicit local diagnostic recorder for passive User Timing spans. */
  openPerformance?: ProjectOpenPerformance;
  /** This page load started in safe mode (D0): the root mount configures Home alone. */
  safeMode?: boolean;
} & (
  | { backendResolution: 'pending'; initialBackend?: never }
  | { backendResolution?: undefined; initialBackend?: FileSystemBackend }
);

type FileManagerEnqueue = EnqueueObject<FileManagerEvent, EventObject, SystemRegistry, typeof fileManagerActors>;
type FileManagerPatch = Partial<FileManagerContext>;

/**
 * Enter a failure: keep the error, its phase, code and class (D3), report the first one (D5), and say whether the one
 * automatic retry of a transient failure is due. Only the root mount retries by itself: a nested mount's worker is its
 * parent's, and a worker that died after `ready` already had its restart.
 */
const fail = (
  {
    context,
    error,
    fallbackPhase,
  }: Readonly<{ context: FileManagerContext; error: unknown; fallbackPhase: FileServiceErrorPhase }>,
  enq: FileManagerEnqueue,
): FileManagerPatch => {
  const phase = failurePhase(error, fallbackPhase);
  const code = failureCode(error);
  const name = error instanceof Error || error instanceof DOMException ? error.name : undefined;
  const startDeadlineMisses = context.startDeadlineMisses + (phase === 'startDeadline' ? 1 : 0);
  const errorClass: FileServiceErrorClass =
    code === context.errorCode ||
    (name !== undefined && deterministicNames.has(name)) ||
    (phase === 'startDeadline' && startDeadlineMisses >= 2)
      ? 'deterministic'
      : 'transient';
  const autoRetryPending =
    errorClass === 'transient' &&
    !context.autoRetried &&
    context.sharedWorker === undefined &&
    phase !== 'watchProxyClosed';
  const shouldReport = !context.startFailureReported;
  const { backendType, rootStatuses } = context;
  enq(() => {
    console.error('[FileManager] error:', error);
    if (shouldReport) {
      reportFileServiceStartFailed({ phase, code, errorClass, homeBackend: backendType, roots: rootStatuses });
    }
  });
  return {
    error: error instanceof Error ? error : undefined,
    errorPhase: phase,
    errorClass,
    errorCode: code,
    startDeadlineMisses,
    autoRetryPending,
    startFailureReported: true,
  };
};

/** Probe the named roots again, or every one that is not available, and hand the statuses on (D1). */
const probeRootsAgain = async (
  proxy: FileManagerContext['proxy'],
  storageRootKeys: readonly string[] | undefined,
  deliver: (roots: readonly RootStatus[]) => void,
): Promise<void> => {
  try {
    const roots = await proxy?.recheckRoots(storageRootKeys === undefined ? undefined : [...storageRootKeys]);
    if (roots !== undefined) {
      deliver(roots);
    }
  } catch {
    // The worker publishes what changed as `rootStatus`; a failed probe leaves the statuses as they are.
  }
};

/** What `ready` clears: the start succeeded, so the next failure is a first one again. */
const startSucceeded: FileManagerPatch = {
  errorPhase: undefined,
  errorClass: undefined,
  errorCode: undefined,
  autoRetryPending: false,
  autoRetried: false,
  startDeadlineMisses: 0,
};

/** Report what one configure found: a degraded input, skipped entries and roots that are not available (D5). */
const reportConfigured = (
  configured: ProjectRootConfigurationResult | undefined,
  degraded: ProjectRootConfigurationDegraded | undefined,
): void => {
  if (degraded !== undefined) {
    reportFileServiceStartedDegraded(degraded);
  }
  for (const entry of configured?.skipped ?? []) {
    reportFileServiceEntrySkipped(entry);
  }
  for (const root of configured?.roots ?? []) {
    if (root.state !== 'available') {
      void reportFileServiceRootUnavailable(root);
    }
  }
};

/** Release the service graph; the worker, proxy, bridge opener and authority are not touched. */
const disposeServices = (context: FileManagerContext): void => {
  context.contentService?.dispose();
  context.treeService?.dispose();
  context.workerChangeChannel?.dispose();
  context.disposeComposedView?.();
};

/**
 * Release what a file manager's context holds: its services, proxy and bridge, and its worker unless it shares one.
 *
 * The machine's own teardown, and the lease store's after it stops a leased actor: `stop()` runs no `exit`, so a
 * dropped lease releases its resources through this rather than through the root's `exit`.
 *
 * @param context - The file manager's context, read after it stopped.
 * @public
 */
export const releaseFileManagerResources = (context: FileManagerContext): void => {
  disposeServices(context);
  safeDispose(() => context.proxy?.dispose());
  safeDispose(context.bridgeDispose);

  if (!context.sharedWorker) {
    safeDispose(() => context.worker?.terminate());
  }
};

const destroyWorkerAndServices = (context: FileManagerContext, enq: FileManagerEnqueue): FileManagerPatch => {
  enq(() => {
    releaseFileManagerResources(context);
  });

  return {
    proxy: undefined,
    bridgeDispose: undefined,
    openFileSystemBridge: undefined,
    openComputeBinding: undefined,
    openComputeStorePort: undefined,
    computeControl: undefined,
    openRevisionSessionPort: undefined,
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
    openRevisionSessionPort: openers?.openRevisionSessionPort,
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
  delays: {
    /** A worker that dies again within this bound of its restart is shown as failed (RV1-F1, T9 E4). Milliseconds. */
    restartWindow: 3500,
    /** No wait of the start outlives this (B12, D3). Milliseconds. */
    startDeadline: fileManagerStartDeadlineMilliseconds,
    /** The pause before the one automatic retry of a transient failure (D3). Milliseconds. */
    transientRetry: 1000,
  },
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
    openRevisionSessionPort: undefined,
    contentService: undefined,
    treeService: undefined,
    viewClient: undefined,
    workerChangeChannel: undefined,
    error: undefined,
    rootDirectory: input.rootDirectory,
    shouldInitializeOnStart: input.shouldInitializeOnStart ?? true,
    hasInitializationRequest: false,
    backendType: input.backendResolution === 'pending' ? undefined : (input.initialBackend ?? 'indexeddb'),
    unavailableReason: undefined,
    activeWorkspaceId: undefined,
    activeWorkspaceName: undefined,
    projectId: input.projectId,
    sharedWorker: input.sharedWorker,
    restarted: false,
    onExternalPollTelemetry: input.onExternalPollTelemetry,
    onRootSkipped: input.onRootSkipped,
    openPerformance: input.openPerformance ?? readLocalProjectOpenPerformance(),
    fault: undefined,
    safeMode: input.safeMode ?? false,
    rootStatuses: [],
    skippedEntries: [],
    degraded: undefined,
    errorPhase: undefined,
    errorClass: undefined,
    errorCode: undefined,
    autoRetryPending: false,
    autoRetried: false,
    startDeadlineMisses: 0,
    startFailureReported: false,
  }),
  /* A fault no transition modelled is recorded and reported once, and the machine keeps answering in the state it was
   * in: the first is kept, later ones are its consequences (MC-R12, D23; B2). Today's modelled failures still enter
   * `error` through their invokes' own `onError`. */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    enq(() => {
      reportAppRuntimeFault(event.error);
    });
    return { context: { fault: faultMessage(event.error, 'file manager fault') } };
  },
  initial: 'initializing',
  exit: ({ context }, enq) => {
    stopPolling(context, enq);
    return { context: destroyWorkerAndServices(context, enq) };
  },
  states: {
    initializing: {
      on: {
        initialize: ({ context }) =>
          context.backendType === undefined
            ? { context: { hasInitializationRequest: true } }
            : { target: 'connectingWorker' },
        resolveInitialBackend: ({ context, event }) => {
          if (context.backendType !== undefined) {
            return {}; // A duplicate resolution cannot change the selected engine.
          }
          return {
            ...(context.shouldInitializeOnStart || context.hasInitializationRequest
              ? { target: 'connectingWorker' }
              : {}),
            context: { backendType: event.backend },
          };
        },
        setRoot: ({ event }) => ({ context: { rootDirectory: event.path, projectId: event.projectId } }),
      },
    },

    connectingWorker: {
      entry: () => ({ context: { error: undefined } }),
      timeout: 'startDeadline',
      onTimeout: ({ context }, enq) => ({
        target: 'error',
        context: fail(
          {
            context,
            error: new FileServiceStartDeadlineError('The file service did not start in time.'),
            fallbackPhase: 'startDeadline',
          },
          enq,
        ),
      }),
      on: {
        setRoot: changeRoot({ whenChanged: true, stopPolling: true }),
        workerConnected: ({ event }, enq) => {
          const { configured, degraded } = event;
          if (configured !== undefined || degraded !== undefined) {
            enq(() => {
              reportConfigured(configured, degraded);
            });
          }
          return {
            context: {
              worker: event.worker,
              proxy: event.proxy,
              bridgeDispose: event.bridgeDispose,
              openFileSystemBridge: event.openFileSystemBridge,
              openComputeBinding: event.openComputeBinding,
              openComputeStorePort: event.openComputeStorePort,
              computeControl: event.computeControl,
              openRevisionSessionPort: event.openRevisionSessionPort,
              ...(configured === undefined
                ? {}
                : { rootStatuses: configured.roots, skippedEntries: configured.skipped }),
              ...(event.configured === undefined && event.degraded === undefined ? {} : { degraded }),
            },
          };
        },
      },
      invoke: {
        src: 'connectWorkerActor',
        input: ({ context }) => ({ context }),
        onDone: { target: 'initializingServices' },
        onError: ({ context, event }, enq) => ({
          target: 'error',
          context: fail({ context, error: event.error, fallbackPhase: 'connectWorker' }, enq),
        }),
      },
    },

    initializingServices: {
      timeout: 'startDeadline',
      onTimeout: ({ context }, enq) => ({
        target: 'error',
        context: fail(
          {
            context,
            error: new FileServiceStartDeadlineError('The file service did not start in time.'),
            fallbackPhase: 'startDeadline',
          },
          enq,
        ),
      }),
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
        onError: ({ context, event }, enq) => ({
          target: 'error',
          context: fail({ context, error: event.error, fallbackPhase: 'initializeServices' }, enq),
        }),
      },
    },

    ready: {
      entry: ({ context, self }, enq) => {
        const { treeService, backendType, sharedWorker, onRootSkipped, safeMode } = context;
        if (sharedWorker === undefined) {
          enq.raise(
            { type: 'recheckRoots', source: 'timer' },
            { id: rootRecheckTimerId, delay: rootRecheckIntervalMilliseconds },
          );
        }
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
              const { configuration } = await readRootConfiguration({ safeMode, onRootSkipped });
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
        return { context: startSucceeded };
      },
      exit: ({ context }, enq) => {
        stopPolling(context, enq);
        enq.cancel(rootRecheckTimerId);
      },
      after: {
        restartWindow: () => ({ context: { restarted: false } }),
      },
      invoke: [
        {
          src: 'watchProxyClosedActor',
          input: ({ context }) => ({ proxy: context.proxy, worker: context.worker }),
          /* RV1-F1: the root mount restarts its own dead worker once without a click; a nested mount's worker is its
           * parent's to restart, and a second death within the bound shows the error with "Try again". */
          onError: ({ context, event }, enq) =>
            context.sharedWorker === undefined && !context.restarted
              ? {
                  target: 'connectingWorker',
                  context: { ...destroyWorkerAndServices(context, enq), restarted: true },
                }
              : {
                  target: 'error',
                  context: {
                    ...fail({ context, error: event.error, fallbackPhase: 'watchProxyClosed' }, enq),
                    ...destroyWorkerAndServices(context, enq),
                  },
                },
        },
        {
          src: 'observeRootDirectoryActor',
          input: ({ context }) => ({ context }),
        },
        {
          src: 'watchRootStatusActor',
          input: ({ context }) => ({ proxy: context.proxy, isRootMount: context.sharedWorker === undefined }),
        },
        {
          src: 'recheckRootsOnFocusActor',
          input: ({ context }) => ({ isRootMount: context.sharedWorker === undefined }),
        },
      ],
      on: {
        setRoot: changeRoot({ whenChanged: true, stopPolling: true }),

        setBackendType: { context: ({ event }) => ({ backendType: event.backendType }) },

        rootStatusChanged: { context: ({ event }) => ({ rootStatuses: event.roots }) },

        /* Probe the roots that are not available again; their new statuses arrive as `rootStatusChanged` too. */
        recheckRoots: ({ context, event, self }, enq) => {
          const { proxy } = context;
          if (event.source === 'timer') {
            enq.raise(
              { type: 'recheckRoots', source: 'timer' },
              { id: rootRecheckTimerId, delay: rootRecheckIntervalMilliseconds },
            );
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
              return {};
            }
          }
          if (event.source !== undefined && !context.rootStatuses.some(isRecheckableRoot)) {
            return {};
          }
          enq(() => {
            /* Outside `ready` the answer is ignored, as every `rootStatusChanged` there is. */
            void probeRootsAgain(proxy, event.storageRootKeys, (roots) => {
              self.send({ type: 'rootStatusChanged', roots });
            });
          });
          return {};
        },

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
      /* A transient failure gets one automatic retry before the person has to act (D3). */
      after: {
        transientRetry: ({ context }) =>
          context.autoRetryPending
            ? { target: 'connectingWorker', context: { autoRetryPending: false, autoRetried: true } }
            : undefined,
      },
      on: {
        setRoot: changeRoot({ whenChanged: false, stopPolling: false }),
        initialize: { target: 'connectingWorker', context: { autoRetryPending: false } },
        reloadWorkspace: { target: 'connectingWorker', context: { error: undefined, autoRetryPending: false } },
      },
    },
  },
});

export type FileManagerMachine = typeof fileManagerMachine;
