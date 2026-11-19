/**
 * What the project library's storage calls and observations read and write through, as structural contracts the app
 * satisfies: the root file manager's facade, the object-store worker and the chat record store. `apps/ui` passes its
 * concrete facade, its `Remote<ObjectStoreWorker>` and its chat store in; nothing here names an app module. The
 * `ProjectLibrary` service and its commands read the wider `ProjectLibraryRootFacade` and `ProjectLibraryWorker`.
 *
 * @module
 */
import type { PartialDeep } from 'type-fest';
import type { Chat } from '@taucad/chat';
import type { ProjectManifest } from '@taucad/types';
import type { WatchEvent } from '@taucad/filesystem';
import type { FileSystemClient, ScopedStorageClient } from '@taucad/fs-client/file-system-client';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import type { EditorState, EditorStateInput } from '@taucad/ui-core/types/editor.types';
import type { ProjectLibraryState } from '#types/project-library.types.js';
import type {
  PendingCreateProjectOperation,
  PendingDuplicateProjectOperation,
  PendingProjectOperation,
  PendingProjectStorage,
} from '#types/pending-project-operation.types.js';

/**
 * The root file manager's facade, as far as the library's storage calls and observations read it: project discovery
 * and the project-directory lifecycle, the record client the chat stores and the library tombstone use, the root
 * resync, and the change channel and record watch the observations follow. The app's facade carries more; any value
 * with these members serves.
 *
 * @public
 */
export type ProjectLibraryFileManager = Readonly<{
  client: Pick<
    FileSystemClient,
    'listProjectManifests' | 'commitPendingProjectDirectory' | 'permanentlyDeleteProjectDirectory'
  >;
  recordFiles: Pick<RootedContentClient, 'readFile' | 'writeFile' | 'readdir' | 'stat' | 'exists' | 'unlink' | 'rmdir'>;
  workspace: Readonly<{ syncProjectRoots: () => Promise<void> }>;
  workerChangeChannel: WorkerChangeChannel | undefined;
  watchRecordFile: (
    path: string,
    listener: (event: WatchEvent) => void,
    options?: { recursive?: boolean },
  ) => ObservationWatch;
}>;

/**
 * The object-store worker calls the library's storage makes: the library rows, the pending-operation journal and a
 * project's local resources. The app passes its `Remote<ObjectStoreWorker>`.
 *
 * @public
 */
export type ProjectLibraryObjectStore = Readonly<{
  getProjectLibraryState: (projectId: string) => Promise<ProjectLibraryState | undefined>;
  getProjectLibraryStates: (projectIds?: readonly string[]) => Promise<ProjectLibraryState[]>;
  createProjectLibraryState: (state: ProjectLibraryState) => Promise<ProjectLibraryState>;
  createProjectLibraryStates: (states: readonly ProjectLibraryState[]) => Promise<ProjectLibraryState[]>;
  deleteProjectResources: (projectId: string) => Promise<void>;
  /** Resolves to the updated preferences, or `undefined` when nothing changed. */
  setProjectDisclosure: (projectId: string, expanded: boolean | undefined) => Promise<unknown>;
  resumePendingProjectOperationResources: (operationId: string) => Promise<readonly Chat[]>;
  completePendingProjectOperation: (operationId: string) => Promise<void>;
}>;

/**
 * The chat record write a committed operation makes for each chat it carries. The app passes its chat store.
 *
 * @public
 */
export type ProjectLibraryChatRecords = Readonly<{ putChatRecord: (chat: Chat) => Promise<void> }>;

/**
 * The root file manager's facade as the `ProjectLibrary` service and its commands read it: the storage calls' facade,
 * plus route verification and adoption, the scoped storage a picked or orphaned folder is read through, and the reads a
 * duplicate copies. The app passes its `ProjectLibraryFacade`.
 *
 * @public
 */
export type ProjectLibraryRootFacade = ProjectLibraryFileManager &
  Readonly<{
    client: Pick<FileSystemClient, 'listProjectManifests' | 'verifyProjectRoute' | 'adoptProjectDirectory'>;
    scopedStorage: ScopedStorageClient;
    readDuplicateProjectFiles: (projectRoot: string) => Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  }>;

/**
 * Initial editor state overrides for a project's creation. `projectId` and `focusedChatId` are set by the creation.
 *
 * @public
 */
export type InitialEditorState = PartialDeep<Omit<EditorStateInput, 'projectId' | 'focusedChatId'>>;

/** What the object-store worker journals for a create. @public */
export type ProjectCreationRequest = {
  manifest: ProjectManifest;
  projectId: string;
  /** Omitted to create the project and no chat at all (review R5). */
  chat?: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'>;
  /** Where the chat's attachment references are copied from; see `PendingCreateProjectOperation`. */
  attachmentSource?: string;
  editorState?: InitialEditorState;
  deferInitialView?: boolean;
  files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
  /** A staged import's locator, journaled in place of its bytes (W7). */
  staging?: { readonly operationId: string };
  /** `false` when the staged import carries its own workbench layout. */
  seedWorkbench?: boolean;
  /** The authored `tau.json` bytes the commit writes when they declare `manifest` exactly (W7.3). */
  manifestBytes?: Uint8Array<ArrayBuffer>;
  storage: PendingProjectStorage;
};

/** What the object-store worker journals for a duplicate. @public */
export type ProjectDuplicateRequest = {
  sourceProjectId: string;
  targetProjectId: string;
  targetManifest: ProjectManifest;
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  storage: PendingProjectStorage;
  /** The source project's chats, read from its files by the caller (W17). */
  sourceChats: readonly Chat[];
};

/**
 * The device's application chrome preferences: which projects the navigation shows expanded.
 *
 * @public
 */
export type AppUiPreferences = {
  readonly id: 'singleton';
  readonly projectDisclosure: Record<string, boolean>;
};

/**
 * The object-store worker as the `ProjectLibrary` service and its commands call it: the storage calls' store, plus the
 * journal reads and preparations, the Trash, activity and the editor state. The app passes its
 * `Remote<ObjectStoreWorker>`.
 *
 * @public
 */
export type ProjectLibraryWorker = ProjectLibraryObjectStore &
  Readonly<{
    getPendingProjectOperations: () => Promise<PendingProjectOperation[]>;
    hasPendingProjectOperationForWorkspace: (workspaceId: string) => Promise<boolean>;
    prepareProjectCreation: (request: ProjectCreationRequest) => Promise<PendingCreateProjectOperation>;
    prepareProjectDuplicate: (request: ProjectDuplicateRequest) => Promise<PendingDuplicateProjectOperation>;
    beginPermanentDeleteProject: (projectId: string, storage: PendingProjectStorage) => Promise<string>;
    touchProjectActivity: (projectId: string, activityAt?: number) => Promise<ProjectLibraryState | undefined>;
    trashProject: (projectId: string) => Promise<ProjectLibraryState | undefined>;
    restoreProject: (projectId: string) => Promise<ProjectLibraryState | undefined>;
    getEditorState: (projectId: string) => Promise<EditorState | undefined>;
    updateEditorState: (editorState: EditorStateInput) => Promise<unknown>;
  }>;

/**
 * The object-store worker as the project manager's provider calls it: the library's worker, plus the GeoSpec consent
 * and the app chrome preferences, whose disclosure write resolves to the preferences. The app passes its
 * `Remote<ObjectStoreWorker>`.
 *
 * @public
 */
export type ProjectManagerWorker = Omit<ProjectLibraryWorker, 'setProjectDisclosure'> &
  Readonly<{
    setGeoSpecCandidateConsent: (projectId: string, enabled: boolean) => Promise<ProjectLibraryState | undefined>;
    getAppUiPreferences: () => Promise<AppUiPreferences>;
    setProjectDisclosure: (projectId: string, expanded: boolean | undefined) => Promise<AppUiPreferences | undefined>;
  }>;
