import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { createContext, useContext, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { Project, ProjectManifest } from '@taucad/types';
import type { ProjectDiscoveryResult, ProjectLocator } from '@taucad/filesystem';
import type { Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { projectManagerMachine } from '#hooks/project-manager.machine.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import {
  getWorkspaceMetadata,
  requestHandlePermission,
  setProjectFileSystemConfig,
  repairWorkspaceBindings as repairStoredWorkspaceBindings,
} from '#filesystem/handle-store.js';
import type { Workspace, WorkspaceBindingRepairResult } from '#filesystem/handle-store.js';
import { directoryPicker } from '#constants/browser.constants.js';
import type { DirectoryPick } from '#constants/browser.constants.js';
import { removeChatPermission, seedChatPermission } from '#hooks/use-permission-mode.js';
import type { AppUiPreferences, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project-library.types.js';
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
  deriveWorkspaceBindingRepairs,
  rememberChatPlacement,
  routeConfigFor,
} from '#runtime/project-library-storage.js';
import type { ProjectListing } from '#runtime/project-library-storage.js';
import type { ProjectLibrary, ProjectRouteAccess, WorkspaceConnectionTrace } from '#runtime/project-library.js';
import type { CreatedProject, CreateProjectOptions, ImportStagingTarget } from '#runtime/project-library-commands.js';
import { selectRuntimeProjectLibrary } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { useWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { prepareFirstProjectTour } from '#components/tour/first-project-tour.js';
import type { WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';

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
    refreshObservations: refreshFilesystemObservations,
    routeAccess: getProjectRouteAccess,
    touchProject,
    whenDiscoveryReady,
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

  const { commands } = library;
  const { generate: generateProjectName } = useProjectNameClient();
  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<CreatedProject> =>
      commands.createProject(options, { generate: generateProjectName }),
    [commands, generateProjectName],
  );
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
