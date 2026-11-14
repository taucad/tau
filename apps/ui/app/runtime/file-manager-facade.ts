/**
 * A file manager's facade, with no React (app state orchestration charter D9, D15; plan § 4 A4b; programme control's
 * ruling of 2026-11-13T13:37Z).
 *
 * The builders here make the parts of a file manager's facade that hold no React state: the authority's topology
 * client, the physical-scope reads, the workspace lifecycle with its root synchronisation, the duplicate's one-shot
 * read and the record watch. `FileManagerScope` builds a leased or session file manager's facade from them in render.
 *
 * {@link createRootFileFacade} builds the root's: the facade over `rootFiles`, the file manager for `/`, which the app
 * runtime composes once and the project library reads for its life. It owns the root's record connections (it installs
 * the replacement when `rootFiles` publishes a new bridge opener, as a session's file-manager child does) and the
 * root's synchronisation passes, so the root layout's scope is a view of it and neither creates a second set. Every
 * object here is a host object, held in closures and never in a machine's context (D4).
 */
import type { FileSystemBridgeRootedProxy } from '@taucad/fs-bridge';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import type { ScopedStorageClient } from '@taucad/fs-client/file-system-client';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { rootedPathOf } from '@taucad/fs-client/rooted-content-client';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import { watchByChangeSets } from '@taucad/filesystem';
import type { WatchEvent, WorkspaceScope } from '@taucad/filesystem';
import { pathRegistry } from '@taucad/filesystem/path-registry';
import { Topic } from '@taucad/events';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import {
  disconnectWorkspace as disconnectStoredWorkspace,
  getProjectRootConfigs,
  restoreWorkspaceHandle as restoreStoredWorkspaceHandle,
  updateWorkspaceHandle,
} from '#filesystem/handle-store.js';
import type { FileManagerProxy, FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { FileManagerSnapshot } from '#runtime/file-manager-host.wait.js';
import { recordConnectionsOf } from '#runtime/file-manager-record-connections.js';
import type { RecordBridgeOpener } from '#runtime/file-manager-record-connections.js';
import type { SessionFilesPort } from '#runtime/session-file-manager.js';
import type { AppRuntimeFiles } from '#runtime/app-runtime.js';
import type { FileSystemClientFacade, WorkspaceFacade } from '#hooks/use-file-manager.js';
import type { ProjectLibraryFileManager } from '#runtime/project-library-storage.js';
import type { WorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { ENV } from '#environment.config.js';

/** A file manager's content and tree services. @public */
export type FileManagerServices = Readonly<{ contentService: FileContentService; treeService: FileTreeService }>;

/** The record watch a facade hands out. @public */
export type RecordWatch = (
  absolutePath: string,
  listener: (event: WatchEvent) => void,
  options?: { recursive?: boolean },
) => ObservationWatch;

/** What the waits are run on: the runtime's file-manager wait (row S18). @public */
export type FacadeFiles = Pick<AppRuntimeFiles, 'awaitFileManager'>;

/**
 * Refuse a file manager in `error` (row S18).
 *
 * @param snapshot - A settled wait's snapshot.
 * @public
 */
export function assertNotErrorState(snapshot: FileManagerSnapshot): void {
  if (snapshot.matches('error')) {
    throw new FileManagerNotReadyError('machine-error', {
      cause: snapshot.context.error,
    });
  }
}

/**
 * The services already bound, if both are: they answer without a wait, as they always did.
 *
 * @param fileManagerRef - The file manager.
 * @returns Its services, or `undefined` while either is missing.
 * @public
 */
export function servicesBound(fileManagerRef: FileManagerRef): FileManagerServices | undefined {
  const { contentService, treeService } = fileManagerRef.getSnapshot().context;
  return contentService && treeService ? { contentService, treeService } : undefined;
}

/**
 * The services a settled wait reached, or the reason it did not reach them.
 *
 * @param settled - The wait's snapshot.
 * @returns The services.
 * @public
 */
export function servicesOf(settled: FileManagerSnapshot): FileManagerServices {
  assertNotErrorState(settled);
  const readyContent = settled.context.contentService;
  const readyTree = settled.context.treeService;
  if (!readyContent || !readyTree) {
    throw new FileManagerNotReadyError('services-timeout');
  }

  return { contentService: readyContent, treeService: readyTree };
}

/**
 * The ref's active workspace id, read in a callback.
 *
 * @public
 */
export const selectActiveWorkspaceId = (fileManagerRef: FileManagerRef): string | undefined =>
  fileManagerRef.getSnapshot().context.activeWorkspaceId;

/**
 * The ref's worker proxy, read in a callback.
 *
 * @public
 */
export const selectProxy = (fileManagerRef: FileManagerRef): FileManagerSnapshot['context']['proxy'] =>
  fileManagerRef.getSnapshot().context.proxy;

/** The ref's tree service, read in a callback. */
const selectTreeService = (fileManagerRef: FileManagerRef): FileTreeService | undefined =>
  fileManagerRef.getSnapshot().context.treeService;

/**
 * The ref's current bridge opener, read after a wait.
 *
 * @public
 */
export const selectBridgeOpener = (fileManagerRef: FileManagerRef): RecordBridgeOpener | undefined =>
  fileManagerRef.getSnapshot().context.openFileSystemBridge;

/**
 * Wait on the runtime's clock for `readiness`, then refuse a file manager in `error` (row S18).
 *
 * @param files - The runtime's file-manager wait.
 * @param fileManagerRef - The file manager.
 * @param wait - The readiness, and the signal that ends the wait when the file manager's owner ends.
 * @returns The settled snapshot.
 * @public
 */
export const readied = async (
  files: FacadeFiles,
  fileManagerRef: FileManagerRef,
  wait: Readonly<{ readiness: 'ready' | 'viewClient' | 'proxy'; gone: AbortSignal | undefined }>,
): Promise<FileManagerSnapshot> => {
  const snapshot = await files.awaitFileManager(fileManagerRef, wait.readiness, {
    reason: 'proxy-timeout',
    ...(wait.gone === undefined ? {} : { gone: wait.gone }),
  });
  assertNotErrorState(snapshot);
  return snapshot;
};

/**
 * Observe one record file through a `'working-copy'` connection of the root that owns it, once per committed changeset
 * (D6, D23).
 *
 * @param opener - The bridge opener the watch opens its connection with.
 * @param whenServicesReady - Waits for the file manager's services before it opens.
 * @returns The watch.
 * @public
 */
export const createRecordWatch =
  (opener: RecordBridgeOpener, whenServicesReady: () => Promise<unknown>): RecordWatch =>
  (absolutePath, listener, options) => {
    const { root, path } = rootedPathOf(absolutePath);
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const abort = new AbortController();
    let disposeConnection = (): void => undefined;
    let disposedConnection = false;
    const open = async (): Promise<void> => {
      try {
        await whenServicesReady();
        abort.signal.throwIfAborted();
        const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
        abort.signal.throwIfAborted();
        const proxy = createFileSystemBridgeProxy(opener(root, 'working-copy'));
        /* A chat's append storm reaches this watch once per committed changeset (D6, D23). */
        let watch = watchByChangeSets(proxy, { paths: [path], ...options }, listener);
        disposeConnection = () => {
          if (!disposedConnection) {
            disposedConnection = true;
            watch.unsubscribe();
            proxy.dispose();
          }
        };
        if (ENV.TAU_DEBUG) {
          const fixture = (
            globalThis as typeof globalThis & {
              __tauE2eObservationWatch?: {
                wrapRecordWatch?(
                  root: string,
                  path: string,
                  watch: ReturnType<FileSystemBridgeRootedProxy['watchReady']>,
                ): ReturnType<FileSystemBridgeRootedProxy['watchReady']>;
              };
            }
          ).__tauE2eObservationWatch;
          if (fixture?.wrapRecordWatch) {
            watch = fixture.wrapRecordWatch(root, path, watch);
          }
        }
        if (abort.signal.aborted) {
          disposeConnection();
          abort.signal.throwIfAborted();
        }
        await watch.ready;
        abort.signal.throwIfAborted();
        ready.resolve();
        await watch.closed;
        closed.resolve();
        disposeConnection();
      } catch (error) {
        ready.reject(error);
        closed.resolve();
        disposeConnection();
      }
    };
    void open();
    return {
      ready: ready.promise,
      closed: closed.promise,
      dispose: () => {
        abort.abort();
        disposeConnection();
      },
    };
  };

/**
 * The one-shot read a duplicate journals, on its own connection.
 *
 * Not borrowed from the record connections: this reads a project the workbench is usually *not* rooted at, once per
 * duplication, and the owner would then hold a `'user'` port open for every project ever duplicated this session.
 *
 * @param opener - Opens the project's rooted `'user'` connection.
 * @param whenServicesReady - Waits for the file manager's services first.
 * @returns The read.
 * @public
 */
export const createDuplicateProjectReader =
  (
    opener: RecordBridgeOpener,
    whenServicesReady: () => Promise<unknown>,
  ): ((projectRoot: string) => Promise<Record<string, Uint8Array<ArrayBuffer>>>) =>
  async (projectRoot) => {
    await whenServicesReady();
    const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
    const proxy = createFileSystemBridgeProxy(opener(projectRoot, 'user'));
    try {
      const files = await proxy.contents('', { versionedOnly: true });
      const recordRows = pathRegistry.filter(
        (row) => row.class === 'records' && !row.versioned && row.agentAccess === 'read-write' && row.match === 'root',
      );
      for (const row of recordRows) {
        // oxlint-disable-next-line no-await-in-loop -- Each selected subtree is read on this one-shot connection.
        if (!(await proxy.exists(row.prefix))) {
          continue;
        }
        if (row.directory) {
          // oxlint-disable-next-line no-await-in-loop -- Read only the selected record subtree.
          for (const [path, content] of Object.entries(await proxy.contents(row.prefix))) {
            files[`${row.prefix}/${path}`] = content;
          }
        } else {
          // oxlint-disable-next-line no-await-in-loop -- Read only the selected record file.
          files[row.prefix] = await proxy.readFile(row.prefix);
        }
      }
      return files;
    } finally {
      proxy.dispose();
    }
  };

/**
 * The `/files` browser's scoped reads (charter D5).
 *
 * These stay on the authority because a scope the mount table does not route has no composed view to serve it;
 * `scope` is required, so a routed path cannot reach content here by omission.
 *
 * @param getReadiedProxy - The worker proxy once the file manager is ready.
 * @returns The reads.
 * @public
 */
export const createScopedStorage = (getReadiedProxy: () => Promise<FileManagerProxy>): ScopedStorageClient => {
  /* One cast, for the one overloaded member: `readFile` answers text or bytes. */
  const readFile = (async (path: string, options: { scope: WorkspaceScope }) => {
    const proxy = await getReadiedProxy();
    return proxy.readScopedFile(path, options);
  }) as ScopedStorageClient['readFile'];
  return {
    readFile,
    readShallowDirectory: async (path, options) => {
      const proxy = await getReadiedProxy();
      return proxy.readScopedShallowDirectory(path, options);
    },
    getZippedDirectory: async (path, options) => {
      const proxy = await getReadiedProxy();
      return proxy.getScopedZippedDirectory(path, options);
    },
  };
};

/**
 * The authority's topology, gated on the machine becoming `ready` (charter D5).
 *
 * These go to the *workspace* proxy and not to the composed view: a project directory's lifecycle is the authority's
 * subject, and the surface carries no content for a consumer to reach past it.
 *
 * @param getReadiedProxy - The worker proxy once the file manager is ready.
 * @returns The topology client.
 * @public
 */
export const createAuthorityClient = (getReadiedProxy: () => Promise<FileManagerProxy>): FileSystemClientFacade => {
  const gated = <K extends keyof FileSystemClientFacade>(method: K): FileSystemClientFacade[K] =>
    (async (...args: unknown[]) => {
      const proxy = await getReadiedProxy();
      return (proxy[method] as (...rest: unknown[]) => unknown)(...args);
    }) as FileSystemClientFacade[K];

  return {
    listProjectManifests: gated('listProjectManifests'),
    verifyProjectRoute: gated('verifyProjectRoute'),
    commitPendingProjectDirectory: gated('commitPendingProjectDirectory'),
    permanentlyDeleteProjectDirectory: gated('permanentlyDeleteProjectDirectory'),
    adoptProjectDirectory: gated('adoptProjectDirectory'),
  };
};

/** What the workspace lifecycle is built over. @public */
export type WorkspaceFacadePorts = Readonly<{
  fileManagerRef: FileManagerRef;
  /** The worker proxy once the file manager is `ready`. */
  getReadiedProxy: () => Promise<FileManagerProxy>;
  /** The worker proxy once the worker is connected, `webAccessUnavailable` included, so recovery can run. */
  getConnectedProxy: () => Promise<FileManagerProxy>;
  whenServicesReady: () => Promise<FileManagerServices>;
  telemetry: Pick<WorkspaceTelemetry, 'workspaceUnmountFailed'>;
}>;

/** The workspace lifecycle, and the activation of the passes that synchronise its roots. @public */
export type WorkspaceLifecycle = Readonly<{
  workspace: WorkspaceFacade;
  /** Open a lifetime for root synchronisation passes. @returns Its close, which refuses what is still waiting. */
  activateRootSync: () => () => void;
}>;

/**
 * The authority's topology, gated on the machine becoming `ready` (charter D5): mount, unmount, storage-root teardown,
 * and root synchronisation, one pass at a time per activation.
 *
 * @param ports - The file manager and its waits.
 * @returns The lifecycle.
 * @public
 */
export const createWorkspaceFacade = ({
  fileManagerRef,
  getReadiedProxy,
  getConnectedProxy,
  whenServicesReady,
  telemetry,
}: WorkspaceFacadePorts): WorkspaceLifecycle => {
  type RootSyncPasses = {
    closed: boolean;
    running: boolean;
    pending: Array<PromiseWithResolvers<void>>;
  };
  const syncLifetime: { passes: RootSyncPasses } = { passes: { closed: false, running: false, pending: [] } };
  const assertOpen = (owner: RootSyncPasses): void => {
    if (owner.closed) {
      throw new Error('Workspace root synchronization owner is disposed');
    }
  };
  const configurePersistedRoots = async (owner: RootSyncPasses): Promise<void> => {
    assertOpen(owner);
    const [proxy, services, configuration] = await Promise.all([
      getReadiedProxy(),
      whenServicesReady(),
      getProjectRootConfigs(),
    ]);
    assertOpen(owner);
    if (selectProxy(fileManagerRef) !== proxy) {
      throw new Error('Workspace root synchronization provider changed');
    }
    await proxy.configureProjectRoots(configuration);
    assertOpen(owner);
    if (selectTreeService(fileManagerRef) !== services.treeService) {
      throw new Error('Workspace root synchronization services changed');
    }
    if (configuration.roots.some(({ backend }) => backend === 'webaccess')) {
      services.treeService.startPolling();
    } else {
      services.treeService.stopPolling();
    }
  };
  const drain = async (owner: RootSyncPasses): Promise<void> => {
    owner.running = true;
    while (owner.pending.length > 0) {
      // Capture callers before source acquisition; later invocations require a fresh pass.
      const callers = owner.pending.splice(0);
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each trailing pass must freshly acquire sources after its predecessor.
        await configurePersistedRoots(owner);
        for (const caller of callers) {
          caller.resolve();
        }
      } catch (error) {
        for (const caller of callers) {
          caller.reject(error);
        }
      }
    }
    owner.running = false;
  };
  const syncProjectRoots = async (): Promise<void> => {
    const { passes } = syncLifetime;
    assertOpen(passes);
    const caller = Promise.withResolvers<void>();
    passes.pending.push(caller);
    if (!passes.running) {
      // async-iife: this drain settles every caller, including failed passes.
      void drain(passes);
    }
    await caller.promise;
  };
  const workspace: WorkspaceFacade = {
    mount: async (prefix, config) => {
      const proxy = await getReadiedProxy();
      await proxy.mount(prefix, config);
    },
    unmount: (prefix) => {
      // async-iife: bootstrap. Errors here are non-fatal but worth
      // surfacing — `workspace.unmount_failed` lights up the metrics
      // dashboard when an unmount step fails to dispose cleanly
      // (Audit Finding 10).
      void (async () => {
        try {
          const proxy = await getReadiedProxy();
          proxy.unmount(prefix);
        } catch (error) {
          telemetry.workspaceUnmountFailed({
            workspaceId: selectActiveWorkspaceId(fileManagerRef),
            prefix,
            reason: 'dispose-failed',
            error,
          });
          console.warn(`[FileManager] unmount('${prefix}') failed`, error);
        }
      })();
    },
    disposeStorageRoot: async (storageRootKey) => {
      const proxy = await getReadiedProxy();
      proxy.disposeStorageRoot(storageRootKey);
    },
    syncProjectRoots,
    replaceWorkspaceHandle: async (workspaceId, handle) => {
      const proxy = await getConnectedProxy();
      await updateWorkspaceHandle(workspaceId, handle);
      proxy.disposeStorageRoot(`webaccess:${workspaceId}`);
      await proxy.configureProjectRoots(await getProjectRootConfigs());
    },
    disconnectWorkspace: async (workspaceId) => {
      const proxy = await getReadiedProxy();
      const disconnected = await disconnectStoredWorkspace(workspaceId);
      if (!disconnected) {
        return undefined;
      }
      proxy.disposeStorageRoot(`webaccess:${workspaceId}`);
      try {
        await syncProjectRoots();
      } catch (error) {
        console.warn('[FileManager] Workspace disconnected but root refresh failed', error);
      }
      return disconnected;
    },
    restoreWorkspaceHandle: async (workspaceId, handle) => {
      const proxy = await getReadiedProxy();
      const restored = await restoreStoredWorkspaceHandle(workspaceId, handle);
      if (!restored) {
        return false;
      }
      proxy.disposeStorageRoot(`webaccess:${workspaceId}`);
      try {
        await syncProjectRoots();
      } catch (error) {
        console.warn('[FileManager] Workspace handle restored but root refresh failed', error);
      }
      return true;
    },
  };
  return {
    workspace,
    activateRootSync: () => {
      if (syncLifetime.passes.closed) {
        syncLifetime.passes = { closed: false, running: false, pending: [] };
      }
      const owner = syncLifetime.passes;
      return () => {
        owner.closed = true;
        for (const caller of owner.pending.splice(0)) {
          caller.reject(new Error('Workspace root synchronization owner is disposed'));
        }
      };
    },
  };
};

/** The root's facade: what the project library reads, as it changes, and the root layout's scope reads too. @public */
export type RootFileFacade = Readonly<{
  /** The facade now: a new object only when the record client, the record watch or the change channel changed. */
  get: () => ProjectLibraryFileManager;
  /** Called after each change. @returns The unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** The root's working-copy client, as a session child's port: the root scope reads it instead of its own. */
  workingCopyFiles: SessionFilesPort<RootedContentClient>;
  /** Stop following `rootFiles` and refuse the root synchronisation passes still waiting. */
  close: () => void;
}>;

/** What the root facade is built over. @public */
export type RootFileFacadeOptions = Readonly<{
  /** The runtime's `rootFiles`, fixed for its life. */
  fileManagerRef: FileManagerRef;
  /** The runtime's file-manager wait, on its clock (row S18). */
  files: FacadeFiles;
  telemetry: Pick<WorkspaceTelemetry, 'workspaceUnmountFailed'>;
}>;

/**
 * Build the root facade over `rootFiles` (A4b): the file facade the project library reads, with no React.
 *
 * @param options - `rootFiles`, the runtime's wait and the workspace telemetry.
 * @returns The facade, following `rootFiles` until it is closed.
 * @public
 */
export function createRootFileFacade({ fileManagerRef, files, telemetry }: RootFileFacadeOptions): RootFileFacade {
  /* `rootFiles` outlives every caller, so no wait ends early for an owner that went away. */
  const whenServicesReady = async (): Promise<FileManagerServices> =>
    servicesBound(fileManagerRef) ??
    servicesOf(await files.awaitFileManager(fileManagerRef, 'services', { reason: 'services-timeout' }));
  const proxyAt = async (readiness: 'ready' | 'proxy'): Promise<FileManagerProxy> => {
    const snapshot = await readied(files, fileManagerRef, { readiness, gone: undefined });
    const { proxy } = snapshot.context;
    if (!proxy) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }
    return proxy;
  };
  const getReadiedProxy = async (): Promise<FileManagerProxy> => proxyAt('ready');
  /* Read the opener when a connection opens, after the services wait: an early read must not keep the undefined one. */
  const fallback: RecordBridgeOpener = (root, consumer) => {
    const opener = selectBridgeOpener(fileManagerRef);
    if (!opener) {
      throw new FileManagerNotReadyError('proxy-timeout', {
        cause: new Error('File Manager filesystem bridge is not ready.'),
      });
    }
    return opener(root, consumer);
  };
  const connections = recordConnectionsOf(fileManagerRef, fallback, whenServicesReady);
  const lifecycle = createWorkspaceFacade({
    fileManagerRef,
    getReadiedProxy,
    getConnectedProxy: async () => proxyAt('proxy'),
    whenServicesReady,
    telemetry,
  });
  const closeRootSync = lifecycle.activateRootSync();
  const fixed = {
    client: createAuthorityClient(getReadiedProxy),
    scopedStorage: createScopedStorage(getReadiedProxy),
    workspace: lifecycle.workspace,
    readDuplicateProjectFiles: createDuplicateProjectReader(fallback, whenServicesReady),
  };

  let opener = selectBridgeOpener(fileManagerRef);
  let owner = connections.ownerFor(opener);
  connections.install(owner);
  /* As the scope's callback: a new opener gives a new watch; the same one keeps it. */
  let watchRecordFile = createRecordWatch(opener ?? fallback, whenServicesReady);
  const build = (): ProjectLibraryFileManager => ({
    ...fixed,
    recordFiles: owner.files('working-copy'),
    watchRecordFile,
    workerChangeChannel: fileManagerRef.getSnapshot().context.workerChangeChannel,
  });
  let current = build();
  const changes = new Topic<void>({ name: 'root-file-facade' });

  /* A reconnect or re-root publishes a new opener: the replacement owner is installed, which releases the replaced
   * one, and the watch opens on the new opener. A new change channel is the manifest watch's to follow. */
  const subscription = fileManagerRef.subscribe((snapshot) => {
    const { openFileSystemBridge, workerChangeChannel } = snapshot.context;
    if (openFileSystemBridge === opener && workerChangeChannel === current.workerChangeChannel) {
      return;
    }
    if (openFileSystemBridge !== opener) {
      opener = openFileSystemBridge;
      watchRecordFile = createRecordWatch(opener ?? fallback, whenServicesReady);
      const next = connections.ownerFor(opener);
      if (next !== owner) {
        owner = next;
        connections.install(next);
      }
    }
    current = build();
    changes.emit(undefined);
  });

  let closed = false;
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    workingCopyFiles: {
      get: () => owner.files('working-copy'),
      subscribe: (listener) => changes.subscribe(listener),
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      subscription.unsubscribe();
      changes.dispose();
      closeRootSync();
    },
  };
}
