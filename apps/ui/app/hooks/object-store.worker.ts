import { expose } from 'comlink';
import type { PartialDeep } from 'type-fest';
import type { ProjectManifest } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { Chat } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import type { AppUiPreferences, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import type { EditorState, EditorStateInput, OpenFile } from '#types/editor.types.js';
import type { PersistedRevisionState, ProjectLibraryState } from '#types/project.types.js';
import type {
  PendingCreateProjectOperation,
  PendingDuplicateProjectOperation,
  PendingProjectOperation,
  PendingProjectStorage,
} from '#types/pending-project-operation.types.js';
import { defaultPanelState } from '#constants/editor.constants.js';
import { mergePanelState } from '#utils/panel-state.utils.js';

/**
 * Type for initial editor state overrides during project creation.
 * Uses PartialDeep to allow partial nested layout objects.
 * Excludes projectId and focusedChatId as those are set automatically.
 */
export type InitialEditorState = PartialDeep<Omit<EditorStateInput, 'projectId' | 'focusedChatId'>>;

// Create a singleton instance of the storage provider
const storage = new IndexedDbStorageProvider();

/**
 * Pick the focused chat id to persist on a duplicated project. Prefers the
 * source project's mapped chat (so reopening the duplicate matches the
 * source's last focus), falling back to the most-recently-updated cloned
 * chat. Returns `undefined` only when no chats were cloned (in which case
 * the caller skips the editor-state write entirely — the editor machine's
 * load-time `ensureFocusedChat` actor will auto-create a chat on first
 * open).
 *
 * Exported for direct unit-test coverage so the policy can be exercised
 * without a live IndexedDB harness.
 *
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal, scoped to object-store worker
export function pickDuplicatedFocusedChatId(args: {
  readonly sourceFocusedChatId: string | undefined;
  readonly chatIdMapping: Readonly<Record<string, string>>;
  readonly clonedChats: readonly Chat[];
}): string | undefined {
  const { sourceFocusedChatId, chatIdMapping, clonedChats } = args;
  if (clonedChats.length === 0) {
    return undefined;
  }

  const mappedFromSource = sourceFocusedChatId ? chatIdMapping[sourceFocusedChatId] : undefined;
  if (mappedFromSource) {
    return mappedFromSource;
  }

  let mostRecent = clonedChats[0]!;
  for (let i = 1; i < clonedChats.length; i++) {
    const candidate = clonedChats[i]!;
    if (candidate.updatedAt > mostRecent.updatedAt) {
      mostRecent = candidate;
    }
  }
  return mostRecent.id;
}

const createInitialEditorState = (args: {
  readonly project: ProjectManifest;
  readonly chatId: string;
  readonly overrides?: InitialEditorState;
  readonly timestamp: number;
}): EditorState => {
  const mainFile = args.project.assets.main.entryPath;
  const seedPaneId = mainFile ? generatePrefixedId(idPrefix.pane) : undefined;
  const openFiles: OpenFile[] =
    args.overrides?.openFiles && args.overrides.openFiles.length > 0
      ? args.overrides.openFiles
      : mainFile && seedPaneId
        ? [
            {
              paneId: seedPaneId,
              path: mainFile,
              name: mainFile.split('/').pop() ?? mainFile,
              lastAccessedAt: args.timestamp,
            },
          ]
        : [];

  const panelState = mergePanelState(defaultPanelState, args.overrides?.panelState);

  return {
    projectId: args.project.id,
    openFiles,
    activePaneId: args.overrides?.activePaneId ?? seedPaneId,
    focusedChatId: args.chatId,
    panelState,
    workbenchLayout: args.overrides?.workbenchLayout as EditorState['workbenchLayout'],
    viewerLayout: args.overrides?.viewerLayout as EditorState['viewerLayout'],
    viewSettings: (args.overrides?.viewSettings ?? {}) as EditorState['viewSettings'],
    modelComponentDisplay: args.overrides?.modelComponentDisplay as EditorState['modelComponentDisplay'],
    updatedAt: args.timestamp,
  };
};

// Define the worker's API
const objectStoreWorker = {
  // ============================================================================
  // Application UI Preference Methods
  // ============================================================================

  async getAppUiPreferences(): Promise<AppUiPreferences> {
    return storage.getAppUiPreferences();
  },

  async setProjectDisclosure(projectId: string, expanded: boolean | undefined): Promise<AppUiPreferences | undefined> {
    return storage.setProjectDisclosure(projectId, expanded);
  },

  // ============================================================================
  // Project Methods
  // ============================================================================

  /** Prepare stable replay data before any cross-store project creation writes. */
  async prepareProjectCreation(options: {
    manifest: ProjectManifest;
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'>;
    editorState?: InitialEditorState;
    files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
    storage: PendingProjectStorage;
  }): Promise<PendingCreateProjectOperation> {
    const timestamp = Date.now();
    const project = options.manifest;
    const chat: Chat = {
      ...options.chat,
      id: generatePrefixedId(idPrefix.chat),
      resourceId: project.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const operationId = generatePrefixedId(idPrefix.request);
    const operation: PendingCreateProjectOperation = {
      operationId,
      kind: 'create',
      ...options.storage,
      manifest: project,
      library: { projectId: project.id, lastActivityAt: timestamp },
      files: options.files,
      chat,
      editorState: createInitialEditorState({
        project,
        chatId: chat.id,
        overrides: options.editorState,
        timestamp,
      }),
    };
    await storage.putPendingProjectOperation(operation);
    return operation;
  },

  /** Prepare stable replay data before any cross-store duplicate writes. */
  async prepareProjectDuplicate(options: {
    sourceManifest: ProjectManifest;
    targetManifest: ProjectManifest;
    files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
    storage: PendingProjectStorage;
  }): Promise<PendingDuplicateProjectOperation> {
    const timestamp = Date.now();
    const newProject = options.targetManifest;
    const sourceChats = await storage.getChatsForResource(options.sourceManifest.id);
    const chatIdMapping: Record<string, string> = {};
    const clonedChats = sourceChats.map((chat): Chat => {
      const id = generatePrefixedId(idPrefix.chat);
      chatIdMapping[chat.id] = id;
      return {
        ...chat,
        id,
        resourceId: newProject.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: undefined,
      };
    });
    const sourceEditorState = await storage.getEditorState(options.sourceManifest.id);
    const mappedFocusedChatId = pickDuplicatedFocusedChatId({
      sourceFocusedChatId: sourceEditorState?.focusedChatId,
      chatIdMapping,
      clonedChats,
    });
    const editorState = mappedFocusedChatId
      ? {
          projectId: newProject.id,
          openFiles: sourceEditorState?.openFiles ?? [],
          activePaneId: sourceEditorState?.activePaneId,
          focusedChatId: mappedFocusedChatId,
          panelState: mergePanelState(defaultPanelState, sourceEditorState?.panelState),
          workbenchLayout: sourceEditorState?.workbenchLayout,
          viewerLayout: sourceEditorState?.viewerLayout,
          viewSettings: sourceEditorState?.viewSettings ?? {},
          modelComponentDisplay: sourceEditorState?.modelComponentDisplay,
          updatedAt: timestamp,
        }
      : undefined;
    const operationId = generatePrefixedId(idPrefix.request);
    const operation: PendingDuplicateProjectOperation = {
      operationId,
      kind: 'duplicate',
      ...options.storage,
      sourceProjectId: options.sourceManifest.id,
      manifest: newProject,
      library: { projectId: newProject.id, lastActivityAt: timestamp },
      files: options.files,
      chats: clonedChats,
      editorState,
    };
    await storage.putPendingProjectOperation(operation);
    return operation;
  },

  async getPendingProjectOperations(): Promise<PendingProjectOperation[]> {
    return storage.getPendingProjectOperations();
  },

  async hasPendingProjectOperationForWorkspace(workspaceId: string): Promise<boolean> {
    const operations = await storage.getPendingProjectOperations();
    return operations.some((operation) => {
      const pendingStorage = operation.kind === 'permanent-delete' ? operation.storage : operation;
      return pendingStorage.backend === 'webaccess' && pendingStorage.workspaceId === workspaceId;
    });
  },

  async resumePendingProjectOperationResources(operationId: string): Promise<void> {
    const operation = await storage.getPendingProjectOperation(operationId);
    if (!operation || operation.kind === 'permanent-delete') {
      return;
    }
    const chats = operation.kind === 'create' ? [operation.chat] : operation.chats;
    await storage.createProjectLibraryState(operation.library);
    await Promise.all(chats.map(async (chat) => storage.putChatRecord(chat)));
    if (operation.editorState) {
      await storage.putEditorStateRecord(operation.editorState);
    }
  },

  async completePendingProjectOperation(operationId: string): Promise<void> {
    await storage.deletePendingProjectOperation(operationId);
  },

  async beginPermanentDeleteProject(projectId: string, storageConfig: PendingProjectStorage): Promise<string> {
    const operationId = generatePrefixedId(idPrefix.request);
    await storage.beginPermanentDeleteProject({
      operationId,
      kind: 'permanent-delete',
      projectId,
      storage: storageConfig,
    });
    return operationId;
  },

  async deleteProjectResources(projectId: string): Promise<void> {
    const chats = await storage.getChatsForResource(projectId, { includeDeleted: true });
    await Promise.all(chats.map(async (chat) => storage.deleteChatRecord(chat.id)));
    await storage.deleteEditorState(projectId);
    await storage.deleteProjectLibraryState(projectId);
  },

  async getProjectLibraryState(projectId: string): Promise<ProjectLibraryState | undefined> {
    return storage.getProjectLibraryState(projectId);
  },

  async getProjectLibraryStates(projectIds?: readonly string[]): Promise<ProjectLibraryState[]> {
    return storage.getProjectLibraryStates(projectIds);
  },

  async createProjectLibraryState(state: ProjectLibraryState): Promise<ProjectLibraryState> {
    return storage.createProjectLibraryState(state);
  },

  async touchProjectActivity(projectId: string, activityAt?: number): Promise<ProjectLibraryState | undefined> {
    return storage.touchProjectActivity(projectId, activityAt);
  },

  async trashProject(projectId: string, deletedAt?: number): Promise<ProjectLibraryState | undefined> {
    return storage.trashProject(projectId, deletedAt);
  },

  async restoreProject(projectId: string): Promise<ProjectLibraryState | undefined> {
    return storage.restoreProject(projectId);
  },

  async setProjectRevisionState(
    projectId: string,
    revisionState: PersistedRevisionState,
  ): Promise<ProjectLibraryState | undefined> {
    return storage.setProjectRevisionState(projectId, revisionState);
  },

  // ============================================================================
  // Chat Methods
  // ============================================================================

  async createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Chat> {
    return storage.createChat(resourceId, chat);
  },

  async createNavigationRepairChat(resourceId: string): Promise<Chat> {
    return storage.createNavigationRepairChat(resourceId);
  },

  async updateChat(chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> {
    return storage.updateChat(chatId, update);
  },

  async applyGeneratedChatName(chatId: string, name: string): Promise<Chat | undefined> {
    return storage.applyGeneratedChatName(chatId, name);
  },

  async patchChat<K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined> {
    return storage.patchChat(chatId, key, value);
  },

  async consumeChatStartupRequest(chatId: string, requestId: string): Promise<Chat | undefined> {
    return storage.consumeChatStartupRequest(chatId, requestId);
  },

  async commitCancelledDraftRestore(
    chatId: string,
    input: CommitCancelledDraftRestoreInput,
  ): Promise<Chat | undefined> {
    return storage.commitCancelledDraftRestore(chatId, input);
  },

  async setMessageEdit(
    chatId: string,
    messageId: string,
    draft: NonNullable<Chat['messageEdits']>[string],
  ): Promise<Chat | undefined> {
    return storage.setMessageEdit(chatId, messageId, draft);
  },

  async clearMessageEdit(chatId: string, messageId: string): Promise<Chat | undefined> {
    return storage.clearMessageEdit(chatId, messageId);
  },

  async softDeleteChat(chatId: string): Promise<Chat | undefined> {
    return storage.softDeleteChat(chatId);
  },

  async getChat(chatId: string): Promise<Chat | undefined> {
    return storage.getChat(chatId);
  },

  async getAllChats(options?: { includeDeleted?: boolean }): Promise<Chat[]> {
    return storage.getAllChats(options);
  },

  async getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> {
    return storage.getChatsForResource(resourceId, options);
  },

  async deleteChat(chatId: string): Promise<void> {
    return storage.deleteChat(chatId);
  },

  async duplicateChat(chatId: string): Promise<Chat> {
    return storage.duplicateChat(chatId);
  },

  async duplicateResourceChats(sourceResourceId: string, targetResourceId: string): Promise<Record<string, string>> {
    return storage.duplicateResourceChats(sourceResourceId, targetResourceId);
  },

  // ============================================================================
  // Editor State Methods
  // ============================================================================

  async getEditorState(projectId: string): Promise<EditorState | undefined> {
    return storage.getEditorState(projectId);
  },

  async updateEditorState(editorState: EditorStateInput): Promise<EditorState> {
    return storage.updateEditorState(editorState);
  },

  async deleteEditorState(projectId: string): Promise<void> {
    return storage.deleteEditorState(projectId);
  },
};

expose(objectStoreWorker);

export type ObjectStoreWorker = typeof objectStoreWorker;
