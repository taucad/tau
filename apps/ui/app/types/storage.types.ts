import type { PartialDeep } from 'type-fest';
import type { Project } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import type { EditorState, EditorStateInput } from '#types/editor.types.js';

export type CommitCancelledDraftRestoreInput = {
  messages: Chat['messages'];
  draft: NonNullable<Chat['draft']>;
  clearStartupRequestId?: string;
};

/**
 * Persistent storage contract for projects, chats, and editor state.
 *
 * Implementors MUST honour the atomic read-modify-write rules captured in
 * `docs/policy/storage-policy.md`:
 *  - `updateChat`/`updateProject` must perform `get → merge → put` inside a
 *    single transaction (or equivalent isolation primitive).
 *  - The field-scoped helpers (`patchChat`, `setMessageEdit`,
 *    `clearMessageEdit`, `softDeleteChat`) must mutate only the named slot,
 *    never round-trip the entire row through a partial merge.
 *  - Concurrent callers for the same id must not lose writes.
 */
export type StorageProvider = {
  // ---------------------------------------------------------------------------
  // Project operations
  // ---------------------------------------------------------------------------
  createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  updateProject(projectId: string, update: PartialDeep<Project>): Promise<Project | undefined>;
  /**
   * Bump `updatedAt` only — no field merges. No-op when the project is missing
   * or soft-deleted (`deletedAt` set).
   */
  touchProject(projectId: string): Promise<Project | undefined>;
  getProjects(options?: { includeDeleted?: boolean }): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | undefined>;
  deleteProject(projectId: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // Chat operations
  // ---------------------------------------------------------------------------
  createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
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
  getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]>;
  deleteChat(chatId: string): Promise<void>;
  duplicateChat(chatId: string): Promise<Chat>;
  duplicateResourceChats(sourceResourceId: string, targetResourceId: string): Promise<Record<string, string>>;

  // ---------------------------------------------------------------------------
  // Editor state operations
  // ---------------------------------------------------------------------------
  getEditorState(projectId: string): Promise<EditorState | undefined>;
  updateEditorState(editorState: EditorStateInput): Promise<EditorState>;
  deleteEditorState(projectId: string): Promise<void>;
};
