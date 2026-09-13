import type { Chat } from '@taucad/chat';
import type { PartialDeep } from 'type-fest';
import type { EditorState, EditorStateInput } from '#types/editor.types.js';
import type { ProjectLibraryState } from '#types/project.types.js';

export type CommitCancelledDraftRestoreInput = {
  messages: Chat['messages'];
  draft: NonNullable<Chat['draft']>;
  clearStartupRequestId?: string;
};

/** Browser/profile-local application chrome state. */
export type AppUiPreferences = {
  readonly id: 'singleton';
  readonly projectDisclosure: Record<string, boolean>;
};

/**
 * Persistent storage contract for project-local library state and editor state.
 *
 * Chats are *not* here: a chat is files in its project ({@link ChatStorage}).
 *
 * Implementors MUST honour the atomic read-modify-write rules captured in
 * `docs/policy/storage-policy.md`: a mutation performs `get → merge → put`
 * inside a single transaction (or equivalent isolation primitive), and
 * concurrent callers for the same id must not lose writes.
 */
export type StorageProvider = {
  // ---------------------------------------------------------------------------
  // Application UI preference operations
  // ---------------------------------------------------------------------------
  getAppUiPreferences(): Promise<AppUiPreferences>;
  setProjectDisclosure(projectId: string, expanded: boolean | undefined): Promise<AppUiPreferences | undefined>;

  // ---------------------------------------------------------------------------
  // Project-library operations
  // ---------------------------------------------------------------------------
  createProjectLibraryState(state: ProjectLibraryState): Promise<ProjectLibraryState>;
  createProjectLibraryStates(states: readonly ProjectLibraryState[]): Promise<ProjectLibraryState[]>;
  getProjectLibraryState(projectId: string): Promise<ProjectLibraryState | undefined>;
  getProjectLibraryStates(projectIds?: readonly string[]): Promise<ProjectLibraryState[]>;
  touchProjectActivity(projectId: string, activityAt?: number): Promise<ProjectLibraryState | undefined>;
  trashProject(projectId: string, deletedAt?: number): Promise<ProjectLibraryState | undefined>;
  restoreProject(projectId: string): Promise<ProjectLibraryState | undefined>;
  deleteProjectLibraryState(projectId: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // Editor state operations
  // ---------------------------------------------------------------------------
  getEditorState(projectId: string): Promise<EditorState | undefined>;
  updateEditorState(editorState: EditorStateInput): Promise<EditorState>;
  deleteEditorState(projectId: string): Promise<void>;
};

/**
 * The chat store's contract, over files.
 *
 * A chat is `.tau/chats/<chatId>/chat.json` inside its project, so this is a
 * *separate* contract from {@link StorageProvider}: the browser object store
 * knows nothing about chats any more (D25, A30, W17). The implementation is
 * `createChatFileStore` in `#db/chat-file-storage.js`.
 *
 * The atomicity rules the object store honoured are unchanged and still apply,
 * with a per-chat lock over a read-modify-write of one file in place of a
 * transaction:
 *  - `updateChat` merges and writes under one lock.
 *  - The field-scoped helpers (`patchChat`, `touchChatRecency`,
 *    `setChatUnreadState`, `setMessageEdit`, `clearMessageEdit`,
 *    `softDeleteChat`) mutate only the named slot.
 *  - Concurrent callers for the same id must not lose writes.
 */
export type ChatStorage = {
  createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt' | 'hasUnreadTurn'> & {
      id?: string;
    },
  ): Promise<Chat>;
  createNavigationRepairChat(resourceId: string): Promise<Chat>;
  /**
   * Legacy partial-merge update. Prefer the field-scoped helpers below for new
   * code; this is retained for the full-row replacement path.
   */
  updateChat(chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined>;
  applyGeneratedChatName(chatId: string, name: string): Promise<Chat | undefined>;
  /**
   * Atomic, field-scoped writer for a single top-level chat field. Preferred
   * over `updateChat` for all single-field writes — eliminates the
   * read-modify-write race that resurrects sent drafts.
   */
  patchChat<K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined>;
  /** Advance user-action recency monotonically. */
  touchChatRecency(chatId: string, requestedAt: number): Promise<Chat | undefined>;
  /** Set boolean unread state without changing row or product recency. */
  setChatUnreadState(chatId: string, hasUnreadTurn: boolean): Promise<Chat | undefined>;
  /**
   * Atomic one-shot startup request consumption. Clears the startup request
   * only when the persisted id still matches `requestId`; returns undefined
   * when the request is missing, already consumed, or stale.
   */
  consumeChatStartupRequest(chatId: string, requestId: string): Promise<Chat | undefined>;
  /**
   * Atomic empty-cancel restore. Replaces the transcript and composer draft
   * together, optionally clearing the matching one-shot startup request in
   * the same transaction.
   */
  commitCancelledDraftRestore(chatId: string, input: CommitCancelledDraftRestoreInput): Promise<Chat | undefined>;
  /**
   * Atomic insert/replace for a single message-edit draft entry.
   */
  setMessageEdit(
    chatId: string,
    messageId: string,
    draft: NonNullable<Chat['messageEdits']>[string],
  ): Promise<Chat | undefined>;
  /**
   * Atomic remove for a single message-edit draft entry. No-op (no
   * `updatedAt` bump) if the entry does not exist.
   */
  clearMessageEdit(chatId: string, messageId: string): Promise<Chat | undefined>;
  /**
   * Atomic soft-delete: sets `deletedAt` and bumps `updatedAt` in one txn.
   */
  softDeleteChat(chatId: string): Promise<Chat | undefined>;
  getChat(chatId: string): Promise<Chat | undefined>;
  getAllChats(options?: { includeDeleted?: boolean }): Promise<Chat[]>;
  getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]>;
  deleteChat(chatId: string): Promise<void>;
  duplicateChat(chatId: string): Promise<Chat>;
  duplicateResourceChats(sourceResourceId: string, targetResourceId: string): Promise<Record<string, string>>;
  /** Write one chat record as given, for replaying a project creation. */
  putChatRecord(chat: Chat): Promise<void>;
};
