import { observeHomeProjectSaves } from '#filesystem/observe-home-project-saves.js';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import { MachineSettingsStore } from '#components/print/machine-settings-store.js';
import { machineSettingsPath } from '@taucad/runtime/machine/settings';
import type { FileSystemBridgeRootedProxy, RootedBridgeConsumer } from '@taucad/fs-bridge';
import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useSelector } from '@xstate/react';
import type { ActorOptions, AnyActorLogic } from 'xstate';
import { OctagonAlert, RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import type { FileSystemBackend, FileStatEntry, FileStat } from '@taucad/types';
import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import type {
  BulkMoveEdit,
  BulkMoveResult,
  FileSystemClient,
  ScopedStorageClient,
} from '@taucad/fs-client/file-system-client';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import { recordConnectionsOf } from '#runtime/file-manager-record-connections.js';
import {
  createAuthorityClient,
  createDuplicateProjectReader,
  createRecordWatch,
  createScopedStorage,
  createWorkspaceFacade,
  readied,
  selectActiveWorkspaceId,
  selectBridgeOpener,
  selectProxy,
  servicesBound,
  servicesOf,
} from '#runtime/file-manager-facade.js';
import type { RootFileFacade } from '#runtime/file-manager-facade.js';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { MountConfig, WorkspaceMutationError, WatchEvent } from '@taucad/filesystem';
import type { ContentExportFilter } from '@taucad/filesystem/content-ops';
import { getProjectRootConfigs, setProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { HomeStorageBackend, WorkspaceEntry } from '#filesystem/handle-store.js';
import {
  selectRuntimeFileManagerHost,
  selectRuntimeFiles,
  selectRuntimeRootFileFacade,
  selectRuntimeRootFiles,
} from '#runtime/app-runtime.js';
import { useAppRuntime, useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectHomeBackend, selectHomeBackendFailure, selectSharedWorkerPresent } from '#runtime/file-manager-host.js';
import type { FileManagerActor, FileManagerSpec } from '#runtime/file-manager-host.js';
import { awaitFileManager } from '#runtime/file-manager-host.wait.js';
import type { LeaseEntry } from '#runtime/leases.js';
import { sessionFileManagerOf } from '#runtime/session-file-manager.js';
import type { FileManagerOwner } from '#runtime/session-file-manager.js';
import type { WorkspaceUnavailableReason } from '#machines/file-manager.machine.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import { reprovideAgentHostProjects } from '#services/agent-host-client.js';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';

/**
 * Wait for a file manager's content and tree services, up to the ready bound.
 *
 * For a caller outside a provider. In the app, a caller uses its scope's `whenServicesReady`, which waits on the
 * runtime's clock (row S18); this wait runs on `options.clock`, or the default clock without one.
 *
 * @param fileManagerRef - The file manager to wait for.
 * @param options - The bound in milliseconds, and the clock to wait on.
 * @returns The services.
 * @throws {FileManagerNotReadyError} When the bound passes first, or the file manager is in `error`.
 * @public
 */
export async function waitForFileManagerServices(
  fileManagerRef: FileManagerRef,
  options?: {
    /** Milliseconds. */
    readyTimeout?: number;
    clock?: ActorOptions<AnyActorLogic>['clock'];
  },
): Promise<{
  contentService: FileContentService;
  treeService: FileTreeService;
}> {
  const known = servicesBound(fileManagerRef);
  if (known !== undefined) {
    return known;
  }
  const settled = await awaitFileManager(fileManagerRef, 'services', {
    reason: 'services-timeout',
    ...(options?.readyTimeout === undefined ? {} : { timeoutMilliseconds: options.readyTimeout }),
    ...(options?.clock === undefined ? {} : { clock: options.clock }),
  });
  return servicesOf(settled);
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

/** Checked workbench record mutations through the existing working-copy root. */
export type WorkbenchFilesClient = Pick<RootedContentClient, 'writeFileChecked' | 'deleteFileChecked'>;

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
  | 'verifyProjectRoute'
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
  backendType: FileSystemBackend | undefined;
  contentService: FileContentService | undefined;
  treeService: FileTreeService | undefined;
  workerChangeChannel: WorkerChangeChannel | undefined;
  /** Observe one workbench record in the live project while code may follow a checkout. */
  watchRecordFile: (
    path: string,
    listener: (event: WatchEvent) => void,
    options?: { recursive?: boolean },
  ) => ObservationWatch;
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
  /**
   * Text bytes through the editor's content cache: refuses a binary file or one
   * past the open-time limit. A caller that wants a file's bytes as they are
   * (an export, an artifact, an agent read) uses `readRawBytes`.
   */
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * A file's bytes as they are, text or binary (charter D17, L3 D-3), up to
   * `sizeLimit` (the open-time limit when omitted). An incidental read: it
   * never enters or reorders the editor's content cache.
   */
  readRawBytes: (path: string, options?: { sizeLimit?: number }) => Promise<Uint8Array<ArrayBuffer>>;
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
   * One project's versioned bytes and agent-writable records, read through
   * that project's own composed view — the snapshot a duplicate journals.
   *
   * Not `client.getDirectoryContents`: the project read here is usually not the
   * one this FM is rooted at. The read opens that project's own rooted `user`
   * connection; the view refuses `.git/**` before provider I/O, while the
   * registry selects record subtrees without reading chats or cache bytes.
   */
  readDuplicateProjectFiles: (projectRoot: string) => Promise<Record<string, Uint8Array<ArrayBuffer>>>;
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
  machineSettings: MachineSettingsStore;
  workbenchFiles: WorkbenchFilesClient;
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

/** The file-manager host's ref, outside a runtime `undefined` (a component test that renders a gate alone). */
function useOptionalFileManagerHost() {
  const runtime = useOptionalAppRuntime();
  return runtime === undefined ? undefined : selectRuntimeFileManagerHost(runtime);
}

/**
 * Physical engine selected for the system-owned Home workspace (row S37): the file-manager host's, once it resolved.
 *
 * @returns The engine, or `undefined` while it resolves or after it failed.
 * @public
 */
export function useHomeStorageBackend(): HomeStorageBackend | undefined {
  const host = useOptionalFileManagerHost();
  if (host === undefined) {
    throw new Error('useHomeStorageBackend must be used within <AppRuntimeProvider>');
  }
  return useSelector(host, selectHomeBackend);
}

/** Whether the shared worker is up, read from `rootFiles`; `false` outside a runtime, where no file manager has one. */
function useSharedWorkerPresent(): boolean {
  const runtime = useOptionalAppRuntime();
  const rootFiles = runtime === undefined ? undefined : selectRuntimeRootFiles(runtime);
  return useSelector(rootFiles, (snapshot) => (snapshot === undefined ? false : selectSharedWorkerPresent(snapshot)));
}

/** Home's backend failure, outside a runtime `undefined`. */
function useHomeBackendFailure(): string | undefined {
  const host = useOptionalFileManagerHost();
  return useSelector(host, (snapshot) => (snapshot === undefined ? undefined : selectHomeBackendFailure(snapshot)));
}

/**
 * What the gate shows when the root mount has no worker (blueprint R7).
 *
 * "No worker" means one of two things and the gate must not confuse them: the
 * root mount is still connecting one, which is progress and shows the caller's
 * placeholder, or its machine gave up, which used to be an unexplained blank.
 * `initialize` takes the machine's `error` state back to `connectingWorker`, so
 * Try again is a real retry rather than a page reload. When the file-manager
 * host could not read Home's engine (row S37), the notice says so and its retry
 * sends the host `retry`; nothing ever selects a fallback engine.
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
  isInline = false,
}: {
  readonly isInline?: boolean;
  readonly fileManagerRef: FileManagerRef;
  readonly placeholder: ReactNode;
  readonly withShellFrame: boolean;
}): React.ReactNode {
  const hasFailed = useSelector(fileManagerRef, (state) => state.matches('error'));
  const isBackendPending = useSelector(fileManagerRef, (state) => state.context.backendType === undefined);
  const host = useOptionalFileManagerHost();
  const homeFailure = useHomeBackendFailure();
  const homeFailed = isBackendPending && homeFailure !== undefined;

  if (!hasFailed && !homeFailed) {
    return placeholder;
  }

  const title = homeFailed ? "Couldn't open Home" : "Couldn't start the file service";
  const description = homeFailed
    ? "Tau couldn't read your Home storage selection. Try again to open your existing files."
    : "Tau's file service did not start, so your files aren't available yet. Try again to restart it.";
  const retry = (
    <Button
      type='button'
      onClick={() => {
        if (homeFailed) {
          host?.send({ type: 'retry' });
        } else {
          fileManagerRef.send({ type: 'initialize' });
        }
      }}
    >
      <RefreshCw />
      Try again
    </Button>
  );
  if (isInline) {
    return (
      <div role='alert' aria-label={title} className='flex flex-wrap items-center gap-3 border-b p-4'>
        <OctagonAlert aria-hidden className='size-4 shrink-0 text-feature' />
        <p className='min-w-0 flex-1 text-sm'>{description}</p>
        {retry}
      </div>
    );
  }
  return (
    <div role='alert' className={withShellFrame ? 'h-dvh w-full' : 'size-full'}>
      <PanelEmptyState
        icon={OctagonAlert}
        iconClassName='text-feature'
        title={title}
        description={description}
        className='p-6 [&_[data-slot=panel-empty-state-copy]]:mt-6'
      >
        {retry}
      </PanelEmptyState>
    </div>
  );
}

/**
 * Hold `children` until this document's file-manager worker exists.
 *
 * The worker is `rootFiles`'s, which the file-manager host watches; a nested
 * file manager built before it would start a worker of its own.
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
  shouldReportFailure = true,
}: {
  readonly shouldReportFailure?: boolean;
  readonly children: ReactNode;
  readonly placeholder?: ReactNode;
  readonly withShellFrame?: boolean;
}): React.ReactNode {
  const isWorkerPresent = useSharedWorkerPresent();
  const fileManager = useOptionalFileManager();

  if (isWorkerPresent) {
    return children;
  }

  /* Outside a provider there is no machine to report on, so the gate stays silent. */
  return fileManager === undefined || !shouldReportFailure ? (
    placeholder
  ) : (
    <SharedWorkerFallback
      fileManagerRef={fileManager.fileManagerRef}
      placeholder={placeholder}
      withShellFrame={withShellFrame}
    />
  );
}

/** Keep storage recovery inside the available page instead of displacing its shell. */
export function HomeFileManagerNotice(): React.ReactNode {
  const fileManager = useOptionalFileManager();
  return fileManager ? (
    <SharedWorkerFallback
      fileManagerRef={fileManager.fileManagerRef}
      placeholder={undefined}
      withShellFrame={false}
      isInline
    />
  ) : undefined;
}

/**
 * Common props shared by every {@link FileManagerProvider} mount.
 * `initialBackend` is required (Audit R4 / Finding 7) — the call site
 * must commit to a backend explicitly so the FM machine can bootstrap
 * deterministically. Product mount sites use {@link HomeFileManagerProvider}
 * so the profile's pinned Home engine is resolved once, by the file-manager host.
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
};

/**
 * Lease this mount's file manager (D6): read in render, idempotent per key, and retained once the mount commits.
 *
 * The key is the mount's own (`useId`, stable across StrictMode's double render and its remount, and between the
 * server render and hydration) with its root, project and backend, so a mount that changes its root leases a fresh
 * file manager built for it, where it used to send `setRoot`. The store starts the actor on the first retain; a
 * release starts the grace, so StrictMode's remount keeps the lease and an unmount releases it after the grace (B3).
 * No ref callback: a context provider renders no element to hold one, so the retain is the commit's passive effect.
 * Not a layout effect: React cleans those up when a revealed Suspense boundary re-suspends and hides the subtree, which
 * would release a mounted lease and drop it after the grace; a passive effect lives as long as the mount, as
 * `useActorRef`'s actor did. It neither sends, subscribes nor times; the store does (I1, I16).
 *
 * A render that commits after its entry's grace (a transition held by a slow lazy chunk) finds the entry dropped: the
 * mount renders again, and the store builds a fresh one for the key. The leased providers key their scope by the
 * actor, so nothing below keeps the stopped one.
 */
function useLeasedFileManager(spec: FileManagerSpec): LeaseEntry<FileManagerActor> {
  const runtime = useAppRuntime();
  const mount = useId();
  const key = JSON.stringify([mount, spec.rootDirectory, spec.projectId ?? null, spec.backend]);
  const lease = selectRuntimeFiles(runtime).leaseFileManager(key, spec);
  const [, renew] = useReducer((generation: number) => generation + 1, 0);
  useEffect(() => {
    const release = lease.retain();
    if (lease.isDropped()) {
      renew();
    }
    return release;
  }, [lease]);
  return lease;
}

/**
 * The root layout's file manager: a context provider over the runtime's `rootFiles`, the file manager for `/`
 * (R2-F2). It exists, unstarted, in the first render and on the server, and the runtime starts it.
 *
 * @param props - The app below the root layout.
 * @returns The provider element.
 * @public
 */
export function RootFileManagerProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const runtime = useAppRuntime();
  return (
    <FileManagerScope
      fileManagerRef={selectRuntimeRootFiles(runtime)}
      rootDirectory='/'
      isRoot
      rootFacade={selectRuntimeRootFileFacade(runtime)}
    >
      {children}
    </FileManagerScope>
  );
}

/**
 * A file manager on Home's engine, which the file-manager host resolves once (row S37): leased for this mount.
 *
 * @param props - The root, the project and whether the actor initializes on start.
 * @returns The provider element.
 * @public
 */
export function HomeFileManagerProvider({
  children,
  rootDirectory,
  projectId,
  shouldInitializeOnStart,
}: HomeFileManagerProviderProps): React.ReactNode {
  const lease = useLeasedFileManager({
    backend: 'home',
    rootDirectory,
    ...(projectId === undefined ? {} : { projectId }),
    ...(shouldInitializeOnStart === undefined ? {} : { shouldInitializeOnStart }),
  });
  return (
    <FileManagerScope
      key={lease.actor.sessionId}
      fileManagerRef={lease.actor}
      rootDirectory={rootDirectory}
      projectId={projectId}
      owner={lease}
    >
      {children}
    </FileManagerScope>
  );
}

/**
 * A project session's file manager: a provider over the actor the session's `fileManager` child built through the
 * host for `/projects/<id>` (A6c). It creates, starts and stops nothing: the child owns the actor, its connections and
 * its working-copy client, and the session stops the child when it closes (I1, I23). Until the child reports an
 * actor (once `rootFiles` holds the shared worker), and while it rebuilds one on a new worker, the provider renders
 * nothing.
 *
 * @param props - The session's file manager, its root and project, and the subtree.
 * @returns The provider element, or nothing before the session has a file manager.
 * @public
 */
export function SessionFileManagerProvider({
  children,
  fileManagerRef,
  rootDirectory,
  projectId,
}: {
  readonly children: ReactNode;
  /** The session's file manager (`selectProjectSessionFileManager`). */
  readonly fileManagerRef: FileManagerRef | undefined;
  readonly rootDirectory: string;
  readonly projectId: string;
}): React.ReactNode {
  if (fileManagerRef === undefined) {
    return null;
  }
  const opened = sessionFileManagerOf(fileManagerRef);
  return (
    <FileManagerScope
      key={opened?.key}
      fileManagerRef={fileManagerRef}
      rootDirectory={rootDirectory}
      projectId={projectId}
      owner={opened?.owner}
    >
      {children}
    </FileManagerScope>
  );
}

/** A resolved caller must still select an engine explicitly. Home alone owns deferred selection. */
export function FileManagerProvider({
  children,
  rootDirectory,
  projectId,
  initialBackend,
  shouldInitializeOnStart,
}: FileManagerProviderProps): React.JSX.Element {
  const lease = useLeasedFileManager({
    backend: initialBackend,
    rootDirectory,
    ...(projectId === undefined ? {} : { projectId }),
    ...(shouldInitializeOnStart === undefined ? {} : { shouldInitializeOnStart }),
  });
  return (
    <FileManagerScope
      key={lease.actor.sessionId}
      fileManagerRef={lease.actor}
      rootDirectory={rootDirectory}
      projectId={projectId}
      owner={lease}
    >
      {children}
    </FileManagerScope>
  );
}

/** The external store of a scope whose owner holds no working-copy client: nothing to hear, nothing to read. */
const subscribeToNothing = (): (() => void) => () => undefined;
const readNothing = (): undefined => undefined;

function FileManagerScope({
  children,
  fileManagerRef,
  rootDirectory,
  projectId,
  isRoot = false,
  owner,
  rootFacade,
}: {
  readonly children: ReactNode;
  readonly fileManagerRef: FileManagerRef;
  readonly rootDirectory: string;
  readonly projectId?: string;
  /** The root layout's scope over `rootFiles`, whose worker every other file manager shares. */
  readonly isRoot?: boolean;
  /**
   * What owns this scope's file manager: its lease, or its session child (A6c). `rootFiles` has none and outlives
   * every scope.
   */
  readonly owner?: FileManagerOwner | undefined;
  /** The runtime's root facade, for the root layout's scope only: the scope reads it instead of building its own. */
  readonly rootFacade?: RootFileFacade;
}): React.JSX.Element {
  const files = selectRuntimeFiles(useAppRuntime());
  /* A scope over an owner that ends, before or during a wait (a lease's late-commit case, a session's close), ends the
   * wait then, not at the bound. */
  const gone = owner?.dropped;

  const workspaceTelemetry = useWorkspaceTelemetry();

  const contentService = useSelector(fileManagerRef, (state) => state.context.contentService);
  const treeService = useSelector(fileManagerRef, (state) => state.context.treeService);
  const workerChangeChannel = useSelector(fileManagerRef, (state) => state.context.workerChangeChannel);
  const backendType = useSelector(fileManagerRef, (state) => state.context.backendType);
  const activeWorkspaceId = useSelector(fileManagerRef, (state) => state.context.activeWorkspaceId);
  const activeWorkspaceName = useSelector(fileManagerRef, (state) => state.context.activeWorkspaceName);
  const unavailableReason = useSelector(fileManagerRef, (state) => state.context.unavailableReason);

  useEffect(() => {
    if (!contentService || !workerChangeChannel || backendType === undefined) {
      return;
    }
    return observeHomeProjectSaves({ projectId, backend: backendType, contentService, channel: workerChangeChannel });
  }, [projectId, backendType, contentService, workerChangeChannel]);

  const bindProjectToWorkspace = useCallback(
    async (workspaceId: string): Promise<void> => {
      if (!projectId) {
        throw new Error('bindProjectToWorkspace requires a project scope (provider mounted without projectId)');
      }
      const previousWorkspaceId = selectActiveWorkspaceId(fileManagerRef);

      // Drop the worker-side standalone cache before reload (Audit R6
      // / Finding 9). The previous workspace's cached provider must go
      // — otherwise a stale `FileSystemAccessProvider` keyed by the
      // old `workspaceId` keeps serving reads against a handle the
      // user has swapped away from. We also invalidate the new
      // workspaceId so a freshly-granted handle replaces any cached
      // provider that was created while permission was missing.
      const proxy = selectProxy(fileManagerRef);
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
          entry.projectId === projectId &&
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
    const snapshot = await readied(files, fileManagerRef, { readiness: 'ready', gone });

    const { proxy } = snapshot.context;
    if (!proxy) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }

    return proxy;
  }, [files, fileManagerRef, gone]);

  /** The composed view client the FM machine builds once the services are up. */
  const getReadiedClient = useCallback(async (): Promise<ComposedViewClient> => {
    const snapshot = await readied(files, fileManagerRef, { readiness: 'viewClient', gone });

    const { viewClient } = snapshot.context;
    if (!viewClient) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }

    return viewClient;
  }, [files, fileManagerRef, gone]);

  const whenServicesReady = useCallback(
    async () =>
      servicesBound(fileManagerRef) ??
      servicesOf(
        await files.awaitFileManager(fileManagerRef, 'services', {
          reason: 'services-timeout',
          ...(gone === undefined ? {} : { gone }),
        }),
      ),
    [files, fileManagerRef, gone],
  );

  /* `setRoot` destroys the worker, so its opener identity releases old rooted ports. */
  const bridgeOpener = useSelector(fileManagerRef, (state) => state.context.openFileSystemBridge);

  /* RV1-F1: when the root mount's worker is replaced, each open agent project host swaps in fresh bridges and keeps
   * its runs. Only a change from an earlier opener counts: a provider's first worker (the share page's mount among
   * them) has no host whose bridges it replaced. */
  const lastBridgeOpener = useRef(bridgeOpener);
  useEffect(() => {
    if (bridgeOpener === undefined || !isRoot) {
      return;
    }
    const previous = lastBridgeOpener.current;
    lastBridgeOpener.current = bridgeOpener;
    if (previous === undefined || previous === bridgeOpener) {
      return;
    }
    // async-iife: bootstrap -- an effect cannot await; a failed re-broker is reported and the host's liveness recovers.
    void (async (): Promise<void> => {
      try {
        await reprovideAgentHostProjects();
      } catch (error) {
        console.error('[FileManager] the agent host could not take the new file service', error);
      }
    })();
  }, [bridgeOpener, isRoot]);

  const openRootedFileSystemBridge = useCallback(
    (root: string, consumer: RootedBridgeConsumer) => {
      /* An early record read may wait for services across the first render. Read
       * the current opener after that wait, not the undefined one it captured. */
      const opener = selectBridgeOpener(fileManagerRef);
      if (!opener) {
        throw new FileManagerNotReadyError('proxy-timeout', {
          cause: new Error('File Manager filesystem bridge is not ready.'),
        });
      }
      return opener(root, consumer);
    },
    [fileManagerRef],
  );

  const machineSettings = useMemo(() => {
    const connection: { proxy?: FileSystemBridgeRootedProxy } = {};
    const service = async (): Promise<FileSystemBridgeRootedProxy> => {
      await whenServicesReady();
      const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
      // A known opener belongs to this store incarnation; the first undefined opener waits for the current one.
      const proxy = createFileSystemBridgeProxy((bridgeOpener ?? openRootedFileSystemBridge)(rootDirectory, 'user'));
      connection.proxy = proxy;
      await proxy.ready;
      return proxy;
    };
    return new MachineSettingsStore(
      service,
      (typeId, onEvent) => {
        if (!contentService) {
          throw new Error('Machine settings content service is unavailable.');
        }
        return contentService.watchReady({ paths: [machineSettingsPath({ typeId })] }, onEvent);
      },
      () => connection.proxy?.dispose(),
    );
  }, [bridgeOpener, rootDirectory, openRootedFileSystemBridge, whenServicesReady, contentService]);
  useEffect(
    () => () => {
      machineSettings.dispose();
    },
    [machineSettings],
  );

  /* The one-shot read a duplicate journals, on its own connection (`createDuplicateProjectReader`). */
  const ownReadDuplicateProjectFiles = useMemo(
    () => createDuplicateProjectReader(openRootedFileSystemBridge, whenServicesReady),
    [openRootedFileSystemBridge, whenServicesReady],
  );

  /**
   * One owner for open, reuse and dispose, per `(root, consumer)` (charter D12, W6).
   *
   * A connection opens the first time a trusted store touches a path under its
   * root and is held until the worker is replaced: the commit that installs a
   * replacement releases what the replaced owner opened, and the file manager's
   * lease releases the last one when it ends (D6), so neither StrictMode's
   * remount nor any other remount releases it. The consumer is half the key
   * because it is half the capability — an `'agent'` caller must never be
   * answered with the unmasked handle a record store opened first.
   *
   * A session's file manager (A6c) brings its own: its child holds the
   * connections, installs each replacement and releases the last when it stops,
   * and the scope reads the child's working-copy client instead.
   */
  const ownedWorkingCopy = owner?.workingCopyFiles ?? rootFacade?.workingCopyFiles;
  const connections = useMemo(
    () => recordConnectionsOf(fileManagerRef, openRootedFileSystemBridge, whenServicesReady),
    [fileManagerRef, openRootedFileSystemBridge, whenServicesReady],
  );
  const rootedConnections = useMemo(
    () => (ownedWorkingCopy === undefined ? connections.ownerFor(bridgeOpener) : undefined),
    [bridgeOpener, connections, ownedWorkingCopy],
  );

  useLayoutEffect(() => {
    if (rootedConnections !== undefined) {
      connections.install(rootedConnections);
    }
  }, [connections, rootedConnections]);

  useLayoutEffect(() => {
    if (ownedWorkingCopy === undefined) {
      owner?.attach(connections.dispose);
    }
  }, [connections, owner, ownedWorkingCopy]);

  const childWorkingCopy = useSyncExternalStore(
    ownedWorkingCopy?.subscribe ?? subscribeToNothing,
    ownedWorkingCopy?.get ?? readNothing,
    ownedWorkingCopy?.get ?? readNothing,
  );

  /*
   * The trusted stores' working copy, handed out one narrowed slice at a time
   * (H8/EQ4). Host record writers read and write the checkout itself and never
   * the overlays above it (architecture V6, charter D8), so all three slices come
   * off the one `'working-copy'` client and each carries only what its own family
   * does — the context never exposes the whole surface.
   */
  const workingCopyFiles = useMemo(
    () => childWorkingCopy ?? (rootedConnections ?? connections.ownerFor(bridgeOpener)).files('working-copy'),
    [bridgeOpener, childWorkingCopy, connections, rootedConnections],
  );

  const ownWatchRecordFile = useMemo(
    () => createRecordWatch(bridgeOpener ?? openRootedFileSystemBridge, whenServicesReady),
    [bridgeOpener, openRootedFileSystemBridge, whenServicesReady],
  );

  /* The `/files` browser's scoped reads (charter D5; `createScopedStorage`). */
  const ownScopedStorage = useMemo(() => createScopedStorage(getReadiedProxy), [getReadiedProxy]);

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

  const readRawBytes = useCallback(
    async (path: string, options?: { sizeLimit?: number }): Promise<Uint8Array<ArrayBuffer>> => {
      const { contentService } = await whenServicesReady();
      return contentService.readRawBytes(path, options);
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

  /* The authority's topology, gated on the machine becoming `ready` (charter D5; `createAuthorityClient`). */
  const ownClient = useMemo(() => createAuthorityClient(getReadiedProxy), [getReadiedProxy]);

  const { workspace: ownWorkspace, activateRootSync } = useMemo(
    () =>
      createWorkspaceFacade({
        fileManagerRef,
        getReadiedProxy,
        getConnectedProxy: async () => {
          const snapshot = await readied(files, fileManagerRef, { readiness: 'proxy', gone });
          const { proxy } = snapshot.context;
          if (!proxy) {
            throw new FileManagerNotReadyError('proxy-timeout');
          }
          return proxy;
        },
        whenServicesReady,
        telemetry: workspaceTelemetry,
      }),
    [getReadiedProxy, files, fileManagerRef, gone, whenServicesReady, workspaceTelemetry],
  );

  /*
   * The root's scope is a view of the runtime's root facade (A4b): the facade owns the root's record connections, its
   * root synchronisation passes, its watch and its topology client, which the project library reads too.
   */
  const rootValue = useSyncExternalStore(
    rootFacade?.subscribe ?? subscribeToNothing,
    rootFacade?.get ?? readNothing,
    rootFacade?.get ?? readNothing,
  );
  const watchRecordFile = rootValue?.watchRecordFile ?? ownWatchRecordFile;
  const readDuplicateProjectFiles = rootValue?.readDuplicateProjectFiles ?? ownReadDuplicateProjectFiles;
  const scopedStorage = rootValue?.scopedStorage ?? ownScopedStorage;
  const client = rootValue?.client ?? ownClient;
  const workspace = rootValue?.workspace ?? ownWorkspace;

  useLayoutEffect(() => (rootFacade === undefined ? activateRootSync() : undefined), [activateRootSync, rootFacade]);

  const value = useMemo<FileManagerContextType>(
    () => ({
      fileManagerRef,
      machineSettings,
      backendType,
      contentService,
      treeService,
      workerChangeChannel,
      watchRecordFile,
      whenServicesReady,
      writeFile,
      writeFiles,
      readFile,
      readRawBytes,
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
      readDuplicateProjectFiles,
      recordFiles: workingCopyFiles,
      parameterFiles: workingCopyFiles,
      workbenchFiles: workingCopyFiles,
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
      machineSettings,
      backendType,
      contentService,
      treeService,
      workerChangeChannel,
      watchRecordFile,
      whenServicesReady,
      writeFile,
      writeFiles,
      readFile,
      readRawBytes,
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
      readDuplicateProjectFiles,
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

  return <FileManagerContext.Provider value={value}>{children}</FileManagerContext.Provider>;
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
