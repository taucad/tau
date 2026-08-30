import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import { createContext, useContext, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { KernelProvider } from '@taucad/runtime';
import type {
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  ProjectLocator,
  StorageRootConfig,
} from '@taucad/filesystem';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import type { Chat } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import type { Remote } from 'comlink';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { projectManagerMachine } from '#hooks/project-manager.machine.js';
import type { ObjectStoreWorker, InitialEditorState } from '#hooks/object-store.worker.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import {
  createWorkspace,
  setProjectFileSystemConfig,
  getProjectFileSystemConfig,
  getHomeStorageBackend,
  getProjectCreationLocation,
  getWorkspace,
  checkHandlePermission,
  requestHandlePermission,
  deleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs,
  listWorkspaces,
  pinHomeStorageBackend,
  setProjectCreationLocation,
  subscribeProjectRootConfigurationChanges,
  applyProjectFileSystemConfigChanges,
  repairWorkspaceBindings as repairStoredWorkspaceBindings,
} from '#filesystem/handle-store.js';
import type {
  ProjectFileSystemConfig,
  Workspace,
  WorkspaceBindingRepair,
  WorkspaceBindingRepairResult,
  WorkspaceEntry,
} from '#filesystem/handle-store.js';
import { isBuildSuperseded } from '#filesystem/build-skew.js';
import { WorkspaceDirectoryRequiredError } from '#filesystem/workspace-errors.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import { createInitialProject } from '#constants/project.constants.js';
import { createMessage } from '#utils/chat.utils.js';
import { getMainFile, getEmptyCode } from '#utils/kernel.utils.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { defaultProjectName } from '#constants/project-names.js';
import type { AppUiPreferences, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import type {
  PendingProjectOperation,
  PendingProjectRecovery,
  PendingProjectRecoveryReason,
  PendingProjectStorage,
} from '#types/pending-project-operation.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project.types.js';
import { allocateProjectDirectorySlug } from '#utils/project-directory.utils.js';
import { directorySlug, homeWorkspaceSlug, projectSlugsOf } from '#utils/project-url.utils.js';
import type { ProjectSlugs } from '#utils/project-url.utils.js';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { metaConfig } from '#constants/meta.constants.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import { selectWorkspaceConnectionState, workspaceConnectionMachine } from '#hooks/workspace-connection.machine.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { getChatRecencyAt } from '#utils/chat-recency.utils.js';
import type { PreparedWorkspaceCatalog, WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';

/**
 * Shared options for initial chat configuration.
 *
 * Note: the initial-message metadata block intentionally only carries
 * `status: pending`. Per-request configuration (kernel / model / mode /
 * toolChoice / testingEnabled / snapshot / contextPayload) is composed at
 * request time. Homepage-created chats opt into the one-shot hydration run
 * with `Chat.startupRequest`; plain pending messages are display state only.
 */
type CreateProjectChatOptions = {
  /** If provided, add to chat and seed a one-shot startup request. */
  initialMessage?: {
    content: string;
    imageUrls?: string[];
  };
  /** Chat name (defaults to 'Initial design' with message, 'Initial chat' without) */
  chatName?: string;
  /** Initial editor state overrides (e.g., panelState for initial panel layout) */
  editorState?: InitialEditorState;
  /** Explicit product location. Omission resolves the last successful location. */
  location?: ProjectCreationLocation;
  /**
   * Seed `Chat.activeModel` so the chat owns its model choice independent
   * of the cookie default. Required when `initialMessage` is supplied so the
   * one-shot startup request runs with the caller's intended model rather
   * than whatever the cookie happens to hold at hydration time.
   */
  activeModel?: string;
  /**
   * Seed `Chat.activeKernel`. Defaults to the project's `kernel` field when
   * the project is created from a kernel template, otherwise undefined.
   */
  activeKernel?: KernelProvider;
};

/**
 * Create a new empty project from a kernel template.
 * Use this when starting a fresh project from scratch.
 */
type CreateProjectFromKernel = CreateProjectChatOptions & {
  /** The kernel/language to use for the new project */
  kernel: KernelProvider;
  /** Override default project name */
  projectName?: string;
};

/**
 * Create a project from existing project data and files.
 * Use this when cloning, remixing, or importing a project.
 */
type CreateProjectFromData = CreateProjectChatOptions & {
  /** The project metadata to use */
  project: Omit<ProjectManifest, '$schema' | 'id'>;
  /** The files for the project */
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
};

/**
 * Options for creating a project with an associated chat.
 * Either create from a kernel template (new project) or from existing data (clone/remix).
 */
export type CreateProjectOptions = CreateProjectFromKernel | CreateProjectFromData;

/**
 * A freshly minted project plus the slugs of the location it was allocated at.
 * Creation flows navigate straight to `projectUrl(result.slugs)` — the legacy
 * id-addressed URL is gone (blueprint L1/L2).
 */
export type CreatedProject = ProjectManifest & { readonly slugs: ProjectSlugs };

export type ConnectedWorkspace = {
  readonly workspace: Workspace;
  readonly projectCount: number;
  readonly minted: boolean;
};

type ProjectManagerContextType = {
  isLoading: boolean;
  error: Error | undefined;
  projectManagerRef: ActorRefFrom<typeof projectManagerMachine>;
  workspaceConnection: WorkspaceConnectionState;
  connectWorkspace: (handle?: FileSystemDirectoryHandle) => Promise<ConnectedWorkspace | undefined>;
  retryWorkspaceConnection: () => Promise<ConnectedWorkspace | undefined>;
  refreshWorkspaceCatalog: () => Promise<void>;
  repairWorkspaceBindings: (workspaceId: string) => Promise<WorkspaceBindingRepairResult>;
  createProject: (options: CreateProjectOptions) => Promise<CreatedProject>;
  updateProject: (projectId: string, update: PartialDeep<ProjectManifest>) => Promise<ProjectManifest | undefined>;
  touchProject: (projectId: string, activityAt?: number) => Promise<ProjectLibraryState | undefined>;
  duplicateProject: (projectId: string) => Promise<CreatedProject>;
  getProjects: (options?: { includeDeleted?: boolean }) => Promise<ProjectLibraryEntry[]>;
  getProjectListing: (options?: { includeDeleted?: boolean }) => Promise<ProjectListing>;
  getProject: (projectId: string) => Promise<ProjectManifest | undefined>;
  getProjectRouteAccess: (projectId: string) => Promise<ProjectRouteAccess>;
  getProjectLibraryState: (projectId: string) => Promise<ProjectLibraryState | undefined>;
  setProjectRevisionState: (
    projectId: string,
    revisionState: NonNullable<ProjectLibraryState['revisionState']>,
  ) => Promise<ProjectLibraryState | undefined>;
  restoreProject: (projectId: string) => Promise<boolean>;
  /** @returns whether a library row was actually trashed — a vanished row is not a success (DF3). */
  deleteProject: (projectId: string) => Promise<boolean>;
  permanentlyDeleteProject: (projectId: string) => Promise<void>;
  /** Give an `adoption-required` directory a fresh identity so it becomes a real project (R11). */
  adoptProject: (locator: ProjectLocator) => Promise<ProjectManifest>;
  /** Drop a pending operation the user has given up on (DF11). */
  discardRecovery: (operationId: string) => Promise<void>;
  assertWorkspaceMutationAllowed: (workspaceId: string) => Promise<void>;
  getAppUiPreferences: () => Promise<AppUiPreferences>;
  setProjectDisclosure: (projectId: string, expanded: boolean | undefined) => Promise<AppUiPreferences | undefined>;
  // Chat methods
  createChat: (
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt' | 'hasUnreadTurn'> & {
      id?: string;
    },
  ) => Promise<Chat>;
  createNavigationRepairChat: (resourceId: string) => Promise<Chat>;
  updateChat: (chatId: string, update: PartialDeep<Chat>) => Promise<Chat | undefined>;
  applyGeneratedChatName: (chatId: string, name: string) => Promise<Chat | undefined>;
  patchChat: <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]) => Promise<Chat | undefined>;
  touchChatRecency: (chatId: string, requestedAt: number) => Promise<Chat | undefined>;
  setChatUnreadState: (chatId: string, hasUnreadTurn: boolean) => Promise<Chat | undefined>;
  consumeChatStartupRequest: (chatId: string, requestId: string) => Promise<Chat | undefined>;
  commitCancelledDraftRestore: (chatId: string, input: CommitCancelledDraftRestoreInput) => Promise<Chat | undefined>;
  setMessageEdit: (
    chatId: string,
    messageId: string,
    draft: NonNullable<Chat['messageEdits']>[string],
  ) => Promise<Chat | undefined>;
  clearMessageEdit: (chatId: string, messageId: string) => Promise<Chat | undefined>;
  softDeleteChat: (chatId: string) => Promise<Chat | undefined>;
  duplicateChat: (chatId: string) => Promise<Chat>;
  getAllChats: (options?: { includeDeleted?: boolean }) => Promise<Chat[]>;
  getChatsForResource: (resourceId: string, options?: { includeDeleted?: boolean }) => Promise<Chat[]>;
  getChat: (chatId: string) => Promise<Chat | undefined>;
  deleteChat: (chatId: string) => Promise<void>;
};

export type ProjectDiscoveryConflict =
  | Extract<ProjectDiscoveryEntry, { status: 'adoption-required' }>
  | Extract<ProjectDiscoveryEntry, { status: 'duplicate-id' }>
  | Extract<ProjectDiscoveryEntry, { status: 'route-blocked' }>
  | Extract<ProjectDiscoveryEntry, { status: 'invalid' }>;

export type ProjectListing = {
  readonly projects: readonly ProjectLibraryEntry[];
  readonly conflicts: readonly ProjectDiscoveryConflict[];
  readonly recoveries: readonly PendingProjectRecovery[];
  readonly workspaceBindingRepairs: readonly WorkspaceBindingRepairGroup[];
};

export type WorkspaceBindingRepairGroup = {
  readonly canonicalWorkspaceId: string;
  readonly workspaceName: string;
  readonly projectCount: number;
};

export type ProjectRouteAccess =
  | { readonly status: 'ready'; readonly project: ProjectManifest }
  | { readonly status: 'trashed'; readonly project: ProjectManifest }
  | { readonly status: 'recovering'; readonly recovery: Extract<PendingProjectRecovery, { status: 'recovering' }> }
  | {
      readonly status: 'recovery-failed';
      readonly recovery: Extract<PendingProjectRecovery, { status: 'failed' }>;
    }
  | { readonly status: 'conflict' | 'unavailable' | 'missing' };

const ProjectManagerContext = createContext<ProjectManagerContextType | undefined>(undefined);

/**
 * Milliseconds. A single mutation fans out across seven worker event channels,
 * and a burst (project creation, import, an agent write pass) fires far faster
 * than a discovery rescan completes: one trailing-edge refetch per burst.
 */
const discoveryInvalidationDebounce = 300;

/** Concurrent disk-side library-state recoveries after IndexedDB eviction. */
const libraryRecoveryConcurrency = 16;

type WorkspaceConnectionTrace = {
  readonly operationId: string;
  startedAt: number;
  workspaceId: string | undefined;
  registeringDuration: number;
  mountingDuration: number;
  catalogDuration: number;
  publishingDuration: number;
  candidateCount: number;
  projectCount: number;
  conflictCount: number;
};

/**
 * Failure modes that a later attempt cannot change: the directory holds foreign
 * content, or local state is already inconsistent. Re-running them only burns
 * writes and re-reports the same banner (DF11).
 */
const terminalRecoveryReasons = new Set<PendingProjectRecoveryReason>([
  'identity-conflict',
  'filesystem-error',
  'local-state-error',
]);

/** Attempts per pending operation per session, retryable reasons included. */
const maxRecoveryAttempts = 3;

const pendingStorageToConfig = (projectId: string, storage: PendingProjectStorage): ProjectFileSystemConfig => ({
  projectId,
  ...storage,
});

class PendingProjectRecoveryError extends Error {
  public readonly reason: PendingProjectRecoveryReason;

  public constructor(reason: PendingProjectRecoveryReason, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = 'PendingProjectRecoveryError';
    this.reason = reason;
  }
}

const pendingOperationStorage = (operation: PendingProjectOperation): PendingProjectStorage =>
  operation.kind === 'permanent-delete' ? operation.storage : operation;

const pendingOperationProjectId = (operation: PendingProjectOperation): string =>
  operation.kind === 'permanent-delete' ? operation.projectId : operation.manifest.id;

const pendingOperationRecovery = (operation: PendingProjectOperation): PendingProjectRecovery => {
  const storage = pendingOperationStorage(operation);
  return {
    operationId: operation.operationId,
    projectId: pendingOperationProjectId(operation),
    kind: operation.kind,
    storage: { ...storage },
    status: 'recovering',
  };
};

const locatorKey = (storageRootKey: string, providerBasePath: string): string =>
  `${storageRootKey}\0${providerBasePath}`;

/**
 * Disk-side mirror of the profile-local library row. IndexedDB is evictable,
 * the workspace folder is not, so trash judgment lives here too.
 */
type ProjectLibraryFile = { readonly deletedAt?: number };

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
    return typeof parsed === 'object' && parsed !== null ? (parsed as ProjectLibraryFile) : {};
  } catch {
    return {};
  }
};

/** Best effort: an unwritable workspace must never fail a trash or restore. */
const writeProjectLibraryFile = async (
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

type PersistentStorageRoot =
  | { readonly backend: 'indexeddb' | 'opfs' }
  | { readonly backend: 'webaccess'; readonly workspaceId: string };

/**
 * The worker's own derivation, bound to this app shell's database prefix —
 * never a second implementation: the blocking decision in discovery compares
 * these keys across the worker boundary (R12).
 */
const persistentStorageRootKey = (root: PersistentStorageRoot): string =>
  resolveStorageRootKey(root, metaConfig.databasePrefix);

/**
 * Allocate the physical directory for a new project at `root`: the name slug,
 * suffixed until it is free against everything discovery can see there
 * (blueprint D3). Commit-time exactness — the service creates the named target
 * or fails — plus the post-commit `tau.json` read-back remain the authority; a
 * listing raced by another tab can only cost a retry, never a wrong identity.
 */
const allocateProjectBasePath = async (
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
const quarantinedLocatorsOf = (recoveries: Iterable<PendingProjectRecovery>): ReadonlyMap<string, string> =>
  new Map([...recoveries].map((recovery) => [pendingStorageLocatorKey(recovery.storage), recovery.projectId]));

const locatorToPendingStorage = (locator: ProjectLocator): PendingProjectStorage =>
  locator.backend === 'webaccess'
    ? {
        backend: locator.backend,
        workspaceId: locator.workspaceId,
        providerBasePath: locator.relativeDirectory,
      }
    : {
        backend: locator.backend,
        providerBasePath: locator.relativeDirectory,
      };

const projectOccurrences = (discovery: ProjectDiscoveryResult, projectId: string) =>
  discovery.entries.filter(
    (entry): entry is Extract<ProjectDiscoveryEntry, { status: 'valid' | 'duplicate-id' | 'route-blocked' }> =>
      (entry.status === 'valid' || entry.status === 'duplicate-id' || entry.status === 'route-blocked') &&
      entry.manifest.id === projectId,
  );

/**
 * Rows without a live handle are disconnected, not absent — the remedy is
 * re-picking the folder, not connecting a first one (DF4).
 */
const resolveWorkspaceForWrite = async (workspaceId: string): Promise<WorkspaceEntry> => {
  if (!isFileSystemAccessSupported) {
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

const pendingStorageToScope = async (storage: PendingProjectStorage): Promise<StorageRootConfig> => {
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

export function ProjectManagerProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const actorRef = useActorRef(projectManagerMachine);
  const fileManager = useFileManager();
  const queryClient = useQueryClient();
  const workspaceTelemetry = useWorkspaceTelemetry();
  const projectNameClient = useProjectNameClient();
  const discoveryReadinessRef = useRef<Promise<void> | undefined>(undefined);
  const recoveryLoopRef = useRef<Promise<void> | undefined>(undefined);
  const recoveriesRef = useRef(new Map<string, PendingProjectRecovery>());
  /** Settle attempts per pending operation this session (DF11 retry cap). */
  const recoveryAttemptsRef = useRef(new Map<string, number>());
  const discoveryPassRef = useRef<Promise<ProjectDiscoveryResult> | undefined>(undefined);
  const connectionTraceRef = useRef<WorkspaceConnectionTrace | undefined>(undefined);
  const connectionPromiseRef = useRef<Promise<ConnectedWorkspace | undefined> | undefined>(undefined);
  /**
   * Bumped when a discovery pass starts and when the durable route
   * configuration changes underneath one. A pass whose epoch is no longer
   * current holds a stale snapshot and must not garbage-collect configs.
   */
  const discoveryEpochRef = useRef(0);
  const [recoveryRevision, setRecoveryRevision] = useState(0);

  const invalidateProjectsList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);

  const invalidateChatQueries = useCallback(
    (resourceId: string, chatId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },
    [queryClient],
  );

  const invalidationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleProjectsListInvalidation = useCallback(() => {
    clearTimeout(invalidationTimerRef.current);
    invalidationTimerRef.current = setTimeout(invalidateProjectsList, discoveryInvalidationDebounce);
  }, [invalidateProjectsList]);

  useEffect(() => {
    return () => {
      clearTimeout(invalidationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const channel = fileManager.workerChangeChannel;
    if (!channel) {
      return;
    }
    /**
     * Discovery-relevant change paths under the flat layout: the synthetic
     * root event, a root-level directory (a project directory appearing or
     * going away), and any `tau.json`. Dot-prefixed segments are workspace or
     * project app state (`.tau/**`) and must never trigger a rescan (F1).
     */
    const isManifestPath = (path: string): boolean => {
      const segments = path.split('/').filter(Boolean);
      if (segments.length === 0) {
        return true;
      }
      if (segments.some((segment) => segment.startsWith('.'))) {
        return false;
      }
      return segments.length === 1 || segments.at(-1) === 'tau.json';
    };
    const subscription = { interestedIn: isManifestPath, handler: scheduleProjectsListInvalidation };
    const unsubscribers = [
      channel.onFileWritten(subscription),
      channel.onFileDeleted(subscription),
      channel.onFileRenamed(subscription),
      channel.onDirectoryCreated(subscription),
      channel.onDirectoryDeleted(subscription),
      channel.onDirectoryRenamed(subscription),
      channel.onDirectoryChanged(subscription),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [fileManager.workerChangeChannel, scheduleProjectsListInvalidation]);

  // Select state from the machine
  const error = useSelector(actorRef, (state) => state.context.error);
  const isLoading = useSelector(actorRef, (state) => {
    return state.matches('initializing') || state.matches('creatingWorker');
  });

  useEffect(() => {
    // Initialize the machine on mount
    actorRef.send({ type: 'initialize' });
  }, [actorRef]);

  const getReadiedWorker = useCallback(async (): Promise<Remote<ObjectStoreWorker>> => {
    const snapshot = await waitFor(actorRef, (state) => state.matches('ready') || state.matches('error'));
    if (snapshot.matches('error')) {
      throw new Error('Projct manager worker failed to initialize');
    }

    if (!snapshot.context.wrappedWorker) {
      throw new Error('Projct manager worker not initialized');
    }

    return snapshot.context.wrappedWorker;
  }, [actorRef]);

  const discoverPermanentDeleteStorage = useCallback(
    async (projectId: string): Promise<PendingProjectStorage> => {
      const configured = await getProjectFileSystemConfig(projectId);
      if (configured === undefined || configured.backend === 'memory') {
        throw new Error(`Project locator unavailable: ${projectId}`);
      }
      const discovery = await fileManager.client.listProjectManifests();
      const configuredRoot = persistentStorageRootKey(configured);
      const configuredRootStatus = discovery.roots.find(
        (root) => persistentStorageRootKey(root.root) === configuredRoot,
      );
      if (
        configuredRootStatus?.status !== 'complete' ||
        discovery.roots.some((root) => root.status === 'inaccessible')
      ) {
        throw new Error(`Project storage is not completely observable: ${projectId}`);
      }
      const occurrences = projectOccurrences(discovery, projectId);
      if (occurrences.length !== 1 || occurrences[0]?.status !== 'valid') {
        throw new Error(`Project must have exactly one current occurrence: ${projectId}`);
      }
      return locatorToPendingStorage(occurrences[0].locator);
    },
    [fileManager.client],
  );

  const assertProjectAbsentAfterDelete = useCallback(
    async (projectId: string, storage: PendingProjectStorage): Promise<void> => {
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
    },
    [fileManager.client],
  );

  const resumePendingProjectOperation = useCallback(
    async (operation: PendingProjectOperation, suppliedWorker?: Remote<ObjectStoreWorker>): Promise<void> => {
      const worker = suppliedWorker ?? (await getReadiedWorker());

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
          await assertProjectAbsentAfterDelete(operation.projectId, operation.storage);
        }
        try {
          await worker.deleteProjectResources(operation.projectId);
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
        result = await fileManager.client.commitPendingProjectDirectory({
          providerBasePath: operation.providerBasePath,
          scope,
          files: Object.fromEntries(Object.entries(operation.files).filter(([path]) => path !== 'tau.json')),
          manifest: serializeProjectManifest(operation.manifest),
        });
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
        await setProjectFileSystemConfig(pendingStorageToConfig(operation.manifest.id, operation));
        await fileManager.workspace.syncProjectRoots();
        await worker.resumePendingProjectOperationResources(operation.operationId);
        await worker.completePendingProjectOperation(operation.operationId);
      } catch (error) {
        throw new PendingProjectRecoveryError('local-state-error', { cause: error });
      }
    },
    [assertProjectAbsentAfterDelete, fileManager, getReadiedWorker, queryClient],
  );

  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> => {
      const worker = await getReadiedWorker();

      const { location: explicitLocation } = options;
      let location = explicitLocation;
      if (!location) {
        const { location: preferredLocation } = await getProjectCreationLocation({
          webAccessSupported: isFileSystemAccessSupported,
        });
        location = preferredLocation;
      }
      let storageRoot:
        | { readonly backend: 'indexeddb' | 'opfs' }
        | { readonly backend: 'webaccess'; readonly workspaceId: string };
      // The workspace is resolved here, so the result can carry the canonical
      // URL its caller navigates to instead of riding an id-addressed redirect.
      let workspaceSlug: string;
      if (location.kind === 'workspace') {
        const entry = await resolveWorkspaceForWrite(location.workspaceId);
        storageRoot = {
          backend: 'webaccess',
          workspaceId: entry.workspace.workspaceId,
        };
        workspaceSlug = entry.workspace.slug;
      } else {
        storageRoot = { backend: await getHomeStorageBackend() };
        workspaceSlug = homeWorkspaceSlug;
      }

      // Determine project data and files based on pattern
      let projectData: Omit<ProjectManifest, '$schema' | 'id'>;
      let files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
      let kernel: KernelProvider | undefined;

      if ('kernel' in options) {
        // CreateProjectFromKernel: Generate from kernel template
        kernel = options.kernel;
        const { projectName: requestedProjectName } = options;
        let projectName = requestedProjectName;
        if (!projectName && options.initialMessage) {
          const generated = await projectNameClient.generate({
            text: options.initialMessage.content,
            imageUrls: options.initialMessage.imageUrls,
          });
          projectName = generated.trim() || defaultProjectName;
        }
        const mainFileName = getMainFile(options.kernel);
        const emptyCode = getEmptyCode(options.kernel);
        const result = createInitialProject({
          projectName: projectName ?? defaultProjectName,
          mainFileName,
          emptyCodeContent: encodeTextFile(emptyCode),
        });
        projectData = result.projectData;
        files = result.files;
      } else {
        // CreateProjectFromData: Use provided project data and files
        projectData = options.project;
        files = options.files;
      }

      const projectId = generatePrefixedId(idPrefix.project);
      const manifest = projectToManifest({ ...projectData, id: projectId });
      const providerBasePath = await allocateProjectBasePath(fileManager.client, storageRoot, manifest.name);
      const pendingStorage: PendingProjectStorage = { ...storageRoot, providerBasePath };

      // The initial homepage prompt remains a normal pending user message
      // for display purposes. The permission to run it automatically after
      // route hydration is separate one-shot command state on the chat row.
      const initialUserMessage = options.initialMessage
        ? createMessage({
            content: options.initialMessage.content,
            role: messageRole.user,
            metadata: {
              status: messageStatus.pending,
            },
            imageUrls: options.initialMessage.imageUrls,
          })
        : undefined;
      const chatMessages = initialUserMessage ? [initialUserMessage] : [];
      const startupRequest: Chat['startupRequest'] | undefined = initialUserMessage
        ? {
            id: generatePrefixedId(idPrefix.request),
            kind: 'regenerate-tail',
            messageId: initialUserMessage.id,
            source: 'homepage-initial-message',
            createdAt: Date.now(),
          }
        : undefined;

      const chatName = options.chatName ?? (options.initialMessage ? 'Initial design' : 'Initial chat');

      // Seed the chat row with chat-scoped active model + kernel so a
      // cookie change in another tab does not mutate the active selection
      // for this freshly-created chat. Defaults to the kernel chosen by
      // the creation flow when not explicitly supplied.
      const seededActiveModel = options.activeModel;
      const seededActiveKernel = options.activeKernel ?? kernel;

      // Single atomic call to create project + chat + Editor state
      const operation = await worker.prepareProjectCreation({
        manifest,
        chat: {
          name: chatName,
          messages: chatMessages,
          activeModel: seededActiveModel,
          activeKernel: seededActiveKernel,
          ...(startupRequest ? { startupRequest } : {}),
        },
        editorState: options.editorState,
        files,
        storage: pendingStorage,
      });
      await resumePendingProjectOperation(operation, worker);
      try {
        await setProjectCreationLocation(location);
      } catch (error) {
        console.warn('[ProjectManager] failed to persist project creation location', error);
      }

      return { ...operation.manifest, slugs: { workspaceSlug, projectSlug: directorySlug(providerBasePath) } };
    },
    [fileManager.client, getReadiedWorker, projectNameClient, resumePendingProjectOperation],
  );

  const runDiscoveryPass = useCallback(
    async (options?: { quarantinedLocators?: ReadonlyMap<string, string> }) => {
      const epoch = ++discoveryEpochRef.current;
      const discovered = await fileManager.client.listProjectManifests();
      const quarantinedLocators = options?.quarantinedLocators ?? quarantinedLocatorsOf(recoveriesRef.current.values());
      const occurrenceCount = new Map<string, number>();
      for (const entry of discovered.entries) {
        if (entry.status === 'valid' || entry.status === 'duplicate-id' || entry.status === 'route-blocked') {
          occurrenceCount.set(entry.manifest.id, (occurrenceCount.get(entry.manifest.id) ?? 0) + 1);
        }
      }
      const entries = discovered.entries
        .map((entry): ProjectDiscoveryEntry => {
          if (entry.status !== 'valid' && entry.status !== 'duplicate-id') {
            return entry;
          }
          return (occurrenceCount.get(entry.manifest.id) ?? 0) > 1
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
          const manifestId = 'manifest' in entry && 'id' in entry.manifest ? entry.manifest.id : undefined;
          return manifestId !== undefined && manifestId !== claimedBy;
        });
      let result: ProjectDiscoveryResult = { ...discovered, entries };
      if (isBuildSuperseded()) {
        // A newer bundle owns durable state now: publish what we can read and
        // write nothing (DF20).
        return result;
      }
      const rootStatuses = new Map(
        result.roots.map((root) => [persistentStorageRootKey(root.root), root.status] as const),
      );
      // A config pointing at a workspace row that no longer exists is dangling:
      // its old location is unreachable by definition, so re-pointing cannot
      // lose data. `rootStatuses` alone cannot tell "unknown workspace" from
      // "workspace not scanned this pass", which is why the store is consulted.
      const [workspaces, persistedConfigs] = await Promise.all([listWorkspaces(), getAllProjectFileSystemConfigs()]);
      const knownWorkspaceIds = new Set(workspaces.map((workspace) => workspace.workspaceId));
      // One cursor pass over the route configs serves both the per-entry
      // reconcile below and the orphan sweep after it. Mid-loop writes update
      // the map so the sweep judges the route this pass just published.
      const configs = new Map(persistedConfigs.map((config) => [config.projectId, config] as const));
      const configUpserts: ProjectFileSystemConfig[] = [];
      const configDeletes: string[] = [];
      const blockedProjectIds = new Set<string>();
      for (const entry of result.entries) {
        if (entry.status !== 'valid') {
          continue;
        }
        const existing = configs.get(entry.manifest.id);
        const next: ProjectFileSystemConfig =
          entry.locator.backend === 'webaccess'
            ? {
                projectId: entry.manifest.id,
                backend: 'webaccess',
                workspaceId: entry.locator.workspaceId,
                providerBasePath: entry.locator.relativeDirectory,
              }
            : {
                projectId: entry.manifest.id,
                backend: entry.locator.backend,
                providerBasePath: entry.locator.relativeDirectory,
              };
        if (existing) {
          const sameWorkspace =
            existing.backend !== 'webaccess' ||
            (next.backend === 'webaccess' && existing.workspaceId === next.workspaceId);
          if (
            existing.backend === next.backend &&
            existing.providerBasePath === next.providerBasePath &&
            sameWorkspace
          ) {
            continue;
          }
          const isDangling = existing.backend === 'webaccess' && !knownWorkspaceIds.has(existing.workspaceId);
          if (
            !isDangling &&
            existing.backend !== 'memory' &&
            rootStatuses.get(persistentStorageRootKey(existing)) !== 'complete'
          ) {
            blockedProjectIds.add(entry.manifest.id);
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
            entry.status === 'valid' && blockedProjectIds.has(entry.manifest.id)
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
          .map((entry) => `${entry.locator.storageRootKey}\0${entry.manifest.id}`),
      );
      // Any discovered directory occupies its locator, whatever its status. A
      // project that is merely unreadable this pass must keep its config.
      const occupiedLocators = new Set(
        result.entries.map((entry) => locatorKey(entry.locator.storageRootKey, entry.locator.relativeDirectory)),
      );
      const orphanCandidates = [...configs.values()];
      // Only the newest epoch may prune: an older snapshot would delete configs
      // a newer pass — or another tab — has already written.
      if (epoch === discoveryEpochRef.current) {
        const worker = await getReadiedWorker();
        for (const config of orphanCandidates) {
          if (config.backend === 'memory') {
            continue;
          }
          const storageRootKey = persistentStorageRootKey(config);
          if (
            completeRoots.has(storageRootKey) &&
            !validRoutes.has(`${storageRootKey}\0${config.projectId}`) &&
            !occupiedLocators.has(locatorKey(storageRootKey, config.providerBasePath)) &&
            !quarantinedLocators.has(locatorKey(storageRootKey, config.providerBasePath))
          ) {
            // Chats, editor layout and library rows are keyed by project id, so
            // they must go with the config or they re-attach if the folder returns.
            configDeletes.push(config.projectId);
          }
        }
        await Promise.all(configDeletes.map(async (projectId) => worker.deleteProjectResources(projectId)));
      }
      if (configUpserts.length > 0 || configDeletes.length > 0) {
        await applyProjectFileSystemConfigChanges({ upserts: configUpserts, deletes: configDeletes });
        await fileManager.workspace.syncProjectRoots();
      }
      return result;
    },
    [fileManager, getReadiedWorker],
  );

  // Single-flight: the 5 s poll, route access, project reads and the broadcast
  // handler all discover concurrently; one pass serves them all.
  const discoverProjects = useCallback(
    async (options?: { quarantinedLocators?: ReadonlyMap<string, string> }): Promise<ProjectDiscoveryResult> => {
      const inFlight = discoveryPassRef.current;
      if (inFlight) {
        return inFlight;
      }
      const pass = (async () => {
        try {
          return await runDiscoveryPass(options);
        } finally {
          discoveryPassRef.current = undefined;
        }
      })();
      discoveryPassRef.current = pass;
      return pass;
    },
    [runDiscoveryPass],
  );

  const settleRecovery = useCallback(
    async (operation: PendingProjectOperation, worker: Remote<ObjectStoreWorker>): Promise<void> => {
      const previous = recoveriesRef.current.get(operation.operationId);
      const attempts = recoveryAttemptsRef.current.get(operation.operationId) ?? 0;
      if (
        attempts >= maxRecoveryAttempts ||
        (previous?.status === 'failed' && terminalRecoveryReasons.has(previous.reason))
      ) {
        return;
      }
      recoveryAttemptsRef.current.set(operation.operationId, attempts + 1);
      try {
        await resumePendingProjectOperation(operation, worker);
        recoveriesRef.current.delete(operation.operationId);
      } catch (error) {
        const recovery = pendingOperationRecovery(operation);
        recoveriesRef.current.set(operation.operationId, {
          ...recovery,
          status: 'failed',
          reason: error instanceof PendingProjectRecoveryError ? error.reason : 'filesystem-error',
        });
      }
      setRecoveryRevision((revision) => revision + 1);
      invalidateProjectsList();
    },
    [invalidateProjectsList, resumePendingProjectOperation],
  );

  /**
   * A workspace re-pick republishes the route configuration, and marker
   * adoption resurrects the workspace id a pending operation cites — so the
   * operation that failed with `workspace-unavailable` can now settle (DF12).
   * Terminal failures and the attempt cap are enforced by `settleRecovery`.
   */
  const retryFailedRecoveries = useCallback(async (): Promise<void> => {
    const retryable = [...recoveriesRef.current.values()].filter(
      (recovery) => recovery.status === 'failed' && recovery.reason === 'workspace-unavailable',
    );
    if (retryable.length === 0) {
      return;
    }
    const worker = await getReadiedWorker();
    const operations = await worker.getPendingProjectOperations();
    /* oxlint-disable no-await-in-loop -- Pending operations settle independently in durable stored order. */
    for (const recovery of retryable) {
      const operation = operations.find((candidate) => candidate.operationId === recovery.operationId);
      if (operation) {
        await settleRecovery(operation, worker);
      }
    }
    /* oxlint-enable no-await-in-loop */
  }, [getReadiedWorker, settleRecovery]);

  useEffect(() => {
    return subscribeProjectRootConfigurationChanges(async () => {
      discoveryEpochRef.current++;
      // The channel invokes this listener with nowhere to put a rejection, so
      // the body owns its own failures (DF10).
      try {
        // Routes must be applied before any refetch reads them, so only the
        // refetch is debounced.
        await fileManager.workspace.syncProjectRoots();
        await retryFailedRecoveries();
      } catch (error) {
        console.warn('[ProjectManager] cross-tab root configuration change failed', error);
      } finally {
        scheduleProjectsListInvalidation();
      }
    });
  }, [fileManager.workspace, retryFailedRecoveries, scheduleProjectsListInvalidation]);

  const discardRecovery = useCallback(
    async (operationId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      // `completePendingProjectOperation` is a plain journal-row delete, which
      // is exactly what discarding needs.
      await worker.completePendingProjectOperation(operationId);
      recoveriesRef.current.delete(operationId);
      setRecoveryRevision((revision) => revision + 1);
      invalidateProjectsList();
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const ensureDiscoveryReady = useCallback(async (): Promise<void> => {
    if (discoveryReadinessRef.current) {
      return discoveryReadinessRef.current;
    }
    const promise = (async () => {
      const worker = await getReadiedWorker();
      const operations = await worker.getPendingProjectOperations();
      recoveriesRef.current = new Map(
        operations.map((operation) => [operation.operationId, pendingOperationRecovery(operation)]),
      );
      setRecoveryRevision((revision) => revision + 1);
      await discoverProjects({ quarantinedLocators: quarantinedLocatorsOf(recoveriesRef.current.values()) });

      const loop = (async (): Promise<void> => {
        /* oxlint-disable no-await-in-loop -- Pending operations settle independently in durable stored order. */
        for (const operation of operations) {
          await settleRecovery(operation, worker);
        }
        /* oxlint-enable no-await-in-loop */
      })();
      recoveryLoopRef.current = loop;
    })();
    discoveryReadinessRef.current = promise;
    try {
      await promise;
    } catch (error) {
      discoveryReadinessRef.current = undefined;
      throw error;
    }
  }, [discoverProjects, getReadiedWorker, settleRecovery]);

  const getProject = useCallback(
    async (projectId: string): Promise<ProjectManifest | undefined> => {
      await ensureDiscoveryReady();
      const read = async (): Promise<ProjectManifest | undefined> => {
        try {
          const parsed = parseProjectManifestBytes(
            await fileManager.client.readFile(`/projects/${projectId}/tau.json`),
          );
          return parsed.success ? parsed.data : undefined;
        } catch {
          return undefined;
        }
      };
      const current = await read();
      if (current) {
        return current;
      }
      await discoverProjects();
      return read();
    },
    [discoverProjects, ensureDiscoveryReady, fileManager.client],
  );

  /**
   * Read the library row, re-minting it from disk when it is missing. A missing
   * row means the origin was evicted (or this profile has never seen the
   * project), so trash state and recency are recovered from
   * `<project>/.tau/library.json` and the manifest mtime rather than invented.
   */
  const ensureProjectLibraryState = useCallback(
    async (worker: Remote<ObjectStoreWorker>, projectId: string): Promise<ProjectLibraryState> => {
      const existing = await worker.getProjectLibraryState(projectId);
      if (existing) {
        return existing;
      }
      const [tombstone, lastActivityAt] = await Promise.all([
        readProjectLibraryFile(fileManager.client, projectId),
        readManifestActivityAt(fileManager.client, projectId),
      ]);
      return worker.createProjectLibraryState({
        projectId,
        lastActivityAt,
        ...(tombstone.deletedAt === undefined ? {} : { deletedAt: tombstone.deletedAt }),
      });
    },
    [fileManager.client],
  );

  const ensureProjectLibraryStates = useCallback(
    async (
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
                readProjectLibraryFile(fileManager.client, projectId),
                readManifestActivityAt(fileManager.client, projectId),
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
    },
    [fileManager.client],
  );

  const getProjectRouteAccess = useCallback(
    async (projectId: string): Promise<ProjectRouteAccess> => {
      await ensureDiscoveryReady();
      const recovery = [...recoveriesRef.current.values()].find((entry) => entry.projectId === projectId);
      if (recovery?.status === 'recovering') {
        return { status: 'recovering', recovery };
      }
      if (recovery?.status === 'failed') {
        return { status: 'recovery-failed', recovery };
      }
      const discovery = await discoverProjects();
      const valid = discovery.entries.find(
        (entry): entry is Extract<ProjectDiscoveryEntry, { status: 'valid' }> =>
          entry.status === 'valid' && entry.manifest.id === projectId,
      );
      if (valid) {
        const worker = await getReadiedWorker();
        const library = await ensureProjectLibraryState(worker, projectId);
        return library.deletedAt === undefined
          ? { status: 'ready', project: valid.manifest }
          : { status: 'trashed', project: valid.manifest };
      }
      if (discovery.entries.some((entry) => entry.status === 'route-blocked' && entry.manifest.id === projectId)) {
        return { status: 'unavailable' };
      }
      if (discovery.entries.some((entry) => entry.status === 'duplicate-id' && entry.manifest.id === projectId)) {
        return { status: 'conflict' };
      }
      const config = await getProjectFileSystemConfig(projectId);
      if (
        config &&
        config.backend !== 'memory' &&
        discovery.roots.some(
          (root) =>
            root.status === 'inaccessible' && persistentStorageRootKey(root.root) === persistentStorageRootKey(config),
        )
      ) {
        return { status: 'unavailable' };
      }
      return { status: 'missing' };
    },
    [discoverProjects, ensureDiscoveryReady, ensureProjectLibraryState, getReadiedWorker, recoveryRevision],
  );

  const updateProject = useCallback(
    async (projectId: string, update: PartialDeep<ProjectManifest>): Promise<ProjectManifest | undefined> => {
      const project = await getProject(projectId);
      if (!project) {
        return undefined;
      }
      const updated = deepmerge(project, update) as ProjectManifest;
      await fileManager.client.writeFile(
        `/projects/${projectId}/tau.json`,
        serializeProjectManifest(projectToManifest(updated)),
      );
      return updated;
    },
    [fileManager.client, getProject],
  );

  const touchProject = useCallback(
    async (projectId: string, activityAt?: number): Promise<ProjectLibraryState | undefined> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      return worker.touchProjectActivity(projectId, activityAt);
    },
    [ensureDiscoveryReady, getReadiedWorker],
  );

  const getProjectLibraryState = useCallback(
    async (projectId: string): Promise<ProjectLibraryState | undefined> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      return worker.getProjectLibraryState(projectId);
    },
    [ensureDiscoveryReady, getReadiedWorker],
  );

  const setProjectRevisionState = useCallback(
    async (
      projectId: string,
      revisionState: NonNullable<ProjectLibraryState['revisionState']>,
    ): Promise<ProjectLibraryState | undefined> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      return worker.setProjectRevisionState(projectId, revisionState);
    },
    [ensureDiscoveryReady, getReadiedWorker],
  );

  const duplicateProject = useCallback(
    async (projectId: string): Promise<CreatedProject> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      const sourceProject = await getProject(projectId);
      if (!sourceProject) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const sourceConfig = await getProjectFileSystemConfig(projectId);
      if (!sourceConfig) {
        throw new Error(`Project locator not found: ${projectId}`);
      }
      if (sourceConfig.backend === 'memory') {
        throw new WorkspaceDirectoryRequiredError('unsupported');
      }

      let storage: PendingProjectStorage;
      let workspaceSlug: string;
      const targetId = generatePrefixedId(idPrefix.project);
      const targetManifest = projectToManifest({
        ...sourceProject,
        id: targetId,
        name: `${sourceProject.name} (Copy)`,
      });
      const providerBasePath = await allocateProjectBasePath(fileManager.client, sourceConfig, targetManifest.name);
      if (sourceConfig.backend === 'webaccess') {
        const entry = await resolveWorkspaceForWrite(sourceConfig.workspaceId);
        storage = {
          backend: 'webaccess',
          workspaceId: entry.workspace.workspaceId,
          providerBasePath,
        };
        workspaceSlug = entry.workspace.slug;
      } else {
        storage = { backend: sourceConfig.backend, providerBasePath };
        workspaceSlug = homeWorkspaceSlug;
      }

      const sourceFiles = Object.fromEntries(
        Object.entries(await fileManager.client.getDirectoryContents(`/projects/${projectId}`))
          .filter(([path]) => path !== 'tau.json')
          .map(([path, content]) => [path, { content }]),
      );
      const operation = await worker.prepareProjectDuplicate({
        sourceManifest: sourceProject,
        targetManifest,
        files: sourceFiles,
        storage,
      });
      await resumePendingProjectOperation(operation, worker);
      return { ...operation.manifest, slugs: { workspaceSlug, projectSlug: directorySlug(providerBasePath) } };
    },
    [ensureDiscoveryReady, getProject, getReadiedWorker, resumePendingProjectOperation],
  );
  // (getProjectFileSystemConfig / getWorkspace are stable module-level
  // bindings — intentionally omitted from the dep array.)

  const deriveWorkspaceBindingRepairs = useCallback(async (discovery: ProjectDiscoveryResult) => {
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
        projectOccurrences(discovery, entry.manifest.id).length === 1,
    );
    const sourceWorkspaceIds = new Set(
      blocked.flatMap((entry) => {
        const config = configByProjectId.get(entry.manifest.id);
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
      const config = configByProjectId.get(entry.manifest.id);
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
            projectId: entry.manifest.id,
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
  }, []);

  const buildProjectListing = useCallback(
    async (discovery: ProjectDiscoveryResult): Promise<ProjectListing> => {
      const worker = await getReadiedWorker();
      const validEntries = discovery.entries.filter(
        (entry): entry is Extract<ProjectDiscoveryEntry, { status: 'valid' }> => entry.status === 'valid',
      );
      // Slugs come from the same pass that produced the locators, so every
      // listing-fed surface can render its canonical `/w/…` link without a
      // second lookup (blueprint L1).
      const [workspaces, libraryStates, workspaceBindingRepairs] = await Promise.all([
        listWorkspaces(),
        ensureProjectLibraryStates(
          worker,
          validEntries.map(({ manifest }) => manifest.id),
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
          manifest: entry.manifest,
          library: libraryStates.get(entry.manifest.id)!,
          locator,
          ...(slugs === undefined ? {} : { slugs }),
          ...(workspaceName === undefined ? {} : { workspaceName }),
        };
      });
      const conflicts: ProjectDiscoveryConflict[] = discovery.entries.filter(
        (entry): entry is Exclude<ProjectDiscoveryEntry, { status: 'valid' }> => entry.status !== 'valid',
      );
      return {
        projects,
        conflicts,
        recoveries: [...recoveriesRef.current.values()],
        workspaceBindingRepairs: workspaceBindingRepairs.map(({ repairs: _repairs, ...group }) => group),
      };
    },
    [deriveWorkspaceBindingRepairs, ensureProjectLibraryStates, getReadiedWorker, recoveryRevision],
  );

  const getProjectListing = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<ProjectListing> => {
      await ensureDiscoveryReady();
      const listing = await buildProjectListing(await discoverProjects());
      return options?.includeDeleted
        ? listing
        : {
            ...listing,
            projects: listing.projects.filter((project) => project.library.deletedAt === undefined),
          };
    },
    [buildProjectListing, discoverProjects, ensureDiscoveryReady],
  );

  const prepareCurrentWorkspaceCatalog = useCallback(
    async (workspaceId?: string, signal?: AbortSignal): Promise<PreparedWorkspaceCatalog> => {
      const previous = discoveryPassRef.current;
      if (previous) {
        await previous.catch(() => undefined);
      }
      signal?.throwIfAborted();
      await retryFailedRecoveries();
      const listing = await buildProjectListing(await discoverProjects());
      signal?.throwIfAborted();
      const visibleListing: ProjectListing = {
        ...listing,
        projects: listing.projects.filter((project) => project.library.deletedAt === undefined),
      };
      const isSelectedWorkspace = (locator: ProjectLocator): boolean =>
        locator.backend === 'webaccess' && locator.workspaceId === workspaceId;
      const selectedProjects = listing.projects.filter(({ locator }) => isSelectedWorkspace(locator));
      const selectedConflicts = listing.conflicts.filter(({ locator }) => isSelectedWorkspace(locator));
      return {
        projectCount: selectedProjects.length,
        candidateCount: selectedProjects.length + selectedConflicts.length,
        conflictCount: selectedConflicts.length,
        publish: async () => {
          queryClient.setQueryData(['projects', { includeDeleted: true }], listing);
          queryClient.setQueryData(['projects', { includeDeleted: false }], visibleListing);
        },
      };
    },
    [buildProjectListing, discoverProjects, queryClient, retryFailedRecoveries],
  );

  const refreshWorkspaceCatalog = useCallback(async (): Promise<void> => {
    const catalog = await prepareCurrentWorkspaceCatalog(undefined);
    await catalog.publish();
  }, [prepareCurrentWorkspaceCatalog]);

  const repairWorkspaceBindings = useCallback(
    async (canonicalWorkspaceId: string): Promise<WorkspaceBindingRepairResult> => {
      await ensureDiscoveryReady();
      const groups = await deriveWorkspaceBindingRepairs(await discoverProjects());
      const group = groups.find((candidate) => candidate.canonicalWorkspaceId === canonicalWorkspaceId);
      if (!group) {
        return { repairedProjectCount: 0, removedWorkspaceIds: [], skipped: [] };
      }
      const result = await repairStoredWorkspaceBindings({ canonicalWorkspaceId, repairs: group.repairs });
      if (result.repairedProjectCount === 0) {
        return result;
      }
      await fileManager.workspace.syncProjectRoots();
      const catalog = await prepareCurrentWorkspaceCatalog(undefined);
      await catalog.publish();
      return result;
    },
    [
      deriveWorkspaceBindingRepairs,
      discoverProjects,
      ensureDiscoveryReady,
      fileManager.workspace,
      prepareCurrentWorkspaceCatalog,
    ],
  );

  const workspaceConnectionServices = useMemo(
    () => ({
      registerWorkspace: async (handle: FileSystemDirectoryHandle, signal: AbortSignal) => {
        const startedAt = performance.now();
        signal.throwIfAborted();
        try {
          const connection = await createWorkspace(handle);
          signal.throwIfAborted();
          if (connectionTraceRef.current) {
            connectionTraceRef.current.workspaceId = connection.workspaceId;
          }
          return { workspace: connection, handle, minted: connection.minted };
        } finally {
          if (connectionTraceRef.current) {
            connectionTraceRef.current.registeringDuration += performance.now() - startedAt;
          }
        }
      },
      mountWorkspace: async (workspace: WorkspaceEntry, signal: AbortSignal) => {
        const startedAt = performance.now();
        signal.throwIfAborted();
        try {
          if ((await checkHandlePermission(workspace.handle)) !== 'granted') {
            throw new DOMException('Tau needs access to this workspace folder.', 'NotAllowedError');
          }
          await fileManager.workspace.syncProjectRoots();
          signal.throwIfAborted();
        } finally {
          if (connectionTraceRef.current) {
            connectionTraceRef.current.mountingDuration += performance.now() - startedAt;
          }
        }
      },
      prepareWorkspaceCatalog: async (
        workspace: WorkspaceEntry,
        signal: AbortSignal,
      ): Promise<PreparedWorkspaceCatalog> => {
        const startedAt = performance.now();
        try {
          const catalog = await prepareCurrentWorkspaceCatalog(workspace.workspace.workspaceId, signal);
          const trace = connectionTraceRef.current;
          if (trace) {
            trace.candidateCount = catalog.candidateCount;
            trace.projectCount = catalog.projectCount;
            trace.conflictCount = catalog.conflictCount;
          }
          return {
            ...catalog,
            publish: async () => {
              const publishStartedAt = performance.now();
              try {
                await catalog.publish();
              } finally {
                if (connectionTraceRef.current) {
                  connectionTraceRef.current.publishingDuration += performance.now() - publishStartedAt;
                }
              }
            },
          };
        } finally {
          if (connectionTraceRef.current) {
            connectionTraceRef.current.catalogDuration += performance.now() - startedAt;
          }
        }
      },
    }),
    [fileManager.workspace, prepareCurrentWorkspaceCatalog],
  );
  const workspaceConnectionRef = useActorRef(workspaceConnectionMachine, { input: workspaceConnectionServices });
  const workspaceConnection = useSelector(workspaceConnectionRef, selectWorkspaceConnectionState);

  const waitForWorkspaceConnection = useCallback(
    async (operationId: string): Promise<ConnectedWorkspace> =>
      new Promise<ConnectedWorkspace>((resolve, reject) => {
        const settle = (snapshot: ReturnType<typeof workspaceConnectionRef.getSnapshot>): void => {
          if (snapshot.context.operationId !== operationId) {
            return;
          }
          if (snapshot.matches('ready')) {
            subscription.unsubscribe();
            resolve({
              workspace: snapshot.context.workspace!.workspace,
              projectCount: snapshot.context.catalog!.projectCount,
              minted: snapshot.context.workspace!.minted,
            });
          } else if (snapshot.matches('failed')) {
            subscription.unsubscribe();
            const failure = snapshot.context.error;
            reject(failure instanceof Error ? failure : new Error('Workspace connection failed.', { cause: failure }));
          }
        };
        const subscription = workspaceConnectionRef.subscribe(settle);
        settle(workspaceConnectionRef.getSnapshot());
      }),
    [workspaceConnectionRef],
  );

  const connectWorkspace = useCallback(
    async (selectedHandle?: FileSystemDirectoryHandle): Promise<ConnectedWorkspace | undefined> => {
      if (!isFileSystemAccessSupported) {
        return undefined;
      }
      if (connectionPromiseRef.current) {
        return connectionPromiseRef.current;
      }
      const connection = (async (): Promise<ConnectedWorkspace | undefined> => {
        const operationId = generatePrefixedId(idPrefix.request);
        workspaceConnectionRef.send({ type: 'beginSelection', operationId });
        let handle = selectedHandle;
        try {
          handle ??= await globalThis.window.showDirectoryPicker({ id: 'tau-workspace', mode: 'readwrite' });
        } catch (error) {
          workspaceConnectionRef.send({ type: 'selectionCancelled' });
          if (error instanceof DOMException && error.name === 'AbortError') {
            return undefined;
          }
          throw error;
        }
        connectionTraceRef.current = {
          operationId,
          startedAt: performance.now(),
          workspaceId: undefined,
          registeringDuration: 0,
          mountingDuration: 0,
          catalogDuration: 0,
          publishingDuration: 0,
          candidateCount: 0,
          projectCount: 0,
          conflictCount: 0,
        };
        const completion = waitForWorkspaceConnection(operationId);
        workspaceConnectionRef.send({ type: 'workspaceSelected', operationId, handle });
        try {
          const connected = await completion;
          const trace = connectionTraceRef.current;
          if (trace.operationId === operationId) {
            const { startedAt, ...metrics } = trace;
            workspaceTelemetry.workspaceConnection({
              ...metrics,
              outcome: 'ready',
              totalMs: performance.now() - startedAt,
            });
          }
          return connected;
        } catch (error) {
          const trace = connectionTraceRef.current;
          if (trace.operationId === operationId) {
            const { startedAt, ...metrics } = trace;
            workspaceTelemetry.workspaceConnection({
              ...metrics,
              outcome: 'failed',
              totalMs: performance.now() - startedAt,
            });
          }
          throw error;
        }
      })();
      connectionPromiseRef.current = connection;
      try {
        return await connection;
      } finally {
        if (connectionPromiseRef.current === connection) {
          connectionPromiseRef.current = undefined;
        }
      }
    },
    [waitForWorkspaceConnection, workspaceConnectionRef, workspaceTelemetry],
  );

  const retryWorkspaceConnection = useCallback(async (): Promise<ConnectedWorkspace | undefined> => {
    const current = selectWorkspaceConnectionState(workspaceConnectionRef.getSnapshot());
    if (current.phase !== 'failed') {
      return undefined;
    }
    if (current.retry === 'pick-again') {
      return connectWorkspace();
    }
    if (current.retry === 'grant-access') {
      const handle = workspaceConnectionRef.getSnapshot().context.workspace?.handle;
      if (handle === undefined || !(await requestHandlePermission(handle))) {
        return undefined;
      }
    }
    const completion = waitForWorkspaceConnection(current.operationId);
    workspaceConnectionRef.send({ type: 'retry' });
    return completion;
  }, [connectWorkspace, waitForWorkspaceConnection, workspaceConnectionRef]);

  const getProjects = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<ProjectLibraryEntry[]> => {
      const listing = await getProjectListing(options);
      return [...listing.projects];
    },
    [getProjectListing],
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      const trashed = await worker.trashProject(projectId);
      if (trashed?.deletedAt === undefined) {
        return false;
      }
      await writeProjectLibraryFile(fileManager.client, projectId, { deletedAt: trashed.deletedAt });
      return true;
    },
    [ensureDiscoveryReady, fileManager.client, getReadiedWorker],
  );

  const restoreProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      const restored = await worker.restoreProject(projectId);
      if (!restored) {
        return false;
      }
      await writeProjectLibraryFile(fileManager.client, projectId, {});
      return true;
    },
    [ensureDiscoveryReady, fileManager.client, getReadiedWorker],
  );

  const permanentlyDeleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      await ensureDiscoveryReady();
      const worker = await getReadiedWorker();
      const storage = await discoverPermanentDeleteStorage(projectId);
      const operationId = await worker.beginPermanentDeleteProject(projectId, storage);
      const pendingOperations = await worker.getPendingProjectOperations();
      const operation = pendingOperations.find((candidate) => candidate.operationId === operationId);
      if (!operation) {
        throw new Error(`Pending project operation not found: ${operationId}`);
      }
      await resumePendingProjectOperation(operation, worker);
    },
    [discoverPermanentDeleteStorage, ensureDiscoveryReady, getReadiedWorker, resumePendingProjectOperation],
  );

  const adoptProject = useCallback(
    async (locator: ProjectLocator): Promise<ProjectManifest> => {
      const manifest = await fileManager.client.adoptProjectDirectory(locator);
      // The next discovery pass reconciles the route config from the manifest
      // now on disk, so nothing else has to be written here.
      invalidateProjectsList();
      return manifest;
    },
    [fileManager.client, invalidateProjectsList],
  );

  const assertWorkspaceMutationAllowed = useCallback(
    async (workspaceId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      if (await worker.hasPendingProjectOperationForWorkspace(workspaceId)) {
        throw new Error('This workspace is required to recover an unfinished project operation');
      }
    },
    [getReadiedWorker],
  );

  // ============================================================================
  // Chat Methods
  // ============================================================================

  const getAppUiPreferences = useCallback(async (): Promise<AppUiPreferences> => {
    const worker = await getReadiedWorker();
    return worker.getAppUiPreferences();
  }, [getReadiedWorker]);

  const setProjectDisclosure = useCallback(
    async (projectId: string, expanded: boolean | undefined): Promise<AppUiPreferences | undefined> => {
      const worker = await getReadiedWorker();
      return worker.setProjectDisclosure(projectId, expanded);
    },
    [getReadiedWorker],
  );

  const createChat = useCallback(
    async (
      resourceId: string,
      chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt' | 'hasUnreadTurn'> & {
        id?: string;
      },
    ): Promise<Chat> => {
      const worker = await getReadiedWorker();
      const chat = await worker.createChat(resourceId, chatData);
      await touchProject(resourceId);
      invalidateProjectsList();
      return chat;
    },
    [getReadiedWorker, invalidateProjectsList, touchProject],
  );

  const createNavigationRepairChat = useCallback(
    async (resourceId: string): Promise<Chat> => {
      const worker = await getReadiedWorker();
      return worker.createNavigationRepairChat(resourceId);
    },
    [getReadiedWorker],
  );

  const updateChat = useCallback(
    async (chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.updateChat(chatId, update);
    },
    [getReadiedWorker],
  );

  const applyGeneratedChatName = useCallback(
    async (chatId: string, name: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.applyGeneratedChatName(chatId, name);
    },
    [getReadiedWorker],
  );

  const patchChat = useCallback(
    async <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.patchChat(chatId, key, value);
      if (result) {
        invalidateChatQueries(result.resourceId, chatId);
      }
      return result;
    },
    [getReadiedWorker, invalidateChatQueries],
  );

  const touchChatRecency = useCallback(
    async (chatId: string, requestedAt: number): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.touchChatRecency(chatId, requestedAt);
      if (!result) {
        return undefined;
      }

      invalidateChatQueries(result.resourceId, chatId);
      await touchProject(result.resourceId, getChatRecencyAt(result));
      invalidateProjectsList();
      return result;
    },
    [getReadiedWorker, invalidateChatQueries, invalidateProjectsList, touchProject],
  );

  const setChatUnreadState = useCallback(
    async (chatId: string, hasUnreadTurn: boolean): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.setChatUnreadState(chatId, hasUnreadTurn);
      if (result) {
        invalidateChatQueries(result.resourceId, chatId);
      }
      return result;
    },
    [getReadiedWorker, invalidateChatQueries],
  );

  const consumeChatStartupRequest = useCallback(
    async (chatId: string, requestId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.consumeChatStartupRequest(chatId, requestId);
    },
    [getReadiedWorker],
  );

  const commitCancelledDraftRestore = useCallback(
    async (chatId: string, input: CommitCancelledDraftRestoreInput): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.commitCancelledDraftRestore(chatId, input);
    },
    [getReadiedWorker],
  );

  const setMessageEdit = useCallback(
    async (
      chatId: string,
      messageId: string,
      draft: NonNullable<Chat['messageEdits']>[string],
    ): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.setMessageEdit(chatId, messageId, draft);
    },
    [getReadiedWorker],
  );

  const clearMessageEdit = useCallback(
    async (chatId: string, messageId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.clearMessageEdit(chatId, messageId);
    },
    [getReadiedWorker],
  );

  const softDeleteChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.softDeleteChat(chatId);
      if (result) {
        await touchProject(result.resourceId);
        invalidateProjectsList();
      }

      return result;
    },
    [getReadiedWorker, invalidateProjectsList, touchProject],
  );

  const duplicateChat = useCallback(
    async (chatId: string): Promise<Chat> => {
      const worker = await getReadiedWorker();
      const chat = await worker.duplicateChat(chatId);
      await touchProject(chat.resourceId);
      invalidateProjectsList();
      return chat;
    },
    [getReadiedWorker, invalidateProjectsList, touchProject],
  );

  const getChatsForResource = useCallback(
    async (resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> => {
      const worker = await getReadiedWorker();
      return worker.getChatsForResource(resourceId, options);
    },
    [getReadiedWorker],
  );

  const getAllChats = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<Chat[]> => {
      const worker = await getReadiedWorker();
      return worker.getAllChats(options);
    },
    [getReadiedWorker],
  );

  const getChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.getChat(chatId);
    },
    [getReadiedWorker],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      const chat = await worker.getChat(chatId);
      await worker.deleteChat(chatId);
      if (chat) {
        await touchProject(chat.resourceId);
      }
      invalidateProjectsList();
    },
    [getReadiedWorker, invalidateProjectsList, touchProject],
  );

  const value = useMemo<ProjectManagerContextType>(() => {
    return {
      isLoading,
      error,
      projectManagerRef: actorRef,
      workspaceConnection,
      connectWorkspace,
      retryWorkspaceConnection,
      refreshWorkspaceCatalog,
      repairWorkspaceBindings,
      createProject,
      updateProject,
      touchProject,
      duplicateProject,
      getProjects,
      getProjectListing,
      getProject,
      getProjectRouteAccess,
      getProjectLibraryState,
      setProjectRevisionState,
      deleteProject,
      restoreProject,
      permanentlyDeleteProject,
      adoptProject,
      discardRecovery,
      assertWorkspaceMutationAllowed,
      getAppUiPreferences,
      setProjectDisclosure,
      createChat,
      createNavigationRepairChat,
      updateChat,
      applyGeneratedChatName,
      patchChat,
      touchChatRecency,
      setChatUnreadState,
      consumeChatStartupRequest,
      commitCancelledDraftRestore,
      setMessageEdit,
      clearMessageEdit,
      softDeleteChat,
      duplicateChat,
      getAllChats,
      getChatsForResource,
      getChat,
      deleteChat,
    };
  }, [
    isLoading,
    error,
    actorRef,
    workspaceConnection,
    connectWorkspace,
    retryWorkspaceConnection,
    refreshWorkspaceCatalog,
    repairWorkspaceBindings,
    createProject,
    updateProject,
    touchProject,
    duplicateProject,
    getProjects,
    getProjectListing,
    getProject,
    getProjectRouteAccess,
    getProjectLibraryState,
    setProjectRevisionState,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    adoptProject,
    discardRecovery,
    assertWorkspaceMutationAllowed,
    getAppUiPreferences,
    setProjectDisclosure,
    createChat,
    createNavigationRepairChat,
    updateChat,
    applyGeneratedChatName,
    patchChat,
    touchChatRecency,
    setChatUnreadState,
    consumeChatStartupRequest,
    commitCancelledDraftRestore,
    setMessageEdit,
    clearMessageEdit,
    softDeleteChat,
    duplicateChat,
    getAllChats,
    getChatsForResource,
    getChat,
    deleteChat,
  ]);

  return <ProjectManagerContext.Provider value={value}>{children}</ProjectManagerContext.Provider>;
}

export function useProjectManager(): ProjectManagerContextType {
  const context = useContext(ProjectManagerContext);

  if (context === undefined) {
    throw new Error('useProjectManager must be used within a ProjectManagerProvider');
  }

  return context;
}
