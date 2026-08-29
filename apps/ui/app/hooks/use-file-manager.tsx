import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import type { FileSystemBackend, FileStatEntry, FileStat } from '@taucad/types';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import type { BulkMoveEdit, BulkMoveResult, FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { MountConfig, WorkspaceMutationError } from '@taucad/filesystem';
import {
  disconnectWorkspace as disconnectStoredWorkspace,
  getHomeStorageBackend,
  getProjectRootConfigs,
  restoreWorkspaceHandle as restoreStoredWorkspaceHandle,
  setProjectFileSystemConfig,
  updateWorkspaceHandle,
} from '#filesystem/handle-store.js';
import type { HomeStorageBackend, WorkspaceEntry } from '#filesystem/handle-store.js';
import type { WorkspaceUnavailableReason } from '#machines/file-manager.machine.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { FileManagerNotReadyError } from '#filesystem/workspace-errors.js';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';

type FileManagerSnapshot = SnapshotFrom<typeof fileManagerMachine>;

/**
 * Default timeout for {@link waitForFileManagerServices} and the proxy
 * gate inside `useFileManager`. Closes Finding 8 of the explicit-
 * workspace blueprint — without a timeout the hook hangs the whole UI
 * (chat composer, project creation) when the FM machine gets stuck in
 * `connectingWorker`/`initializingServices`. 30s matches the worker
 * boot budget tracked in `runtime-blueprint-v5-implementation-audit`.
 */
export const fileManagerReadyTimeout = 30_000;

function createErrorAwareWaitPredicate(
  predicate: (state: FileManagerSnapshot) => boolean,
): (state: FileManagerSnapshot) => boolean {
  return (state: FileManagerSnapshot) => {
    if (state.matches('error')) {
      return true;
    }

    return predicate(state);
  };
}

function assertNotErrorState(snapshot: FileManagerSnapshot): void {
  if (snapshot.matches('error')) {
    throw new FileManagerNotReadyError('machine-error', { cause: snapshot.context.error });
  }
}

export async function waitForFileManagerServices(
  fileManagerRef: FileManagerRef,
  options?: {
    /** Milliseconds. */
    readyTimeout?: number;
  },
): Promise<{ contentService: FileContentService; treeService: FileTreeService }> {
  const snapshot = fileManagerRef.getSnapshot();
  const { contentService: content, treeService: tree } = snapshot.context;
  if (content && tree) {
    return { contentService: content, treeService: tree };
  }

  const settled = await waitForWithTimeout({
    fileManagerRef,
    predicate: createErrorAwareWaitPredicate(
      (state) => state.context.contentService !== undefined && state.context.treeService !== undefined,
    ),
    readyTimeout: options?.readyTimeout ?? fileManagerReadyTimeout,
    reason: 'services-timeout',
  });
  assertNotErrorState(settled);
  const readyContent = settled.context.contentService;
  const readyTree = settled.context.treeService;
  if (!readyContent || !readyTree) {
    throw new FileManagerNotReadyError('services-timeout');
  }

  return { contentService: readyContent, treeService: readyTree };
}

type WaitForWithTimeoutOptions = {
  readonly fileManagerRef: FileManagerRef;
  readonly predicate: (state: FileManagerSnapshot) => boolean;
  /** Milliseconds. */
  readonly readyTimeout: number;
  readonly reason: 'proxy-timeout' | 'services-timeout';
};

async function waitForWithTimeout({
  fileManagerRef,
  predicate,
  readyTimeout,
  reason,
}: WaitForWithTimeoutOptions): Promise<FileManagerSnapshot> {
  return Promise.race([
    waitFor(fileManagerRef, predicate),
    new Promise<FileManagerSnapshot>((_resolve, reject) => {
      const id = setTimeout(() => {
        reject(new FileManagerNotReadyError(reason));
      }, readyTimeout);
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- access guarded below
      const unrefable = id as unknown as { unref?: () => void };
      unrefable.unref?.();
    }),
  ]);
}

type WriteFileOptions = {
  source: FileWriteSource;
};

type DeleteFileOptions = {
  source: FileWriteSource;
};

/**
 * Typed proxy dispatch facade. Mirrors the worker {@link FileSystemClient}
 * one-to-one. Each method gates on the FM machine becoming `ready`
 * before forwarding to the worker — no per-method `useCallback`
 * ceremony.
 *
 * Use this surface for:
 *
 * - **Cross-workspace writes** that target prefixes outside this provider's
 *   `rootDirectory`. Keys are interpreted in the worker's filesystem
 *   namespace and routed by the mount table (longest-prefix match), so
 *   absolute paths like `/projects/<id>/main.scad` land in the matching
 *   mounted backend regardless of the FM provider's scope. This is the
 *   documented escape hatch for the project bootstrap mount-write-unmount
 *   transaction in `use-project-manager.tsx` — passing absolute keys
 *   through the cache-bound `writeFile`/`writeFiles` callbacks below would
 *   trip `WorkspaceScopeViolationError` (and previously spammed the tree
 *   service with `WorkspacePathEscapeError`).
 * - **Cache-free / scope-routed reads** for `/files`-style cross-workspace
 *   dispatch and admin tooling.
 *
 * The cache-bound editor flows continue to use the dedicated `readFile` /
 * `writeFile` / `renameFile` callbacks below; those enforce workspace-
 * relative keys at the boundary.
 *
 * @public
 */
export type FileSystemClientFacade = Pick<
  FileSystemClient,
  | 'readFile'
  | 'writeFile'
  | 'writeFiles'
  | 'mkdir'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'move'
  | 'bulkMove'
  | 'canMove'
  | 'canRename'
  | 'canCreate'
  | 'canDelete'
  | 'unlink'
  | 'rmdir'
  | 'exists'
  | 'getDirectoryStat'
  | 'getDirectoryContents'
  | 'duplicateFile'
  | 'copyDirectory'
  | 'getZippedDirectory'
  | 'readShallowDirectory'
  | 'readDirectory'
  | 'listProjectManifests'
  | 'commitPendingProjectDirectory'
  | 'permanentlyDeleteProjectDirectory'
  | 'adoptProjectDirectory'
>;

/**
 * Workspace lifecycle facade. Groups admin operations that are not
 * per-call FS dispatch — mount/unmount and standalone-provider
 * invalidation. Ordinary calls gate on `ready`; handle replacement also
 * accepts the connected worker in `webAccessUnavailable` so recovery can run.
 *
 * @public
 */
export type WorkspaceFacade = {
  mount: (prefix: string, config: MountConfig) => Promise<void>;
  unmount: (prefix: string) => void;
  /** Dispose a physical storage root after an explicit handle rebind. */
  disposeStorageRoot: (storageRootKey: string) => Promise<void>;
  /** Push the persisted locator set to the worker after a config change. */
  syncProjectRoots: () => Promise<void>;
  /** Replace a workspace handle and synchronize this tab before resolving. */
  replaceWorkspaceHandle: (workspaceId: string, handle: FileSystemDirectoryHandle) => Promise<void>;
  /** Remove retained folder authority while preserving workspace identity and project bindings. */
  disconnectWorkspace: (workspaceId: string) => Promise<WorkspaceEntry | undefined>;
  /** Restore an Undo handle only while the workspace remains disconnected. */
  restoreWorkspaceHandle: (workspaceId: string, handle: FileSystemDirectoryHandle) => Promise<boolean>;
};

type FileManagerContextType = {
  fileManagerRef: FileManagerRef;
  backendType: FileSystemBackend;
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
  workerChangeChannel: WorkerChangeChannel | undefined;
  /** Resolves once both content and tree facades are bound (or rejects if the machine enters `error`). */
  whenServicesReady: () => Promise<{ contentService: FileContentService; treeService: FileTreeService }>;
  /**
   * Write a single file through the per-FM `FileContentService` cache.
   *
   * `path` **MUST** be workspace-relative to this provider's
   * `rootDirectory`; absolute keys that escape the workspace root throw
   * `WorkspaceScopeViolationError` synchronously. Use `client.writeFile`
   * for cross-workspace writes (worker namespace, no resolver).
   */
  writeFile: (path: string, data: Uint8Array<ArrayBuffer>, options: WriteFileOptions) => Promise<void>;
  /**
   * Write multiple files through the per-FM `FileContentService` cache.
   *
   * Map keys **MUST** be workspace-relative to this provider's
   * `rootDirectory`; absolute keys that escape the workspace root throw
   * `WorkspaceScopeViolationError` synchronously. Use `client.writeFiles`
   * for cross-workspace bootstrap (mount-write-unmount transactions).
   */
  writeFiles: (files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  /**
   * Move a file or directory through the per-FM `FileContentService` cache.
   * Directory-aware: every cached descendant is re-keyed and republished as a
   * single batch so editor surfaces never observe an inconsistent view.
   *
   * Both arguments **MUST** be workspace-relative to this provider's
   * `rootDirectory`; absolute keys that escape the workspace root throw
   * `WorkspaceScopeViolationError` synchronously.
   */
  moveFile: (source: string, target: string) => Promise<void>;
  /**
   * Move many paths sequentially and report each completed or failed edit.
   */
  bulkMove: (edits: readonly BulkMoveEdit[]) => Promise<BulkMoveResult>;
  /**
   * Preflight {@link moveFile}. Returns `true` if safe to issue, or a
   * structured {@link WorkspaceMutationError} otherwise. Use to gate UI
   * actions (drag/drop, rename) on a typed error code rather than
   * letting the mutation fail with a less actionable message.
   */
  canMove: (source: string, target: string) => Promise<true | WorkspaceMutationError>;
  /**
   * Preflight rename within a single parent directory.
   */
  canRename: (source: string, newName: string) => Promise<true | WorkspaceMutationError>;
  /**
   * Preflight create (`'file'` for `writeFile`, `'directory'` for `createDirectory`).
   */
  canCreate: (path: string, kind: 'file' | 'directory') => Promise<true | WorkspaceMutationError>;
  /**
   * Preflight delete (`deleteFile` for files, `deleteDirectory` for directories).
   */
  canDelete: (path: string) => Promise<true | WorkspaceMutationError>;
  /**
   * Create a directory through the project-scoped content facade.
   */
  createDirectory: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  /**
   * Remove a directory through the project-scoped content facade.
   */
  deleteDirectory: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  duplicateFile: (sourcePath: string, destinationPath: string) => Promise<void>;
  deleteFile: (path: string, options: DeleteFileOptions) => Promise<void>;
  stat: (path: string) => Promise<FileStat>;
  exists: (path: string) => Promise<boolean>;
  readdir: (path: string) => Promise<string[]>;
  getDirectoryStat: (path: string) => Promise<FileStatEntry[]>;
  getZippedDirectory: (path: string) => Promise<Blob>;
  copyDirectory: (sourcePath: string, destinationPath: string) => Promise<void>;
  /**
   * Typed proxy dispatch facade. Use for cache-free reads/writes and
   * cross-workspace operations whose keys lie outside this provider's
   * `rootDirectory` (e.g. the project bootstrap mount-write-unmount
   * transaction in `use-project-manager.tsx`, which writes
   * `/projects/<id>/...` keys through the root FM at `/`). Routes through
   * the worker mount table by absolute path prefix — backend selection
   * (indexeddb / webaccess with handle+workspaceId / opfs / memory) is
   * owned by the mount registration, never by the write call.
   */
  client: FileSystemClientFacade;
  /**
   * Workspace lifecycle facade (mount, unmount, invalidate cached
   * standalone providers).
   */
  workspace: WorkspaceFacade;
  /**
   * Human label for the workspace currently driving the FM machine,
   * sourced from machine context (closes Audit F14 — no more stale IDB
   * reads). `undefined` for non-webaccess backends.
   */
  activeWorkspaceName: string | undefined;
  /** Active workspace `wsp_*` id, or `undefined` when not webaccess. */
  activeWorkspaceId: string | undefined;
  /**
   * Why webaccess can't be initialized (handle missing or permission
   * revoked), or `undefined` when the backend is healthy. Drives the
   * `ProjectUnavailableOverlay` recovery branch (R8).
   */
  unavailableReason: WorkspaceUnavailableReason | undefined;
  /**
   * Bind the current project to a workspace as a single transaction:
   * write the persistent `ProjectFileSystemConfig.workspaceId` row first,
   * then dispatch `reloadWorkspace` so the FM machine re-reads it from
   * IDB. The persistent record is the only authority for the project ↔
   * workspace binding — the machine never carries that identity as
   * ambient state. Rejects when called outside a project route
   * (`projectId === undefined`).
   */
  bindProjectToWorkspace: (workspaceId: string) => Promise<void>;
  /** Opaque, fully writable filesystem rooted at this provider's project. */
  runtimeFileSystem: RuntimeFileSystem;
};

const FileManagerContext = createContext<FileManagerContextType | undefined>(undefined);

const SharedWorkerContext = createContext<Worker | undefined>(undefined);

/**
 * Carries the root FileManagerProvider's file-pool SharedArrayBuffer down to
 * nested providers. Nested machines reuse this SAB instead of allocating
 * their own 50 MiB pool, avoiding duplicate `postMessage({ type: 'filePool' })`
 * traffic to the shared worker.
 */
const SharedFilePoolBufferContext = createContext<SharedArrayBuffer | undefined>(undefined);

const HomeStorageBackendContext = createContext<HomeStorageBackend | undefined>(undefined);

/** Physical engine selected for the system-owned Home workspace. */
export function useHomeStorageBackend(): HomeStorageBackend {
  const backend = useContext(HomeStorageBackendContext);
  if (!backend) {
    throw new Error('useHomeStorageBackend must be used within HomeFileManagerProvider');
  }
  return backend;
}

/**
 * Gate component that defers rendering until the parent FileManagerProvider's
 * worker is available via SharedWorkerContext. Prevents nested
 * FileManagerProviders from creating duplicate workers during the window
 * between root mount and root worker initialization.
 */
export function SharedWorkerGate({ children }: { readonly children: ReactNode }): React.ReactNode | undefined {
  const worker = useContext(SharedWorkerContext);

  if (!worker) {
    return undefined;
  }

  return children;
}

/**
 * Common props shared by every {@link FileManagerProvider} mount.
 * `initialBackend` is required (Audit R4 / Finding 7) — the call site
 * must commit to a backend explicitly so the FM machine can bootstrap
 * deterministically. Product mount sites use {@link HomeFileManagerProvider}
 * so the profile's pinned Home engine is resolved once at the app root.
 */
type FileManagerProviderCommonProps = {
  readonly children: ReactNode;
  readonly rootDirectory: string;
  readonly shouldInitializeOnStart?: boolean;
};

/**
 * Discriminated provider props that compile-time-reject `webaccess`
 * mounts without a `projectId` (Audit R15). A workspace-bound
 * (webaccess) FM provider only makes sense inside a project route; the
 * type system surfaces violations as `TS2322` instead of failing at
 * runtime once the worker tries to mount.
 */
export type FileManagerProviderProps = FileManagerProviderCommonProps &
  (
    | { readonly initialBackend: 'webaccess'; readonly projectId: string }
    | {
        readonly initialBackend: 'indexeddb' | 'opfs' | 'memory';
        readonly projectId?: string;
      }
  );

export type HomeFileManagerProviderProps = FileManagerProviderCommonProps & {
  readonly projectId?: string;
};

/** Resolve Home once at the app root and reuse that engine at every nested mount. */
export function HomeFileManagerProvider({
  children,
  rootDirectory,
  projectId,
  shouldInitializeOnStart,
}: HomeFileManagerProviderProps): React.JSX.Element {
  const inheritedBackend = useContext(HomeStorageBackendContext);
  const [resolvedBackend, setResolvedBackend] = useState<HomeStorageBackend>();
  const backend = inheritedBackend ?? resolvedBackend;

  useEffect(() => {
    if (inheritedBackend) {
      return;
    }
    const controller = new AbortController();
    // async-iife: bootstrap
    void (async () => {
      const backend = await getHomeStorageBackend();
      if (!controller.signal.aborted) {
        setResolvedBackend(backend);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [inheritedBackend]);

  if (!backend) {
    return <div role='status' aria-label='Opening Home' />;
  }

  const fileManager = (
    <FileManagerProvider
      rootDirectory={rootDirectory}
      initialBackend={backend}
      {...(projectId === undefined ? {} : { projectId })}
      {...(shouldInitializeOnStart === undefined ? {} : { shouldInitializeOnStart })}
    >
      {children}
    </FileManagerProvider>
  );

  return inheritedBackend ? (
    fileManager
  ) : (
    <HomeStorageBackendContext.Provider value={backend}>{fileManager}</HomeStorageBackendContext.Provider>
  );
}

export function FileManagerProvider({
  children,
  rootDirectory,
  projectId,
  initialBackend,
  shouldInitializeOnStart = true,
}: FileManagerProviderProps): React.JSX.Element {
  const parentWorker = useContext(SharedWorkerContext);
  const parentFilePoolBuffer = useContext(SharedFilePoolBufferContext);

  const workspaceTelemetry = useWorkspaceTelemetry();

  const fileManagerRef = useActorRef(fileManagerMachine, {
    input: {
      rootDirectory,
      shouldInitializeOnStart,
      initialBackend,
      projectId,
      sharedWorker: parentWorker,
      sharedFilePoolBuffer: parentFilePoolBuffer,
      onExternalPollTelemetry: workspaceTelemetry.workspaceExternalPoll,
      onRootSkipped: workspaceTelemetry.workspaceRootSkipped,
    },
  });

  const rootDirectoryRef = useRef(rootDirectory);
  rootDirectoryRef.current = rootDirectory;

  useEffect(() => {
    fileManagerRef.send({ type: 'setRoot', path: rootDirectory, projectId });
  }, [fileManagerRef, rootDirectory, projectId]);

  const contentService = useSelector(fileManagerRef, (state) => state.context.contentService);
  const treeService = useSelector(fileManagerRef, (state) => state.context.treeService);
  const workerChangeChannel = useSelector(fileManagerRef, (state) => state.context.workerChangeChannel);
  const backendType = useSelector(fileManagerRef, (state) => state.context.backendType);
  const activeWorkspaceId = useSelector(fileManagerRef, (state) => state.context.activeWorkspaceId);
  const activeWorkspaceName = useSelector(fileManagerRef, (state) => state.context.activeWorkspaceName);
  const unavailableReason = useSelector(fileManagerRef, (state) => state.context.unavailableReason);

  const bindProjectToWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      if (!projectId) {
        throw new Error('bindProjectToWorkspace requires a project scope (provider mounted without projectId)');
      }
      const previousWorkspaceId = fileManagerRef.getSnapshot().context.activeWorkspaceId;

      // Drop the worker-side standalone cache before reload (Audit R6
      // / Finding 9). The previous workspace's cached provider must go
      // — otherwise a stale `FileSystemAccessProvider` keyed by the
      // old `workspaceId` keeps serving reads against a handle the
      // user has swapped away from. We also invalidate the new
      // workspaceId so a freshly-granted handle replaces any cached
      // provider that was created while permission was missing.
      const snapshot = fileManagerRef.getSnapshot();
      const { proxy } = snapshot.context;
      if (!proxy) {
        throw new Error('File manager is not ready');
      }

      if (previousWorkspaceId && previousWorkspaceId !== workspaceId) {
        proxy.disposeStorageRoot(`webaccess:${previousWorkspaceId}`);
      }
      proxy.disposeStorageRoot(`webaccess:${workspaceId}`);
      await proxy.configureProjectRoots(await getProjectRootConfigs());
      const discovery = await proxy.listProjectManifests();
      const matches = discovery.entries.filter(
        (entry) =>
          entry.status === 'valid' &&
          entry.manifest.id === projectId &&
          entry.locator.backend === 'webaccess' &&
          entry.locator.workspaceId === workspaceId,
      );
      if (matches.length !== 1) {
        throw new Error(`Workspace must contain exactly one valid manifest for project ${projectId}`);
      }
      const match = matches[0]!;
      await setProjectFileSystemConfig({
        projectId,
        backend: 'webaccess',
        workspaceId,
        providerBasePath: match.locator.relativeDirectory,
      });
      await proxy.configureProjectRoots(await getProjectRootConfigs());

      workspaceTelemetry.workspaceSwap({ previousWorkspaceId, nextWorkspaceId: workspaceId });
      fileManagerRef.send({ type: 'reloadWorkspace' });
    },
    [fileManagerRef, projectId, workspaceTelemetry],
  );

  useEffect(() => {
    if (unavailableReason === 'permission' && activeWorkspaceId) {
      workspaceTelemetry.workspacePermissionRevoked({ workspaceId: activeWorkspaceId });
    }
    if (unavailableReason) {
      workspaceTelemetry.workspaceOpenFailed({
        workspaceId: activeWorkspaceId,
        reason: unavailableReason,
      });
    }
  }, [activeWorkspaceId, unavailableReason, workspaceTelemetry]);

  /**
   * Wait for the FM machine to enter `ready` and return the typed
   * worker proxy. Backs the `client` and `workspace` facades exposed
   * on the hook value.
   */
  const getReadiedProxy = useCallback(async (): Promise<FileManagerProxy> => {
    const snapshot = await waitForWithTimeout({
      fileManagerRef,
      predicate: createErrorAwareWaitPredicate((state) => state.matches('ready')),
      readyTimeout: fileManagerReadyTimeout,
      reason: 'proxy-timeout',
    });

    assertNotErrorState(snapshot);

    const { proxy } = snapshot.context;
    if (!proxy) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }

    return proxy;
  }, [fileManagerRef]);

  const whenServicesReady = useCallback(async () => {
    return waitForFileManagerServices(fileManagerRef);
  }, [fileManagerRef]);

  const openRootedFileSystemBridge = useCallback(
    (root: string) => {
      const opener = fileManagerRef.getSnapshot().context.openFileSystemBridge;
      if (!opener) {
        throw new FileManagerNotReadyError('proxy-timeout', {
          cause: new Error('File Manager filesystem bridge is not ready.'),
        });
      }
      return opener(root);
    },
    [fileManagerRef],
  );

  const runtimeFileSystem = useMemo(
    () => fromFileSystemBridge(() => openRootedFileSystemBridge(rootDirectory)),
    // A successful service initialization is the host's existing binding
    // identity. Rotating the opaque filesystem here makes every owner keyed
    // by RuntimeFileSystem identity capture the replacement mount instead of
    // trying to retarget an already-materialized rooted capability.
    [contentService, openRootedFileSystemBridge, rootDirectory],
  );

  const writeFile = useCallback(
    async (path: string, data: Uint8Array<ArrayBuffer>, options: WriteFileOptions): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.write(path, data, options.source);
    },
    [whenServicesReady],
  );

  const writeFiles = useCallback(
    async (files: Record<string, { content: Uint8Array<ArrayBuffer> }>): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.writeFiles(files, 'machine');
    },
    [whenServicesReady],
  );

  const readFile = useCallback(
    async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      const { contentService } = await whenServicesReady();
      return contentService.resolveBytes(path);
    },
    [whenServicesReady],
  );

  const renameFile = useCallback(
    async (oldPath: string, newPath: string): Promise<void> => {
      if (oldPath === newPath) {
        return;
      }
      const { contentService } = await whenServicesReady();
      await contentService.move(oldPath, newPath);
    },
    [whenServicesReady],
  );

  const moveFile = useCallback(
    async (source: string, target: string): Promise<void> => {
      if (source === target) {
        return;
      }
      const { contentService } = await whenServicesReady();
      await contentService.move(source, target);
    },
    [whenServicesReady],
  );

  const bulkMove = useCallback(
    async (edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult> => {
      if (edits.length === 0) {
        return { moved: [], failed: [] };
      }
      const { contentService } = await whenServicesReady();
      return contentService.bulkMove(edits);
    },
    [whenServicesReady],
  );

  const canMove = useCallback(
    async (source: string, target: string): Promise<true | WorkspaceMutationError> => {
      const { contentService } = await whenServicesReady();
      return contentService.canMove(source, target);
    },
    [whenServicesReady],
  );

  const canRename = useCallback(
    async (source: string, newName: string): Promise<true | WorkspaceMutationError> => {
      const { contentService } = await whenServicesReady();
      return contentService.canRename(source, newName);
    },
    [whenServicesReady],
  );

  const canCreate = useCallback(
    async (path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> => {
      const { contentService } = await whenServicesReady();
      return contentService.canCreate(path, kind);
    },
    [whenServicesReady],
  );

  const canDelete = useCallback(
    async (path: string): Promise<true | WorkspaceMutationError> => {
      const { contentService } = await whenServicesReady();
      return contentService.canDelete(path);
    },
    [whenServicesReady],
  );

  const createDirectory = useCallback(
    async (path: string, options?: { recursive?: boolean }): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.createDirectory(path, options);
    },
    [whenServicesReady],
  );

  const deleteDirectory = useCallback(
    async (path: string, options?: { recursive?: boolean }): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.deleteDirectory(path, options);
    },
    [whenServicesReady],
  );

  const duplicateFile = useCallback(
    async (sourcePath: string, destinationPath: string): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.duplicate(sourcePath, destinationPath);
    },
    [whenServicesReady],
  );

  const deleteFile = useCallback(
    async (path: string, options: DeleteFileOptions): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.delete(path, options.source);
    },
    [whenServicesReady],
  );

  const exists = useCallback(
    async (path: string): Promise<boolean> => {
      const { treeService } = await whenServicesReady();
      return treeService.exists(path);
    },
    [whenServicesReady],
  );

  const readdir = useCallback(
    async (path: string): Promise<string[]> => {
      const { treeService } = await whenServicesReady();
      const entries = await treeService.listDirectory(path);
      return entries.map((entry) => entry.name);
    },
    [whenServicesReady],
  );

  const stat = useCallback(
    async (path: string): Promise<FileStat> => {
      const { treeService } = await whenServicesReady();
      return treeService.stat(path);
    },
    [whenServicesReady],
  );

  const getDirectoryStat = useCallback(
    async (path: string): Promise<FileStatEntry[]> => {
      const { treeService } = await whenServicesReady();
      return treeService.getDirectoryStat(path);
    },
    [whenServicesReady],
  );

  const getZippedDirectory = useCallback(
    async (path: string): Promise<Blob> => {
      const { contentService } = await whenServicesReady();
      return contentService.getZippedDirectory(path);
    },
    [whenServicesReady],
  );

  const copyDirectory = useCallback(
    async (sourcePath: string, destinationPath: string): Promise<void> => {
      const { contentService } = await whenServicesReady();
      await contentService.copyDirectory(sourcePath, destinationPath);
    },
    [whenServicesReady],
  );

  const client = useMemo<FileSystemClientFacade>(() => {
    const gated = <K extends keyof FileSystemClientFacade>(method: K): FileSystemClientFacade[K] =>
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- pass-through gate, runtime types preserved by FileSystemClientFacade
      (async (...args: unknown[]) => {
        const proxy = await getReadiedProxy();
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- forward through to the typed proxy method
        return (proxy[method] as (...rest: unknown[]) => unknown)(...args);
      }) as FileSystemClientFacade[K];

    return {
      readFile: gated('readFile'),
      writeFile: gated('writeFile'),
      writeFiles: gated('writeFiles'),
      mkdir: gated('mkdir'),
      readdir: gated('readdir'),
      stat: gated('stat'),
      lstat: gated('lstat'),
      move: gated('move'),
      bulkMove: gated('bulkMove'),
      canMove: gated('canMove'),
      canRename: gated('canRename'),
      canCreate: gated('canCreate'),
      canDelete: gated('canDelete'),
      unlink: gated('unlink'),
      rmdir: gated('rmdir'),
      exists: gated('exists'),
      getDirectoryStat: gated('getDirectoryStat'),
      getDirectoryContents: gated('getDirectoryContents'),
      duplicateFile: gated('duplicateFile'),
      copyDirectory: gated('copyDirectory'),
      getZippedDirectory: gated('getZippedDirectory'),
      readShallowDirectory: gated('readShallowDirectory'),
      readDirectory: gated('readDirectory'),
      listProjectManifests: gated('listProjectManifests'),
      commitPendingProjectDirectory: gated('commitPendingProjectDirectory'),
      permanentlyDeleteProjectDirectory: gated('permanentlyDeleteProjectDirectory'),
      adoptProjectDirectory: gated('adoptProjectDirectory'),
    };
  }, [getReadiedProxy]);

  const workspace = useMemo<WorkspaceFacade>(() => {
    const configurePersistedRoots = async (): Promise<void> => {
      const [proxy, services, configuration] = await Promise.all([
        getReadiedProxy(),
        whenServicesReady(),
        getProjectRootConfigs(),
      ]);
      await proxy.configureProjectRoots(configuration);
      if (configuration.roots.some(({ backend }) => backend === 'webaccess')) {
        services.treeService.startPolling();
      } else {
        services.treeService.stopPolling();
      }
    };
    return {
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
            const snapshot = fileManagerRef.getSnapshot();
            workspaceTelemetry.workspaceUnmountFailed({
              workspaceId: snapshot.context.activeWorkspaceId,
              prefix,
              reason: 'dispose-failed',
            });
            console.warn(`[FileManager] unmount('${prefix}') failed`, error);
          }
        })();
      },
      disposeStorageRoot: async (storageRootKey) => {
        const proxy = await getReadiedProxy();
        proxy.disposeStorageRoot(storageRootKey);
      },
      syncProjectRoots: async () => {
        await configurePersistedRoots();
      },
      replaceWorkspaceHandle: async (workspaceId, handle) => {
        const snapshot = await waitForWithTimeout({
          fileManagerRef,
          predicate: createErrorAwareWaitPredicate((state) => state.context.proxy !== undefined),
          readyTimeout: fileManagerReadyTimeout,
          reason: 'proxy-timeout',
        });
        assertNotErrorState(snapshot);
        const { proxy } = snapshot.context;
        if (!proxy) {
          throw new FileManagerNotReadyError('proxy-timeout');
        }
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
          await configurePersistedRoots();
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
          await configurePersistedRoots();
        } catch (error) {
          console.warn('[FileManager] Workspace handle restored but root refresh failed', error);
        }
        return true;
      },
    };
  }, [getReadiedProxy, fileManagerRef, whenServicesReady, workspaceTelemetry]);

  const value = useMemo<FileManagerContextType>(
    () => ({
      fileManagerRef,
      backendType,
      contentService,
      treeService,
      workerChangeChannel,
      whenServicesReady,
      writeFile,
      writeFiles,
      readFile,
      renameFile,
      moveFile,
      bulkMove,
      canMove,
      canRename,
      canCreate,
      canDelete,
      createDirectory,
      deleteDirectory,
      duplicateFile,
      deleteFile,
      stat,
      exists,
      readdir,
      getDirectoryStat,
      getZippedDirectory,
      copyDirectory,
      client,
      workspace,
      activeWorkspaceName,
      activeWorkspaceId,
      unavailableReason,
      bindProjectToWorkspace,
      runtimeFileSystem,
    }),
    [
      fileManagerRef,
      backendType,
      contentService,
      treeService,
      workerChangeChannel,
      whenServicesReady,
      writeFile,
      writeFiles,
      readFile,
      renameFile,
      moveFile,
      bulkMove,
      canMove,
      canRename,
      canCreate,
      canDelete,
      createDirectory,
      deleteDirectory,
      duplicateFile,
      deleteFile,
      stat,
      exists,
      readdir,
      getDirectoryStat,
      getZippedDirectory,
      copyDirectory,
      client,
      workspace,
      activeWorkspaceName,
      activeWorkspaceId,
      unavailableReason,
      bindProjectToWorkspace,
      runtimeFileSystem,
    ],
  );

  const isRoot = parentWorker === undefined;
  const workerForChildren = useSelector(fileManagerRef, (state) => state.context.worker);
  const filePoolBufferForChildren = useSelector(fileManagerRef, (state) => state.context.filePoolBuffer);

  const provider = <FileManagerContext.Provider value={value}>{children}</FileManagerContext.Provider>;

  if (isRoot) {
    return (
      <SharedWorkerContext.Provider value={workerForChildren}>
        <SharedFilePoolBufferContext.Provider value={filePoolBufferForChildren}>
          {provider}
        </SharedFilePoolBufferContext.Provider>
      </SharedWorkerContext.Provider>
    );
  }

  return provider;
}

export function useFileManager(): FileManagerContextType {
  const context = useContext(FileManagerContext);
  if (context === undefined) {
    throw new Error('useFileManager must be used within a FileManagerProvider');
  }

  return context;
}

/**
 * Non-throwing variant of `useFileManager`. Returns `undefined` when called
 * outside a `FileManagerProvider` instead of throwing. Used by components
 * that optionally read from the file manager context (e.g. `FileSelector`).
 */
export function useOptionalFileManager(): FileManagerContextType | undefined {
  return useContext(FileManagerContext);
}

/**
 * Hook to get the current file tree as an array of file entries.
 * This is used to provide context to the LLM about the project structure.
 *
 * @returns Array of file entries, or undefined if the file manager is not ready
 */
