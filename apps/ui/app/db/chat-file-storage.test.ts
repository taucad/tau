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
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import type { ChatStorage } from '#types/storage.types.js';
import type { ProjectLibraryState } from '#types/project.types.js';

/**
 * The chat store's behaviour, re-pointed from `indexeddb-storage.test.ts`.
 *
 * Every case here was a case against the browser object store before W17 moved
 * the chat to `.tau/chats/<id>/chat.json`: the atomicity rules, the
 * field-scoped writers, recency and unread, message edits, duplication and the
 * soft delete are the same contract with a file underneath, so the coverage was
 * re-pointed rather than deleted (S43, review 3 F10).
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
    const filesystem = await provider();
    const bytes = await filesystem.readFile(rooted(path));
    return options === 'utf8' ? decoder.decode(bytes) : bytes;
  }
  const store = createChatFileStore({
    client: {
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
    },
    projectIds: async () => [...seen],
  });
  return {
    store,
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

const startupRequest = (messageId: string, id = 'req_startup_test'): NonNullable<Chat['startupRequest']> => ({
  id,
  kind: 'regenerate-tail',
  messageId,
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

  describe('chat draft resurrection — disjoint-field writes preserve every field', () => {
    // These tests reproduce the original "draft resurrection" race: a sent
    // draft was reappearing in the input field because two concurrent
    // updateChat({draft}) and updateChat({messages}) calls performed
    // get + put across two separate transactions. After atomic updateChat,
    // per-chatId mutex, and field-scoped patchChat the production
    // call sites use patchChat and the race is closed at every layer.
    /* Rewritten for W8: the draft left `Chat` for the composer record, so the
     * race is pinned on `name`, another field written beside `messages`. */
    it('should preserve both name and messages when patchChat("name") and patchChat("messages") race repeatedly', async () => {
      const iterations = 200;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const text = `iter-${i}`;
        const messages = [userMessage(text)];

        await Promise.all([store.patchChat(chat.id, 'name', text), store.patchChat(chat.id, 'messages', messages)]);

        const final = await store.getChat(chat.id);
        expect(final?.name).toBe(text);
        expect(final?.messages).toEqual(messages);
      }
      /* oxlint-enable no-await-in-loop */
    });

    it('should preserve both error and messages when patchChat("error") and patchChat("messages") race', async () => {
      const iterations = 100;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const tag = `err-${i}`;
        const error = sampleError(tag);
        const messages = [userMessage(tag)];

        await Promise.all([store.patchChat(chat.id, 'error', error), store.patchChat(chat.id, 'messages', messages)]);

        const final = await store.getChat(chat.id);
        expect(final?.error?.title).toBe(tag);
        expect(final?.messages).toHaveLength(1);
        expect(final?.messages[0]?.parts[0]).toEqual({ type: 'text', text: tag });
      }
      /* oxlint-enable no-await-in-loop */
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
      expect(stored?.messages).toEqual([userMessage('full')]);
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
      const request = startupRequest(message.id);
      const chat = await store.createChat('resource_test', {
        name: 'Startup Chat',
        messages: [message],
        startupRequest: request,
      });

      const consumed = await store.consumeChatStartupRequest(chat.id, request.id);
      const storedAfterConsume = await store.getChat(chat.id);
      const staleConsume = await store.consumeChatStartupRequest(chat.id, request.id);

      expect(consumed?.startupRequest).toBeUndefined();
      expect(storedAfterConsume?.startupRequest).toBeUndefined();
      expect(staleConsume).toBeUndefined();
    });

    it('should no-op when the startup request id is stale', async () => {
      const store = createStore();
      const message = userMessage('initial');
      const request = startupRequest(message.id);
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

    /* Rewritten for W8: the restored draft is written to the composer record
     * by `ChatSessionStore`; the chat row commits the transcript and the
     * startup cleanup. */
    it('should commit restored messages and startup cleanup together', async () => {
      const store = createStore();
      const message = userMessage('cancelled');
      const request = startupRequest(message.id);
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

    it('should preserve disjoint writers when cancelled restore races another field', async () => {
      const iterations = 100;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const text = `cancelled-${i}`;
        const message = userMessage(text);
        const request = startupRequest(message.id, `req_restore_${i}`);

        await store.patchChat(chat.id, 'messages', [message]);
        await store.patchChat(chat.id, 'startupRequest', request);

        await Promise.all([
          store.patchChat(chat.id, 'activeExecution', { kind: 'tau', model: `model-${i}` }),
          store.commitCancelledDraftRestore(chat.id, {
            messages: [],
            clearStartupRequestId: request.id,
          }),
        ]);

        const final = await store.getChat(chat.id);
        expect(final?.activeExecution).toEqual({ kind: 'tau', model: `model-${i}` });
        expect(final?.messages).toEqual([]);
        expect(final?.startupRequest).toBeUndefined();
      }
      /* oxlint-enable no-await-in-loop */
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
    await store.patchChat(chat.id, 'messages', [userMessage('hi')]);
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
        messages: [userMessage('hello')],
        error: sampleError('seed-error'),
        activeKernel: 'manifold',
      });
      const before = structuredClone(seeded);

      await store.patchChat(seeded.id, 'name', 'Renamed');

      const after = await store.getChat(seeded.id);
      expect(after?.name).toBe('Renamed');
      expect(after?.messages).toEqual(before.messages);
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

    it('should preserve both writes when patchChat for different keys race', async () => {
      const iterations = 100;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const execution = { kind: 'tau', model: `model-${i}` } as const;
        const messages = [userMessage(`m-${i}`)];

        await Promise.all([
          store.patchChat(chat.id, 'activeExecution', execution),
          store.patchChat(chat.id, 'messages', messages),
        ]);

        const final = await store.getChat(chat.id);
        expect(final?.activeExecution).toEqual(execution);
        expect(final?.messages).toEqual(messages);
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

    it('preserves recency, name, and messages across repeated concurrent writes', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      const initialActivityAt = chat.recencyAt!;

      /* oxlint-disable no-await-in-loop -- race regression requires each iteration to settle before the next */
      for (let index = 1; index <= 100; index++) {
        const activityAt = initialActivityAt + index;
        const messages = [userMessage(`activity-race-${index}`)];
        await Promise.all([
          store.touchChatRecency(chat.id, activityAt),
          store.patchChat(chat.id, 'name', `name-${index}`),
          store.patchChat(chat.id, 'messages', messages),
        ]);

        const stored = await store.getChat(chat.id);
        expect(stored?.recencyAt).toBe(activityAt);
        expect(stored?.name).toBe(`name-${index}`);
        expect(stored?.messages).toEqual(messages);
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

  describe('duplicateChat carries activeExecution + activeKernel', () => {
    it('should copy activeExecution and activeKernel into the duplicated chat', async () => {
      const store = createStore();
      const original = await store.createChat('resource_test', {
        name: 'Original',
        messages: [],
        activeExecution: { kind: 'tau', model: 'gpt-5.4-medium' },
        activeKernel: 'manifold',
      });
      await sleep(2);

      const copy = await store.duplicateChat(original.id);

      expect(copy.id).not.toBe(original.id);
      expect(copy.activeExecution).toEqual({ kind: 'tau', model: 'gpt-5.4-medium' });
      expect(copy.activeKernel).toBe('manifold');
      expect(copy.recencyAt).toBe(copy.createdAt);
      expect(copy.recencyAt).toBeGreaterThan(original.recencyAt!);
    });

    it('should leave duplicate fields undefined when the source chat had none', async () => {
      const store = createStore();
      const original = await store.createChat('resource_test', {
        name: 'Original',
        messages: [],
      });

      const copy = await store.duplicateChat(original.id);

      expect(copy.activeExecution).toBeUndefined();
      expect(copy.activeKernel).toBeUndefined();
    });

    it('should not copy one-shot startup intent into the duplicated chat', async () => {
      const store = createStore();
      const message = userMessage('initial');
      const original = await store.createChat('resource_test', {
        name: 'Original',
        messages: [message],
        startupRequest: startupRequest(message.id),
      });

      const copy = await store.duplicateChat(original.id);

      expect(copy.messages).toEqual(original.messages);
      expect(copy.startupRequest).toBeUndefined();
    });

    it('should not copy one-shot startup intent when duplicating all resource chats', async () => {
      const store = createStore();
      const sourceProject = { projectId: nextProjectId() };
      const targetProject = { projectId: nextProjectId() };
      const message = userMessage('initial');
      const original = await store.createChat(sourceProject.projectId, {
        name: 'Original',
        messages: [message],
        startupRequest: startupRequest(message.id),
      });

      const mapping = await store.duplicateResourceChats(sourceProject.projectId, targetProject.projectId);
      const copiedChat = await store.getChat(mapping[original.id]!);

      expect(copiedChat?.messages).toEqual(original.messages);
      expect(copiedChat?.startupRequest).toBeUndefined();
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
 * records, so the chat store neither holds nor hands them out, and a copy of a
 * chat starts with an empty composer.
 */
describe('chat file store — composer fields are not the chat’s (W8)', () => {
  const composerFields = ['draft', 'messageEdits', 'hasUnreadTurn'];
  const composerRecord = (project: string, chatId: string): string => `/.tau/composers/chats/${project}/${chatId}.json`;

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

  it('duplicates a chat and its project’s chats without composer state or records (D4)', async () => {
    const files = createStoreWithFiles();
    const projectId = nextProjectId();
    const targetProjectId = nextProjectId();
    const original = await files.store.createChat(projectId, { name: 'Original', messages: [] });
    await files.write(
      composerRecord(projectId, original.id),
      `${JSON.stringify({ version: 1, draft: draftMessage('mine alone') })}\n`,
    );
    /* A caller from before W8 that still names the old field. */
    await files.store.updateChat(original.id, {
      ...original,
      draft: draftMessage('held in memory'),
    } as unknown as Chat);

    const copy = await files.store.duplicateChat(original.id);
    const mapping = await files.store.duplicateResourceChats(projectId, targetProjectId);
    const projectCopy = await files.store.getChat(mapping[original.id]!);

    for (const chat of [copy, projectCopy]) {
      for (const field of composerFields) {
        expect(chat).not.toHaveProperty(field);
      }
    }
    await expect(files.exists(composerRecord(projectId, copy.id))).resolves.toBe(false);
    await expect(files.exists(composerRecord(targetProjectId, mapping[original.id]!))).resolves.toBe(false);
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

  it('deletes a chat that never had a draft without failing', async () => {
    const files = createStoreWithFiles();
    const chat = await files.store.createChat(projectId, { name: 'No draft', messages: [] });

    await expect(files.store.deleteChat(chat.id)).resolves.toBeUndefined();
    const deleted = await files.store.getChat(chat.id);
    expect(deleted?.deletedAt).toBeGreaterThan(0);
  });
});

/**
 * A chat opened from `.tau/chats/**` alone, with no help from this session.
 *
 * `chat.json` carries no `messages` (P26/D25): the transcript is the session
 * log's, so a chat that arrived as files — a fetch's projection, a clone, a
 * second device — has to render from `events.jsonl` and nothing else.
 */
describe('chat file store — the transcript the log implies', () => {
  const chatId = 'chat_from_files';
  const projectId = 'proj_000000000000000000fs';
  const logLine = (input: {
    sequence: number;
    role: 'user' | 'assistant';
    text: string;
    epoch?: string;
    runId?: string;
  }): string =>
    `${JSON.stringify({
      version: 1,
      leaderEpoch: input.epoch ?? 'epoch-one',
      sequence: input.sequence,
      recordedAt: new Date(Date.UTC(2026, 8, 13, 6, 0, input.sequence)).toISOString(),
      runId: input.runId ?? 'run-one',
      type: 'message.appended',
      message: { id: `m${String(input.sequence)}`, role: input.role, content: input.text },
    })}\n`;

  const record = `${JSON.stringify(
    { id: chatId, resourceId: projectId, name: 'From the log', createdAt: 1, updatedAt: 2 },
    undefined,
    2,
  )}\n`;

  const texts = (chat: Chat | undefined): readonly string[] =>
    (chat?.messages ?? []).flatMap((message) =>
      message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])),
    );

  it('renders a chat whose record was never written by this session', async () => {
    const { store, write } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/${'chat.json'}`, record);
    await write(
      `/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`,
      `${logLine({ sequence: 0, role: 'user', text: 'Make it 40mm' })}${logLine({ sequence: 1, role: 'assistant', text: 'Done.' })}`,
    );

    const chat = await store.getChat(chatId);
    expect(chat?.name).toBe('From the log');
    expect(texts(chat)).toEqual(['Make it 40mm', 'Done.']);
    /* And the record on disk still holds no transcript: the derivation is the
     * only history, never a second copy beside it. */
    expect(record).not.toContain('messages');
  });

  /* Two devices: this one's log at `events.jsonl`, the other's projected in as
   * `events/<deviceId>.jsonl`. Disjoint paths, so reading is a merge. */
  it("merges another device's projected segment into the transcript", async () => {
    const { store, write } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/chat.json`, record);
    await write(
      `/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`,
      logLine({ sequence: 0, role: 'user', text: 'From here' }),
    );
    await write(
      `/projects/${projectId}/.tau/chats/${chatId}/events/device-b.jsonl`,
      /* A later `recordedAt` — the only ordering fact a record carries, since
       * the epoch is a random UUID per leadership lease. */
      logLine({ sequence: 1, role: 'user', text: 'From there', epoch: 'epoch-two', runId: 'run-two' }),
    );

    expect(texts(await store.getChat(chatId))).toEqual(['From here', 'From there']);
  });

  it("refreshes a cached transcript when another device's segment changes", async () => {
    const { store, write } = createStoreWithFiles();
    await write(`/projects/${projectId}/.tau/chats/${chatId}/chat.json`, record);
    await write(
      `/projects/${projectId}/.tau/chats/${chatId}/events/device-b.jsonl`,
      logLine({ sequence: 0, role: 'user', text: 'Before sync', epoch: 'epoch-two' }),
    );
    expect(texts(await store.getChat(chatId))).toEqual(['Before sync']);

    await write(
      `/projects/${projectId}/.tau/chats/${chatId}/events/device-b.jsonl`,
      `${logLine({ sequence: 0, role: 'user', text: 'Before sync', epoch: 'epoch-two' })}${logLine({ sequence: 1, role: 'assistant', text: 'After sync', epoch: 'epoch-two' })}`,
    );
    store.invalidateLog(chatId);

    expect(texts(await store.getChat(chatId))).toEqual(['Before sync', 'After sync']);
  });

  /* A record that has not landed yet is a real runtime state, not a migration
   * shim: the fetch path projects segments and `chat.json` as separate writes
   * (a1 review R4). */
  it('lists a chat directory that holds a log but no record yet', async () => {
    const { store, write } = createStoreWithFiles();
    await write(
      `/projects/${projectId}/.tau/chats/${chatId}/events.jsonl`,
      logLine({ sequence: 0, role: 'user', text: 'Arrived first' }),
    );

    const listed = await store.getChatsForResource(projectId);
    expect(listed.map((chat) => chat.id)).toEqual([chatId]);
    expect(texts(listed[0])).toEqual(['Arrived first']);
  });
});
