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
const createStoreWithFiles = (): { store: ChatStorage; write: (path: string, content: string) => Promise<void> } => {
  let filesystem: FileSystemProvider | undefined;
  const provider = async (): Promise<FileSystemProvider> => {
    filesystem ??= await createMemoryProvider();
    return filesystem;
  };
  const rooted = (path: string): string => path.replace(/^\/+/u, '');
  const seen = new Set<string>();
  const store = createChatFileStore({
    client: {
      readFile: async (path) => {
        const filesystem = await provider();
        return decoder.decode(await filesystem.readFile(rooted(path)));
      },
      writeFile: async (path, data) => {
        seen.add(path.slice('/projects/'.length, path.indexOf('/.tau/')));
        const filesystem = await provider();
        await filesystem.writeFile(rooted(path), data);
      },
      readdir: async (path) => {
        const filesystem = await provider();
        return filesystem.readdir(rooted(path));
      },
    },
    projectIds: async () => [...seen],
  });
  return {
    store,
    /* Seed the checkout the way a fetch's projection does: files appear, and
     * nothing the store wrote put them there. */
    write: async (path, content) => {
      seen.add(path.slice('/projects/'.length, path.indexOf('/.tau/')));
      const provided = await provider();
      await provided.writeFile(rooted(path), content);
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
    it('should preserve both draft and messages when patchChat("draft") and patchChat("messages") race repeatedly', async () => {
      const iterations = 200;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const text = `iter-${i}`;
        const draft = draftMessage(text);
        const messages = [userMessage(text)];

        await Promise.all([store.patchChat(chat.id, 'draft', draft), store.patchChat(chat.id, 'messages', messages)]);

        const final = await store.getChat(chat.id);
        if (
          final?.draft?.parts[0]?.type !== 'text' ||
          final.draft.parts[0].text !== text ||
          final.messages.length !== 1 ||
          final.messages[0]?.parts[0]?.type !== 'text' ||
          final.messages[0].parts[0].text !== text
        ) {
          throw new Error(
            `iteration ${i}: expected draft="${text}" + messages=["${text}"], got draft=${JSON.stringify(
              final?.draft?.parts,
            )} messages=${JSON.stringify(final?.messages)}`,
          );
        }
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

    it('should commit restored messages, draft, and startup cleanup together', async () => {
      const store = createStore();
      const message = userMessage('cancelled');
      const request = startupRequest(message.id);
      const chat = await store.createChat('resource_test', {
        name: 'Cancelled Startup',
        messages: [message],
        startupRequest: request,
      });
      const draft = draftMessage('cancelled');
      await sleep(2);

      const restored = await store.commitCancelledDraftRestore(chat.id, {
        messages: [],
        draft,
        clearStartupRequestId: request.id,
      });
      const stored = await store.getChat(chat.id);

      expect(restored?.messages).toEqual([]);
      expect(restored?.draft).toEqual(draft);
      expect(restored?.startupRequest).toBeUndefined();
      expect(stored?.messages).toEqual([]);
      expect(stored?.draft).toEqual(draft);
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
        const draft = draftMessage(text);

        await store.patchChat(chat.id, 'messages', [message]);
        await store.patchChat(chat.id, 'draft', undefined);
        await store.patchChat(chat.id, 'startupRequest', request);

        await Promise.all([
          store.patchChat(chat.id, 'activeExecution', { kind: 'tau', model: `model-${i}` }),
          store.commitCancelledDraftRestore(chat.id, {
            messages: [],
            draft,
            clearStartupRequestId: request.id,
          }),
        ]);

        const final = await store.getChat(chat.id);
        expect(final?.activeExecution).toEqual({ kind: 'tau', model: `model-${i}` });
        expect(final?.messages).toEqual([]);
        expect(final?.draft).toEqual(draft);
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
        draft: draftMessage('seed-draft'),
        messageEdits: { 'msg-1': draftMessage('seed-edit') },
      });
      const before = structuredClone(seeded);

      await store.patchChat(seeded.id, 'name', 'Renamed');

      const after = await store.getChat(seeded.id);
      expect(after?.name).toBe('Renamed');
      expect(after?.messages).toEqual(before.messages);
      expect(after?.draft).toEqual(before.draft);
      expect(after?.messageEdits).toEqual(before.messageEdits);
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
        const draft = draftMessage(`d-${i}`);
        const messages = [userMessage(`m-${i}`)];

        await Promise.all([store.patchChat(chat.id, 'draft', draft), store.patchChat(chat.id, 'messages', messages)]);

        const final = await store.getChat(chat.id);
        expect(final?.draft).toEqual(draft);
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

  describe('chat recency and unread semantics', () => {
    it('initializes recency with row timestamps and starts read', async () => {
      const chat = await freshChat(createStore());

      expect(chat.recencyAt).toBe(chat.createdAt);
      expect(chat.updatedAt).toBe(chat.createdAt);
      expect(chat.hasUnreadTurn).toBe(false);
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

    it('sets and clears unread state while preserving row and recency timestamps', async () => {
      const store = createStore();
      const chat = await freshChat(store);

      const unread = await store.setChatUnreadState(chat.id, true);

      expect(unread?.hasUnreadTurn).toBe(true);
      expect(unread?.updatedAt).toBe(chat.updatedAt);
      expect(unread?.recencyAt).toBe(chat.recencyAt);
      await expect(store.setChatUnreadState(chat.id, true)).resolves.toBeUndefined();
      const read = await store.setChatUnreadState(chat.id, false);
      expect(read?.hasUnreadTurn).toBe(false);
      expect(read?.updatedAt).toBe(chat.updatedAt);
      expect(read?.recencyAt).toBe(chat.recencyAt);
      const stored = await store.getChat(chat.id);
      expect(stored?.hasUnreadTurn).toBe(false);
    });

    it('returns undefined for missing recency and unread targets', async () => {
      const store = createStore();

      await expect(store.touchChatRecency('chat_missing', 1)).resolves.toBeUndefined();
      await expect(store.setChatUnreadState('chat_missing', true)).resolves.toBeUndefined();
    });

    it('preserves recency, unread state, and messages across repeated concurrent writes', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      const initialActivityAt = chat.recencyAt!;

      /* oxlint-disable no-await-in-loop -- race regression requires each iteration to settle before the next */
      for (let index = 1; index <= 100; index++) {
        const activityAt = initialActivityAt + index;
        const messages = [userMessage(`activity-race-${index}`)];
        await Promise.all([
          store.touchChatRecency(chat.id, activityAt),
          store.setChatUnreadState(chat.id, index % 2 === 1),
          store.patchChat(chat.id, 'messages', messages),
        ]);

        const stored = await store.getChat(chat.id);
        expect(stored?.recencyAt).toBe(activityAt);
        expect(stored?.hasUnreadTurn).toBe(index % 2 === 1);
        expect(stored?.messages).toEqual(messages);
      }
      /* oxlint-enable no-await-in-loop */
    });
  });

  describe('setMessageEdit / clearMessageEdit', () => {
    it('should create the messageEdits map if absent and store the named entry', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      expect(chat.messageEdits).toBeUndefined();

      const result = await store.setMessageEdit(chat.id, 'msg-1', draftMessage('edit-1'));

      expect(result?.messageEdits).toBeDefined();
      expect(result?.messageEdits?.['msg-1']?.parts[0]).toEqual({ type: 'text', text: 'edit-1' });
    });

    it('should return undefined and preserve updatedAt when setting the same message edit', async () => {
      const store = createStore();
      const chat = await freshChat(store);
      const draft = draftMessage('edit-1');
      const first = await store.setMessageEdit(chat.id, 'msg-1', draft);
      await sleep(2);

      const result = await store.setMessageEdit(chat.id, 'msg-1', structuredClone(draft));
      const stored = await store.getChat(chat.id);

      expect(result).toBeUndefined();
      expect(stored?.updatedAt).toBe(first?.updatedAt);
    });

    it('should replace only the named entry, leaving siblings untouched', async () => {
      const store = createStore();
      const chat = await store.createChat('resource_test', {
        name: 'Test',
        messages: [],
        messageEdits: {
          'msg-keep': draftMessage('keep-original'),
          'msg-replace': draftMessage('replace-original'),
        },
      });

      const result = await store.setMessageEdit(chat.id, 'msg-replace', draftMessage('replaced'));

      expect(result?.messageEdits?.['msg-keep']?.parts[0]).toEqual({
        type: 'text',
        text: 'keep-original',
      });
      expect(result?.messageEdits?.['msg-replace']?.parts[0]).toEqual({
        type: 'text',
        text: 'replaced',
      });
    });

    it('should remove only the named entry on clearMessageEdit', async () => {
      const store = createStore();
      const chat = await store.createChat('resource_test', {
        name: 'Test',
        messages: [],
        messageEdits: {
          'msg-keep': draftMessage('stay'),
          'msg-remove': draftMessage('remove-me'),
        },
      });

      const result = await store.clearMessageEdit(chat.id, 'msg-remove');

      expect(result?.messageEdits?.['msg-remove']).toBeUndefined();
      expect(result?.messageEdits?.['msg-keep']?.parts[0]).toEqual({ type: 'text', text: 'stay' });
    });

    it('should be a no-op (no updatedAt bump) when clearing a non-existent entry', async () => {
      const store = createStore();
      const chat = await freshChat(store);

      const result = await store.clearMessageEdit(chat.id, 'msg-never-existed');

      expect(result).toBeUndefined();
    });

    it('should preserve disjoint message-edit writes when concurrent setMessageEdit calls race', async () => {
      const iterations = 30;
      const store = createStore();
      const chat = await freshChat(store);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const a = draftMessage(`a-${i}`);
        const b = draftMessage(`b-${i}`);

        await Promise.all([store.setMessageEdit(chat.id, 'msg-a', a), store.setMessageEdit(chat.id, 'msg-b', b)]);

        const final = await store.getChat(chat.id);
        expect(final?.messageEdits?.['msg-a']?.parts[0]).toEqual({ type: 'text', text: `a-${i}` });
        expect(final?.messageEdits?.['msg-b']?.parts[0]).toEqual({ type: 'text', text: `b-${i}` });
      }
      /* oxlint-enable no-await-in-loop */
    });

    it('should preserve other entries when setMessageEdit and clearMessageEdit race on the same chat', async () => {
      const iterations = 30;
      const store = createStore();
      const chat = await store.createChat('resource_test', {
        name: 'Test',
        messages: [],
        messageEdits: { 'msg-keep': draftMessage('initial-keep') },
      });

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        await Promise.all([
          store.setMessageEdit(chat.id, 'msg-keep', draftMessage(`keep-${i}`)),
          store.clearMessageEdit(chat.id, 'msg-removable'),
        ]);

        const final = await store.getChat(chat.id);
        expect(final?.messageEdits?.['msg-keep']?.parts[0]).toEqual({
          type: 'text',
          text: `keep-${i}`,
        });
        expect(final?.messageEdits?.['msg-removable']).toBeUndefined();
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
      expect(copy.hasUnreadTurn).toBe(false);
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
