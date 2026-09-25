import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { OctagonAlert, RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { waitFor } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import type { FileSystemBackend, FileStatEntry, FileStat } from '@taucad/types';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import type {
  BulkMoveEdit,
  BulkMoveResult,
  FileSystemClient,
  ScopedStorageClient,
} from '@taucad/fs-client/file-system-client';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { createRootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { MountConfig, WorkspaceMutationError, WorkspaceScope } from '@taucad/filesystem';
import type { ContentExportFilter } from '@taucad/filesystem/content-ops';
import {
  disconnectWorkspace as disconnectStoredWorkspace,
  getHomeStorageBackend,
  getProjectRootConfigs,
  restoreWorkspaceHandle as restoreStoredWorkspaceHandle,
  setProjectFileSystemConfig,
  updateWorkspaceHandle,
} from '#filesystem/handle-store.js';
import type { HomeStorageBackend, WorkspaceEntry } from '#filesystem/handle-store.js';
import type { RootedBridgeConsumer } from '@taucad/fs-bridge';
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
    throw new FileManagerNotReadyError('machine-error', {
      cause: snapshot.context.error,
    });
  }
}

export async function waitForFileManagerServices(
  fileManagerRef: FileManagerRef,
  options?: {
    /** Milliseconds. */
    readyTimeout?: number;
  },
): Promise<{
  contentService: FileContentService;
  treeService: FileTreeService;
}> {
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
 * What the record stores write through the root that owns the path (W6, H8).
 *
 * The whole {@link RootedContentClient} is the unmasked working copy, so it is
 * not what the context carries: a record store reads, writes, lists and removes
 * one path at a time, and never relocates one or writes under a precondition.
 *
 * @public
 */
export type RecordFilesClient = Pick<
  RootedContentClient,
  'readFile' | 'writeFile' | 'readdir' | 'stat' | 'exists' | 'unlink' | 'rmdir'
>;

/**
 * What the parameter sidecar writes through the root that owns the path (W6, H8).
 *
 * `createParameterSetService`'s own slice: checked single-file writes, the
 * relocation a renamed target needs, and the directory bookkeeping around them.
 *
 * @public
 */
export type ParameterFilesClient = Pick<
  RootedContentClient,
  'exists' | 'readFile' | 'writeFileChecked' | 'move' | 'unlink' | 'rmdir' | 'mkdir'
>;

/**
 * What an ephemeral preview mount takes (W6, H8).
 *
 * One batch per mount, so the preview's whole snapshot lands under one lock set.
 *
 * @public
 */
export type PreviewFilesClient = Pick<RootedContentClient, 'writeFiles'>;

/**
 * The authority's **topology** surface (charter D5, O1.2).
 *
 * Project discovery and the project-directory lifecycle: the four calls whose
 * subject is a *project directory*, not a file inside one. Mount, unmount and
 * storage-root teardown are {@link WorkspaceFacade}'s; content belongs to the
 * root that owns the path ({@link RecordFilesClient} and its siblings); a
 * physical scope the mount table does not route is {@link ScopedStorageClient}'s.
 *
 * No content method may reappear here. The authority-global surface walks the
 * raw provider, so any content call on it is an unmasked read or write of a
 * project tree — which is exactly what the reserved layout refuses everywhere
 * else (authority Rule 16). `use-file-manager.test-d.ts` pins the absence.
 *
 * @public
 */
export type FileSystemClientFacade = Pick<
  FileSystemClient,
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
  whenServicesReady: () => Promise<{
    contentService: FileContentService;
    treeService: FileTreeService;
  }>;
  /**
   * Write a single file through the per-FM `FileContentService` cache.
   *
   * `path` **MUST** be workspace-relative to this provider's
   * `rootDirectory`; absolute keys that escape the workspace root throw
   * `WorkspaceScopeViolationError` synchronously. Use `files.writeFile`
   * for a write outside this FM's root (the owning root's own connection).
   */
  writeFile: (path: string, data: Uint8Array<ArrayBuffer>, options: WriteFileOptions) => Promise<void>;
  /**
   * Write multiple files through the per-FM `FileContentService` cache.
   *
   * Map keys **MUST** be workspace-relative to this provider's
   * `rootDirectory`; absolute keys that escape the workspace root throw
   * `WorkspaceScopeViolationError` synchronously. Use `files.writeFiles`
   * for a bootstrap outside this FM's root (mount-write-unmount transactions).
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
  /**
   * Place a whole overlay unit into the project so the project owns it (ruling
   * P11). `unitRoot` is checkout-relative, like the tree paths the Files pane
   * speaks — the one write the composed view allows under a read-only overlay.
   */
  overrideUnit: (unitRoot: string) => Promise<void>;
  deleteFile: (path: string, options: DeleteFileOptions) => Promise<void>;
  stat: (path: string) => Promise<FileStat>;
  exists: (path: string) => Promise<boolean>;
  readdir: (path: string) => Promise<string[]>;
  getDirectoryStat: (path: string) => Promise<FileStatEntry[]>;
  /**
   * Zip a directory through the project-scoped content facade. `''` is this
   * provider's own root — the whole-project export — and it follows the FM's
   * current root, so an archive taken while a linked checkout is selected is
   * the checkout the workbench is showing.
   */
  getZippedDirectory: (path: string, options?: ContentExportFilter) => Promise<Blob>;
  /**
   * One project's versioned bytes, read through that project's *own* composed
   * view — the snapshot a duplicate journals (authority Rule 12, charter D11).
   *
   * Not `client.getDirectoryContents`: the project read here is usually not the
   * one this FM is rooted at, and both the mask and `versionedOnly` classify
   * project-relative paths — so the read opens that project's own rooted `user`
   * connection, whose view refuses `.git/**` before provider I/O and whose
   * filter drops records and cache (authority Rule 16, charter D2).
   */
  readVersionedProjectFiles: (projectRoot: string) => Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /**
   * The record stores' slice of the root that owns the path (charter D5, D12).
   *
   * Composer records, chat records and their attachments, thumbnails, `tau.json`
   * and the project library file. Absolute paths as everywhere else in the UI;
   * each call classifies the path's route and issues the operation on that
   * root's own `'working-copy'` connection, because host record writers read and
   * write the checkout itself and never the overlays above it (architecture V6,
   * D8).
   *
   * Not {@link FileManagerContextType.client}: the authority-global surface is
   * topology and owns no content. Not the whole rooted surface either — that is
   * the unmasked working copy, and no component takes more of it than its own
   * store family writes (H8/EQ4).
   */
  recordFiles: RecordFilesClient;
  /**
   * The parameter sidecar's slice (`parameter-set-service.ts`).
   *
   * One file at a time, under its own precondition, and relocated when a
   * parameter set's target moves — never a batch and never a listing.
   */
  parameterFiles: ParameterFilesClient;
  /**
   * The ephemeral preview mount's slice (`use-cad-preview.tsx`).
   *
   * One `/previews/<instance>` memory mount, written whole on every mount and
   * never read back through here.
   */
  previewFiles: PreviewFilesClient;
  /**
   * Physical-scope reads for the `/files` workspace browser (charter D5).
   *
   * The one surface whose paths the mount table does not route, so the
   * authority — not a rooted view — answers them. `scope` is required.
   */
  scopedStorage: ScopedStorageClient;
  /**
   * Typed proxy dispatch facade for the authority's **topology** (charter D5):
   * project discovery and the project-directory lifecycle. Mount, unmount and
   * storage-root teardown are on {@link FileManagerContextType.workspace}, and
   * content is on {@link FileManagerContextType.files} — the global surface
   * serves none.
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
/**
 * The one file-manager worker this document runs, once the root mount has it.
 *
 * The sessions registry needs it to admit and release a project's compute
 * (S44), and it is app-level: every project mount shares this worker.
 *
 * @returns The shared worker, or `undefined` before the root mount has one.
 * @public
 */
export function useSharedFileManagerWorker(): Worker | undefined {
  return useContext(SharedWorkerContext);
}

/**
 * What the gate shows when the root mount has no worker (blueprint R7).
 *
 * "No worker" means one of two things and the gate must not confuse them: the
 * root mount is still connecting one, which is progress and shows the caller's
 * placeholder, or its machine gave up, which used to be an unexplained blank.
 * `initialize` takes the machine's `error` state back to `connectingWorker`, so
 * Try again is a real retry rather than a page reload.
 *
 * Soft-error tone, not destructive red: nothing was lost, the service just did
 * not start.
 *
 * @param properties - The root mount's machine, for the failure check and the
 *   retry, what to show while the worker is still on its way, and whether the
 *   notice stands in for the whole shell.
 * @returns The notice, or the placeholder.
 */
function SharedWorkerFallback({
  fileManagerRef,
  placeholder,
  withShellFrame,
}: {
  readonly fileManagerRef: FileManagerRef;
  readonly placeholder: ReactNode;
  readonly withShellFrame: boolean;
}): React.ReactNode {
  const hasFailed = useSelector(fileManagerRef, (state) => state.matches('error'));

  if (!hasFailed) {
    return placeholder;
  }

  return (
    /* Above the shell nothing sizes this mount, so it takes the window, as the
     * skeleton it replaces does; `PanelEmptyState` is size-contained and would
     * otherwise collapse to nothing. */
    <div role='alert' className={withShellFrame ? 'h-dvh w-full' : 'size-full'}>
      <PanelEmptyState
        icon={OctagonAlert}
        iconClassName='text-feature'
        title="Couldn't start the file service"
        description="Tau's file service did not start, so your files aren't available yet. Try again to restart it."
        className='p-6 [&_[data-slot=panel-empty-state-copy]]:mt-6'
      >
        <Button
          type='button'
          onClick={() => {
            fileManagerRef.send({ type: 'initialize' });
          }}
        >
          <RefreshCw />
          Try again
        </Button>
      </PanelEmptyState>
    </div>
  );
}

/**
 * Hold `children` until this document's file-manager worker exists.
 *
 * @param properties - The gated subtree, and the `placeholder` to show while
 *   the worker connects. A route that knows what it is opening passes its own
 *   loading state; without one the gate waits invisibly, as it always did.
 *   `withShellFrame` marks a gate above the app shell, whose failure notice
 *   then takes the window.
 * @returns The children, the placeholder, or the failure notice.
 */
export function SharedWorkerGate({
  children,
  placeholder,
  withShellFrame = false,
}: {
  readonly children: ReactNode;
  readonly placeholder?: ReactNode;
  readonly withShellFrame?: boolean;
}): React.ReactNode {
  const worker = useContext(SharedWorkerContext);
  const fileManager = useOptionalFileManager();

  if (worker) {
    return children;
  }

  /* Outside a provider there is no machine to report on, so the gate stays silent. */
  return fileManager === undefined ? (
    placeholder
  ) : (
    <SharedWorkerFallback
      fileManagerRef={fileManager.fileManagerRef}
      placeholder={placeholder}
      withShellFrame={withShellFrame}
    />
  );
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
        readonly initialBackend: 'indexeddb' | 'opfs' | 'memory' | 'node';
        readonly projectId?: string;
      }
  );

export type HomeFileManagerProviderProps = FileManagerProviderCommonProps & {
  readonly projectId?: string;
  /**
   * What to show while Home's storage engine resolves. This mount wraps the
   * whole app, so a route that knows what it is opening passes its own loading
   * state rather than leaving the window empty.
   */
  readonly placeholder?: ReactNode;
};

/** Resolve Home once at the app root and reuse that engine at every nested mount. */
export function HomeFileManagerProvider({
  children,
  rootDirectory,
  projectId,
  shouldInitializeOnStart,
  placeholder,
}: HomeFileManagerProviderProps): React.ReactNode {
  const inheritedBackend = useContext(HomeStorageBackendContext);
  const [resolvedBackend, setResolvedBackend] = useState<HomeStorageBackend>();
  const [resolutionFailure, setResolutionFailure] = useState<Error>();
  const backend = inheritedBackend ?? resolvedBackend;

  useEffect(() => {
    if (inheritedBackend) {
      return;
    }
    const controller = new AbortController();
    // async-iife: bootstrap
    void (async () => {
      try {
        const resolved = await getHomeStorageBackend();
        if (!controller.signal.aborted) {
          setResolvedBackend(resolved);
        }
      } catch (error) {
        // This provider gates the entire app, so a swallowed rejection is indistinguishable from a
        // permanent hang. There is no safe fallback engine — surface it to the root error boundary.
        if (!controller.signal.aborted) {
          setResolutionFailure(error instanceof Error ? error : new Error(String(error)));
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [inheritedBackend]);

  if (resolutionFailure) {
    throw resolutionFailure;
  }

  if (!backend) {
    /* The placeholder carries its own status role; without one this is the bare live region. */
    return placeholder ?? <div role='status' aria-label='Opening Home' />;
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

      workspaceTelemetry.workspaceSwap({
        previousWorkspaceId,
        nextWorkspaceId: workspaceId,
      });
      fileManagerRef.send({ type: 'reloadWorkspace' });
    },
    [fileManagerRef, projectId, workspaceTelemetry],
  );

  useEffect(() => {
    if (unavailableReason === 'permission' && activeWorkspaceId) {
      workspaceTelemetry.workspacePermissionRevoked({
        workspaceId: activeWorkspaceId,
      });
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

  /** The composed view client the FM machine builds once the services are up. */
  const getReadiedClient = useCallback(async (): Promise<ComposedViewClient> => {
    const snapshot = await waitForWithTimeout({
      fileManagerRef,
      predicate: createErrorAwareWaitPredicate(
        (state) => state.matches('ready') && state.context.viewClient !== undefined,
      ),
      readyTimeout: fileManagerReadyTimeout,
      reason: 'proxy-timeout',
    });

    assertNotErrorState(snapshot);

    const { viewClient } = snapshot.context;
    if (!viewClient) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }

    return viewClient;
  }, [fileManagerRef]);

  const whenServicesReady = useCallback(async () => {
    return waitForFileManagerServices(fileManagerRef);
  }, [fileManagerRef]);

  /* The opener this worker installed. `setRoot` destroys the worker and connects
   * a new one, so this identity is what makes the rooted connections below
   * rotate with it instead of holding ports onto a worker that is gone. */
  const bridgeOpener = useSelector(fileManagerRef, (state) => state.context.openFileSystemBridge);

  const openRootedFileSystemBridge = useCallback(
    (root: string, consumer: RootedBridgeConsumer) => {
      if (!bridgeOpener) {
        throw new FileManagerNotReadyError('proxy-timeout', {
          cause: new Error('File Manager filesystem bridge is not ready.'),
        });
      }
      return bridgeOpener(root, consumer);
    },
    [bridgeOpener],
  );

  /*
   * The one-shot read a duplicate journals, on its own connection.
   *
   * Not borrowed from the owner below: this reads a project the workbench is
   * usually *not* rooted at, once per duplication, and the owner would then hold
   * a `'user'` port open for every project ever duplicated this session.
   */
  const readVersionedProjectFiles = useCallback(
    async (projectRoot: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> => {
      await whenServicesReady();
      const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
      const proxy = createFileSystemBridgeProxy(openRootedFileSystemBridge(projectRoot, 'user'));
      try {
        return await proxy.contents('', { versionedOnly: true });
      } finally {
        proxy.dispose();
      }
    },
    [openRootedFileSystemBridge, whenServicesReady],
  );

  /**
   * One owner for open, reuse and dispose, per `(root, consumer)` (charter D12, W6).
   *
   * A connection opens the first time a trusted store touches a path under its
   * root and is held until the worker is replaced; the effect below releases what
   * a replaced owner opened. The consumer is half the key because it is half the
   * capability — an `'agent'` caller must never be answered with the unmasked
   * handle a record store opened first.
   */
  const rootedConnections = useMemo(
    () =>
      createRootedContentClient({
        open: async (root, consumer: RootedBridgeConsumer) => {
          await whenServicesReady();
          const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
          const proxy = createFileSystemBridgeProxy(openRootedFileSystemBridge(root, consumer));
          return {
            files: proxy,
            dispose: () => {
              proxy.dispose();
            },
          };
        },
      }),
    [openRootedFileSystemBridge, whenServicesReady],
  );

  useEffect(
    () => () => {
      rootedConnections.dispose();
    },
    [rootedConnections],
  );

  /*
   * The trusted stores' working copy, handed out one narrowed slice at a time
   * (H8/EQ4). Host record writers read and write the checkout itself and never
   * the overlays above it (architecture V6, charter D8), so all three slices come
   * off the one `'working-copy'` client and each carries only what its own family
   * does — the context never exposes the whole surface.
   */
  const workingCopyFiles = useMemo(() => rootedConnections.files('working-copy'), [rootedConnections]);

  /**
   * The `/files` browser's scoped reads (charter D5).
   *
   * These stay on the authority because a scope the mount table does not route
   * has no composed view to serve it; `scope` is required, so a routed path
   * cannot reach content here by omission.
   */
  const scopedStorage = useMemo<ScopedStorageClient>(() => {
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
  }, [getReadiedProxy]);

  const runtimeFileSystem = useMemo(
    () =>
      fromFileSystemBridge(() => {
        if (contentService === undefined) {
          throw new FileManagerNotReadyError('proxy-timeout');
        }
        /* Quick Look and the RPC handlers run this runtime over project code the
         * agent wrote, so it reads the agent's view, not the working copy (CI1, W14). */
        return openRootedFileSystemBridge(rootDirectory, 'agent');
      }),
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
    async (path: string, options?: ContentExportFilter): Promise<Blob> => {
      const { contentService } = await whenServicesReady();
      return contentService.getZippedDirectory(path, options);
    },
    [whenServicesReady],
  );

  /**
   * Place a whole overlay unit into the project so the project owns it
   * (ruling P11, architecture V8).
   *
   * The composed view's own gesture, not the authority's: it reads the unit's
   * subtree through the view and writes it back whole, which is why it takes a
   * checkout-relative path and is not on {@link FileSystemClientFacade}.
   */
  const overrideUnit = useCallback(
    async (unitRoot: string): Promise<void> => {
      const viewClient = await getReadiedClient();
      await viewClient.overrideUnit(unitRoot);
    },
    [getReadiedClient],
  );

  /**
   * The authority's topology, gated on the machine becoming `ready` (charter D5).
   *
   * These four go to the *workspace* proxy and not to the composed view: a
   * project directory's lifecycle is the authority's subject, and the surface
   * carries no content for a consumer to reach past it.
   */
  const client = useMemo<FileSystemClientFacade>(() => {
    const gated = <K extends keyof FileSystemClientFacade>(method: K): FileSystemClientFacade[K] =>
      (async (...args: unknown[]) => {
        const proxy = await getReadiedProxy();
        return (proxy[method] as (...rest: unknown[]) => unknown)(...args);
      }) as FileSystemClientFacade[K];

    return {
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
      overrideUnit,
      deleteFile,
      stat,
      exists,
      readdir,
      getDirectoryStat,
      getZippedDirectory,
      readVersionedProjectFiles,
      recordFiles: workingCopyFiles,
      parameterFiles: workingCopyFiles,
      previewFiles: workingCopyFiles,
      scopedStorage,
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
      overrideUnit,
      deleteFile,
      stat,
      exists,
      readdir,
      getDirectoryStat,
      getZippedDirectory,
      readVersionedProjectFiles,
      workingCopyFiles,
      scopedStorage,
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
