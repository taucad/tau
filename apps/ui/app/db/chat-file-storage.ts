import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import { safeValidateUiMessages } from '@taucad/chat';
import type { Chat } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import { parseChatRecord, serializeChatRecord } from '@taucad/chat/schemas';
import { chatLogFileName, chatRecordFileName, chatRecordsPath } from '@taucad/revisions';
import { errorCategory, idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { isRecord } from '@taucad/utils/schema';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import { KeyedMutex } from '#db/keyed-mutex.js';
import type { ChatStorage, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import { getChatRecencyAt } from '#utils/chat-recency.utils.js';

/**
 * The chat store, on the filesystem.
 *
 * A chat is files (D25, A30): `.tau/chats/<chatId>/chat.json` is the record and
 * `events.jsonl` beside it is the session log, both inside the project they
 * belong to, so a chat reaches a second device by the same fetch that brings the
 * project and no chat-specific sync plane exists. This module replaces the chat
 * half of `IndexedDbStorageProvider` outright — there is no dual reader and no
 * migration (A31/I15).
 *
 * Two things the object store gave for free have to be built here:
 *
 * - **Which project a chat is in.** IndexedDB had one table keyed by chat id;
 *   the filesystem has one directory per project. Every read of a project's
 *   chats fills a `chatId -> projectId` index, and a mutation on a chat this
 *   session has not seen resolves through one scan of the known projects.
 * - **Atomicity.** IndexedDB gave a `get -> put` transaction; here it is the
 *   same per-chat {@link KeyedMutex} the object store already used, over a
 *   read-modify-write of one file. That serialises this document's writers,
 *   which is what the store's contract asks for
 *   (`docs/policy/storage-policy.md`) — ponytail: a cross-tab writer is fenced
 *   by the file service's own coordinator, and if two tabs ever need a stricter
 *   order the upgrade is a Web Lock keyed on the chat id, as the revision port
 *   already does for refs.
 *
 * `messages` never reaches `chat.json` (P26). The session log's projection owns
 * the transcript; this store reads only metadata. Before the host acknowledges
 * the first Start, `startupRequest.message` is a durable command intent that
 * can be displayed as one pending message after a reload.
 *
 * The composer — draft, message edits, unread — is not the chat's at all: it is
 * this device's composer records (blueprint D3, W8), and this module only
 * removes a deleted chat's record.
 */

const defaultNavigationChatName = 'New chat';

const invalidStartupError: NonNullable<Chat['error']> = {
  category: errorCategory.generic,
  code: 'HISTORY_INVALID',
  title: 'Could not restore the starting message',
  message: 'The saved starting message is invalid. This chat cannot start until its history is repaired.',
};

const chatDirectory = (projectId: string, chatId: string): string =>
  `/projects/${projectId}/${chatRecordsPath(chatId)}`;

const recordPath = (projectId: string, chatId: string): string =>
  `${chatDirectory(projectId, chatId)}/${chatRecordFileName}`;

const chatsDirectory = (projectId: string): string => `/projects/${projectId}/.tau/chats`;

/** What a chat directory holding only a log reads as, until its record lands. */
const placeholderRecord = (projectId: string, chatId: string): Chat => ({
  id: chatId,
  resourceId: projectId,
  name: defaultNavigationChatName,
  messages: [],
  createdAt: 0,
  updatedAt: 0,
});

/**
 * The slice of the worker filesystem client the chat store needs. @internal
 *
 * A chat record is text; the composer record the delete paths remove is bytes
 * in the same path space, so `readFile` carries both of the worker client's
 * arms and this type satisfies `ComposerRecordClient` without a second client.
 */
export type ChatStoreClient = {
  readFile: {
    (path: string, options: 'utf8'): Promise<string>;
    (path: string): Promise<Uint8Array<ArrayBuffer>>;
  };
  writeFile: (path: string, data: string | Uint8Array<ArrayBuffer>) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  exists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
};

/** How the chat store finds the projects a chat could be in. @internal */
export type ChatFileStoreOptions = {
  readonly client: ChatStoreClient;
  /** Every project this profile knows about, deleted ones included. */
  readonly projectIds: () => Promise<readonly string[]>;
};

const isDeleted = (chat: Chat | ChatRecord): boolean => chat.deletedAt !== undefined;

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left === null || right === null) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
};

/**
 * Create the filesystem-backed chat store.
 *
 * @param options - The worker filesystem client and the project inventory.
 * @returns The chat half of the storage contract, over files.
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal, app-scoped.
export function createChatFileStore(options: ChatFileStoreOptions): ChatStorage {
  const mutex = new KeyedMutex<string>();
  /** `chatId -> projectId`, filled by every read and every create. */
  const located = new Map<string, string>();

  const readText = async (path: string): Promise<string | undefined> => {
    try {
      return await options.client.readFile(path, 'utf8');
    } catch {
      return undefined;
    }
  };

  const hydrate = async (record: ChatRecord): Promise<Chat> => {
    const request: unknown = record.startupRequest;
    if (request === undefined) {
      return { ...record, messages: [] };
    }
    const envelope = isRecord(request) ? request : undefined;
    const validEnvelope =
      envelope !== undefined &&
      typeof envelope['id'] === 'string' &&
      envelope['id'].startsWith(`${idPrefix.request}_`) &&
      envelope['id'].length > idPrefix.request.length + 1 &&
      envelope['kind'] === 'regenerate-tail' &&
      typeof envelope['messageId'] === 'string' &&
      envelope['messageId'].length > 0 &&
      (envelope['source'] === 'homepage-initial-message' ||
        envelope['source'] === 'fix-with-ai-new-chat' ||
        envelope['source'] === 'resolve-conflict-new-chat') &&
      Number.isSafeInteger(envelope['createdAt']) &&
      typeof envelope['createdAt'] === 'number' &&
      envelope['createdAt'] >= 0;
    const result = validEnvelope ? await safeValidateUiMessages([envelope['message']]) : undefined;
    const message = result?.success ? result.data[0] : undefined;
    if (message?.role === 'user' && message.id === envelope?.['messageId'] && message.metadata?.status === 'pending') {
      return { ...record, messages: [message] };
    }
    return {
      ...record,
      messages: [],
      error: invalidStartupError,
    };
  };

  const readRecord = async (projectId: string, chatId: string): Promise<ChatRecord | undefined> => {
    const text = await readText(recordPath(projectId, chatId));
    const record = text === undefined ? undefined : parseChatRecord(text);
    if (record === undefined) {
      return undefined;
    }
    located.set(record.id, projectId);
    return record;
  };

  const writeRecord = async (projectId: string, chat: Chat): Promise<void> => {
    await options.client.writeFile(recordPath(projectId, chat.id), serializeChatRecord(chat));
    located.set(chat.id, projectId);
  };

  /**
   * One chat directory, record or no record.
   *
   * Fetch projects segments and `chat.json` as separate writes. A log-only
   * directory stays discoverable, but its transcript belongs to the projection
   * subscriber, not this metadata store.
   */
  const readChatDirectory = async (projectId: string, chatId: string): Promise<Chat | undefined> => {
    const record = await readRecord(projectId, chatId);
    if (record !== undefined) {
      return hydrate(record);
    }
    const directory = chatDirectory(projectId, chatId);
    const ownLog = await options.client.exists(`${directory}/${chatLogFileName}`);
    let foreignLog = false;
    if (!ownLog) {
      try {
        const entries = await options.client.readdir(`${directory}/events`);
        foreignLog = entries.some((name) => name.endsWith('.jsonl'));
      } catch {
        // This chat has no projected foreign segment yet.
      }
    }
    if (!ownLog && !foreignLog) {
      return undefined;
    }
    located.set(chatId, projectId);
    return placeholderRecord(projectId, chatId);
  };

  /** Read navigation metadata without deriving a host-log transcript. */
  const readChatRecord = async (projectId: string, chatId: string): Promise<ChatRecord | undefined> => {
    const record = await readRecord(projectId, chatId);
    if (record !== undefined) {
      return record.recencyAt === undefined ? { ...record, recencyAt: getChatRecencyAt(record) } : record;
    }
    const chat = await readChatDirectory(projectId, chatId);
    if (chat === undefined) {
      return undefined;
    }
    const { messages: _messages, ...metadata } = chat;
    return { ...metadata, recencyAt: getChatRecencyAt(chat) };
  };

  const listProjectChats = async (projectId: string): Promise<Chat[]> => {
    let ids: string[];
    try {
      ids = await options.client.readdir(chatsDirectory(projectId));
    } catch {
      return [];
    }
    const chats = await Promise.all(ids.map(async (chatId) => readChatDirectory(projectId, chatId)));
    return chats.filter((chat) => chat !== undefined);
  };

  const listProjectChatRecords = async (projectId: string): Promise<ChatRecord[]> => {
    let ids: string[];
    try {
      ids = await options.client.readdir(chatsDirectory(projectId));
    } catch {
      return [];
    }
    const records = await Promise.all(ids.map(async (chatId) => readChatRecord(projectId, chatId)));
    return records.filter((record) => record !== undefined);
  };

  /**
   * Which project holds one chat.
   *
   * A hit is free; a miss costs one pass over the known projects, which is the
   * price of the chat table being gone and is paid once per chat per session.
   */
  const locate = async (chatId: string): Promise<string | undefined> => {
    const known = located.get(chatId);
    if (known !== undefined) {
      return known;
    }
    const projects = await options.projectIds();
    const found = await Promise.all(
      projects.map(async (projectId) =>
        (await readChatDirectory(projectId, chatId)) === undefined ? undefined : projectId,
      ),
    );
    return found.find((projectId) => projectId !== undefined);
  };

  /**
   * Read one chat, hand it to `mutate`, and write it back under the chat's lock.
   *
   * `mutate` returns the chat to persist, or `undefined` for "nothing changed",
   * which is what keeps a no-op clear from bumping `updatedAt` — the same
   * contract the object store's `writeChatAtomic` had.
   */
  const write = async (chatId: string, mutate: (chat: Chat) => Chat | undefined): Promise<Chat | undefined> =>
    mutex.run(chatId, async () => {
      const projectId = await locate(chatId);
      if (projectId === undefined) {
        return undefined;
      }
      const record = await readRecord(projectId, chatId);
      const existing = record === undefined ? await readChatDirectory(projectId, chatId) : { ...record, messages: [] };
      if (existing === undefined) {
        return undefined;
      }
      const updated = mutate(existing);
      if (updated === undefined) {
        /* A no-op is reported as `undefined`, exactly as the object store's
         * `writeChatAtomic` did: the caller's cache invalidation is keyed on a
         * returned chat, so a clear that changed nothing must not repaint. */
        return undefined;
      }
      await writeRecord(projectId, updated);
      return hydrate(updated);
    });

  /** As {@link write}, but `false` from the mutator means "nothing changed". */
  const patch = async (chatId: string, mutate: (chat: Chat) => boolean): Promise<Chat | undefined> =>
    write(chatId, (chat) => {
      const draft = { ...chat };
      if (!mutate(draft)) {
        return undefined;
      }
      draft.updatedAt = Date.now();
      return draft;
    });

  const create = async (
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'> & {
      id?: string;
    },
  ): Promise<Chat> => {
    const id = chat.id ?? generatePrefixedId(idPrefix.chat);
    const timestamp = Date.now();
    const created: Chat = {
      ...chat,
      id,
      resourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      recencyAt: timestamp,
    };
    await writeRecord(resourceId, created);
    return hydrate(created);
  };

  /**
   * Reclaim the chat's composer record when the chat goes (D11).
   *
   * The record holds this device's half-written message and its draft-stage
   * attachments, and no path clears `deletedAt`, so a deleted chat's record has
   * no reader left. `remove` takes the record and its attachment directory
   * together and treats an absent one as done, so a chat that never had a draft
   * deletes exactly as cleanly.
   */
  const removeComposerRecord = async (projectId: string, chatId: string): Promise<void> =>
    createComposerRecordStore(options.client, composerRecordPaths.chat(projectId, chatId)).remove();

  /**
   * Tombstone a chat and reclaim its composer record. The record goes even when
   * the chat was already tombstoned — by another device, or a repeated delete —
   * because this device's record travels nowhere and nothing else removes it.
   */
  const tombstone = async (chatId: string): Promise<Chat | undefined> => {
    const deleted = await patch(chatId, (chat) => {
      if (isDeleted(chat)) {
        return false;
      }
      chat.deletedAt = Date.now();
      return true;
    });
    const projectId = deleted?.resourceId ?? (await locate(chatId));
    if (projectId !== undefined) {
      await removeComposerRecord(projectId, chatId);
    }
    return deleted;
  };

  return {
    createChat: async (resourceId, chat) => create(resourceId, chat),

    createNavigationRepairChat: async (resourceId) =>
      create(resourceId, { name: defaultNavigationChatName, messages: [] }),

    updateChat: async (chatId, update: PartialDeep<Chat>) =>
      write(chatId, (chat) => {
        const isFullChat = 'id' in update && update.id === chatId;
        // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the caller's own contract: a full row replaces, a partial merges.
        const candidate = {
          ...(isFullChat ? (update as Chat) : (deepmerge(chat, update) as Chat)),
          messages: chat.messages,
        };
        if (isFullChat && chat.error === undefined && valuesEqual(candidate.error, invalidStartupError)) {
          delete candidate.error;
        }
        if (valuesEqual(candidate, chat)) {
          return undefined;
        }
        return isFullChat ? candidate : { ...candidate, updatedAt: Date.now() };
      }),

    applyGeneratedChatName: async (chatId, name) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      return write(chatId, (chat) =>
        isDeleted(chat) || chat.name !== defaultNavigationChatName || chat.name === trimmed
          ? undefined
          : { ...chat, name: trimmed },
      );
    },

    patchChat: async (chatId, key, value) =>
      patch(chatId, (chat) => {
        if (key === 'messages') {
          throw new Error('Chat transcript messages are host-log-owned and cannot be patched in chat.json.');
        }
        if (valuesEqual(chat[key], value)) {
          return false;
        }
        chat[key] = value;
        return true;
      }),

    touchChatRecency: async (chatId, requestedAt) =>
      patch(chatId, (chat) => {
        chat.recencyAt = Math.max(requestedAt, getChatRecencyAt(chat) + 1);
        return true;
      }),

    consumeChatStartupRequest: async (chatId, requestId) =>
      patch(chatId, (chat) => {
        if (chat.startupRequest?.id !== requestId) {
          return false;
        }
        delete chat.startupRequest;
        return true;
      }),

    commitCancelledDraftRestore: async (chatId, input: CommitCancelledDraftRestoreInput) =>
      patch(chatId, (chat) => {
        if (input.clearStartupRequestId !== undefined && chat.startupRequest?.id === input.clearStartupRequestId) {
          delete chat.startupRequest;
          return true;
        }
        return false;
      }),

    softDeleteChat: async (chatId) => tombstone(chatId),

    /* A tombstone, not an erasure: `deletedAt` in the record is what travels to
     * the other device, where an absent file would just look like a chat that
     * had not arrived yet (S39, S43). The composer record is the exception —
     * it is this device's alone and travels nowhere, so it goes (D11). */
    deleteChat: async (chatId) => {
      await tombstone(chatId);
    },

    getChat: async (chatId, knownProjectId) => {
      const projectId = knownProjectId ?? (await locate(chatId));
      return projectId === undefined ? undefined : readChatDirectory(projectId, chatId);
    },

    getChatsForResource: async (resourceId, listOptions) => {
      const chats = await listProjectChats(resourceId);
      return listOptions?.includeDeleted === true ? chats : chats.filter((chat) => !isDeleted(chat));
    },

    getAllChats: async (listOptions) => {
      const projects = await options.projectIds();
      const perProject = await Promise.all(projects.map(async (projectId) => listProjectChats(projectId)));
      const chats = perProject.flat();
      return listOptions?.includeDeleted === true ? chats : chats.filter((chat) => !isDeleted(chat));
    },

    getChatRecordsForResource: async (resourceId, listOptions) => {
      const records = await listProjectChatRecords(resourceId);
      return listOptions?.includeDeleted === true ? records : records.filter((record) => !isDeleted(record));
    },

    getAllChatRecords: async (listOptions) => {
      const projects = await options.projectIds();
      const perProject = await Promise.all(projects.map(async (projectId) => listProjectChatRecords(projectId)));
      const records = perProject.flat();
      return listOptions?.includeDeleted === true ? records : records.filter((record) => !isDeleted(record));
    },

    putChatRecord: async (chat) => {
      await writeRecord(chat.resourceId, chat);
    },
  };
}
