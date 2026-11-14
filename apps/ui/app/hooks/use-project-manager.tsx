import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import { createContext, useContext, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ActorRefFrom } from 'xstate';
import { projectIdSchema, projectToManifest, readProjectManifestBytes, serializeProjectManifest } from '@taucad/types';
import type { Project, ProjectManifest, ProjectManifestReadResult } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { KernelProvider } from '@taucad/runtime';
import type { ProjectDiscoveryResult, ProjectLocator, StorageRootConfig } from '@taucad/filesystem';
import type { CadAgentExecution, Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { generatePrefixedId } from '@taucad/utils/id';
import { serializeStartRecord, startRecordPath } from '@taucad/revisions';
import type { StartOrigin } from '@taucad/revisions';
import type { Remote } from 'comlink';
import type { projectManagerMachine } from '#hooks/project-manager.machine.js';
import type { ObjectStoreWorker, InitialEditorState } from '#hooks/object-store.worker.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import {
  getWorkspaceMetadata,
  isNodeWorkspace,
  isNodeWorkspaceConnected,
  setProjectFileSystemConfig,
  getProjectFileSystemConfig,
  getHomeStorageBackend,
  getProjectCreationLocation,
  requestHandlePermission,
  deleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs,
  setProjectCreationLocation,
  repairWorkspaceBindings as repairStoredWorkspaceBindings,
} from '#filesystem/handle-store.js';
import type { Workspace, WorkspaceBindingRepairResult } from '#filesystem/handle-store.js';
import { isOrphanedProjectRoute } from '#filesystem/orphaned-project-route.js';
import { WorkspaceDirectoryRequiredError } from '@taucad/ui-core/filesystem/workspace-errors';
import { directoryPicker } from '#constants/browser.constants.js';
import type { DirectoryPick } from '#constants/browser.constants.js';
import { removeChatPermission, seedChatPermission } from '#hooks/use-permission-mode.js';
import { createEntrylessProject, createInitialProject } from '#constants/project.constants.js';
import { attachmentKind } from '@taucad/chat-ui/utils/attachment.utils';
import { buildUserMessage } from '#utils/chat.utils.js';
import type { StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import {
  getMainFile,
  getEmptyCode,
  getKernelDependencies,
  getKernelOption,
  getKernelProjectTemplate,
} from '#utils/kernel.utils.js';
import { encodeTextFile } from '@taucad/ui-core/utils/filesystem.utils';
import { defaultProjectName } from '@taucad/ui-core/constants/project-names';
import type { AppUiPreferences, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import type {
  PendingProjectOperation,
  PendingProjectRecovery,
  PendingProjectStorage,
} from '#types/pending-project-operation.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project-library.types.js';
import { directorySlug, homeWorkspaceSlug } from '#utils/project-url.utils.js';
import type { ProjectSlugs } from '#utils/project-url.utils.js';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import type { ProjectCreationLocation } from '@taucad/ui-core/types/project-creation-location.types';
import { selectWorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';
import {
  selectDiscoveryObservationError,
  selectLibraryError,
  selectLibraryIsLoading,
  selectLibraryRecoveries,
  selectLibraryRevision,
  selectLibraryWorkspaceConnection,
  selectMetadataObservationError,
  selectMetadataObservationErrors,
} from '#runtime/project-library.js';
import {
  allocateProjectBasePath,
  composerAttachmentsOf,
  deriveWorkspaceBindingRepairs,
  locatorToPendingStorage,
  pendingStorageToScope,
  persistentStorageRootKey,
  projectOccurrences,
  rememberChatPlacement,
  resolveWorkspaceForWrite,
  routeBindsLocator,
  routeConfigFor,
  writeProjectLibraryFile,
} from '#runtime/project-library-storage.js';
import type { PersistentStorageRoot, ProjectListing } from '#runtime/project-library-storage.js';
import type { ProjectLibrary, ProjectRouteAccess, WorkspaceConnectionTrace } from '#runtime/project-library.js';
import { selectRuntimeChatSessions, selectRuntimeProjectLibrary } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { tauCloudIntent, withNamedLock } from '#hooks/use-cloud-projects.js';
import { prepareFirstProjectTour } from '#components/tour/first-project-tour.js';
import type { WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';

export type InitialMessageAttachment = Omit<StoredAttachmentRef, 'byteLength'>;

/** The operation field naming where a created chat's attachments are copied from, when not Home. */
const attachmentSourceOf = (options: CreateProjectChatOptions): { attachmentSource?: string } => {
  const source = options.initialMessage?.attachmentSource;
  return source === undefined ? {} : { attachmentSource: source };
};

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
    /**
     * Draft attachments already stored in `attachmentSource`. Resume copies
     * them into the new chat before its startup request is written.
     */
    attachments?: readonly InitialMessageAttachment[];
    /** The composer directory holding those bytes. Defaults to the Home composer's. */
    attachmentSource?: string;
  };
  /** Chat name (defaults to 'Initial design' with message, 'Initial chat' without) */
  chatName?: string;
  /** Initial editor state overrides (e.g., panelState for initial panel layout) */
  editorState?: InitialEditorState;
  /** Explicit product location. Omission resolves the last successful location. */
  location?: ProjectCreationLocation;
  /**
   * Create under an id that already exists elsewhere (W18 DEF-2).
   *
   * A device opening a project from Tau Cloud that it has never held must reuse
   * the remote's id, because the id *is* the repository path there. Omitted
   * everywhere else: a new project mints its own, and an id this device already
   * holds is refused rather than duplicated.
   */
  id?: string;
  /**
   * Create the project and no chat at all (W18 DEF-2, review R5).
   *
   * Opening someone's own project from Tau Cloud must not invent a chat for
   * them: `.tau/chats` is unversioned, so the open pull cannot take one away,
   * and chats travel on their own record refs — an empty *Initial chat* minted
   * here would be offered back to the account on the next push. Mutually
   * exclusive with `initialMessage` and `chatName`, which are what a chat is
   * *for*; every other caller leaves it out and gets the chat it always got.
   */
  chat?: false;
  /**
   * Seed `Chat.activeExecution` so the chat owns its execution choice independent
   * of the cookie default. Required when `initialMessage` is supplied so the
   * one-shot startup request runs with the caller's intended model rather
   * than whatever the cookie happens to hold at hydration time.
   */
  activeExecution?: CadAgentExecution;
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
  /**
   * The kernel/language to use for the new project, or `auto` (automatic kernel selection blueprint D3): a project
   * with a name and a manifest and no model file, whose first chat starts on Auto; the first model the agent writes
   * and evaluates becomes main.
   */
  kernel: KernelProvider | 'auto';
  /** Override default project name */
  projectName?: string;
};

/**
 * Create a project from existing project data and files.
 * Use this when cloning, remixing, or importing a project.
 */
type CreateProjectFromData = CreateProjectChatOptions & {
  /** Wait for the remote manifest before choosing the first view. */
  deferInitialView?: boolean;
  /** The project metadata to use */
  project: Omit<ProjectManifest, '$schema'>;
  /** The files for the project */
  files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
  /**
   * Where the files came from, for the project's Start version (A6): History
   * reads "imported from GitHub", "a folder" or "a zip". Absent, the project
   * reads "project created" (a fork, a remix, a template).
   */
  origin?: Exclude<StartOrigin, 'created'>;
  /**
   * An import already staged on the creation location's storage root (W7,
   * charter D12): its files move into the project at commit, so the journal
   * holds this locator instead of their bytes. `files` then holds only what
   * the create adds. Pass the `location` the staging was prepared for.
   */
  staging?: Readonly<{
    operationId: string;
    /** The import carries its own workbench layout, so none is seeded beside it. */
    carriesWorkbenchLayout?: boolean;
    /**
     * The `tau.json` bytes to commit, when they declare `project` exactly: a
     * linked repository's own, kept as authored so no setup revision rewrites
     * them. Bytes that declare anything else are not committed.
     */
    manifestBytes?: Uint8Array<ArrayBuffer>;
    /**
     * The project directory the entries were written straight into (where
     * the root's rename copies): the create commits there instead of
     * allocating another.
     */
    providerBasePath?: string;
  }>;
};

/**
 * Where an import stages before its project is created (W7): the location,
 * its storage root, the project directory a create there would take, and the
 * stagings the journal already owns on this device, which a sweep keeps.
 */
export type ImportStagingTarget = Readonly<{
  location: ProjectCreationLocation;
  scope: StorageRootConfig;
  providerBasePath: string;
  owned: readonly string[];
}>;

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
export type CreatedProject = Project & { readonly slugs: ProjectSlugs };

export type ConnectedWorkspace = {
  readonly workspace: Workspace;
  readonly projectCount: number;
  readonly minted: boolean;
};

type ProjectManagerContextType = {
  discoveryObservationError: string | undefined;
  metadataObservationError: string | undefined;
  getMetadataObservationError: (resourceId: string) => string | undefined;
  refreshFilesystemObservations: (resourceId?: string) => void;
  isLoading: boolean;
  error: Error | undefined;
  projectManagerRef: ActorRefFrom<typeof projectManagerMachine>;
  workspaceConnection: WorkspaceConnectionState;
  connectWorkspace: (handle?: FileSystemDirectoryHandle) => Promise<ConnectedWorkspace | undefined>;
  retryWorkspaceConnection: () => Promise<ConnectedWorkspace | undefined>;
  refreshWorkspaceCatalog: () => Promise<void>;
  repairWorkspaceBindings: (workspaceId: string) => Promise<WorkspaceBindingRepairResult>;
  createProject: (options: CreateProjectOptions) => Promise<CreatedProject>;
  /** Resolve where a new project named `name` would be created, so an import can stage on that storage root first (W7). */
  prepareImportStaging: (name: string, location?: ProjectCreationLocation) => Promise<ImportStagingTarget>;
  /** Whether a journal row owns an import staging, so a failed create must leave it for its recovery (W7). */
  ownsImportStaging: (operationId: string) => Promise<boolean>;
  /** Rejects while `tau.json` is degraded: the normalized view is lossy (blueprint R4). */
  updateProject: (projectId: string, update: PartialDeep<ProjectManifest>) => Promise<Project | undefined>;
  /** Rewrite a degraded `tau.json` as its normalized strict manifest; refuses a JSON syntax error. */
  repairProject: (projectId: string) => Promise<Project | undefined>;
  touchProject: (projectId: string, activityAt?: number) => Promise<ProjectLibraryState | undefined>;
  setGeoSpecCandidateConsent: (projectId: string, enabled: boolean) => Promise<ProjectLibraryState | undefined>;
  duplicateProject: (projectId: string) => Promise<CreatedProject>;
  getProjects: (options?: { includeDeleted?: boolean }) => Promise<ProjectLibraryEntry[]>;
  getProjectListing: (options?: { includeDeleted?: boolean }) => Promise<ProjectListing>;
  getProject: (projectId: string) => Promise<Project | undefined>;
  getProjectRouteAccess: (projectId: string) => Promise<ProjectRouteAccess>;
  getProjectLibraryState: (projectId: string) => Promise<ProjectLibraryState | undefined>;
  restoreProject: (projectId: string) => Promise<boolean>;
  /** @returns whether a library row was actually trashed — a vanished row is not a success (DF3). */
  deleteProject: (projectId: string) => Promise<boolean>;
  permanentlyDeleteProject: (projectId: string) => Promise<void>;
  /**
   * Bumped whenever a project's library row moves in or out of the Trash.
   *
   * `getProjectRouteAccess` reads `deletedAt` once per call, so a route that
   * resolved its access before the person deleted the project on screen would
   * keep showing the closed notice until a reload (blueprint Finding 2). The
   * project route depends on this counter, which makes that a live transition.
   */
  libraryRevision: number;
  /**
   * Give an `adoption-required` directory an identity so it becomes a real project (R11): the id its
   * route last bound when no other directory claims it, otherwise a fresh one.
   */
  adoptProject: (locator: ProjectLocator) => Promise<Project>;
  /** Bind a project id's route to one of the directories that claim it; writes no project file. */
  chooseProjectDirectory: (locator: ProjectLocator, projectId: string) => Promise<void>;
  /** Pending operations this session is still settling, or has given up on (DF11). */
  recoveries: readonly PendingProjectRecovery[];
  /** Drop a pending operation the user has given up on (DF11). */
  discardRecovery: (operationId: string) => Promise<void>;
  assertWorkspaceMutationAllowed: (workspaceId: string) => Promise<void>;
  getAppUiPreferences: () => Promise<AppUiPreferences>;
  setProjectDisclosure: (projectId: string, expanded: boolean | undefined) => Promise<AppUiPreferences | undefined>;
  // Chat methods
  createChat: (
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'> & {
      id?: string;
    },
  ) => Promise<Chat>;
  createNavigationRepairChat: (resourceId: string) => Promise<Chat>;
  updateChat: (chatId: string, update: PartialDeep<Chat>) => Promise<Chat | undefined>;
  applyGeneratedChatName: (chatId: string, name: string) => Promise<Chat | undefined>;
  patchChat: <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]) => Promise<Chat | undefined>;
  touchChatRecency: (chatId: string, requestedAt: number) => Promise<Chat | undefined>;
  consumeChatStartupRequest: (chatId: string, requestId: string) => Promise<Chat | undefined>;
  commitCancelledDraftRestore: (chatId: string, input: CommitCancelledDraftRestoreInput) => Promise<Chat | undefined>;
  softDeleteChat: (chatId: string) => Promise<Chat | undefined>;
  getAllChats: (options?: { includeDeleted?: boolean }) => Promise<Chat[]>;
  getChatsForResource: (resourceId: string, options?: { includeDeleted?: boolean }) => Promise<Chat[]>;
  getAllChatRecords: (options?: { includeDeleted?: boolean }) => Promise<ChatRecord[]>;
  getChatRecordsForResource: (resourceId: string, options?: { includeDeleted?: boolean }) => Promise<ChatRecord[]>;
  getChat: (chatId: string, projectId?: string) => Promise<Chat | undefined>;
  /** Adopt a pre-XD2 record's device-relative placement once, on a session's open (`ChatStorage.adoptLegacyChatPlacement`). */
  adoptLegacyChatPlacement: (
    chatId: string,
    projectId: string | undefined,
    accept: (hostId: TauAgentHostId) => Promise<boolean>,
  ) => Promise<TauAgentHostId | undefined>;
  invalidateProjectedChats: (resourceId: string, chatIds: readonly string[]) => void;
  deleteChat: (chatId: string) => Promise<void>;
  purgeChat: (chatId: string) => Promise<void>;
};

/* This module exports a hook as well as a provider, so React Refresh refuses it
 * as a boundary (`isLikelyComponentType` wants a capitalised name) and the
 * update is re-imported by whichever accepting importer is above it. A second
 * `createContext` would put the provider and its consumers on different
 * contexts, and `useProjectManager` would then throw through the root boundary
 * — which re-renders the same tree, in a loop that floods the log. `hot.data`
 * is keyed by module path, so the first context outlives every update. */
const hotContexts = import.meta.hot?.data as
  | { projectManagerContext?: React.Context<ProjectManagerContextType | undefined> }
  | undefined;
const ProjectManagerContext =
  hotContexts?.projectManagerContext ?? createContext<ProjectManagerContextType | undefined>(undefined);
if (hotContexts) {
  hotContexts.projectManagerContext = ProjectManagerContext;
}

/**
 * Where a new project is created: the explicit location, or the last
 * successful one, and the storage root it names. The workspace is resolved
 * here, so a create can carry the canonical URL its caller navigates to
 * instead of riding an id-addressed redirect.
 */
const resolveCreationStorage = async (
  explicitLocation: ProjectCreationLocation | undefined,
): Promise<{ location: ProjectCreationLocation; storageRoot: PersistentStorageRoot; workspaceSlug: string }> => {
  let location = explicitLocation;
  if (!location) {
    const { location: preferredLocation } = await getProjectCreationLocation({
      webAccessSupported: directoryPicker().available,
    });
    location = preferredLocation;
  }
  if (location.kind === 'workspace') {
    const picked = await getWorkspaceMetadata(location.workspaceId);
    if (picked && isNodeWorkspace(picked)) {
      if (!(await isNodeWorkspaceConnected(picked))) {
        throw new WorkspaceDirectoryRequiredError('disconnected', { workspaceId: picked.workspaceId });
      }
      return { location, storageRoot: { backend: 'node', path: picked.path }, workspaceSlug: picked.slug };
    }
    const entry = await resolveWorkspaceForWrite(location.workspaceId);
    return {
      location,
      storageRoot: { backend: 'webaccess', workspaceId: entry.workspace.workspaceId },
      workspaceSlug: entry.workspace.slug,
    };
  }
  return { location, storageRoot: { backend: await getHomeStorageBackend() }, workspaceSlug: homeWorkspaceSlug };
};

export function ProjectManagerProvider({
  children,
  library: composed,
}: {
  readonly children?: ReactNode;
  readonly library?: ProjectLibrary;
}): React.JSX.Element {
  const runtime = useOptionalAppRuntime();
  const library = composed ?? (runtime === undefined ? undefined : selectRuntimeProjectLibrary(runtime));
  const chatSessions = runtime === undefined ? undefined : selectRuntimeChatSessions(runtime);
  if (library === undefined) {
    throw new Error('ProjectManagerProvider must be used within <AppRuntimeProvider>, or be given a library');
  }
  const actorRef = library.projectManager;
  const fileManager = useFileManager();
  /*
   * The library's transitional binding (programme-control D15 ruling, A2): the root file manager's facade, which
   * `FileManagerScope` builds in React. It is handed over in render, so a session acquired in this pass already reads
   * through it. Since A3b the library owns everything else it reads: the chat store over the facade's record client,
   * the two filesystem observations, discovery, the journal and route access. A4b builds the facade over `rootFiles`
   * and deletes the binding.
   */
  library.bind({ fileManager });
  const { chatStore } = library;
  if (chatStore === undefined) {
    throw new Error('The project library has no chat store after its binding');
  }
  /* The observations' reads run through this provider's binding: a remount releases it, and the next mount resumes it
   * (B9, StrictMode). */
  useEffect(() => {
    library.resume();
    return () => {
      library.release();
    };
  }, [library]);
  const workspaceTelemetry = useWorkspaceTelemetry();
  const projectNameClient = useProjectNameClient();

  /* What the library publishes, read through its module-level selectors (MC-R25). */
  const librarySnapshot = useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
  const error = selectLibraryError(librarySnapshot);
  const isLoading = selectLibraryIsLoading(librarySnapshot);
  const recoveries = selectLibraryRecoveries(librarySnapshot);
  /*
   * Moves whenever a project moves in or out of the Trash. `getProjectRouteAccess` reads `deletedAt` once per call, so
   * the route depends on this counter, which makes that a live transition (blueprint Finding 2).
   */
  const libraryRevision = selectLibraryRevision(librarySnapshot);
  const discoveryObservationError = selectDiscoveryObservationError(librarySnapshot);
  const metadataObservationError = selectMetadataObservationError(librarySnapshot);
  const metadataObservationErrors = selectMetadataObservationErrors(librarySnapshot);
  const getMetadataObservationError = useCallback(
    (resourceId: string): string | undefined => metadataObservationErrors.get(resourceId),
    [metadataObservationErrors],
  );

  const {
    discardRecovery,
    getProjectListing,
    getReadiedWorker,
    invalidateChatQueries,
    invalidateListing,
    noteLibraryChanged,
    refreshObservations: refreshFilesystemObservations,
    routeAccess: getProjectRouteAccess,
    touchProject,
    whenDiscoveryReady,
    whenReplaysDrained,
  } = library;

  const invalidateProjectedChats = useCallback(
    (resourceId: string, chatIds: readonly string[]) => {
      for (const chatId of chatIds) {
        invalidateChatQueries(resourceId, chatId);
      }
    },
    [invalidateChatQueries],
  );

  /** A discovery pass's result: the one in flight, or a new one. */
  const discoverProjects = useCallback(async (): Promise<ProjectDiscoveryResult> => {
    const { result } = await library.discover();
    return result;
  }, [library]);

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

  /**
   * Images for the naming profile, which needs bytes over HTTP. Documents are
   * not sent to it (blueprint §Legacy arms).
   */
  const namingImageUrls = useCallback(
    async (message: NonNullable<CreateProjectChatOptions['initialMessage']>): Promise<string[]> => {
      const source = composerAttachmentsOf(fileManager.recordFiles, message.attachmentSource);
      const urls = await Promise.all(
        (message.attachments ?? [])
          .filter((attachment) => attachmentKind(attachment.mediaType) === 'image')
          .map(async (attachment) => {
            const bytes = await source.read(attachment);
            return bytes && `data:${attachment.mediaType};base64,${uint8ArrayToBase64(bytes)}`;
          }),
      );
      return urls.filter((url) => url !== undefined);
    },
    [fileManager.recordFiles],
  );

  const createProjectOnce = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> => {
      /* The id is a directory here and a repository name on the Tau Hosted
         Remote, so a supplied one is checked against the same rule a minted one
         satisfies — before anything is readied, allocated or written (W18 DEF-2). */
      if (options.id !== undefined && !projectIdSchema.safeParse(options.id).success) {
        throw new Error(`Not a project id: ${options.id}`);
      }
      /* One id is one local project (review R4). The *From Tau Cloud* row is
         offered from a cached listing against an asynchronous discovery pass, so
         the same row can be clicked twice — and two directories under one id is
         a `duplicate-id` conflict neither of them recovers from. The route
         config is the durable record of what this device holds. */
      if (options.id !== undefined && (await getProjectFileSystemConfig(options.id)) !== undefined) {
        throw new Error(`That project is already on this device: ${options.id}`);
      }
      const worker = await getReadiedWorker();

      const { location, storageRoot, workspaceSlug } = await resolveCreationStorage(options.location);

      const projectId = options.id ?? generatePrefixedId(idPrefix.project);

      // Determine project data and files based on pattern
      let projectData: Omit<ProjectManifest, '$schema'>;
      let files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
      let kernel: KernelProvider | undefined;

      if ('kernel' in options) {
        // CreateProjectFromKernel: Generate from kernel template
        const { projectName: requestedProjectName } = options;
        let projectName = requestedProjectName;
        if (!projectName && options.initialMessage) {
          const generated = await projectNameClient
            .generate({
              projectId,
              text: options.initialMessage.content,
              imageUrls: await namingImageUrls(options.initialMessage),
            })
            /* Naming is a courtesy from the API, not a prerequisite: with the
             * API unreachable (a daemon-served page, desktop offline) the
             * project is still created, under the same default an empty
             * suggestion gets. */
            .catch((): string => '');
          projectName = generated.trim() || defaultProjectName;
        }
        if (options.kernel === 'auto') {
          projectData = createEntrylessProject(projectName ?? defaultProjectName);
          files = {};
        } else {
          kernel = options.kernel;
          const mainFileName = getMainFile(options.kernel);
          const emptyCode = getEmptyCode(options.kernel);
          const result = createInitialProject({
            projectName: projectName ?? defaultProjectName,
            mainFileName,
            emptyCodeContent: encodeTextFile(emptyCode),
            ecosystem: getKernelOption(options.kernel).ecosystem,
            dependencies: await getKernelDependencies(options.kernel),
            template: await getKernelProjectTemplate(options.kernel),
          });
          projectData = result.projectData;
          files = result.files;
        }
      } else {
        // CreateProjectFromData: Use provided project data and files
        projectData = options.project;
        files = options.files;
      }

      /* A6: a project born here, with no remote of its own, asks its first open to mint the Start version, V1. A
         caller that supplies the id brings history of its own (a Tau Cloud open, a linked GitHub import). */
      if (options.id === undefined) {
        files = {
          ...files,
          [startRecordPath]: {
            content: serializeStartRecord('kernel' in options ? 'created' : (options.origin ?? 'created')),
          },
        };
      }

      const manifest = projectToManifest(projectData);
      /* An import written straight into its project directory commits there; anything else allocates now. */
      const stagedBasePath = 'staging' in options ? options.staging?.providerBasePath : undefined;
      const providerBasePath =
        stagedBasePath ?? (await allocateProjectBasePath(fileManager.client, storageRoot, manifest.name));
      const pendingStorage: PendingProjectStorage = { ...storageRoot, providerBasePath };

      // The initial homepage prompt remains a normal pending user message
      // for display purposes. The permission to run it automatically after
      // route hydration is separate one-shot command state on the chat row.
      const initialUserMessage = options.initialMessage
        ? buildUserMessage({
            text: options.initialMessage.content,
            attachments: options.initialMessage.attachments,
          })
        : undefined;
      const chatMessages = initialUserMessage ? [initialUserMessage] : [];
      const startupRequest: Chat['startupRequest'] | undefined = initialUserMessage
        ? {
            id: generatePrefixedId(idPrefix.request),
            kind: 'regenerate-tail',
            messageId: initialUserMessage.id,
            message: initialUserMessage,
            source: 'homepage-initial-message',
            createdAt: Date.now(),
          }
        : undefined;

      const chatName = options.chatName ?? (options.initialMessage ? 'Initial design' : 'Initial chat');

      // Seed the chat row with chat-scoped active model + kernel so a
      // cookie change in another tab does not mutate the active selection
      // for this freshly-created chat. Defaults to the kernel chosen by
      // the creation flow when not explicitly supplied. The chat store keeps
      // only the portable execution; a device-relative placement is kept for
      // this device below (XD2).
      const seededActiveExecution = options.activeExecution;
      const seededActiveKernel = options.activeKernel ?? kernel;

      /* Rule 4: a supplied id waits while this tab replays a row of it; a minted one cannot be held by any row. */
      const mutation = await library.beginMutation(projectId, { gated: options.id !== undefined });
      // Single atomic call to create project + chat + Editor state
      const operation = await worker
        .prepareProjectCreation({
          manifest,
          projectId,
          ...(options.chat === false
            ? {}
            : {
                chat: {
                  name: chatName,
                  messages: chatMessages,
                  activeExecution: seededActiveExecution,
                  activeKernel: seededActiveKernel,
                  /* A project created under Auto seeds its first chat with `auto` (blueprint D2). */
                  ...('kernel' in options && options.kernel === 'auto' ? { kernelPreference: 'auto' } : {}),
                  ...(startupRequest ? { startupRequest } : {}),
                },
                ...attachmentSourceOf(options),
              }),
          editorState: options.editorState,
          deferInitialView: 'project' in options && options.deferInitialView,
          files,
          ...('staging' in options && options.staging !== undefined
            ? {
                staging: { operationId: options.staging.operationId },
                seedWorkbench: options.staging.carriesWorkbenchLayout !== true,
                ...(options.staging.manifestBytes === undefined
                  ? {}
                  : { manifestBytes: options.staging.manifestBytes }),
              }
            : {}),
          storage: pendingStorage,
        })
        .catch((error: unknown) => {
          mutation.abandon();
          throw error;
        });
      mutation.journaled(operation);
      await mutation.apply(operation, worker);
      if (operation.chat !== undefined) {
        await rememberChatPlacement(fileManager.recordFiles, {
          projectId: operation.projectId,
          chatId: operation.chat.id,
          execution: seededActiveExecution,
        });
        if (chatMessages.length === 0) {
          // Created empty here: its lane shows the empty state at once, not after its log answers (A12, I21).
          chatSessions?.noteCreatedEmpty(operation.chat.id);
        }
      }
      /* D19: a project born with no remote backs up to Tau Cloud from its first
         revision — a template, a fork, a file or zip import. A caller that
         supplies the id is adopting an identity that has a remote of its own (a
         Tau Cloud open, a materialized project, a linked GitHub import), so it
         is left alone. The session decides once it knows the account (W11). */
      if (options.id === undefined) {
        tauCloudIntent.set(projectId, 'default');
      }
      /* Route callers navigate with the returned slugs immediately. Publish
       * the completed filesystem commit to every active project-list query
       * before that navigation can ask the sole slug resolver for its id. */
      /* The row's settle moved the epoch and started the pass after the commit; this refetch joins it. */
      await library.invalidateProjectListing();
      try {
        await setProjectCreationLocation(location);
      } catch (error) {
        console.warn('[ProjectManager] failed to persist project creation location', error);
      }

      return {
        ...operation.manifest,
        id: operation.projectId,
        slugs: { workspaceSlug, projectSlug: directorySlug(providerBasePath) },
      };
    },
    [
      chatSessions,
      fileManager.client,
      fileManager.recordFiles,
      getReadiedWorker,
      library,
      namingImageUrls,
      projectNameClient,
    ],
  );

  /**
   * Release the rows a cleared browser left behind for a project id (R14).
   *
   * The route config, editor layout and library state are keyed by the id and
   * survive the browser deleting every file, so re-importing the same project
   * met "already on this device" with nothing in the library to open. Only a
   * Home route whose folder is proven to hold no file is released; its rows go
   * the way the discovery sweep removes an orphan's, and the import proceeds.
   * Folders on disk, unreadable folders and folders with any file left keep
   * the refusal.
   */
  const releaseOrphanedProjectRoute = useCallback(
    async (projectId: string, worker: Remote<ObjectStoreWorker>): Promise<void> => {
      const config = await getProjectFileSystemConfig(projectId);
      if (config === undefined || !(await isOrphanedProjectRoute(config, fileManager.scopedStorage))) {
        return;
      }
      /* A discovered identity naming the project elsewhere is not an orphan:
       * releasing its route would let this import create a second copy. */
      const { entries } = await discoverProjects();
      if (entries.some((entry) => 'projectId' in entry && entry.projectId === projectId)) {
        return;
      }
      await worker.deleteProjectResources(projectId);
      await deleteProjectFileSystemConfig(projectId);
      await fileManager.workspace.syncProjectRoots();
    },
    [discoverProjects, fileManager.scopedStorage, fileManager.workspace],
  );

  /* A supplied id is checked and then written, so two creations of it — an
     *Open* racing materialize on sign-in, or two tabs — hold one lock per id
     across the check and the write; the second sees the first's project and is
     refused. A minted id cannot collide, so it takes no lock.
     An earlier creation of the id that never finished — a reload, a re-init or
     a tab closed between its directory commit and its route config (R2) — is
     finished here rather than repeated: this page's own recovery first, then
     any journal row another tab left since. Its directory is quarantined from
     the library meanwhile, so a caller asking again cannot tell it is there. */
  /* Resolved the way a create resolves it, so the staging lands on the storage root the commit moves it from. */
  const importStagingOwners = useCallback(async (): Promise<string[]> => {
    const worker = await getReadiedWorker();
    const operations = await worker.getPendingProjectOperations();
    return operations.flatMap((operation) =>
      operation.kind === 'create' && operation.staging !== undefined ? [operation.staging.operationId] : [],
    );
  }, [getReadiedWorker]);

  const prepareImportStaging = useCallback(
    async (name: string, requested?: ProjectCreationLocation): Promise<ImportStagingTarget> => {
      const { location, storageRoot } = await resolveCreationStorage(requested);
      const [providerBasePath, owned] = await Promise.all([
        allocateProjectBasePath(fileManager.client, storageRoot, name),
        importStagingOwners(),
      ]);
      return {
        location,
        scope: await pendingStorageToScope({ ...storageRoot, providerBasePath: '' }),
        providerBasePath,
        owned,
      };
    },
    [fileManager.client, importStagingOwners],
  );

  const ownsImportStaging = useCallback(
    async (operationId: string): Promise<boolean> => {
      const owners = await importStagingOwners();
      return owners.includes(operationId);
    },
    [importStagingOwners],
  );

  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> => {
      const { id } = options;
      if (id === undefined) {
        return createProjectOnce(options);
      }
      return withNamedLock(`tau:create-project:${id}`, async () => {
        await whenDiscoveryReady();
        await whenReplaysDrained();
        const worker = await getReadiedWorker();
        const operations = await worker.getPendingProjectOperations();
        const unfinished = operations.find(
          (operation) => operation.kind !== 'permanent-delete' && operation.projectId === id,
        );
        if (unfinished !== undefined) {
          if (await library.replayForPerson(unfinished)) {
            throw new Error(`An earlier creation of this project has not finished on this device: ${id}`);
          }
        } else if (
          !operations.some((operation) => operation.kind === 'permanent-delete' && operation.projectId === id)
        ) {
          await releaseOrphanedProjectRoute(id, worker);
        }
        return createProjectOnce(options);
      });
    },
    [createProjectOnce, getReadiedWorker, library, releaseOrphanedProjectRoute, whenDiscoveryReady, whenReplaysDrained],
  );

  /**
   * The routed project's manifest: strict, or degraded with the issue that
   * write-protects it (blueprint R3/R4). Identity comes from the established route binding.
   */
  const readProjectManifest = useCallback(
    async (projectId: string): Promise<Extract<ProjectManifestReadResult, { success: true }> | undefined> => {
      await whenDiscoveryReady();
      const read = async (): Promise<Extract<ProjectManifestReadResult, { success: true }> | undefined> => {
        try {
          const result = readProjectManifestBytes(
            await fileManager.recordFiles.readFile(`/projects/${projectId}/tau.json`),
          );
          return result.success ? result : undefined;
        } catch {
          return undefined;
        }
      };
      const current = await read();
      if (current) {
        return current;
      }
      await whenReplaysDrained();
      await discoverProjects();
      return read();
    },
    [discoverProjects, fileManager.recordFiles, whenDiscoveryReady, whenReplaysDrained],
  );

  const getProject = useCallback(
    async (projectId: string): Promise<Project | undefined> => {
      const read = await readProjectManifest(projectId);
      return read === undefined ? undefined : { ...read.data, id: projectId };
    },
    [readProjectManifest],
  );

  const updateProject = useCallback(
    async (projectId: string, update: PartialDeep<ProjectManifest>): Promise<Project | undefined> => {
      const project = await readProjectManifest(projectId);
      if (!project) {
        return undefined;
      }
      // A degraded view is lossy (dropped keys, clamped text), so writing it
      // back would erase what a person or a newer build wrote (blueprint R4).
      if (project.issue) {
        throw new Error('tau.json needs repair before Tau can change it. Repair it, or fix it in the editor.');
      }
      const updated = deepmerge(project.data, update) as ProjectManifest;
      await fileManager.recordFiles.writeFile(
        `/projects/${projectId}/tau.json`,
        serializeProjectManifest(projectToManifest(updated)),
      );
      return { ...updated, id: projectId };
    },
    [fileManager.recordFiles, readProjectManifest],
  );

  const repairProject = useCallback(
    async (projectId: string): Promise<Project | undefined> => {
      const project = await readProjectManifest(projectId);
      if (!project?.issue) {
        return project === undefined ? undefined : { ...project.data, id: projectId };
      }
      // Defaults would erase text a person can still fix by hand.
      if (project.issue.code === 'manifest-invalid-json') {
        throw new Error('tau.json is not valid JSON. Fix it in the editor; Repair would discard its text.');
      }
      await fileManager.recordFiles.writeFile(
        `/projects/${projectId}/tau.json`,
        serializeProjectManifest(project.data),
      );
      invalidateListing();
      return { ...project.data, id: projectId };
    },
    [fileManager.recordFiles, invalidateListing, readProjectManifest],
  );

  const setGeoSpecCandidateConsent = useCallback(
    async (projectId: string, enabled: boolean): Promise<ProjectLibraryState | undefined> => {
      await whenDiscoveryReady();
      const worker = await getReadiedWorker();
      return worker.setGeoSpecCandidateConsent(projectId, enabled);
    },
    [getReadiedWorker, whenDiscoveryReady],
  );

  const getProjectLibraryState = useCallback(
    async (projectId: string): Promise<ProjectLibraryState | undefined> => {
      await whenDiscoveryReady();
      const worker = await getReadiedWorker();
      return worker.getProjectLibraryState(projectId);
    },
    [getReadiedWorker, whenDiscoveryReady],
  );

  const duplicateProject = useCallback(
    async (projectId: string): Promise<CreatedProject> => {
      await whenDiscoveryReady();
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

      /* The source's own composed view supplies authored files and the
         registry-selected writable records. The fresh manifest is written by
         the commit, so the source's own `tau.json` is dropped. */
      const sourceFiles = Object.fromEntries(
        Object.entries(await fileManager.readDuplicateProjectFiles(`/projects/${projectId}`))
          .filter(([path]) => path !== 'tau.json')
          .map(([path, content]) => [path, { content }]),
      );
      const sourceChats = await chatStore.getChatsForResource(projectId);
      /* A copy journals a row for its fresh id, which no row can hold (rule 4). */
      const mutation = await library.beginMutation(targetId, { gated: false });
      const operation = await worker
        .prepareProjectDuplicate({
          sourceProjectId: projectId,
          targetProjectId: targetId,
          targetManifest,
          files: sourceFiles,
          storage,
          sourceChats,
        })
        .catch((error: unknown) => {
          mutation.abandon();
          throw error;
        });
      mutation.journaled(operation);
      await mutation.apply(operation, worker);
      /* D19: a copy has no remote of its own, so it backs up by default too. */
      tauCloudIntent.set(targetId, 'default');
      return {
        ...operation.manifest,
        id: operation.projectId,
        slugs: { workspaceSlug, projectSlug: directorySlug(providerBasePath) },
      };
    },
    [chatStore, fileManager, getProject, getReadiedWorker, library, whenDiscoveryReady],
  );
  // (getProjectFileSystemConfig / getWorkspace are stable module-level
  // bindings — intentionally omitted from the dep array.)

  const refreshWorkspaceCatalog = useCallback(async (): Promise<void> => {
    const catalog = await library.prepareCurrentWorkspaceCatalog(undefined);
    await catalog.publish();
  }, [library]);

  const repairWorkspaceBindings = useCallback(
    async (canonicalWorkspaceId: string): Promise<WorkspaceBindingRepairResult> => {
      await whenDiscoveryReady();
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
      const catalog = await library.prepareCurrentWorkspaceCatalog(undefined);
      await catalog.publish();
      return result;
    },
    [discoverProjects, fileManager.workspace, library, whenDiscoveryReady],
  );

  const workspaceConnectionRef = library.workspaceConnection;
  const workspaceConnection = selectLibraryWorkspaceConnection(librarySnapshot);

  const waitForWorkspaceConnection = useCallback(
    async (operationId: string): Promise<ConnectedWorkspace> =>
      new Promise<ConnectedWorkspace>((resolve, reject) => {
        const settle = (snapshot: ReturnType<typeof workspaceConnectionRef.getSnapshot>): void => {
          if (snapshot.context.operationId !== operationId) {
            /* Only a later `beginSelection` sets another id: this operation was superseded, so it settles. The
             * library's connection outlives a provider remount, which clears the in-flight promise (A2). */
            if (snapshot.context.operationId !== undefined) {
              subscription.unsubscribe();
              reject(new Error('Workspace connection was superseded.'));
            }
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
      const picker = directoryPicker();
      if (!picker.available) {
        return undefined;
      }
      return library.connectOnce(async (): Promise<ConnectedWorkspace | undefined> => {
        const operationId = generatePrefixedId(idPrefix.request);
        workspaceConnectionRef.send({ type: 'beginSelection', operationId });
        let selection: DirectoryPick | undefined =
          selectedHandle === undefined ? undefined : { backend: 'webaccess', handle: selectedHandle };
        try {
          selection ??= await picker.pick({ id: 'tau-workspace', mode: 'readwrite' });
          if (selection === undefined) {
            workspaceConnectionRef.send({ type: 'selectionCancelled' });
            return undefined;
          }
        } catch (error) {
          workspaceConnectionRef.send({ type: 'selectionCancelled' });
          throw error;
        }
        const trace: WorkspaceConnectionTrace = {
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
        library.connectionTrace = trace;
        const completion = waitForWorkspaceConnection(operationId);
        workspaceConnectionRef.send({ type: 'workspaceSelected', operationId, selection });
        try {
          const connected = await completion;
          if (library.connectionTrace === trace) {
            const { startedAt, ...metrics } = trace;
            workspaceTelemetry.workspaceConnection({
              ...metrics,
              outcome: 'ready',
              totalMs: performance.now() - startedAt,
            });
          }
          return connected;
        } catch (error) {
          if (library.connectionTrace === trace) {
            const { startedAt, ...metrics } = trace;
            workspaceTelemetry.workspaceConnection({
              ...metrics,
              outcome: 'failed',
              totalMs: performance.now() - startedAt,
            });
          }
          throw error;
        }
      });
    },
    [library, waitForWorkspaceConnection, workspaceConnectionRef, workspaceTelemetry],
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
      const { selection } = workspaceConnectionRef.getSnapshot().context;
      if (selection?.backend !== 'webaccess' || !(await requestHandlePermission(selection.handle))) {
        return undefined;
      }
    }
    workspaceConnectionRef.send({ type: 'retry' });
    return waitForWorkspaceConnection(current.operationId);
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
      await whenDiscoveryReady();
      const worker = await getReadiedWorker();
      const trashed = await worker.trashProject(projectId);
      if (trashed?.deletedAt === undefined) {
        return false;
      }
      await writeProjectLibraryFile(fileManager.recordFiles, projectId, { deletedAt: trashed.deletedAt });
      noteLibraryChanged();
      return true;
    },
    [fileManager.recordFiles, getReadiedWorker, noteLibraryChanged, whenDiscoveryReady],
  );

  const restoreProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      await whenDiscoveryReady();
      const worker = await getReadiedWorker();
      const restored = await worker.restoreProject(projectId);
      if (!restored) {
        return false;
      }
      await writeProjectLibraryFile(fileManager.recordFiles, projectId, {});
      noteLibraryChanged();
      return true;
    },
    [fileManager.recordFiles, getReadiedWorker, noteLibraryChanged, whenDiscoveryReady],
  );

  const permanentlyDeleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      await whenDiscoveryReady();
      const worker = await getReadiedWorker();
      /* Rule 4: a row this tab replays for the project settles first, so the locator is read after it. */
      const mutation = await library.beginMutation(projectId, { gated: true });
      let operation: PendingProjectOperation | undefined;
      try {
        const storage = await discoverPermanentDeleteStorage(projectId);
        const operationId = await worker.beginPermanentDeleteProject(projectId, storage);
        const pendingOperations = await worker.getPendingProjectOperations();
        operation = pendingOperations.find((candidate) => candidate.operationId === operationId);
        if (!operation) {
          throw new Error(`Pending project operation not found: ${operationId}`);
        }
      } catch (error) {
        mutation.abandon();
        throw error;
      }
      mutation.journaled(operation);
      await mutation.apply(operation, worker);
      noteLibraryChanged();
    },
    [discoverPermanentDeleteStorage, getReadiedWorker, library, noteLibraryChanged, whenDiscoveryReady],
  );

  const adoptProject = useCallback(
    async (locator: ProjectLocator): Promise<Project> => {
      await whenDiscoveryReady();
      // The route that last bound this directory keys its chats, library row and
      // editor state: restore that id unless another directory now claims it (R6).
      const [configs, discovery] = await Promise.all([getAllProjectFileSystemConfigs(), discoverProjects()]);
      const remembered = configs.find((config) => routeBindsLocator(config, locator))?.projectId;
      const claimed = discovery.entries.some((entry) => 'projectId' in entry && entry.projectId === remembered);
      const manifest = await fileManager.client.adoptProjectDirectory(
        locator,
        remembered === undefined || claimed ? undefined : { id: remembered },
      );
      // The next discovery pass reconciles the route config from the manifest
      // now on disk, so nothing else has to be written here.
      invalidateListing();
      return { ...manifest.manifest, id: manifest.projectId };
    },
    [discoverProjects, fileManager.client, invalidateListing, whenDiscoveryReady],
  );

  const chooseProjectDirectory = useCallback(
    async (locator: ProjectLocator, projectId: string): Promise<void> => {
      await whenDiscoveryReady();
      // Re-verify on a fresh scan: the folder may have changed since the card
      // rendered. Only the route binding moves; no project file is written (R7).
      const discovery = await discoverProjects();
      const chosen = discovery.entries.find(
        (entry) =>
          (entry.status === 'duplicate-id' || entry.status === 'valid') &&
          entry.projectId === projectId &&
          entry.locator.storageRootKey === locator.storageRootKey &&
          entry.locator.relativeDirectory === locator.relativeDirectory,
      );
      if (!chosen) {
        throw new Error('This folder no longer holds that project.');
      }
      await setProjectFileSystemConfig(routeConfigFor(projectId, chosen.locator));
      await fileManager.workspace.syncProjectRoots();
      invalidateListing();
    },
    [discoverProjects, fileManager.workspace, invalidateListing, whenDiscoveryReady],
  );

  const assertWorkspaceMutationAllowed = useCallback(
    async (workspaceId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      const workspace = await getWorkspaceMetadata(workspaceId);
      const operations = workspace?.path === undefined ? [] : await worker.getPendingProjectOperations();
      const pendingNative = operations.some((operation) => {
        const storage = operation.kind === 'permanent-delete' ? operation.storage : operation;
        return storage.backend === 'node' && storage.path === workspace?.path;
      });
      if (pendingNative || (await worker.hasPendingProjectOperationForWorkspace(workspaceId))) {
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
      chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'> & {
        id?: string;
      },
    ): Promise<Chat> => {
      const chat = await chatStore.createChat(resourceId, chatData);
      await rememberChatPlacement(fileManager.recordFiles, {
        projectId: resourceId,
        chatId: chat.id,
        execution: chatData.activeExecution,
      });
      /* W9: the new chat copies the Settings default; one never seeded reads Ask. */
      await seedChatPermission(resourceId, chat.id);
      await touchProject(resourceId);
      invalidateListing();
      return chat;
    },
    [chatStore, fileManager.recordFiles, invalidateListing, touchProject],
  );

  const { createNavigationRepairChat } = library;

  const updateChat = useCallback(
    async (chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> => {
      return chatStore.updateChat(chatId, update);
    },
    [chatStore],
  );

  const applyGeneratedChatName = useCallback(
    async (chatId: string, name: string): Promise<Chat | undefined> => {
      return chatStore.applyGeneratedChatName(chatId, name);
    },
    [chatStore],
  );

  const { patchChat, touchChatRecency, consumeChatStartupRequest, commitCancelledDraftRestore } = library;

  const softDeleteChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const result = await chatStore.softDeleteChat(chatId);
      if (result) {
        await touchProject(result.resourceId);
        invalidateListing();
      }

      return result;
    },
    [chatStore, invalidateListing, touchProject],
  );

  /* The provider's reads end with it: one its unmount fails is not asked again (the library's own ports are). */
  const { readChats, adoptLegacyChatPlacement } = library;
  const once = { retry: false } as const;

  const getChatsForResource = useCallback(
    async (resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> =>
      readChats(async (source) => source.getChatsForResource(resourceId, options), resourceId, once),
    [readChats],
  );

  const getAllChats = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<Chat[]> =>
      readChats(async (source) => source.getAllChats(options), undefined, once),
    [readChats],
  );

  const getChatRecordsForResource = useCallback(
    async (resourceId: string, options?: { includeDeleted?: boolean }): Promise<ChatRecord[]> =>
      readChats(async (source) => source.getChatRecordsForResource(resourceId, options), resourceId, once),
    [readChats],
  );

  const getAllChatRecords = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<ChatRecord[]> =>
      readChats(async (source) => source.getAllChatRecords(options), undefined, once),
    [readChats],
  );

  const getChat = useCallback(
    async (chatId: string, projectId?: string): Promise<Chat | undefined> =>
      readChats(async (source) => source.getChat(chatId, projectId), projectId, once),
    [readChats],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      const chat = await chatStore.getChat(chatId);
      await chatStore.deleteChat(chatId);
      if (chat) {
        await removeChatPermission(chat.resourceId, chatId);
        await touchProject(chat.resourceId);
      }
      invalidateListing();
    },
    [chatStore, invalidateListing, touchProject],
  );

  const purgeChat = useCallback(
    async (chatId: string): Promise<void> => {
      const chat = await chatStore.getChat(chatId);
      await chatStore.purgeChat(chatId);
      if (chat) {
        await removeChatPermission(chat.resourceId, chatId);
        await touchProject(chat.resourceId);
      }
      invalidateListing();
    },
    [chatStore, invalidateListing, touchProject],
  );

  /* A newcomer's first project asks for the product tour: decided before the project exists, stored once it does. */
  const createProjectAskingForTour = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> => {
      const askForTour = await prepareFirstProjectTour({
        async readProjectCount() {
          const listing = await getProjectListing({ includeDeleted: true });
          return listing.projects.length;
        },
        async readAccount() {
          const { authClient } = await import('#lib/auth-client.js');
          const { data, error } = await authClient.getSession();
          if (error !== null) {
            throw new Error('The session could not be read');
          }
          return data === null ? { isSignedIn: false } : { isSignedIn: true, createdAt: data.user.createdAt };
        },
      });
      const created = await createProject(options);
      askForTour?.();
      return created;
    },
    [createProject, getProjectListing],
  );

  const value = useMemo<ProjectManagerContextType>(() => {
    return {
      isLoading,
      error,
      discoveryObservationError,
      metadataObservationError,
      getMetadataObservationError,
      refreshFilesystemObservations,
      projectManagerRef: actorRef,
      workspaceConnection,
      connectWorkspace,
      retryWorkspaceConnection,
      refreshWorkspaceCatalog,
      repairWorkspaceBindings,
      createProject: createProjectAskingForTour,
      prepareImportStaging,
      ownsImportStaging,
      updateProject,
      repairProject,
      touchProject,
      setGeoSpecCandidateConsent,
      duplicateProject,
      getProjects,
      getProjectListing,
      getProject,
      getProjectRouteAccess,
      getProjectLibraryState,
      deleteProject,
      restoreProject,
      permanentlyDeleteProject,
      libraryRevision,
      adoptProject,
      chooseProjectDirectory,
      recoveries,
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
      consumeChatStartupRequest,
      commitCancelledDraftRestore,
      softDeleteChat,
      getAllChats,
      getChatsForResource,
      getAllChatRecords,
      getChatRecordsForResource,
      getChat,
      adoptLegacyChatPlacement,
      invalidateProjectedChats,
      deleteChat,
      purgeChat,
    };
  }, [
    isLoading,
    error,
    discoveryObservationError,
    metadataObservationError,
    getMetadataObservationError,
    refreshFilesystemObservations,
    actorRef,
    workspaceConnection,
    connectWorkspace,
    retryWorkspaceConnection,
    refreshWorkspaceCatalog,
    repairWorkspaceBindings,
    createProjectAskingForTour,
    prepareImportStaging,
    ownsImportStaging,
    updateProject,
    repairProject,
    touchProject,
    setGeoSpecCandidateConsent,
    duplicateProject,
    getProjects,
    getProjectListing,
    getProject,
    getProjectRouteAccess,
    getProjectLibraryState,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    libraryRevision,
    adoptProject,
    chooseProjectDirectory,
    recoveries,
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
    consumeChatStartupRequest,
    commitCancelledDraftRestore,
    softDeleteChat,
    getAllChats,
    getChatsForResource,
    getAllChatRecords,
    getChatRecordsForResource,
    getChat,
    adoptLegacyChatPlacement,
    invalidateProjectedChats,
    deleteChat,
    purgeChat,
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
