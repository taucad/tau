import { observeHomeProjectSaves } from '#filesystem/observe-home-project-saves.js';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import { MachineSettingsStore } from '#components/print/machine-settings-store.js';
import { machineSettingsPath } from '@taucad/runtime/machine/settings';
import type { FileSystemBridgeRootedProxy, FileSystemBridgeConnection, RootedBridgeConsumer } from '@taucad/fs-bridge';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
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
import { createRootedContentClient, rootedPathOf } from '@taucad/fs-client/rooted-content-client';
import type { RootedContentClient, RootedContentOwner } from '@taucad/fs-client/rooted-content-client';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';
import { watchByChangeSets } from '@taucad/filesystem';
import type { MountConfig, WorkspaceMutationError, WorkspaceScope, WatchEvent } from '@taucad/filesystem';
import type { ContentExportFilter } from '@taucad/filesystem/content-ops';
import { pathRegistry } from '@taucad/filesystem/path-registry';
import {
  disconnectWorkspace as disconnectStoredWorkspace,
  getProjectRootConfigs,
  restoreWorkspaceHandle as restoreStoredWorkspaceHandle,
  setProjectFileSystemConfig,
  updateWorkspaceHandle,
} from '#filesystem/handle-store.js';
import type { HomeStorageBackend, WorkspaceEntry } from '#filesystem/handle-store.js';
import { selectRuntimeFileManagerHost, selectRuntimeFiles, selectRuntimeRootFiles } from '#runtime/app-runtime.js';
import type { AppRuntimeFiles } from '#runtime/app-runtime.js';
import { useAppRuntime, useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectHomeBackend, selectHomeBackendFailure, selectSharedWorkerPresent } from '#runtime/file-manager-host.js';
import type { FileManagerActor, FileManagerSpec } from '#runtime/file-manager-host.js';
import { awaitFileManager } from '#runtime/file-manager-host.wait.js';
import type { FileManagerSnapshot } from '#runtime/file-manager-host.wait.js';
import type { LeaseEntry } from '#runtime/leases.js';
import type { WorkspaceUnavailableReason } from '#machines/file-manager.machine.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import { reprovideAgentHostProjects } from '#services/agent-host-client.js';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { ENV } from '#environment.config.js';

type RecordBridgeOpener = (root: string, consumer: RootedBridgeConsumer) => FileSystemBridgeConnection;

type RecordConnections = Readonly<{
  /** The owner for this opener: the current one, or a fresh one once a known opener was replaced. */
  ownerFor: (opener: RecordBridgeOpener | undefined) => RootedContentOwner<RootedBridgeConsumer>;
  /** Commit `owner` as the one in use, and release the one it replaced. */
  install: (owner: RootedContentOwner<RootedBridgeConsumer>) => void;
  /** Release the owner in use: the file manager's lease ended. */
  dispose: () => void;
}>;

function recordConnectionsForIncarnation(
  fallback: RecordBridgeOpener,
  ready: () => Promise<unknown>,
): RecordConnections {
  let owner: RootedContentOwner<RootedBridgeConsumer> | undefined;
  let previous: RecordBridgeOpener | undefined;
  let installed: RootedContentOwner<RootedBridgeConsumer> | undefined;
  const ownerFor = (opener: RecordBridgeOpener | undefined): RootedContentOwner<RootedBridgeConsumer> => {
    if (!owner || (previous !== undefined && opener !== previous)) {
      owner = createRootedContentClient({
        open: async (root, consumer: RootedBridgeConsumer) => {
          await ready();
          const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
          const proxy = createFileSystemBridgeProxy((opener ?? fallback)(root, consumer));
          try {
            await proxy.ready;
          } catch (error) {
            // A failed handshake must not become this root's cached connection.
            proxy.dispose();
            throw error;
          }
          return {
            files: proxy,
            dispose: () => {
              proxy.dispose();
            },
          };
        },
      });
    }
    previous = opener;
    return owner;
  };
  return {
    ownerFor,
    install: (current) => {
      if (installed !== undefined && installed !== current) {
        installed.dispose();
      }
      installed = current;
    },
    dispose: () => {
      installed?.dispose();
      installed = undefined;
    },
  };
}

/*
 * One record-connection owner per file manager (charter D6, D12, W6). It outlives a remount of its scope, as the file
 * manager does, so a remount never opens a second set; a replaced owner is released when its successor is installed,
 * and the last one when the file manager's lease ends. This replaces the mount count and its microtask dispose.
 */
const recordConnections = new WeakMap<FileManagerRef, RecordConnections>();

function recordConnectionsOf(
  fileManagerRef: FileManagerRef,
  fallback: RecordBridgeOpener,
  ready: () => Promise<unknown>,
): RecordConnections {
  const known = recordConnections.get(fileManagerRef);
  if (known !== undefined) {
    return known;
  }
  const connections = recordConnectionsForIncarnation(fallback, ready);
  recordConnections.set(fileManagerRef, connections);
  return connections;
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
  const known = servicesBound(fileManagerRef);
  if (known !== undefined) {
    return known;
  }
  const settled = await awaitFileManager(fileManagerRef, 'services', {
    reason: 'services-timeout',
    ...(options?.readyTimeout === undefined ? {} : { timeoutMilliseconds: options.readyTimeout }),
  });
  return servicesOf(settled);
}

/** The services already bound, if both are: they answer without a wait, as they always did. */
function servicesBound(
  fileManagerRef: FileManagerRef,
): { contentService: FileContentService; treeService: FileTreeService } | undefined {
  const { contentService, treeService } = fileManagerRef.getSnapshot().context;
  return contentService && treeService ? { contentService, treeService } : undefined;
}

/** The services a settled wait reached, or the reason it did not reach them. */
function servicesOf(settled: FileManagerSnapshot): {
  contentService: FileContentService;
  treeService: FileTreeService;
} {
  assertNotErrorState(settled);
  const readyContent = settled.context.contentService;
  const readyTree = settled.context.treeService;
  if (!readyContent || !readyTree) {
    throw new FileManagerNotReadyError('services-timeout');
  }

  return { contentService: readyContent, treeService: readyTree };
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

/** Whether the shared worker is up; `false` outside a runtime, where no file manager can have one. */
function useSharedWorkerPresent(): boolean {
  const host = useOptionalFileManagerHost();
  return useSelector(host, (snapshot) => (snapshot === undefined ? false : selectSharedWorkerPresent(snapshot)));
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
 * No ref callback: a context provider renders no element to hold one, so the retain is the commit's layout effect.
 * It neither sends, subscribes nor times; the store does (I1, I16).
 */
function useLeasedFileManager(spec: FileManagerSpec): LeaseEntry<FileManagerActor> {
  const runtime = useAppRuntime();
  const mount = useId();
  const key = JSON.stringify([mount, spec.rootDirectory, spec.projectId ?? null, spec.backend]);
  const lease = selectRuntimeFiles(runtime).leaseFileManager(key, spec);
  useLayoutEffect(() => lease.retain(), [lease]);
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
    <FileManagerScope fileManagerRef={selectRuntimeRootFiles(runtime)} rootDirectory='/' isRoot>
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
    <FileManagerScope fileManagerRef={lease.actor} rootDirectory={rootDirectory} projectId={projectId} lease={lease}>
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
    <FileManagerScope fileManagerRef={lease.actor} rootDirectory={rootDirectory} projectId={projectId} lease={lease}>
      {children}
    </FileManagerScope>
  );
}

/** The ref's active workspace id, read in a callback. */
const selectActiveWorkspaceId = (fileManagerRef: FileManagerRef): string | undefined =>
  fileManagerRef.getSnapshot().context.activeWorkspaceId;

/** The ref's worker proxy, read in a callback. */
const selectProxy = (fileManagerRef: FileManagerRef) => fileManagerRef.getSnapshot().context.proxy;

/** The ref's tree service, read in a callback. */
const selectTreeService = (fileManagerRef: FileManagerRef): FileTreeService | undefined =>
  fileManagerRef.getSnapshot().context.treeService;

/** The ref's current bridge opener, read after a wait. */
const selectBridgeOpener = (fileManagerRef: FileManagerRef) =>
  fileManagerRef.getSnapshot().context.openFileSystemBridge;

/** Wait on the runtime's clock for `readiness`, then refuse a file manager in `error` (row S18). */
const readied = async (
  files: AppRuntimeFiles,
  fileManagerRef: FileManagerRef,
  readiness: 'ready' | 'viewClient' | 'proxy',
): Promise<FileManagerSnapshot> => {
  const snapshot = await files.awaitFileManager(fileManagerRef, readiness, 'proxy-timeout');
  assertNotErrorState(snapshot);
  return snapshot;
};

function FileManagerScope({
  children,
  fileManagerRef,
  rootDirectory,
  projectId,
  isRoot = false,
  lease,
}: {
  readonly children: ReactNode;
  readonly fileManagerRef: FileManagerRef;
  readonly rootDirectory: string;
  readonly projectId?: string;
  /** The root layout's scope over `rootFiles`, whose worker every other file manager shares. */
  readonly isRoot?: boolean;
  /** The lease this scope's file manager came from; `rootFiles` has none and outlives every scope. */
  readonly lease?: LeaseEntry<FileManagerActor>;
}): React.JSX.Element {
  const files = selectRuntimeFiles(useAppRuntime());

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
    const snapshot = await readied(files, fileManagerRef, 'ready');

    const { proxy } = snapshot.context;
    if (!proxy) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }

    return proxy;
  }, [files, fileManagerRef]);

  /** The composed view client the FM machine builds once the services are up. */
  const getReadiedClient = useCallback(async (): Promise<ComposedViewClient> => {
    const snapshot = await readied(files, fileManagerRef, 'viewClient');

    const { viewClient } = snapshot.context;
    if (!viewClient) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }

    return viewClient;
  }, [files, fileManagerRef]);

  const whenServicesReady = useCallback(
    async () =>
      servicesBound(fileManagerRef) ??
      servicesOf(await files.awaitFileManager(fileManagerRef, 'services', 'services-timeout')),
    [files, fileManagerRef],
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

  /*
   * The one-shot read a duplicate journals, on its own connection.
   *
   * Not borrowed from the owner below: this reads a project the workbench is
   * usually *not* rooted at, once per duplication, and the owner would then hold
   * a `'user'` port open for every project ever duplicated this session.
   */
  const readDuplicateProjectFiles = useCallback(
    async (projectRoot: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> => {
      await whenServicesReady();
      const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
      const proxy = createFileSystemBridgeProxy(openRootedFileSystemBridge(projectRoot, 'user'));
      try {
        const files = await proxy.contents('', { versionedOnly: true });
        const recordRows = pathRegistry.filter(
          (row) =>
            row.class === 'records' && !row.versioned && row.agentAccess === 'read-write' && row.match === 'root',
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
    },
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
   */
  const connections = useMemo(
    () => recordConnectionsOf(fileManagerRef, openRootedFileSystemBridge, whenServicesReady),
    [fileManagerRef, openRootedFileSystemBridge, whenServicesReady],
  );
  const rootedConnections = useMemo(() => connections.ownerFor(bridgeOpener), [bridgeOpener, connections]);

  useLayoutEffect(() => {
    connections.install(rootedConnections);
  }, [connections, rootedConnections]);

  useLayoutEffect(() => {
    lease?.attach(connections.dispose);
  }, [connections, lease]);

  /*
   * The trusted stores' working copy, handed out one narrowed slice at a time
   * (H8/EQ4). Host record writers read and write the checkout itself and never
   * the overlays above it (architecture V6, charter D8), so all three slices come
   * off the one `'working-copy'` client and each carries only what its own family
   * does — the context never exposes the whole surface.
   */
  const workingCopyFiles = useMemo(() => rootedConnections.files('working-copy'), [rootedConnections]);

  const watchRecordFile = useCallback(
    (
      absolutePath: string,
      listener: (event: WatchEvent) => void,
      options?: { recursive?: boolean },
    ): ObservationWatch => {
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
          const proxy = createFileSystemBridgeProxy((bridgeOpener ?? openRootedFileSystemBridge)(root, 'working-copy'));
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
    },
    [bridgeOpener, openRootedFileSystemBridge, whenServicesReady],
  );

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
      verifyProjectRoute: gated('verifyProjectRoute'),
      commitPendingProjectDirectory: gated('commitPendingProjectDirectory'),
      permanentlyDeleteProjectDirectory: gated('permanentlyDeleteProjectDirectory'),
      adoptProjectDirectory: gated('adoptProjectDirectory'),
    };
  }, [getReadiedProxy]);

  const { workspace, activateRootSync } = useMemo(() => {
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
            workspaceTelemetry.workspaceUnmountFailed({
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
        const snapshot = await readied(files, fileManagerRef, 'proxy');
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
  }, [getReadiedProxy, files, fileManagerRef, whenServicesReady, workspaceTelemetry]);

  useLayoutEffect(() => activateRootSync(), [activateRootSync]);

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
