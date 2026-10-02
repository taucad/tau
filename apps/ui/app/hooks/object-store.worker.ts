import { expose } from 'comlink';
import type { PartialDeep } from 'type-fest';
import type { Project } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { Chat } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import type { EditorState, EditorStateInput, OpenFile, PanelState } from '#types/editor.types.js';
import { defaultPanelState } from '#constants/editor.constants.js';

/**
 * Type for initial editor state overrides during project creation.
 * Uses PartialDeep to allow partial nested objects (e.g., openPanels: { chat: true }).
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

// Define the worker's API
const objectStoreWorker = {
  // ============================================================================
  // Project Methods
  // ============================================================================

  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    return storage.createProject(project);
  },

  /**
   * Atomic method to create a project with its associated chat and Editor state in one call.
   * This reduces roundtrips between main thread and worker.
   * Implements rollback on partial failure to maintain atomicity.
   *
   * @param options - Options for project creation
   * @param options.project - The project data to create
   * @param options.chat - The chat data to create
   * @param options.editorState - Optional initial editor state overrides (e.g., panelState for initial panel layout)
   */
  // oxlint-disable-next-line complexity -- TODO: Refactor this function to make it more readable.
  async createProjectWithResources(options: {
    project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'>;
    editorState?: InitialEditorState;
  }): Promise<{ project: Project; chat: Chat }> {
    const project = await storage.createProject(options.project);

    let chat: Chat;
    try {
      chat = await storage.createChat(project.id, options.chat);
    } catch (chatError) {
      // Rollback: delete the project since chat creation failed
      try {
        await storage.deleteProject(project.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup project after chat creation failure:', cleanupError);
      }

      throw chatError;
    }

    try {
      // Derive main file from project assets for auto-populating editor state
      const mainFile = options.project.assets.mechanical?.main;

      // Auto-populate openFiles + activePaneId from main file if not provided.
      // New panes always mint a stable paneId so persistence carries the
      // identity forward and downstream consumers can key off it.
      const seedPaneId = mainFile ? generatePrefixedId(idPrefix.pane) : undefined;
      const openFiles: OpenFile[] =
        options.editorState?.openFiles && options.editorState.openFiles.length > 0
          ? options.editorState.openFiles
          : mainFile && seedPaneId
            ? [
                {
                  paneId: seedPaneId,
                  path: mainFile,
                  name: mainFile.split('/').pop() ?? mainFile,
                  lastAccessedAt: Date.now(),
                },
              ]
            : [];
      const activePaneId = options.editorState?.activePaneId ?? seedPaneId;

      // Merge provided panelState with defaults
      const mergedPanelState: PanelState = {
        openPanels: {
          ...defaultPanelState.openPanels,
          ...options.editorState?.panelState?.openPanels,
        },
        panelSizes: {
          ...defaultPanelState.panelSizes,
          ...options.editorState?.panelState?.panelSizes,
        },
        mobileActiveTab: options.editorState?.panelState?.mobileActiveTab ?? defaultPanelState.mobileActiveTab,
        kernelPaneview: {
          ...defaultPanelState.kernelPaneview,
          ...options.editorState?.panelState?.kernelPaneview,
        },
        parametersPaneview: {
          ...defaultPanelState.parametersPaneview,
          ...options.editorState?.panelState?.parametersPaneview,
        },
      };

      await storage.updateEditorState({
        projectId: project.id,
        openFiles,
        activePaneId,
        focusedChatId: chat.id,
        panelState: mergedPanelState,
        editorLayout: undefined,
        viewerLayout: undefined,
        viewSettings: {},
      });
    } catch (editorStateError) {
      // Rollback: delete chat and project since editor state update failed
      try {
        await storage.deleteChat(chat.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup chat after editor state update failure:', cleanupError);
      }

      try {
        await storage.deleteProject(project.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup project after editor state update failure:', cleanupError);
      }

      throw editorStateError;
    }

    return { project, chat };
  },

  async duplicateProject(projectId: string): Promise<Project> {
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Create the duplicated project
    const newProject = await storage.createProject({
      ...project,
      name: `${project.name} (Copy)`,
    });

    // Duplicate all chats for this project
    const chatIdMapping = await storage.duplicateResourceChats(projectId, newProject.id);

    // Always carry forward a valid `focusedChatId` to the duplicate. The
    // editor route's `<ActiveChatProvider chatId>` is type-required (Layer
    // 0), so persisting `undefined` here would force the load-time
    // ensureFocusedChat actor to heal it on first open — correct but
    // wasteful, and historically a producer of the project-chat crash-loop.
    // Mirror the most-recent-update policy used by `pickNextFocusedChatId`
    // so the duplicated project opens on the freshest cloned chat.
    const clonedChats = await storage.getChatsForResource(newProject.id);
    const sourceEditorState = await storage.getEditorState(projectId);
    const mappedFocusedChatId = pickDuplicatedFocusedChatId({
      sourceFocusedChatId: sourceEditorState?.focusedChatId,
      chatIdMapping,
      clonedChats,
    });
    if (mappedFocusedChatId) {
      await storage.updateEditorState({
        projectId: newProject.id,
        openFiles: sourceEditorState?.openFiles ?? [],
        activePaneId: sourceEditorState?.activePaneId,
        focusedChatId: mappedFocusedChatId,
        panelState: sourceEditorState?.panelState ?? defaultPanelState,
        editorLayout: sourceEditorState?.editorLayout,
        viewerLayout: sourceEditorState?.viewerLayout,
        viewSettings: sourceEditorState?.viewSettings ?? {},
      });
    }

    return newProject;
  },

  async updateProject(
    projectId: string,
    update: PartialDeep<Project>,
    options?: {
      noUpdatedAt?: boolean;
    },
  ): Promise<Project | undefined> {
    return storage.updateProject(projectId, update, options);
  },

  async touchProject(projectId: string): Promise<Project | undefined> {
    return storage.touchProject(projectId);
  },

  async getProjects(options?: { includeDeleted?: boolean }): Promise<Project[]> {
    return storage.getProjects(options);
  },

  async getProject(projectId: string): Promise<Project | undefined> {
    return storage.getProject(projectId);
  },

  async deleteProject(projectId: string): Promise<void> {
    // Delete all chats associated with the project
    const chats = await storage.getChatsForResource(projectId, { includeDeleted: true });
    await Promise.all(chats.map(async (chat) => storage.deleteChat(chat.id)));

    // Delete the Editor state for the project
    await storage.deleteEditorState(projectId);

    // Delete the project itself
    return storage.deleteProject(projectId);
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

  async updateChat(
    chatId: string,
    update: PartialDeep<Chat>,
    options?: { noUpdatedAt?: boolean },
  ): Promise<Chat | undefined> {
    return storage.updateChat(chatId, update, options);
  },

  async patchChat<K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined> {
    return storage.patchChat(chatId, key, value);
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
