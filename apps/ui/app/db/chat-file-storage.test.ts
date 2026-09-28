// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for the library-row tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import { errorCategory } from '@taucad/types/constants';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import type { FileSystemProvider } from '@taucad/filesystem';
import { createChatFileStore } from '#db/chat-file-storage.js';
import type { ChatStoreClient } from '#db/chat-file-storage.js';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import type { ChatStorage } from '#types/storage.types.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';

/**
 * The chat store's behaviour, re-pointed from `indexeddb-storage.test.ts`.
 *
 * The record owns metadata and a pending startup command intent. A host-log
 * projection, not this store, owns all accepted transcript messages.
 */

const decoder = new TextDecoder();

let projectSequence = 0;
const nextProjectId = (): string => `proj_${String(projectSequence++).padStart(21, '0')}`;

/**
 * A chat store over one in-memory filesystem.
 *
 * The worker's client speaks absolute workspace paths (`/projects/<id>/…`) and
 * a provider speaks rooted ones, which is the one translation the real client
 * does for us — so the fixture does it here and nothing else is faked.
 */
const createStoreWithFiles = (): {
  store: ReturnType<typeof createChatFileStore>;
  reopen: () => ReturnType<typeof createChatFileStore>;
  reads: string[];
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
} => {
  let filesystem: FileSystemProvider | undefined;
  const provider = async (): Promise<FileSystemProvider> => {
    filesystem ??= await createMemoryProvider();
    return filesystem;
  };
  const rooted = (path: string): string => path.replace(/^\/+/u, '');
  const seen = new Set<string>();
  const reads: string[] = [];
  /* Only a project path names a project; a composer record lives in the Home
   * workspace and must never be mistaken for one. */
  const noteProject = (path: string): void => {
    if (path.startsWith('/projects/')) {
      seen.add(path.slice('/projects/'.length, path.indexOf('/.tau/')));
    }
  };
  /* The worker client removes a directory whole; a provider only removes an
   * empty one, so the fixture walks it the way the file service does. */
  const removeTree = async (path: string): Promise<void> => {
    const provided = await provider();
    for (const name of await provided.readdir(path)) {
      const child = `${path}/${name}`;
      // oxlint-disable-next-line no-await-in-loop -- sequential traversal, as the file service's own recursive remove is.
      const entry = await provided.stat(child);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await (entry.type === 'dir' ? removeTree(child) : provided.unlink(child));
    }
    await provided.rmdir(path);
  };
  /* The worker client reads a chat record as text and a composer record as
   * bytes, from the same path space. */
  async function readFile(path: string, options: 'utf8'): Promise<string>;
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, options?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    reads.push(path);
    const filesystem = await provider();
    const bytes = await filesystem.readFile(rooted(path));
    return options === 'utf8' ? decoder.decode(bytes) : bytes;
  }
  const client: ChatStoreClient = {
    readFile,
    writeFile: async (path, data) => {
      noteProject(path);
      const filesystem = await provider();
      await filesystem.writeFile(rooted(path), data);
    },
    readdir: async (path) => {
      const filesystem = await provider();
      return filesystem.readdir(rooted(path));
    },
    exists: async (path) => {
      const filesystem = await provider();
      return filesystem.exists(rooted(path));
    },
    unlink: async (path) => {
      const filesystem = await provider();
      await filesystem.unlink(rooted(path));
    },
    rmdir: async (path, options) => {
      const provided = await provider();
      await (options?.recursive === true ? removeTree(rooted(path)) : provided.rmdir(rooted(path)));
    },
  };
  const reopen = (): ReturnType<typeof createChatFileStore> =>
    createChatFileStore({ client, projectIds: async () => [...seen] });
  const store = reopen();
  return {
    store,
    reopen,
    reads,
    read: async (path) => {
      const provided = await provider();
      return decoder.decode(await provided.readFile(rooted(path)));
    },
    /* Seed the checkout the way a fetch's projection does: files appear, and
     * nothing the store wrote put them there. */
    write: async (path, content) => {
      noteProject(path);
      const provided = await provider();
      await provided.writeFile(rooted(path), content);
    },
    exists: async (path) => {
      const provided = await provider();
      return provided.exists(rooted(path));
    },
  };
};

const createStore = (): ChatStorage => createStoreWithFiles().store;

const userMessage = (text: string): MyUIMessage => ({
  id: `msg_${text}`,
  role: 'user',
  metadata: { createdAt: 1, status: 'success' },
  parts: [{ type: 'text', text }],
});

const draftMessage = (text: string): MyUIMessage => ({
  id: 'draft',
  role: 'user',
  metadata: { createdAt: 1, status: 'pending' },
  parts: [{ type: 'text', text }],
});

const startupRequest = (message: MyUIMessage, id = 'req_startup_test'): NonNullable<Chat['startupRequest']> => ({
  id,
  kind: 'regenerate-tail',
  messageId: message.id,
  message,
  source: 'homepage-initial-message',
  createdAt: 1,
});

const sampleError = (title: string): ChatError => ({
  category: errorCategory.generic,
  title,
  message: title,
});

async function freshChat(store: ChatStorage): Promise<Chat> {
  return store.createChat('resource_test', { name: 'Test Chat', messages: [] });
}

async function freshProject(provider: IndexedDbStorageProvider): Promise<ProjectLibraryState> {
  return provider.createProjectLibraryState({ projectId: nextProjectId(), lastActivityAt: 1 });
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  projectSequence = 0;
});

describe('chat file store', () => {
  it('reads all non-deleted chats without adding an index', async () => {
    const store = createStore();
    const first = await store.createChat('proj_one', { name: 'First', messages: [] });
    const second = await store.createChat('proj_two', { name: 'Second', messages: [] });
    await store.softDeleteChat(second.id);

    await expect(store.getAllChats()).resolves.toMatchObject([{ id: first.id }]);
    await expect(store.getAllChats({ includeDeleted: true })).resolves.toHaveLength(2);
  });

  describe('disjoint metadata writes', () => {
    it('preserves concurrent name and error patches', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      await Promise.all([
        store.patchChat(chat.id, 'name', 'Renamed'),
        store.patchChat(chat.id, 'error', sampleError('Refused')),
      ]);
      expect(await store.getChat(chat.id)).toMatchObject({ name: 'Renamed', error: sampleError('Refused') });
    });
  });

  describe('updateChat atomic single-transaction semantics', () => {
    it('should return undefined when chat does not exist', async () => {
      const store = createStore();
      const result = await store.updateChat('chat_missing', { name: 'never' });
      expect(result).toBeUndefined();
    });

    it('should accept a full chat replacement when update.id matches chatId', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      const replacement: Chat = {
        ...chat,
        name: 'Replaced',
        messages: [userMessage('full')],
        updatedAt: chat.updatedAt + 1000,
      };

      const result = await store.updateChat(chat.id, replacement);
      const stored = await store.getChat(chat.id);

      expect(result?.name).toBe('Replaced');
      expect(stored?.name).toBe('Replaced');
      expect(stored?.messages).toEqual([]);
    });

    it('should bump updatedAt for material changes and return undefined for no-op updates', async () => {
      const store = createStore();
      const chat = await freshChat(store);

      await sleep(2);

      const bumped = await store.updateChat(chat.id, { name: 'bump' });
      expect(bumped?.updatedAt).toBeGreaterThan(chat.updatedAt);

      await sleep(2);
      const noChange = await store.updateChat(chat.id, { name: 'bump' });
      const stored = await store.getChat(chat.id);
      expect(noChange).toBeUndefined();
      expect(stored?.updatedAt).toBe(bumped?.updatedAt);
    });
  });

  describe('chat startup and cancelled-draft atomic mutations', () => {
    it('should consume a matching startup request exactly once', async () => {
      const store = createStore();
      const message = userMessage('initial');
      const request = startupRequest(message);
      const chat = await store.createChat('resource_test', {
        name: 'Startup Chat',
        messages: [message],
        startupRequest: request,
      });

      const consumed = await store.consumeChatStartupRequest(chat.id, request.id);
      const storedAfterConsume = await store.getChat(chat.id);
      const staleConsume = await store.consumeChatStartupRequest(chat.id, request.id);

      expect(consumed?.startupRequest).toBeUndefined();
      expect(consumed?.messages).toEqual([]);
      expect(storedAfterConsume?.startupRequest).toBeUndefined();
      expect(storedAfterConsume?.messages).toEqual([]);
      expect(staleConsume).toBeUndefined();
    });

    it('rehydrates the exact pending command input after reopening, including attachment refs', async () => {
      const files = createStoreWithFiles();
      const message: MyUIMessage = {
        id: 'msg_attachment',
        role: 'user',
        metadata: { createdAt: 1, status: 'pending' },
        parts: [
          { type: 'file', url: 'attachments/image.png', mediaType: 'image/png' },
          { type: 'text', text: 'Use this image' },
        ],
      };
      const request = startupRequest(message);
      const created = await files.store.createChat('resource_test', {
        name: 'Startup Chat',
        messages: [message],
        startupRequest: request,
      });

      const reloaded = await files.reopen().getChat(created.id);
      expect(reloaded?.startupRequest).toEqual(request);
      expect(reloaded?.messages).toEqual([message]);
    });

    it.each([
      ['missing message', undefined],
      ['mismatched id', { id: 'msg_other', role: 'user', parts: [{ type: 'text', text: 'wrong' }] }],
      ['assistant role', { id: 'msg_pending', role: 'assistant', parts: [{ type: 'text', text: 'wrong' }] }],
      ['invalid shape', { id: 'msg_pending', role: 'user', parts: [{ type: 'text' }] }],
    ])('keeps malformed %s intent undispatched and visible as history error', async (_, message) => {
      const files = createStoreWithFiles();
      const chatId = 'chat_malformed';
      const record = {
        id: chatId,
        resourceId: 'resource_test',
        name: 'Malformed startup',
        createdAt: 1,
        updatedAt: 1,
        startupRequest: {
          id: 'req_pending',
          kind: 'regenerate-tail',
          messageId: 'msg_pending',
          message,
          source: 'homepage-initial-message',
          createdAt: 1,
        },
      };
      await files.write(`/projects/resource_test/.tau/chats/${chatId}/chat.json`, JSON.stringify(record));

      const loaded = await files.store.getChat(chatId);
      expect(loaded?.startupRequest?.id).toBe('req_pending');
      expect(loaded?.messages).toEqual([]);
      expect(loaded?.error?.code).toBe('HISTORY_INVALID');
    });

    it.each([
      ['unknown kind', { kind: 'future-kind' }],
      ['unknown source', { source: 'future-source' }],
      ['invalid command id', { id: 'not-a-request-id' }],
      ['invalid timestamp', { createdAt: -1 }],
      [
        'non-pending message',
        { message: { ...draftMessage('initial'), metadata: { createdAt: 1, status: 'success' } } },
      ],
    ])('does not dispatch a persisted startup intent with %s', async (_, override) => {
      const files = createStoreWithFiles();
      const path = '/projects/resource_test/.tau/chats/chat_bad_envelope/chat.json';
      const message = draftMessage('initial');
      await files.write(
        path,
        JSON.stringify({
          id: 'chat_bad_envelope',
          resourceId: 'resource_test',
          name: 'Bad envelope',
          createdAt: 1,
          updatedAt: 1,
          startupRequest: { ...startupRequest(message), ...override },
        }),
      );

      const loaded = await files.store.getChat('chat_bad_envelope');
      expect(loaded?.messages).toEqual([]);
      expect(loaded?.error?.code).toBe('HISTORY_INVALID');
      expect(JSON.parse(await files.read(path))).not.toHaveProperty('error');
    });

    it('does not persist a synthetic history error during an unrelated metadata patch', async () => {
      const files = createStoreWithFiles();
      const path = '/projects/resource_test/.tau/chats/chat_malformed/chat.json';
      await files.write(
        path,
        JSON.stringify({
          id: 'chat_malformed',
          resourceId: 'resource_test',
          name: 'Before',
          createdAt: 1,
          updatedAt: 1,
          startupRequest: {
            id: 'req_pending',
            kind: 'regenerate-tail',
            messageId: 'msg_pending',
            message: { id: 'msg_other', role: 'user', parts: [{ type: 'text', text: 'wrong' }] },
            source: 'homepage-initial-message',
            createdAt: 1,
          },
        }),
      );

      await files.store.patchChat('chat_malformed', 'name', 'After');
      const bytes = await files.read(path);
      const persisted: unknown = JSON.parse(bytes);
      expect(persisted).toMatchObject({ name: 'After', startupRequest: { id: 'req_pending' } });
      expect(persisted).not.toHaveProperty('error');
      const loaded = await files.store.getChat('chat_malformed');
      expect(loaded?.error?.code).toBe('HISTORY_INVALID');
      await files.store.updateChat('chat_malformed', { ...loaded!, name: 'Again' });
      const updated: unknown = JSON.parse(await files.read(path));
      expect(updated).toMatchObject({ name: 'Again' });
      expect(updated).not.toHaveProperty('error');
    });

    it('should no-op when the startup request id is stale', async () => {
      const store = createStore();
      const message = userMessage('initial');
      const request = startupRequest(message);
      const chat = await store.createChat('resource_test', {
        name: 'Startup Chat',
        messages: [message],
        startupRequest: request,
      });

      const result = await store.consumeChatStartupRequest(chat.id, 'req_stale');
      const stored = await store.getChat(chat.id);

      expect(result).toBeUndefined();
      expect(stored?.startupRequest).toEqual(request);
      expect(stored?.updatedAt).toBe(chat.updatedAt);
    });

    it('clears a matching startup intent without persisting restored messages', async () => {
      const store = createStore();
      const message = userMessage('cancelled');
      const request = startupRequest(message);
      const chat = await store.createChat('resource_test', {
        name: 'Cancelled Startup',
        messages: [message],
        startupRequest: request,
      });
      await sleep(2);

      const restored = await store.commitCancelledDraftRestore(chat.id, {
        messages: [],
        clearStartupRequestId: request.id,
      });
      const stored = await store.getChat(chat.id);

      expect(restored?.messages).toEqual([]);
      expect(restored?.startupRequest).toBeUndefined();
      expect(stored?.messages).toEqual([]);
      expect(stored).not.toHaveProperty('draft');
      expect(stored?.startupRequest).toBeUndefined();
      expect(restored?.updatedAt).toBeGreaterThan(chat.updatedAt);
    });

    it('does not treat a restored message array as a record mutation', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      await expect(
        store.commitCancelledDraftRestore(chat.id, { messages: [userMessage('not a record')] }),
      ).resolves.toBeUndefined();
      const stored = await store.getChat(chat.id);
      expect(stored?.messages).toEqual([]);
    });
  });

  describe('per-chatId mutex serialises submissions', () => {
    it('should observe submission order on the resolved values when many writers race the same chat', async () => {
      const writers = 20;
      const store = createStore();
      const chat = await freshChat(store);

      const results = await Promise.all(
        Array.from({ length: writers }, async (_, index) => store.patchChat(chat.id, 'name', `n-${index}`)),
      );

      // Each result should reflect a strictly increasing updatedAt. Mutex
      // submissions are FIFO so results[i].name === `n-${i}` and timestamps
      // are non-decreasing.
      const names = results.map((r) => r?.name);
      expect(names).toEqual(Array.from({ length: writers }, (_, index) => `n-${index}`));

      const stored = await store.getChat(chat.id);
      expect(stored?.name).toBe(`n-${writers - 1}`);
    });
  });

  /* The library row is IndexedDB's and the chat is a file: a chat write that
   * reached the library row would be a second store for one fact (W17). */
  it('never changes activity from chat persistence', async () => {
    const provider = new IndexedDbStorageProvider();
    const store = createStore();
    const state = await freshProject(provider);
    const chat = await store.createChat(state.projectId, { name: 'A', messages: [] });
    await store.updateChat(chat.id, { name: 'B' });
    await store.patchChat(chat.id, 'error', sampleError('Refused'));
    await store.softDeleteChat(chat.id);

    expect(await provider.getProjectLibraryState(state.projectId)).toEqual(state);
  });

  it('preserves activity when applying a generated navigation chat name', async () => {
    const provider = new IndexedDbStorageProvider();
    const store = createStore();
    const state = await freshProject(provider);
    const chat = await store.createNavigationRepairChat(state.projectId);

    const result = await store.applyGeneratedChatName(chat.id, 'Generated Bracket');

    expect(result?.name).toBe('Generated Bracket');
    expect(result?.updatedAt).toBe(chat.updatedAt);
    expect(await provider.getProjectLibraryState(state.projectId)).toEqual(state);
  });

  describe('patchChat field-scoped writer', () => {
    it('should write only the named field, leaving every other field byte-identical', async () => {
      const store = createStore();
      const seeded = await store.createChat('resource_test', {
        name: 'Original',
        messages: [],
        error: sampleError('seed-error'),
        activeKernel: 'manifold',
      });
      const before = structuredClone(seeded);

      await store.patchChat(seeded.id, 'name', 'Renamed');

      const after = await store.getChat(seeded.id);
      expect(after?.name).toBe('Renamed');
      expect(after?.messages).toEqual([]);
      expect(after?.error).toEqual(before.error);
      expect(after?.activeKernel).toBe(before.activeKernel);
      expect(after?.id).toBe(before.id);
      expect(after?.resourceId).toBe(before.resourceId);
      expect(after?.createdAt).toBe(before.createdAt);
    });

    it('should bump updatedAt', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      await sleep(2);

      const result = await store.patchChat(chat.id, 'name', 'Bumped');
      expect(result?.updatedAt).toBeGreaterThan(chat.updatedAt);
    });

    it('should return undefined and preserve updatedAt when the field value is unchanged', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      await sleep(2);

      const result = await store.patchChat(chat.id, 'name', chat.name);
      const stored = await store.getChat(chat.id);

      expect(result).toBeUndefined();
      expect(stored?.updatedAt).toBe(chat.updatedAt);
    });

    it('should return undefined when chat does not exist', async () => {
      const store = createStore();
      const result = await store.patchChat('chat_missing', 'name', 'Whatever');
      expect(result).toBeUndefined();
    });

    it('refuses transcript writes through the old field-scoped API', async () => {
      const files = createStoreWithFiles();
      const chat = await freshChat(files.store);
      await expect(files.store.patchChat(chat.id, 'messages', [userMessage('not a record')])).rejects.toThrow(
        'host-log-owned',
      );
      const stored = await files.reopen().getChat(chat.id);
      expect(stored?.messages).toEqual([]);
    });

    it('should preserve both writes when patchChat for different keys race', async () => {
      const iterations = 100;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const execution = { kind: 'tau', model: `model-${i}` } as const;
        const error = sampleError(`error-${i}`);

        await Promise.all([
          store.patchChat(chat.id, 'activeExecution', execution),
          store.patchChat(chat.id, 'error', error),
        ]);

        const final = await store.getChat(chat.id);
        expect(final?.activeExecution).toEqual(execution);
        expect(final?.error).toEqual(error);
      }
      /* oxlint-enable no-await-in-loop */
    });

    it('should clear an optional field when value is undefined', async () => {
      const store = createStore();
      const seeded = await store.createChat('resource_test', {
        name: 'WithError',
        messages: [],
        error: sampleError('bad'),
      });
      expect(seeded.error?.title).toBe('bad');

      await store.patchChat(seeded.id, 'error', undefined);

      const after = await store.getChat(seeded.id);
      expect(after?.error).toBeUndefined();
    });
  });

  /* W8: unread is the project's unread record, written by `ChatSessionStore`
   * alone (D9); the rows that pinned `setChatUnreadState` here moved there. */
  describe('chat recency semantics', () => {
    it('initializes recency with row timestamps', async () => {
      const chat = await freshChat(createStore());

      expect(chat.recencyAt).toBe(chat.createdAt);
      expect(chat.updatedAt).toBe(chat.createdAt);
    });

    it('strictly advances recency for every accepted action and bumps row updatedAt', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      const activityAt = chat.recencyAt! + 100;
      await sleep(2);

      const result = await store.touchChatRecency(chat.id, activityAt);

      expect(result?.recencyAt).toBe(activityAt);
      expect(result?.updatedAt).toBeGreaterThan(chat.updatedAt);
      const repeated = await store.touchChatRecency(chat.id, activityAt - 1);
      expect(repeated?.recencyAt).toBe(activityAt + 1);
      const stored = await store.getChat(chat.id);
      expect(stored?.recencyAt).toBe(activityAt + 1);
    });

    it('returns undefined for a missing recency target', async () => {
      const store = createStore();

      await expect(store.touchChatRecency('chat_missing', 1)).resolves.toBeUndefined();
    });

    it('preserves recency, name, and execution across repeated concurrent writes', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      const initialActivityAt = chat.recencyAt!;

      /* oxlint-disable no-await-in-loop -- race regression requires each iteration to settle before the next */
      for (let index = 1; index <= 100; index++) {
        const activityAt = initialActivityAt + index;
        const execution = { kind: 'tau', model: `model-${index}` } as const;
        await Promise.all([
          store.touchChatRecency(chat.id, activityAt),
          store.patchChat(chat.id, 'name', `name-${index}`),
          store.patchChat(chat.id, 'activeExecution', execution),
        ]);

        const stored = await store.getChat(chat.id);
        expect(stored?.recencyAt).toBe(activityAt);
        expect(stored?.name).toBe(`name-${index}`);
        expect(stored?.activeExecution).toEqual(execution);
      }
      /* oxlint-enable no-await-in-loop */
    });
  });

  describe('activeExecution + activeKernel are top-level Chat fields', () => {
    it('should round-trip activeExecution through patchChat', async () => {
      const store = createStore();
      const chat = await freshChat(store);

      const execution = { kind: 'tau', model: 'gpt-5.4-medium' } as const;
      const result = await store.patchChat(chat.id, 'activeExecution', execution);

      expect(result?.activeExecution).toEqual(execution);
      const stored = await store.getChat(chat.id);
      expect(stored?.activeExecution).toEqual(execution);
    });

    it('should round-trip activeKernel through patchChat', async () => {
      const store = createStore();
      const chat = await freshChat(store);

      const result = await store.patchChat(chat.id, 'activeKernel', 'manifold');

      expect(result?.activeKernel).toBe('manifold');
      const stored = await store.getChat(chat.id);
      expect(stored?.activeKernel).toBe('manifold');
    });

    it('should clear activeExecution when patched with undefined', async () => {
      const store = createStore();
      const chat = await store.createChat('resource_test', {
        name: 'WithModel',
        messages: [],
        activeExecution: { kind: 'tau', model: 'seed-model' },
      });
      expect(chat.activeExecution).toEqual({ kind: 'tau', model: 'seed-model' });

      await store.patchChat(chat.id, 'activeExecution', undefined);

      const stored = await store.getChat(chat.id);
      expect(stored?.activeExecution).toBeUndefined();
    });

    it('should preserve activeExecution when patching an unrelated field', async () => {
      const store = createStore();
      const chat = await store.createChat('resource_test', {
        name: 'WithModel',
        messages: [],
        activeExecution: { kind: 'acp', hostId: 'origin', agentId: 'claude' },
        activeKernel: 'manifold',
      });

      await store.patchChat(chat.id, 'name', 'Renamed');

      const stored = await store.getChat(chat.id);
      expect(stored?.activeExecution).toEqual({ kind: 'acp', hostId: 'origin', agentId: 'claude' });
      expect(stored?.activeKernel).toBe('manifold');
    });
  });

  describe('softDeleteChat', () => {
    it('should set deletedAt and bump updatedAt atomically', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      await sleep(2);

      const result = await store.softDeleteChat(chat.id);

      expect(result?.deletedAt).toBeDefined();
      expect(result?.deletedAt).toBeGreaterThanOrEqual(chat.createdAt);
      expect(result?.updatedAt).toBeGreaterThan(chat.updatedAt);
    });

    it('should return undefined when chat does not exist', async () => {
      const store = createStore();
      const result = await store.softDeleteChat('chat_missing');
      expect(result).toBeUndefined();
    });
  });
});

/**
 * A chat is its record and its log; its composer is not (blueprint W8, D3, D4).
 *
 * `draft`, `messageEdits` and `hasUnreadTurn` moved to this device's composer
 * records, so the chat store neither holds nor hands them out. A chat is not
 * duplicated (R4).
 */
describe('chat file store — composer fields are not the chat’s (W8)', () => {
  const composerFields = ['draft', 'messageEdits', 'hasUnreadTurn'];

  it('creates, reads and lists chats with no composer field', async () => {
    const store = createStore();
    const created = await freshChat(store);
    const read = await store.getChat(created.id);
    const [listed] = await store.getChatsForResource('resource_test');

    for (const chat of [created, read, listed]) {
      for (const field of composerFields) {
        expect(chat).not.toHaveProperty(field);
      }
    }
  });
});

/**
 * Deletion reclaims the chat's composer record (blueprint D11).
 *
 * The record and its draft-stage attachments are this device's alone, so a
 * deleted chat's half-written message has nothing left to belong to: no path
 * clears `deletedAt`, and the record would outlive every reader of it. The
 * paths are the Home workspace's `/.tau/composers/chats/**`, never the
 * project's, so a sibling chat and a sibling project are untouched by
 * construction — which is what these rows pin.
 */
describe('chat file store — composer record deletion (D11)', () => {
  const projectId = 'proj_composer0000000001';
  const siblingProjectId = 'proj_composer0000000002';
  const recordPath = (project: string, chatId: string): string => `/.tau/composers/chats/${project}/${chatId}.json`;
  const attachmentPath = (project: string, chatId: string): string =>
    `/.tau/composers/chats/${project}/${chatId}/attachments/${'a'.repeat(64)}.png`;

  /** One chat with a draft record and one attachment beside it. */
  const seedComposer = async (
    files: ReturnType<typeof createStoreWithFiles>,
    project: string,
    chatId: string,
  ): Promise<void> => {
    await files.write(
      recordPath(project, chatId),
      `${JSON.stringify({ version: 1, draft: draftMessage(`draft for ${chatId}`) })}\n`,
    );
    await files.write(attachmentPath(project, chatId), 'attachment bytes');
  };

  it('removes the soft-deleted chat’s record and attachments, and nothing else', async () => {
    const files = createStoreWithFiles();
    const chat = await files.store.createChat(projectId, { name: 'Deleted', messages: [] });
    const sibling = await files.store.createChat(projectId, { name: 'Kept', messages: [] });
    const otherProjectChat = await files.store.createChat(siblingProjectId, { name: 'Elsewhere', messages: [] });
    await seedComposer(files, projectId, chat.id);
    await seedComposer(files, projectId, sibling.id);
    await seedComposer(files, siblingProjectId, otherProjectChat.id);

    await files.store.softDeleteChat(chat.id);

    await expect(files.exists(recordPath(projectId, chat.id))).resolves.toBe(false);
    await expect(files.exists(attachmentPath(projectId, chat.id))).resolves.toBe(false);
    // The named acceptance row: one chat's deletion touches no sibling.
    await expect(files.exists(recordPath(projectId, sibling.id))).resolves.toBe(true);
    await expect(files.exists(attachmentPath(projectId, sibling.id))).resolves.toBe(true);
    await expect(files.exists(recordPath(siblingProjectId, otherProjectChat.id))).resolves.toBe(true);
    await expect(files.exists(attachmentPath(siblingProjectId, otherProjectChat.id))).resolves.toBe(true);
  });

  it('removes the record on the hard delete path too', async () => {
    const files = createStoreWithFiles();
    const chat = await files.store.createChat(projectId, { name: 'Deleted', messages: [] });
    await seedComposer(files, projectId, chat.id);

    await files.store.deleteChat(chat.id);

    await expect(files.exists(recordPath(projectId, chat.id))).resolves.toBe(false);
    await expect(files.exists(attachmentPath(projectId, chat.id))).resolves.toBe(false);
  });

  it('should remove the record of a chat that was already tombstoned (G11)', async () => {
    const files = createStoreWithFiles();
    const chat = await files.store.createChat(projectId, { name: 'Deleted elsewhere', messages: [] });
    await files.store.softDeleteChat(chat.id);
    // Written after the tombstone: another device deleted it while this one still held a draft.
    await seedComposer(files, projectId, chat.id);

    await files.store.deleteChat(chat.id);

    await expect(files.exists(recordPath(projectId, chat.id))).resolves.toBe(false);
    await expect(files.exists(attachmentPath(projectId, chat.id))).resolves.toBe(false);
  });

  it('deletes a chat that never had a draft without failing', async () => {
    const files = createStoreWithFiles();
    const chat = await files.store.createChat(projectId, { name: 'No draft', messages: [] });

    await expect(files.store.deleteChat(chat.id)).resolves.toBeUndefined();
    const deleted = await files.store.getChat(chat.id);
    expect(deleted?.deletedAt).toBeGreaterThan(0);
  });
});

/** Record lookup discovers logs but never reads transcript bytes. */
describe('chat file store — log ownership boundary', () => {
  const chatId = 'chat_from_files';
  const projectId = 'proj_000000000000000000fs';
  const record = `${JSON.stringify(
    { id: chatId, resourceId: projectId, name: 'From the log', createdAt: 1, updatedAt: 2 },
    undefined,
    2,
  )}\n`;

  it('reads metadata only for a chat whose log contains turns', async () => {
    const { store, write, reads } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/${'chat.json'}`, record);
    await write(`/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`, 'accepted host events');

    const chat = await store.getChat(chatId);
    expect(chat?.name).toBe('From the log');
    expect(chat?.messages).toEqual([]);
    expect(reads).not.toContain(`/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`);
    expect(record).not.toContain('messages');
  });

  it('does not cache or derive a remote segment as record messages', async () => {
    const { store, write } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/chat.json`, record);
    await write(`/projects/${projectId}/.tau/chats/${chatId}/events/device-b.jsonl`, 'remote host events');
    const chat = await store.getChat(chatId);
    expect(chat?.messages).toEqual([]);
  });

  /* A record that has not landed yet is a real runtime state, not a migration
   * shim: the fetch path projects segments and `chat.json` as separate writes
   * (a1 review R4). */
  it('lists a chat directory that holds a log but no record yet', async () => {
    const { store, write } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`, 'accepted host events');

    const listed = await store.getChatsForResource(projectId);
    expect(listed.map((chat) => chat.id)).toEqual([chatId]);
    expect(listed[0]?.messages).toEqual([]);
  });

  it('lists a foreign-log-only chat directory before its record arrives', async () => {
    const { store, write } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/events/device-b.jsonl`, 'remote host events');
    const listed = await store.getChatsForResource(projectId);
    expect(listed.map((chat) => chat.id)).toEqual([chatId]);
  });
});
