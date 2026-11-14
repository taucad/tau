/**
 * The project library's storage calls (app state orchestration charter D9, D10; plan § 4 A3b; inventory L1, L2, L5,
 * L8).
 *
 * These are the reads and writes `ProjectManagerProvider` made inside its discovery, recovery and route-access loops,
 * moved out of React unchanged so the library's three machines can call them as ports: one discovery pass in three
 * steps (`scanDiscovery`, `planDiscovery`, `applyDiscovery`), the commit of a pending project operation
 * (`commitPendingProjectOperation`), the reads route access makes, and the listing a pass is enriched into. Each takes
 * the root file manager's facade, which still comes from React through the library's binding until A4b builds it
 * over `rootFiles`. Nothing here holds state: the sequencing and the fences are the machines'.
 *
 * @module
 */
import { declaresManifest } from '@taucad/project-workspace/utils/project-manifest-equivalence';
import type { QueryClient } from '@tanstack/react-query';
import type { Remote } from 'comlink';
import { z } from 'zod';
import { serializeProjectManifest } from '@taucad/types';
import type {
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  ProjectLocator,
  StorageRootConfig,
} from '@taucad/filesystem';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import { consumableBytes } from '@taucad/fs-bridge';
import type { CadAgentExecution, Chat } from '@taucad/chat';
import { composerRecordPaths, createComposerRecordStore } from '@taucad/chat-ui/db/composer-record-store';
import { chatPlacementOf } from '@taucad/chat-ui/utils/chat-execution';
import { writeChatPlacement } from '@taucad/chat-ui/db/chat-placements';
import { attachmentReferenceOf } from '@taucad/chat-ui/utils/attachment.utils';
import { createAttachmentStore, createChatAttachmentStore, isNotFound } from '@taucad/chat-ui/db/attachment-store';
import type { AttachmentStore } from '@taucad/chat-ui/db/attachment-store';
import { WorkspaceDirectoryRequiredError } from '@taucad/ui-core/filesystem/workspace-errors';
import { allocateProjectDirectorySlug } from '@taucad/ui-core/utils/project-directory.utils';
import { readLocalProjectOpenPerformance } from '@taucad/ui-core/lib/project-open-performance';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';
import type { useFileManager } from '#hooks/use-file-manager.js';
import {
  applyProjectFileSystemConfigChanges,
  checkHandlePermission,
  deleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs,
  getProjectFileSystemConfig,
  getWorkspace,
  listWorkspaces,
  pinHomeStorageBackend,
  requestHomeStoragePersistence,
  setProjectFileSystemConfig,
} from '#filesystem/handle-store.js';
import type { ProjectFileSystemConfig, WorkspaceBindingRepair, WorkspaceEntry } from '#filesystem/handle-store.js';
import { directoryPicker } from '#constants/browser.constants.js';
import { nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { metaConfig } from '#constants/meta.constants.js';
import type { ChatStorage } from '#types/storage.types.js';
import type {
  PendingProjectOperation,
  PendingProjectRecovery,
  PendingProjectRecoveryReason,
  PendingProjectStorage,
} from '#types/pending-project-operation.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project-library.types.js';
import { projectSlugsOf } from '#utils/project-url.utils.js';
import type { DiscoveryPlan, DiscoveryWrites } from '#machines/library-discovery.machine.js';
import type { RecoveryRowInput, ReplayOutcome } from '#machines/library-recovery.machine.js';

/** The root file manager's facade, as `FileManagerScope` builds it in React until A4b (D15 ruling, A2). @public */
export type ProjectLibraryFileManager = Pick<
  ReturnType<typeof useFileManager>,
  'client' | 'recordFiles' | 'workspace' | 'scopedStorage' | 'workerChangeChannel' | 'watchRecordFile'
>;

export type ProjectDiscoveryConflict =
  | Extract<ProjectDiscoveryEntry, { status: 'adoption-required' }>
  | Extract<ProjectDiscoveryEntry, { status: 'duplicate-id' }>
  | Extract<ProjectDiscoveryEntry, { status: 'route-blocked' }>
  | Extract<ProjectDiscoveryEntry, { status: 'invalid' }>;

export type WorkspaceBindingRepairGroup = {
  readonly canonicalWorkspaceId: string;
  readonly workspaceName: string;
  readonly projectCount: number;
};

export type ProjectListing = {
  readonly projects: readonly ProjectLibraryEntry[];
  readonly conflicts: readonly ProjectDiscoveryConflict[];
  readonly recoveries: readonly PendingProjectRecovery[];
  readonly workspaceBindingRepairs: readonly WorkspaceBindingRepairGroup[];
};

/** Concurrent disk-side library-state recoveries after IndexedDB eviction. */
const libraryRecoveryConcurrency = 16;

export const pendingStorageToConfig = (projectId: string, storage: PendingProjectStorage): ProjectFileSystemConfig => {
  if (storage.backend === 'webaccess') {
    return {
      projectId,
      backend: storage.backend,
      workspaceId: storage.workspaceId,
      providerBasePath: storage.providerBasePath,
    };
  }
  if (storage.backend === 'node') {
    return {
      projectId,
      backend: storage.backend,
      ...(storage.path === undefined ? {} : { path: storage.path }),
      providerBasePath: storage.providerBasePath,
    };
  }
  return { projectId, backend: storage.backend, providerBasePath: storage.providerBasePath };
};

export class PendingProjectRecoveryError extends Error {
  public readonly reason: PendingProjectRecoveryReason;

  public constructor(reason: PendingProjectRecoveryReason, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = 'PendingProjectRecoveryError';
    this.reason = reason;
  }
}

/**
 * Where a pending operation's project lives, as plain data: the backend, the directory and the root that names it. A
 * create or duplicate carries these at its top level beside its files, chats and editor state; only these are copied,
 * so a recovery row never holds the operation's bytes (MC-R5; the A0.4 and A3a risk).
 */
export const pendingOperationStorage = (operation: PendingProjectOperation): PendingProjectStorage => {
  const storage = operation.kind === 'permanent-delete' ? operation.storage : operation;
  if (storage.backend === 'webaccess') {
    return { backend: 'webaccess', workspaceId: storage.workspaceId, providerBasePath: storage.providerBasePath };
  }
  if (storage.backend === 'node') {
    return {
      backend: 'node',
      ...(storage.path === undefined ? {} : { path: storage.path }),
      providerBasePath: storage.providerBasePath,
    };
  }
  return { backend: storage.backend, providerBasePath: storage.providerBasePath };
};

/** One journal row as the recovery machine reads it: its plain-data projection, never the operation itself. */
export const recoveryRowOf = (operation: PendingProjectOperation): RecoveryRowInput => {
  const storage = pendingOperationStorage(operation);
  return {
    operationId: operation.operationId,
    projectId: operation.projectId,
    kind: operation.kind,
    storage,
    ...(storage.backend === 'webaccess' ? { workspaceId: storage.workspaceId } : {}),
  };
};

const locatorKey = (storageRootKey: string, providerBasePath: string): string =>
  `${storageRootKey}\0${providerBasePath}`;

/**
 * Disk-side mirror of the profile-local library row. IndexedDB is evictable,
 * the workspace folder is not, so trash judgment lives here too.
 */
const projectLibraryFileSchema = z.strictObject({ deletedAt: z.number().nonnegative().optional() });
type ProjectLibraryFile = z.infer<typeof projectLibraryFileSchema>;

/** Minimal slice of the worker filesystem client the library tombstone needs. */
type ProjectLibraryFileClient = {
  readFile: (path: string, options: 'utf8') => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  stat: (path: string) => Promise<{ readonly mtimeMs: number }>;
};

const projectLibraryFilePath = (projectId: string): string => `/projects/${projectId}/.tau/library.json`;

const readProjectLibraryFile = async (
  client: ProjectLibraryFileClient,
  projectId: string,
): Promise<ProjectLibraryFile> => {
  try {
    const parsed: unknown = JSON.parse(await client.readFile(projectLibraryFilePath(projectId), 'utf8'));
    const result = projectLibraryFileSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
};

/** Best effort: an unwritable workspace must never fail a trash or restore. */
export const writeProjectLibraryFile = async (
  client: ProjectLibraryFileClient,
  projectId: string,
  content: ProjectLibraryFile,
): Promise<void> => {
  try {
    await client.writeFile(projectLibraryFilePath(projectId), JSON.stringify(content));
  } catch (error) {
    console.warn(`[ProjectManager] failed to write ${projectLibraryFilePath(projectId)}`, error);
  }
};

/** Manifest mtime is the only recency evidence that survives an eviction. */
const readManifestActivityAt = async (client: ProjectLibraryFileClient, projectId: string): Promise<number> => {
  try {
    const stat = await client.stat(`/projects/${projectId}/tau.json`);
    return stat.mtimeMs;
  } catch {
    return Date.now();
  }
};

export type PersistentStorageRoot =
  | { readonly backend: 'indexeddb' | 'opfs' }
  | { readonly backend: 'webaccess'; readonly workspaceId: string }
  /** `path` is absent on persisted rows, which name Home implicitly (see `ProjectFileSystemConfig`). */
  | { readonly backend: 'node'; readonly path?: string };

/**
 * The worker's own derivation, bound to this app shell's database prefix —
 * never a second implementation: the blocking decision in discovery compares
 * these keys across the worker boundary (R12).
 */
/**
 * Durable node-root discriminator: a picked folder names its absolute path, and
 * Home names nothing — its `userData/home` path is ambient, so a Home row stays
 * free of a machine-specific path (L2 deviation 1).
 */
const nodeRootPath = (path: string): { readonly path?: string } => (path === nodeHomeRoot() ? {} : { path });

export const persistentStorageRootKey = (root: PersistentStorageRoot): string =>
  resolveStorageRootKey(
    root.backend === 'node' ? { backend: 'node', path: root.path ?? nodeHomeRoot() } : root,
    metaConfig.databasePrefix,
  );

/** The persisted route that binds a project id to exactly this discovered directory. */
export const routeConfigFor = (projectId: string, locator: ProjectLocator): ProjectFileSystemConfig =>
  locator.backend === 'webaccess'
    ? {
        projectId,
        backend: 'webaccess',
        workspaceId: locator.workspaceId,
        providerBasePath: locator.relativeDirectory,
      }
    : locator.backend === 'node'
      ? { projectId, backend: 'node', ...nodeRootPath(locator.path), providerBasePath: locator.relativeDirectory }
      : { projectId, backend: locator.backend, providerBasePath: locator.relativeDirectory };

/** Whether a persisted route already binds its project to exactly this directory. */
export const routeBindsLocator = (config: ProjectFileSystemConfig | undefined, locator: ProjectLocator): boolean =>
  config !== undefined &&
  config.backend !== 'memory' &&
  persistentStorageRootKey(config) === locator.storageRootKey &&
  config.providerBasePath === locator.relativeDirectory;

/**
 * Allocate the physical directory for a new project at `root`: the name slug,
 * suffixed until it is free against everything discovery can see there
 * (blueprint D3). Commit-time exactness — the service creates the named target
 * or fails — plus the post-commit `tau.json` read-back remain the authority; a
 * listing raced by another tab can only cost a retry, never a wrong identity.
 */
export const allocateProjectBasePath = async (
  client: { listProjectManifests: () => Promise<ProjectDiscoveryResult> },
  root: PersistentStorageRoot,
  name: string,
): Promise<string> => {
  const storageRootKey = persistentStorageRootKey(root);
  const discovery = await client.listProjectManifests();
  const taken = new Set(
    discovery.entries
      .filter((entry) => entry.locator.storageRootKey === storageRootKey)
      .flatMap((entry) => entry.locator.relativeDirectory.split('/').filter(Boolean).slice(-1)),
  );
  return allocateProjectDirectorySlug(name, taken);
};

const pendingStorageLocatorKey = (storage: PendingProjectStorage): string =>
  locatorKey(persistentStorageRootKey(storage), storage.providerBasePath);

/** Locators an unfinished operation still claims, mapped to the project it claims them for. */
export const quarantinedLocatorsOf = (recoveries: Iterable<PendingProjectRecovery>): ReadonlyMap<string, string> =>
  new Map([...recoveries].map((recovery) => [pendingStorageLocatorKey(recovery.storage), recovery.projectId]));

export const locatorToPendingStorage = (locator: ProjectLocator): PendingProjectStorage => {
  if (locator.backend === 'webaccess') {
    return {
      backend: locator.backend,
      workspaceId: locator.workspaceId,
      providerBasePath: locator.relativeDirectory,
    };
  }
  if (locator.backend === 'node') {
    return { backend: 'node', ...nodeRootPath(locator.path), providerBasePath: locator.relativeDirectory };
  }
  return {
    backend: locator.backend,
    providerBasePath: locator.relativeDirectory,
  };
};

/** The occurrences of a project id a pass found: its valid, duplicate and route-blocked directories. */
export type ProjectOccurrence = Extract<ProjectDiscoveryEntry, { status: 'valid' | 'duplicate-id' | 'route-blocked' }>;

export const projectOccurrences = (discovery: ProjectDiscoveryResult, projectId: string): ProjectOccurrence[] =>
  discovery.entries.filter(
    (entry): entry is ProjectOccurrence =>
      (entry.status === 'valid' || entry.status === 'duplicate-id' || entry.status === 'route-blocked') &&
      entry.projectId === projectId,
  );

/**
 * Rows without a live handle are disconnected, not absent — the remedy is
 * re-picking the folder, not connecting a first one (DF4).
 */
export const resolveWorkspaceForWrite = async (workspaceId: string): Promise<WorkspaceEntry> => {
  if (directoryPicker().backend !== 'webaccess' || !directoryPicker().available) {
    throw new WorkspaceDirectoryRequiredError('unsupported', { workspaceId });
  }
  const rows = await listWorkspaces();
  if (!rows.some((workspace) => workspace.workspaceId === workspaceId)) {
    throw new WorkspaceDirectoryRequiredError('missing', { workspaceId });
  }
  const entry = await getWorkspace(workspaceId);
  if (!entry) {
    throw new WorkspaceDirectoryRequiredError('disconnected', { workspaceId });
  }
  if ((await checkHandlePermission(entry.handle)) !== 'granted') {
    throw new WorkspaceDirectoryRequiredError('permission', { workspaceId });
  }
  return entry;
};

export const pendingStorageToScope = async (storage: PendingProjectStorage): Promise<StorageRootConfig> => {
  if (storage.backend === 'node') {
    return { backend: 'node', path: storage.path ?? nodeHomeRoot() };
  }
  if (storage.backend !== 'webaccess') {
    return { backend: storage.backend };
  }
  const entry = await resolveWorkspaceForWrite(storage.workspaceId);
  return {
    backend: 'webaccess',
    directoryHandle: entry.handle,
    workspaceId: storage.workspaceId,
  };
};

/**
 * Which rows' workspaces are present (rule 6 of `LibraryCatalog`): a webaccess row's folder handle is held. A lapsed
 * permission (`'prompt'`) with the handle held counts as present (D14), so the permission is not read here; the replay
 * reads it and fails `workspace-unavailable` as before. A row on a Home backend or a native folder names no handle,
 * and is present, as today's retry treats it.
 */
export const presentWorkspaceRows = async (rows: readonly RecoveryRowInput[]): Promise<readonly string[]> => {
  const present = await Promise.all(
    rows.map(async (row) => {
      if (row.storage.backend !== 'webaccess') {
        return true;
      }
      return (await getWorkspace(row.storage.workspaceId)) !== undefined;
    }),
  );
  return rows.flatMap((row, index) => (present[index] ? [row.operationId] : []));
};

/** The attachment store a composer directory names; the Home composer's when none is named. */
export const composerAttachmentsOf = (
  recordFiles: ProjectLibraryFileManager['recordFiles'],
  directory: string | undefined,
): AttachmentStore =>
  directory === undefined
    ? createComposerRecordStore(recordFiles, composerRecordPaths.newProject).attachments
    : createAttachmentStore(recordFiles, directory);

/**
 * Keep a new chat's device-relative placement in this device's placements record for its project (XD2).
 *
 * `chat.json` keeps the chat's intent and never a host that only this device can name, so a chat created on
 * `origin` or a loopback daemon would otherwise open on this device's default. A failed write leaves the chat on
 * that default, which is where it would run on any other device anyway.
 */
export const rememberChatPlacement = async (
  recordFiles: ProjectLibraryFileManager['recordFiles'],
  { projectId, chatId, execution }: Readonly<{ projectId: string; chatId: string; execution?: CadAgentExecution }>,
): Promise<void> => {
  const placement = chatPlacementOf(execution);
  if (placement === undefined) {
    return;
  }
  await writeChatPlacement({ client: recordFiles, projectId, chatId, placement });
};

/**
 * Copy a new chat's referenced attachments out of the composer directory the
 * operation names. Idempotent by hash, so a resumed operation repeats it safely.
 */
const promoteDraftAttachments = async (
  recordFiles: ProjectLibraryFileManager['recordFiles'],
  operation: PendingProjectOperation,
  chats: readonly Chat[],
): Promise<void> => {
  // Only a create carries a fresh draft; a duplicate's chats already own their bytes.
  if (operation.kind !== 'create') {
    return;
  }
  const source = composerAttachmentsOf(recordFiles, operation.attachmentSource);
  await Promise.all(
    chats.map(async (chat) => {
      const target = createChatAttachmentStore(recordFiles, operation.projectId, chat.id);
      const references = chat.messages.flatMap((message) =>
        message.parts.flatMap((part) => {
          const reference = part.type === 'file' ? attachmentReferenceOf(part) : undefined;
          return reference === undefined ? [] : [reference];
        }),
      );
      await Promise.all(references.map(async (reference) => source.copyTo(target, reference)));
    }),
  );
};

/**
 * Reclaim a permanently deleted project's composer records (blueprint D11).
 *
 * Every per-chat record for the project, and the draft-stage attachments
 * beside them, live under the one Home-workspace directory, so the subtree
 * goes in a single recursive removal keyed on the project id — no other
 * project's records are under it. A project that never held a draft has no
 * directory at all, and that absence is not a failure.
 */
const removeProjectComposerRecords = async (
  recordFiles: ProjectLibraryFileManager['recordFiles'],
  projectId: string,
): Promise<void> => {
  try {
    await recordFiles.rmdir(composerRecordPaths.project(projectId), { recursive: true });
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
};

const assertProjectAbsentAfterDelete = async (
  fileManager: ProjectLibraryFileManager,
  projectId: string,
  storage: PendingProjectStorage,
): Promise<void> => {
  const discovery = await fileManager.client.listProjectManifests();
  const rootStatus = discovery.roots.find(
    (root) => persistentStorageRootKey(root.root) === persistentStorageRootKey(storage),
  );
  if (rootStatus?.status !== 'complete' || discovery.roots.some((root) => root.status === 'inaccessible')) {
    throw new PendingProjectRecoveryError('workspace-unavailable');
  }
  if (projectOccurrences(discovery, projectId).length > 0) {
    throw new PendingProjectRecoveryError('identity-conflict');
  }
};

/** What committing a pending operation reads and writes through. */
export type CommitIo = Readonly<{
  fileManager: ProjectLibraryFileManager;
  worker: Remote<ObjectStoreWorker>;
  chatStore: ChatStorage;
  queryClient: QueryClient;
}>;

/** Commit one pending operation's directory and its local state; a failure carries its recovery reason. */
export const commitPendingProjectOperation = async (
  { fileManager, worker, chatStore, queryClient }: CommitIo,
  operation: PendingProjectOperation,
): Promise<void> => {
  if (operation.kind === 'permanent-delete') {
    let result;
    try {
      result = await fileManager.client.permanentlyDeleteProjectDirectory({
        projectId: operation.projectId,
        providerBasePath: operation.storage.providerBasePath,
        scope: await pendingStorageToScope(operation.storage),
      });
    } catch (error) {
      throw new PendingProjectRecoveryError(
        error instanceof WorkspaceDirectoryRequiredError ? 'workspace-unavailable' : 'filesystem-error',
        { cause: error },
      );
    }
    if (result.status === 'identity-mismatch' || result.status === 'unidentifiable') {
      throw new PendingProjectRecoveryError('identity-conflict');
    }
    if (result.status === 'absent') {
      await assertProjectAbsentAfterDelete(fileManager, operation.projectId, operation.storage);
    }
    try {
      await worker.deleteProjectResources(operation.projectId);
      await removeProjectComposerRecords(fileManager.recordFiles, operation.projectId);
      const updatedPreferences = await worker.setProjectDisclosure(operation.projectId, undefined);
      if (updatedPreferences) {
        void queryClient.invalidateQueries({ queryKey: ['app-ui-preferences'] });
      }
      await deleteProjectFileSystemConfig(operation.projectId);
      await fileManager.workspace.syncProjectRoots();
      await worker.completePendingProjectOperation(operation.operationId);
    } catch (error) {
      throw new PendingProjectRecoveryError('local-state-error', { cause: error });
    }
    return;
  }

  let result;
  try {
    if (operation.backend === 'indexeddb' || operation.backend === 'opfs') {
      await pinHomeStorageBackend(operation.backend);
    }
    const scope = await pendingStorageToScope(operation);
    /* The bytes are handed over: this attempt owns them, and a retry reads
     * the durable pending operation again (`getPendingProjectOperations`),
     * so the bridge transfers them instead of copying the whole import. */
    const input = {
      providerBasePath: operation.providerBasePath,
      projectId: operation.projectId,
      scope,
      files: Object.fromEntries(Object.entries(operation.files).filter(([path]) => path !== 'tau.json')),
      manifest:
        operation.kind === 'create' &&
        operation.manifestBytes !== undefined &&
        declaresManifest(operation.manifestBytes, operation.manifest)
          ? operation.manifestBytes
          : serializeProjectManifest(operation.manifest),
      ...(operation.kind === 'create' && operation.staging !== undefined ? { staging: operation.staging } : {}),
    };
    result = await fileManager.client.commitPendingProjectDirectory(Object.assign(input, { [consumableBytes]: true }));
  } catch (error) {
    throw new PendingProjectRecoveryError(
      error instanceof WorkspaceDirectoryRequiredError ? 'workspace-unavailable' : 'filesystem-error',
      { cause: error },
    );
  }
  if (result.status === 'identity-mismatch' || result.status === 'unidentifiable-manifest') {
    throw new PendingProjectRecoveryError('identity-conflict');
  }

  try {
    await setProjectFileSystemConfig(pendingStorageToConfig(operation.projectId, operation));
    await fileManager.workspace.syncProjectRoots();
    /* The project's root is mounted by the line above, so the chats this
     * operation carries can be written where they live: files inside it. */
    const chats = await worker.resumePendingProjectOperationResources(operation.operationId);
    // The bytes land before the record that makes the startup request runnable.
    await promoteDraftAttachments(fileManager.recordFiles, operation, chats);
    await Promise.all(chats.map(async (chat) => chatStore.putChatRecord(chat)));
    await worker.completePendingProjectOperation(operation.operationId);
  } catch (error) {
    throw new PendingProjectRecoveryError('local-state-error', { cause: error });
  }
  if (operation.backend === 'indexeddb' || operation.backend === 'opfs') {
    void requestHomeStoragePersistence();
  }
};

/** A commit's failure as the recovery machine counts it. */
export const replayOutcomeOf = (error: unknown): ReplayOutcome => ({
  status: 'failed',
  reason: error instanceof PendingProjectRecoveryError ? error.reason : 'filesystem-error',
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* One discovery pass, in the three steps `libraryDiscovery` fences between. */

/** What a scan read: the classified listing, and the route configs it was classified against. */
export type DiscoveryScan = Readonly<{
  result: ProjectDiscoveryResult;
  configs: ReadonlyMap<string, ProjectFileSystemConfig>;
  quarantinedLocators: ReadonlyMap<string, string>;
}>;

/**
 * Read the roots and the route configs and classify what they hold: a copy no route binds is a `duplicate-id`, and a
 * directory an unfinished operation claims for its own project is hidden (DF11).
 */
export const scanDiscovery = async (
  fileManager: ProjectLibraryFileManager,
  recoveries: () => Iterable<PendingProjectRecovery>,
): Promise<DiscoveryScan> => {
  const quarantinedLocators = new Map(quarantinedLocatorsOf(recoveries()));
  const discoverySpan = readLocalProjectOpenPerformance()?.begin('discovery');
  const scan = async (): Promise<ProjectDiscoveryResult> => {
    try {
      const discovered = await fileManager.client.listProjectManifests();
      discoverySpan?.finish('ok', { scanGenerations: 1, manifestResults: discovered.entries.length });
      return discovered;
    } catch (error) {
      discoverySpan?.finish('error');
      throw error;
    }
  };
  const [discovered, persistedConfigs] = await Promise.all([scan(), getAllProjectFileSystemConfigs()]);
  for (const [locator, projectId] of quarantinedLocatorsOf(recoveries())) {
    quarantinedLocators.set(locator, projectId);
  }
  // One cursor pass over the route configs serves duplicate anchoring, the
  // per-entry reconcile below and the orphan sweep after it.
  const configs = new Map(persistedConfigs.map((config) => [config.projectId, config] as const));
  const occurrenceCount = new Map<string, number>();
  for (const entry of discovered.entries) {
    if (entry.status === 'valid' || entry.status === 'duplicate-id' || entry.status === 'route-blocked') {
      occurrenceCount.set(entry.projectId, (occurrenceCount.get(entry.projectId) ?? 0) + 1);
    }
  }
  const entries = discovered.entries
    .map((entry): ProjectDiscoveryEntry => {
      if (entry.status !== 'valid' && entry.status !== 'duplicate-id') {
        return entry;
      }
      /* A copy never demotes the directory its route already binds: only an
       * unbound copy is quarantined, and with no binding every copy is
       * (blueprint R7; no scan-order winner, F10). */
      return (occurrenceCount.get(entry.projectId) ?? 0) > 1 &&
        !routeBindsLocator(configs.get(entry.projectId), entry.locator)
        ? { ...entry, status: 'duplicate-id' }
        : { ...entry, status: 'valid' };
    })
    .filter((entry) => {
      const claimedBy = quarantinedLocators.get(
        locatorKey(entry.locator.storageRootKey, entry.locator.relativeDirectory),
      );
      if (claimedBy === undefined) {
        return true;
      }
      // A pending operation only hides its *own* project. An identifiable
      // project of a different id is live content and must stay visible (DF11).
      const manifestId = 'projectId' in entry ? entry.projectId : undefined;
      return manifestId !== undefined && manifestId !== claimedBy;
    });
  return { result: { ...discovered, entries }, configs, quarantinedLocators };
};

/**
 * Decide a scan's writes: the route configs to write for the directories found, with a project whose route is bound
 * to an incomplete root marked `route-blocked`, and the orphans to delete, once the worker that deletes them is ready.
 */
export const planDiscovery = async (
  scan: DiscoveryScan,
  readiedWorker: () => Promise<unknown>,
): Promise<DiscoveryPlan> => {
  const configs = new Map(scan.configs);
  const { quarantinedLocators } = scan;
  let { result } = scan;
  const rootStatuses = new Map(result.roots.map((root) => [persistentStorageRootKey(root.root), root.status] as const));
  // A config pointing at a workspace row that no longer exists is dangling:
  // its old location is unreachable by definition, so re-pointing cannot
  // lose data. `rootStatuses` alone cannot tell "unknown workspace" from
  // "workspace not scanned this pass", which is why the store is consulted.
  const workspaces = await listWorkspaces();
  const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId));
  const configUpserts: ProjectFileSystemConfig[] = [];
  const configDeletes: string[] = [];
  const blockedProjectIds = new Set<string>();
  for (const entry of result.entries) {
    if (entry.status !== 'valid') {
      continue;
    }
    const existing = configs.get(entry.projectId);
    const next = routeConfigFor(entry.projectId, entry.locator);
    if (existing) {
      // Which physical root the row names: the workspace for webaccess, the
      // absolute path for node. Every other backend has exactly one root.
      const sameWorkspace =
        existing.backend === 'webaccess'
          ? next.backend === 'webaccess' && existing.workspaceId === next.workspaceId
          : existing.backend !== 'node' || (next.backend === 'node' && existing.path === next.path);
      if (existing.backend === next.backend && existing.providerBasePath === next.providerBasePath && sameWorkspace) {
        continue;
      }
      const isDangling = existing.backend === 'webaccess' && !knownWorkspaceIds.has(existing.workspaceId);
      if (
        !isDangling &&
        existing.backend !== 'memory' &&
        rootStatuses.get(persistentStorageRootKey(existing)) !== 'complete'
      ) {
        blockedProjectIds.add(entry.projectId);
        continue;
      }
    }
    configUpserts.push(next);
    configs.set(next.projectId, next);
  }
  if (blockedProjectIds.size > 0) {
    result = {
      ...result,
      entries: result.entries.map((entry) =>
        entry.status === 'valid' && blockedProjectIds.has(entry.projectId)
          ? { ...entry, status: 'route-blocked' }
          : entry,
      ),
    };
  }
  const completeRoots = new Set(
    [...rootStatuses].filter(([, status]) => status === 'complete').map(([storageRootKey]) => storageRootKey),
  );
  const validRoutes = new Set(
    result.entries
      .filter((entry) => entry.status === 'valid')
      .map((entry) => `${entry.locator.storageRootKey}\0${entry.projectId}`),
  );
  // Any discovered directory occupies its locator, whatever its status. A
  // project that is merely unreadable this pass must keep its config.
  const occupiedLocators = new Set(
    result.entries.map((entry) => locatorKey(entry.locator.storageRootKey, entry.locator.relativeDirectory)),
  );
  /* A directory names its own identity. A route still pointing at it under another id is stale (a copy scanned
   * before its identity file arrived was minted a fresh id, then the copy overwrote it), so it goes: kept, it
   * would claim the same physical directory as the route that now binds that identity there (PG-PROJ-5). */
  const identityAtLocator = new Map(
    result.entries.flatMap((entry) =>
      'projectId' in entry
        ? [[locatorKey(entry.locator.storageRootKey, entry.locator.relativeDirectory), entry.projectId] as const]
        : [],
    ),
  );
  const isOrphanedAt = (locator: string, projectId: string): boolean => {
    const identity = identityAtLocator.get(locator);
    return identity === undefined ? !occupiedLocators.has(locator) : identity !== projectId;
  };
  const orphans = [...configs.values()].filter((config) => {
    if (config.backend === 'memory') {
      return false;
    }
    const storageRootKey = persistentStorageRootKey(config);
    return (
      completeRoots.has(storageRootKey) &&
      !validRoutes.has(`${storageRootKey}\0${config.projectId}`) &&
      isOrphanedAt(locatorKey(storageRootKey, config.providerBasePath), config.projectId) &&
      !quarantinedLocators.has(locatorKey(storageRootKey, config.providerBasePath))
    );
  });
  // The worker deletes an orphan's chats, editor layout and library rows, so the prune waits for it, as today; the
  // machine checks the epoch after this read, so a pass whose epoch moved meanwhile prunes nothing (I7).
  await readiedWorker();
  // Chats, editor layout and library rows are keyed by project id, so
  // they must go with the config or they re-attach if the folder returns.
  configDeletes.push(...orphans.map((config) => config.projectId));
  return { result, writes: { upserts: configUpserts, deletes: configDeletes } };
};

/**
 * Apply a pass's writes: the orphans' resources, then their route configs with the upserts, then the roots. Once
 * resources are deleted their config rows follow, so nothing stops between the two. The upserts are new writes:
 * `stopped` is asked once more after the deletes, and when a newer build took over meanwhile they are skipped (DF20).
 */
export const applyDiscovery = async (
  fileManager: ProjectLibraryFileManager,
  worker: () => Promise<Remote<ObjectStoreWorker>>,
  { writes, stopped }: Readonly<{ writes: DiscoveryWrites; stopped: () => boolean }>,
): Promise<Readonly<{ skipped: boolean }>> => {
  const { deletes } = writes;
  if (deletes.length > 0) {
    const readied = await worker();
    await Promise.all(deletes.map(async (projectId) => readied.deleteProjectResources(projectId)));
  }
  const upserts = writes.upserts as readonly ProjectFileSystemConfig[];
  const skipped = upserts.length > 0 && stopped();
  const applied = skipped ? [] : upserts;
  if (applied.length > 0 || deletes.length > 0) {
    await applyProjectFileSystemConfigChanges({ upserts: applied, deletes });
    await fileManager.workspace.syncProjectRoots();
  }
  return { skipped };
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Route access reads. */

/**
 * Read the library row, re-minting it from disk when it is missing. A missing
 * row means the origin was evicted (or this profile has never seen the
 * project), so trash state and recency are recovered from
 * `<project>/.tau/library.json` and the manifest mtime rather than invented.
 */
export const ensureProjectLibraryState = async (
  recordFiles: ProjectLibraryFileClient,
  worker: Remote<ObjectStoreWorker>,
  projectId: string,
): Promise<ProjectLibraryState> => {
  const existing = await worker.getProjectLibraryState(projectId);
  if (existing) {
    return existing;
  }
  const [tombstone, lastActivityAt] = await Promise.all([
    readProjectLibraryFile(recordFiles, projectId),
    readManifestActivityAt(recordFiles, projectId),
  ]);
  return worker.createProjectLibraryState({
    projectId,
    lastActivityAt,
    ...(tombstone.deletedAt === undefined ? {} : { deletedAt: tombstone.deletedAt }),
  });
};

/**
 * Why a project the pass did not find cannot open: `unavailable` when its root was inaccessible or its identity could
 * not be read, `conflict` for a foreign identity, otherwise `missing`.
 */
export const classifyMissingProject = async (
  projectId: string,
  discovery: ProjectDiscoveryResult,
): Promise<'unavailable' | 'conflict' | 'missing'> => {
  const config = await getProjectFileSystemConfig(projectId);
  if (
    config &&
    config.backend !== 'memory' &&
    discovery.roots.some(
      (root) =>
        root.status === 'inaccessible' && persistentStorageRootKey(root.root) === persistentStorageRootKey(config),
    )
  ) {
    return 'unavailable';
  }
  const identityFailure = discovery.entries.find(
    (entry) =>
      entry.status === 'invalid' &&
      routeBindsLocator(config, entry.locator) &&
      (entry.issue.code === 'identity-invalid' ||
        entry.issue.code === 'identity-conflict' ||
        entry.issue.code === 'identity-unavailable'),
  );
  if (identityFailure?.status === 'invalid') {
    return identityFailure.issue.code === 'identity-unavailable' ? 'unavailable' : 'conflict';
  }
  return 'missing';
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* The listing. */

const ensureProjectLibraryStates = async (
  recordFiles: ProjectLibraryFileClient,
  worker: Remote<ObjectStoreWorker>,
  projectIds: readonly string[],
): Promise<ReadonlyMap<string, ProjectLibraryState>> => {
  const states = await worker.getProjectLibraryStates(projectIds);
  const byProjectId = new Map(states.map((state) => [state.projectId, state] as const));
  const missing = projectIds.filter((projectId) => !byProjectId.has(projectId));
  const recovered: ProjectLibraryState[] = [];
  for (let offset = 0; offset < missing.length; offset += libraryRecoveryConcurrency) {
    recovered.push(
      // oxlint-disable-next-line eslint/no-await-in-loop -- Chunked filesystem reads bound handle pressure.
      ...(await Promise.all(
        missing.slice(offset, offset + libraryRecoveryConcurrency).map(async (projectId) => {
          const [tombstone, lastActivityAt] = await Promise.all([
            readProjectLibraryFile(recordFiles, projectId),
            readManifestActivityAt(recordFiles, projectId),
          ]);
          return {
            projectId,
            lastActivityAt,
            ...(tombstone.deletedAt === undefined ? {} : { deletedAt: tombstone.deletedAt }),
          };
        }),
      )),
    );
  }
  const created = recovered.length === 0 ? [] : await worker.createProjectLibraryStates(recovered);
  for (const state of created) {
    byProjectId.set(state.projectId, state);
  }
  return byProjectId;
};

/** The binding repairs a pass's `route-blocked` webaccess entries offer, grouped by the workspace that holds them. */
/** A group of binding repairs, with the repairs it would apply. */
export type WorkspaceBindingRepairPlan = WorkspaceBindingRepairGroup & Readonly<{ repairs: WorkspaceBindingRepair[] }>;

export const deriveWorkspaceBindingRepairs = async (
  discovery: ProjectDiscoveryResult,
): Promise<WorkspaceBindingRepairPlan[]> => {
  if (!discovery.entries.some((entry) => entry.status === 'route-blocked' && entry.locator.backend === 'webaccess')) {
    return [];
  }
  const [configs, workspaces] = await Promise.all([getAllProjectFileSystemConfigs(), listWorkspaces()]);
  const configByProjectId = new Map(configs.map((config) => [config.projectId, config] as const));
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace] as const));
  const completeWorkspaceIds = new Set(
    discovery.roots.flatMap(({ root, status }) =>
      status === 'complete' && root.backend === 'webaccess' ? [root.workspaceId] : [],
    ),
  );
  const blocked = discovery.entries.filter(
    (
      entry,
    ): entry is Extract<ProjectDiscoveryEntry, { status: 'route-blocked' }> & {
      locator: Extract<ProjectLocator, { backend: 'webaccess' }>;
    } =>
      entry.status === 'route-blocked' &&
      entry.locator.backend === 'webaccess' &&
      completeWorkspaceIds.has(entry.locator.workspaceId) &&
      projectOccurrences(discovery, entry.projectId).length === 1,
  );
  const sourceWorkspaceIds = new Set(
    blocked.flatMap((entry) => {
      const config = configByProjectId.get(entry.projectId);
      return config?.backend === 'webaccess' ? [config.workspaceId] : [];
    }),
  );
  const sourceEntries = await Promise.all(
    [...sourceWorkspaceIds].map(async (workspaceId) => ({ workspaceId, entry: await getWorkspace(workspaceId) })),
  );
  const connectedSources = new Set(
    sourceEntries.filter(({ entry }) => entry !== undefined).map(({ workspaceId }) => workspaceId),
  );
  const candidates = blocked.flatMap((entry) => {
    const config = configByProjectId.get(entry.projectId);
    if (
      config?.backend !== 'webaccess' ||
      config.workspaceId === entry.locator.workspaceId ||
      config.providerBasePath !== entry.locator.relativeDirectory ||
      !workspaceById.has(config.workspaceId) ||
      connectedSources.has(config.workspaceId)
    ) {
      return [];
    }
    return [
      {
        canonicalWorkspaceId: entry.locator.workspaceId,
        workspaceName: workspaceById.get(entry.locator.workspaceId)?.name ?? entry.locator.workspaceId,
        repair: {
          projectId: entry.projectId,
          sourceWorkspaceId: config.workspaceId,
          providerBasePath: config.providerBasePath,
        } satisfies WorkspaceBindingRepair,
      },
    ];
  });
  const byWorkspace = Map.groupBy(candidates, ({ canonicalWorkspaceId }) => canonicalWorkspaceId);
  return [...byWorkspace].map(([canonicalWorkspaceId, group]) => ({
    canonicalWorkspaceId,
    workspaceName: group[0]!.workspaceName,
    projectCount: group.length,
    repairs: group.map(({ repair }) => repair),
  }));
};

/** Enrich a pass's listing into what the library shows: library rows, slugs, conflicts, recoveries and repairs. */
export const buildProjectListing = async (
  { recordFiles, worker }: Readonly<{ recordFiles: ProjectLibraryFileClient; worker: Remote<ObjectStoreWorker> }>,
  discovery: ProjectDiscoveryResult,
  recoveries: () => readonly PendingProjectRecovery[],
): Promise<ProjectListing> => {
  const validEntries = discovery.entries.filter(
    (entry): entry is Extract<ProjectDiscoveryEntry, { status: 'valid' }> => entry.status === 'valid',
  );
  // Slugs come from the same pass that produced the locators, so every
  // listing-fed surface can render its canonical `/w/…` link without a
  // second lookup (blueprint L1).
  const [workspaces, libraryStates, workspaceBindingRepairs] = await Promise.all([
    listWorkspaces(),
    ensureProjectLibraryStates(
      recordFiles,
      worker,
      validEntries.map(({ projectId }) => projectId),
    ),
    deriveWorkspaceBindingRepairs(discovery),
  ]);
  const projects: ProjectLibraryEntry[] = validEntries.map((entry) => {
    const { locator } = entry;
    const slugs = projectSlugsOf(locator, workspaces);
    const workspaceName =
      locator.backend === 'webaccess'
        ? workspaces.find((workspace) => workspace.workspaceId === locator.workspaceId)?.name
        : undefined;
    return {
      projectId: entry.projectId,
      manifest: entry.manifest,
      library: libraryStates.get(entry.projectId)!,
      locator,
      ...(slugs === undefined ? {} : { slugs }),
      ...(workspaceName === undefined ? {} : { workspaceName }),
      ...(entry.issue === undefined ? {} : { issue: entry.issue }),
    };
  });
  const conflicts: ProjectDiscoveryConflict[] = discovery.entries.filter(
    (entry): entry is Exclude<ProjectDiscoveryEntry, { status: 'valid' }> => entry.status !== 'valid',
  );
  return {
    projects,
    conflicts,
    recoveries: recoveries(),
    workspaceBindingRepairs: workspaceBindingRepairs.map(({ repairs: _repairs, ...group }) => group),
  };
};
