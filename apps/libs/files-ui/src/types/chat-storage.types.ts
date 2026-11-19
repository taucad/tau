/**
 * The chat store's contract, which the project library and the app's chat file store share. `apps/ui`'s
 * `createChatFileStore` implements it.
 *
 * @module
 */
import type { Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { PartialDeep } from 'type-fest';

/** What an empty-cancel restore writes. @public */
export type CommitCancelledDraftRestoreInput = {
  messages: Chat['messages'];
  clearStartupRequestId?: string;
};

/**
 * The chat store's contract, over files.
 *
 * A chat is `.tau/chats/<chatId>/chat.json` inside its project, so this is a
 * *separate* contract from the app's `StorageProvider`: the browser object store
 * knows nothing about chats any more (D25, A30, W17). The implementation is
 * `createChatFileStore` in `apps/ui`.
 *
 * The atomicity rules the object store honoured are unchanged and still apply,
 * with a per-chat lock over a read-modify-write of one file in place of a
 * transaction:
 *  - `updateChat` merges and writes under one lock.
 *  - The field-scoped helpers (`patchChat`, `touchChatRecency`,
 *    `softDeleteChat`) mutate only the named slot.
 *
 * The composer — draft, message edits, unread — is not a chat field; it lives
 * in this device's composer records (`@taucad/chat-ui/db/composer-record-store`).
 *  - Concurrent callers for the same id must not lose writes.
 *
 * @public
 */
export type ChatStorage = {
  createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'> & {
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
   * read-modify-write race that lets one field's write undo another's.
   */
  patchChat<K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined>;
  /**
   * The device-relative Tau placement (`origin`, a `loopback:` daemon) a record written before placement moved to the
   * device still carries (XD2), when `accept` holds for it: the caller adopts it into this device's placements. The
   * record is never written by this: no device can prove the host is its own. Answered from the record's last read
   * where there is one. A write that sets the chat's `activeExecution` drops the host (it is superseded); every other
   * write keeps it.
   */
  adoptLegacyChatPlacement?(
    chatId: string,
    projectId: string | undefined,
    accept: (hostId: TauAgentHostId) => Promise<boolean>,
  ): Promise<TauAgentHostId | undefined>;
  /** Advance user-action recency monotonically. */
  touchChatRecency(chatId: string, requestedAt: number): Promise<Chat | undefined>;
  /**
   * Atomic one-shot startup request consumption. Clears the startup request
   * only when the persisted id still matches `requestId`; returns undefined
   * when the request is missing, already consumed, or stale.
   */
  consumeChatStartupRequest(chatId: string, requestId: string): Promise<Chat | undefined>;
  /**
   * Atomic empty-cancel restore. Replaces the transcript, optionally clearing
   * the matching one-shot startup request in the same transaction. The
   * restored draft goes to the chat's composer record, not here.
   */
  commitCancelledDraftRestore(chatId: string, input: CommitCancelledDraftRestoreInput): Promise<Chat | undefined>;
  /**
   * Atomic soft-delete: sets `deletedAt` and bumps `updatedAt` in one txn.
   */
  softDeleteChat(chatId: string): Promise<Chat | undefined>;
  /** Use the owning project when known so a new chat does not depend on the global project inventory. */
  getChat(chatId: string, projectId?: string): Promise<Chat | undefined>;
  /** Navigation metadata without deriving a transcript for every chat. */
  getAllChatRecords(options?: { includeDeleted?: boolean }): Promise<ChatRecord[]>;
  getChatRecordsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<ChatRecord[]>;
  getAllChats(options?: { includeDeleted?: boolean }): Promise<Chat[]>;
  getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]>;
  /**
   * This device's own log of a chat (`events.jsonl`) as it is now, empty when it has none. A headless reader's bytes
   * (W30): nothing is opened, locked or kept, so a caller that must trust them holds the chat's lease while it reads.
   */
  readChatLog(chatId: string, projectId: string): Promise<Uint8Array<ArrayBuffer>>;
  deleteChat(chatId: string): Promise<void>;
  /** Irreversibly remove an archived chat from discovery, retaining its sync tombstone. */
  purgeChat(chatId: string): Promise<void>;
  /** Write one chat record as given, for replaying a project creation. */
  putChatRecord(chat: Chat): Promise<void>;
};
