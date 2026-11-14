import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { createContext, useContext, useMemo, useCallback, useSyncExternalStore } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { Project, ProjectManifest } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import type { Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { projectManagerMachine } from '#hooks/project-manager.machine.js';
import type { WorkspaceBindingRepairResult } from '#filesystem/handle-store.js';
import { removeChatPermission, seedChatPermission } from '#hooks/use-permission-mode.js';
import type { AppUiPreferences, ChatStorage, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project-library.types.js';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import type { ProjectCreationLocation } from '@taucad/ui-core/types/project-creation-location.types';
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
import type { ProjectListing } from '#runtime/project-library-storage.js';
import type { ProjectLibrary, ProjectRouteAccess } from '#runtime/project-library.js';
import type { CreatedProject, CreateProjectOptions, ImportStagingTarget } from '#runtime/project-library-commands.js';
import type { ConnectedWorkspace } from '#runtime/project-library-workspace.js';
import { selectRuntimeProjectLibrary } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { prepareFirstProjectTour } from '#components/tour/first-project-tour.js';
import type { WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';

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
  /** The listing's query: the one key and function that write `['projects']` (D9). Readers spread it into `useQuery`. */
  projectListingQuery: ProjectLibrary['listingQuery'];
  getProject: (projectId: string) => Promise<Project | undefined>;
  getProjectRouteAccess: (projectId: string) => Promise<ProjectRouteAccess>;
  getProjectLibraryState: (projectId: string) => Promise<ProjectLibraryState | undefined>;
  restoreProject: (projectId: string) => Promise<boolean>;
  /** @returns whether a library row was actually trashed — a vanished row is not a success (DF3). */
  deleteProject: (projectId: string) => Promise<boolean>;
  permanentlyDeleteProject: (projectId: string) => Promise<void>;
  /** Refuse a delete while a stored chat's history is not caught up or work is running (row L7). */
  verifyProjectQuiescent: (projectId: string) => Promise<void>;
  /** Close the project's live session and wait for the registry to drop it; nothing when it holds none. */
  closeProjectSession: (projectId: string) => Promise<void>;
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

export function ProjectManagerProvider({
  children,
  library: composed,
}: {
  readonly children?: ReactNode;
  readonly library?: ProjectLibrary;
}): React.JSX.Element {
  const runtime = useOptionalAppRuntime();
  const library = composed ?? (runtime === undefined ? undefined : selectRuntimeProjectLibrary(runtime));
  if (library === undefined) {
    throw new Error('ProjectManagerProvider must be used within <AppRuntimeProvider>, or be given a library');
  }
  const actorRef = library.projectManager;

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
  const workspaceConnection = selectLibraryWorkspaceConnection(librarySnapshot);
  const getMetadataObservationError = useCallback(
    (resourceId: string): string | undefined => metadataObservationErrors.get(resourceId),
    [metadataObservationErrors],
  );

  /* A facade (A4b): every command is the library's, read off it here; the wrappers below only compose them. */
  const {
    commands,
    workspaceCommands,
    discardRecovery,
    getProjectListing,
    getReadiedWorker,
    invalidateChatQueries,
    invalidateListing,
    listingQuery: projectListingQuery,
    refreshObservations: refreshFilesystemObservations,
    routeAccess: getProjectRouteAccess,
    touchProject,
    whenDiscoveryReady,
    createNavigationRepairChat,
    patchChat,
    touchChatRecency,
    consumeChatStartupRequest,
    commitCancelledDraftRestore,
    readChats,
    adoptLegacyChatPlacement,
  } = library;
  const {
    prepareImportStaging,
    ownsImportStaging,
    getProject,
    updateProject,
    repairProject,
    duplicateProject,
    trashProject: deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    adoptProject,
    verifyProjectQuiescent,
    closeProjectSession,
  } = commands;
  const {
    connectWorkspace,
    retryWorkspaceConnection,
    refreshWorkspaceCatalog,
    repairWorkspaceBindings,
    chooseProjectDirectory,
    assertWorkspaceMutationAllowed,
  } = workspaceCommands;

  /** The chat store over the facade's current record client, read when a command runs. */
  const chatStoreOf = useCallback((): ChatStorage => {
    const { chatStore } = library;
    if (chatStore === undefined) {
      throw new Error('The project library has no chat store before the root file facade');
    }
    return chatStore;
  }, [library]);

  const invalidateProjectedChats = useCallback(
    (resourceId: string, chatIds: readonly string[]) => {
      for (const chatId of chatIds) {
        invalidateChatQueries(resourceId, chatId);
      }
    },
    [invalidateChatQueries],
  );

  const { generate: generateProjectName } = useProjectNameClient();
  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> =>
      commands.createProject(options, { generate: generateProjectName }),
    [commands, generateProjectName],
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

  const getProjects = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<ProjectLibraryEntry[]> => {
      const listing = await getProjectListing(options);
      return [...listing.projects];
    },
    [getProjectListing],
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
      const chat = await chatStoreOf().createChat(resourceId, chatData);
      await library.rememberChatPlacement({
        projectId: resourceId,
        chatId: chat.id,
        ...(chatData.activeExecution === undefined ? {} : { execution: chatData.activeExecution }),
      });
      /* W9: the new chat copies the Settings default; one never seeded reads Ask. */
      await seedChatPermission(resourceId, chat.id);
      await touchProject(resourceId);
      invalidateListing();
      return chat;
    },
    [chatStoreOf, invalidateListing, library, touchProject],
  );

  const updateChat = useCallback(
    async (chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> =>
      chatStoreOf().updateChat(chatId, update),
    [chatStoreOf],
  );

  const applyGeneratedChatName = useCallback(
    async (chatId: string, name: string): Promise<Chat | undefined> =>
      chatStoreOf().applyGeneratedChatName(chatId, name),
    [chatStoreOf],
  );

  const softDeleteChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const result = await chatStoreOf().softDeleteChat(chatId);
      if (result) {
        await touchProject(result.resourceId);
        invalidateListing();
      }

      return result;
    },
    [chatStoreOf, invalidateListing, touchProject],
  );

  /* The provider's reads are not asked again (the library's own ports are). */
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
      const chatStore = chatStoreOf();
      const chat = await chatStore.getChat(chatId);
      await chatStore.deleteChat(chatId);
      if (chat) {
        await removeChatPermission(chat.resourceId, chatId);
        await touchProject(chat.resourceId);
      }
      invalidateListing();
    },
    [chatStoreOf, invalidateListing, touchProject],
  );

  const purgeChat = useCallback(
    async (chatId: string): Promise<void> => {
      const chatStore = chatStoreOf();
      const chat = await chatStore.getChat(chatId);
      await chatStore.purgeChat(chatId);
      if (chat) {
        await removeChatPermission(chat.resourceId, chatId);
        await touchProject(chat.resourceId);
      }
      invalidateListing();
    },
    [chatStoreOf, invalidateListing, touchProject],
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
      projectListingQuery,
      getProject,
      getProjectRouteAccess,
      getProjectLibraryState,
      deleteProject,
      restoreProject,
      permanentlyDeleteProject,
      verifyProjectQuiescent,
      closeProjectSession,
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
    projectListingQuery,
    getProject,
    getProjectRouteAccess,
    getProjectLibraryState,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    verifyProjectQuiescent,
    closeProjectSession,
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
