/**
 * What the project library's storage calls and observations read and write through, as structural contracts the app
 * satisfies: the root file manager's facade, the object-store worker and the chat record store. `apps/ui` passes its
 * concrete facade, its `Remote<ObjectStoreWorker>` and its chat store in; nothing here names an app module.
 *
 * @module
 */
import type { Chat } from '@taucad/chat';
import type { WatchEvent } from '@taucad/filesystem';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import type { ProjectLibraryState } from '#types/project-library.types.js';

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
