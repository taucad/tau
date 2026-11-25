/**
 * The project manager's provider: the project library's commands, reads and chat calls composed into the value
 * `useProjectManager` (`#hooks/use-project-manager`) reads. The app passes its library and what only it supplies
 * (`ProjectManagerServices`).
 *
 * @module
 */
import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { useMemo, useCallback, useSyncExternalStore } from 'react';
import type { Chat } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { ChatStorage } from '#types/chat-storage.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project-library.types.js';
import type {
  AppUiPreferences,
  ProjectLibraryRootFacade,
  ProjectManagerWorker,
} from '#types/project-library-io.types.js';
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
import type { ProjectLibrary } from '#runtime/project-library.js';
import type { CreatedProject, CreateProjectOptions, ProjectNaming } from '#runtime/project-library-commands.js';
import { projectManagerContext } from '#hooks/use-project-manager.js';
import type { ProjectManagerContextType } from '#hooks/use-project-manager.js';

/**
 * What only the app supplies to the project manager.
 *
 * @public
 */
export type ProjectManagerServices = Readonly<{
  /** Name a new project from its prompt (the app's project-name client). */
  generateProjectName: ProjectNaming['generate'];
  /** Copy the Settings permission default to a new chat. */
  seedChatPermission: (projectId: string, chatId: string) => Promise<void>;
  /** Drop a deleted chat's permission mode. */
  removeChatPermission: (projectId: string, chatId: string) => Promise<void>;
  /**
   * Decide, before a project is created, whether it is a newcomer's first; resolves to the call that asks for the
   * product tour once the project exists.
   */
  prepareFirstProjectTour: (readProjectCount: () => Promise<number>) => Promise<(() => void) | undefined>;
}>;

/**
 * Supplies the project manager over one project library.
 *
 * @param props - `library`: the project library; `services`: what only the app supplies.
 */
export function ProjectManagerProvider<
  ObjectStore extends ProjectManagerWorker,
  Facade extends ProjectLibraryRootFacade,
  Projection,
>({
  children,
  library,
  services,
}: {
  readonly children?: ReactNode;
  readonly library: ProjectLibrary<ObjectStore, Facade, Projection>;
  readonly services: ProjectManagerServices;
}): React.JSX.Element {
  const { generateProjectName, seedChatPermission, removeChatPermission, prepareFirstProjectTour } = services;
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
    leaseQuiescentProject,
    closeProjectSession,
  } = commands;
  const {
    connectWorkspace,
    retryWorkspaceConnection,
    refreshWorkspaceCatalog,
    repairWorkspaceBindings,
    chooseProjectDirectory,
    assertWorkspaceMutationAllowed,
    readFolderEvidence,
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
    [chatStoreOf, invalidateListing, library, seedChatPermission, touchProject],
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
    [chatStoreOf, invalidateListing, removeChatPermission, touchProject],
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
    [chatStoreOf, invalidateListing, removeChatPermission, touchProject],
  );

  /* A newcomer's first project asks for the product tour: decided before the project exists, stored once it does. */
  const createProjectAskingForTour = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> => {
      const askForTour = await prepareFirstProjectTour(async () => {
        const listing = await getProjectListing({ includeDeleted: true });
        return listing.projects.length;
      });
      const created = await createProject(options);
      askForTour?.();
      return created;
    },
    [createProject, getProjectListing, prepareFirstProjectTour],
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
      leaseQuiescentProject,
      closeProjectSession,
      libraryRevision,
      adoptProject,
      chooseProjectDirectory,
      recoveries,
      discardRecovery,
      assertWorkspaceMutationAllowed,
      readFolderEvidence,
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
    leaseQuiescentProject,
    closeProjectSession,
    libraryRevision,
    adoptProject,
    chooseProjectDirectory,
    recoveries,
    discardRecovery,
    assertWorkspaceMutationAllowed,
    readFolderEvidence,
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

  return <projectManagerContext.Provider value={value}>{children}</projectManagerContext.Provider>;
}
