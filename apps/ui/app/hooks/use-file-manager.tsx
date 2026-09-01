import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import type { FileTreeEntry, FileSystemBackend, FileStatEntry, FileStat } from '@taucad/types';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import type { BulkMoveEdit, BulkMoveResult, FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { MountConfig, WorkspaceMutationError } from '@taucad/filesystem';
import { setProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { WorkspaceUnavailableReason } from '#machines/file-manager.machine.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { FileManagerNotReadyError } from '#filesystem/workspace-errors.js';

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
  | 'readFiles'
  | 'writeFile'
  | 'writeFiles'
  | 'mkdir'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'rename'
  | 'move'
  | 'bulkMove'
  | 'canMove'
  | 'canRename'
  | 'canCreate'
  | 'canDelete'
  | 'unlink'
  | 'rmdir'
  | 'exists'
  | 'batchExists'
  | 'ensureDirectoryExists'
  | 'getDirectoryStat'
  | 'getDirectoryContents'
  | 'duplicateFile'
  | 'copyDirectory'
  | 'getZippedDirectory'
  | 'readShallowDirectory'
  | 'readDirectory'
>;

/**
 * Workspace lifecycle facade. Groups admin operations that are not
 * per-call FS dispatch — mount/unmount and standalone-provider
 * invalidation. Each call gates on the FM machine becoming `ready`.
 *
 * @public
 */
export type WorkspaceFacade = {
  mount: (prefix: string, config: MountConfig) => Promise<void>;
  unmount: (prefix: string) => void;
  /**
   * Drop the cached standalone provider for the supplied backend /
   * workspace pair. Used by `/files` "Change Folder" and recovery
   * binding so the next standalone call picks up the new handle.
   */
  invalidateStandaloneProvider: (
    backend: 'webaccess' | 'indexeddb' | 'opfs' | 'memory',
    workspaceId?: string,
  ) => Promise<void>;
};

type FileManagerContextType = {
  fileManagerRef: FileManagerRef;
  backendType: FileSystemBackend;
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
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
  moveFile: (source: string, target: string, options?: { overwrite?: boolean }) => Promise<void>;
  /**
   * Move many paths in a single batch. On mid-flight failure every prior
   * move within this batch is reversed by the worker so the workspace
   * returns to the pre-batch state. See {@link BulkMoveResult}.
   */
  bulkMove: (edits: readonly BulkMoveEdit[], options?: { overwrite?: boolean }) => Promise<BulkMoveResult>;
  /**
   * Preflight {@link moveFile}. Returns `true` if safe to issue, or a
   * structured {@link WorkspaceMutationError} otherwise. Use to gate UI
   * actions (drag/drop, rename) on a typed error code rather than
   * letting the mutation fail with a less actionable message.
   */
  canMove: (
    source: string,
    target: string,
    options?: { overwrite?: boolean },
  ) => Promise<true | WorkspaceMutationError>;
  /**
   * Preflight rename within a single parent directory.
   */
  canRename: (source: string, newName: string) => Promise<true | WorkspaceMutationError>;
  /**
   * Preflight create (`'file'` for `writeFile`, `'directory'` for `mkdir`).
   */
  canCreate: (path: string, kind: 'file' | 'directory') => Promise<true | WorkspaceMutationError>;
  /**
   * Preflight delete (`unlink` for files, `rmdir` for directories).
   */
  canDelete: (path: string) => Promise<true | WorkspaceMutationError>;
  /**
   * Create a directory through the worker mount. Pass `{ recursive: true }`
   * to create intermediate directories.
   */
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  /**
   * Remove a directory through the worker mount. Pass `{ recursive: true }`
   * to drop a non-empty subtree (mount-routed; no scope required for the
   * default workspace).
   */
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
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
 * deterministically. The cookie used to be consulted inside the hook;
 * that read now lives in `apps/ui/app/root.tsx` where the policy
 * decision is centralized.
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
    },
  });

  const rootDirectoryRef = useRef(rootDirectory);
  rootDirectoryRef.current = rootDirectory;

  useEffect(() => {
    fileManagerRef.send({ type: 'setRoot', path: rootDirectory, projectId });
  }, [fileManagerRef, rootDirectory, projectId]);

  const contentService = useSelector(fileManagerRef, (state) => state.context.contentService);
  const treeService = useSelector(fileManagerRef, (state) => state.context.treeService);
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
      await setProjectFileSystemConfig({ projectId, backend: 'webaccess', workspaceId });

      // Drop the worker-side standalone cache before reload (Audit R6
      // / Finding 9). The previous workspace's cached provider must go
      // — otherwise a stale `FileSystemAccessProvider` keyed by the
      // old `workspaceId` keeps serving reads against a handle the
      // user has swapped away from. We also invalidate the new
      // workspaceId so a freshly-granted handle replaces any cached
      // provider that was created while permission was missing.
      const snapshot = fileManagerRef.getSnapshot();
      const { proxy } = snapshot.context;
      if (proxy) {
        if (previousWorkspaceId && previousWorkspaceId !== workspaceId) {
          proxy.invalidateStandaloneProvider('webaccess', previousWorkspaceId);
        }
        proxy.invalidateStandaloneProvider('webaccess', workspaceId);
      }

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
    async (source: string, target: string, options?: { overwrite?: boolean }): Promise<void> => {
      if (source === target) {
        return;
      }
      const { contentService } = await whenServicesReady();
      await contentService.move(source, target, options);
    },
    [whenServicesReady],
  );

  const bulkMove = useCallback(
    async (edits: readonly BulkMoveEdit[], options?: { overwrite?: boolean }): Promise<BulkMoveResult> => {
      if (edits.length === 0) {
        return { moved: [], failed: [] };
      }
      const { contentService } = await whenServicesReady();
      return contentService.bulkMove(edits, options);
    },
    [whenServicesReady],
  );

  const canMove = useCallback(
    async (
      source: string,
      target: string,
      options?: { overwrite?: boolean },
    ): Promise<true | WorkspaceMutationError> => {
      const { contentService } = await whenServicesReady();
      return contentService.canMove(source, target, options);
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

  const mkdir = useCallback(
    async (path: string, options?: { recursive?: boolean }): Promise<void> => {
      const proxy = await getReadiedProxy();
      await proxy.mkdir(path, options);
    },
    [getReadiedProxy],
  );

  const rmdir = useCallback(
    async (path: string, options?: { recursive?: boolean }): Promise<void> => {
      const proxy = await getReadiedProxy();
      await proxy.rmdir(path, options);
    },
    [getReadiedProxy],
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
      readFiles: gated('readFiles'),
      writeFile: gated('writeFile'),
      writeFiles: gated('writeFiles'),
      mkdir: gated('mkdir'),
      readdir: gated('readdir'),
      stat: gated('stat'),
      lstat: gated('lstat'),
      rename: gated('rename'),
      move: gated('move'),
      bulkMove: gated('bulkMove'),
      canMove: gated('canMove'),
      canRename: gated('canRename'),
      canCreate: gated('canCreate'),
      canDelete: gated('canDelete'),
      unlink: gated('unlink'),
      rmdir: gated('rmdir'),
      exists: gated('exists'),
      batchExists: gated('batchExists'),
      ensureDirectoryExists: gated('ensureDirectoryExists'),
      getDirectoryStat: gated('getDirectoryStat'),
      getDirectoryContents: gated('getDirectoryContents'),
      duplicateFile: gated('duplicateFile'),
      copyDirectory: gated('copyDirectory'),
      getZippedDirectory: gated('getZippedDirectory'),
      readShallowDirectory: gated('readShallowDirectory'),
      readDirectory: gated('readDirectory'),
    };
  }, [getReadiedProxy]);

  const workspace = useMemo<WorkspaceFacade>(
    () => ({
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
      invalidateStandaloneProvider: async (backend, workspaceId) => {
        const proxy = await getReadiedProxy();
        proxy.invalidateStandaloneProvider(backend, workspaceId);
      },
    }),
    [getReadiedProxy, fileManagerRef, workspaceTelemetry],
  );

  const value = useMemo<FileManagerContextType>(
    () => ({
      fileManagerRef,
      backendType,
      contentService,
      treeService,
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
      mkdir,
      rmdir,
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
    }),
    [
      fileManagerRef,
      backendType,
      contentService,
      treeService,
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
      mkdir,
      rmdir,
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
export function useFileTree(): FileTreeEntry[] | undefined {
  const { treeService } = useFileManager();

  if (!treeService) {
    return undefined;
  }

  const tree = treeService.getTreeSnapshot();
  if (tree.size === 0) {
    return undefined;
  }

  return [...tree.values()].map(({ path, name, type, size }) => ({
    path,
    name,
    type,
    size,
  }));
}
