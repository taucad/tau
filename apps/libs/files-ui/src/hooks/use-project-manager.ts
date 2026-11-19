/**
 * The project manager's context: the project library's commands, reads and chat calls as one value, which
 * `ProjectManagerProvider` (`#hooks/project-manager-provider`) supplies.
 *
 * The context lives in this module, apart from its provider, so an edit to the provider is a React Refresh boundary
 * that keeps this context: a second `createContext` would put the provider and its consumers on different contexts.
 *
 * @module
 */
import { createContext, useContext } from 'react';
import type { PartialDeep } from 'type-fest';
import type { ActorRefFrom } from 'xstate';
import type { Project, ProjectManifest } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import type { Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { ProjectCreationLocation } from '@taucad/ui-core/types/project-creation-location.types';
import type { projectManagerMachine } from '#machines/project-manager.machine.js';
import type { WorkspaceConnectionState } from '#machines/workspace-connection.machine.js';
import type { FolderEvidence, RelinkTarget, WorkspaceBindingRepairResult } from '#filesystem/handle-store.js';
import type { CommitCancelledDraftRestoreInput } from '#types/chat-storage.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryEntry, ProjectLibraryState } from '#types/project-library.types.js';
import type { AppUiPreferences } from '#types/project-library-io.types.js';
import type { ProjectLibrary, ProjectRouteAccess } from '#runtime/project-library.js';
import type { ProjectListing } from '#runtime/project-library-storage.js';
import type { CreatedProject, CreateProjectOptions, ImportStagingTarget } from '#runtime/project-library-commands.js';
import type { ConnectedWorkspace } from '#runtime/project-library-workspace.js';

/**
 * What `useProjectManager` returns.
 *
 * @public
 */
export type ProjectManagerContextType = {
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
  /**
   * Hold a closed project quiescent for an irreversible step (W30): its chat logs leased and read headlessly. Refuses
   * a run that has not ended, or a chat another tab leads; the caller releases it.
   */
  leaseQuiescentProject: (projectId: string) => Promise<Readonly<{ lost: () => boolean; release: () => void }>>;
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
  /** Read what a folder picked for Locate holds; reads only (blueprint D2). */
  readFolderEvidence: (target: RelinkTarget) => Promise<FolderEvidence>;
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

/** The project manager's one context; `undefined` outside a provider. @internal */
export const projectManagerContext = createContext<ProjectManagerContextType | undefined>(undefined);

/**
 * The project manager.
 *
 * @returns The value the nearest `ProjectManagerProvider` supplies.
 * @throws When no provider is mounted.
 */
export function useProjectManager(): ProjectManagerContextType {
  const context = useContext(projectManagerContext);

  if (context === undefined) {
    throw new Error('useProjectManager must be used within a ProjectManagerProvider');
  }

  return context;
}
