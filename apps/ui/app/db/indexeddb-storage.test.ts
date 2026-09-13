// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError, Project } from '@taucad/types';
import { errorCategory } from '@taucad/types/constants';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';

// ===========================================================================
// Helpers
// ===========================================================================

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

const sampleError = (title: string): ChatError => ({
  category: errorCategory.generic,
  title,
  message: title,
});

const sampleProject = (
  overrides: Partial<Pick<Project, 'name' | 'description'>> = {},
): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: overrides.name ?? 'Test Project',
  description: overrides.description ?? 'test project',
  author: { name: 'tester', avatar: '' },
  tags: [],
  thumbnail: '',
  assets: { mechanical: { main: '/index.ts', parameters: {} } },
});

async function freshChat(provider: IndexedDbStorageProvider): Promise<Chat> {
  return provider.createChat('resource_test', {
    name: 'Test Chat',
    messages: [],
  });
}

async function freshProject(provider: IndexedDbStorageProvider): Promise<Project> {
  return provider.createProject(sampleProject());
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

// ===========================================================================
// Test setup -- reset fake IndexedDB between every test for full isolation.
// IndexedDbStorageProvider uses a fixed `tau-db` name, so we replace the
// global factory rather than using unique DB names per test.
// ===========================================================================

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('IndexedDbStorageProvider', () => {
  // =========================================================================
  // Concurrent updateChat preserves disjoint field writes
  // =========================================================================
  describe('chat draft resurrection — disjoint-field writes preserve every field', () => {
    // These tests reproduce the original "draft resurrection" race: a sent
    // draft was reappearing in the input field because two concurrent
    // updateChat({draft}) and updateChat({messages}) calls performed
    // get + put across two separate transactions. After atomic updateChat,
    // per-chatId mutex, and field-scoped patchChat the production
    // call sites use patchChat and the race is closed at every layer.
    it('should preserve both draft and messages when patchChat("draft") and patchChat("messages") race repeatedly', async () => {
      const iterations = 200;
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const text = `iter-${i}`;
        const draft = draftMessage(text);
        const messages = [userMessage(text)];

        await Promise.all([
          provider.patchChat(chat.id, 'draft', draft),
          provider.patchChat(chat.id, 'messages', messages),
        ]);

        const final = await provider.getChat(chat.id);
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
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const tag = `err-${i}`;
        const error = sampleError(tag);
        const messages = [userMessage(tag)];

        await Promise.all([
          provider.patchChat(chat.id, 'error', error),
          provider.patchChat(chat.id, 'messages', messages),
        ]);

        const final = await provider.getChat(chat.id);
        expect(final?.error?.title).toBe(tag);
        expect(final?.messages).toHaveLength(1);
        expect(final?.messages[0]?.parts[0]).toEqual({ type: 'text', text: tag });
      }
      /* oxlint-enable no-await-in-loop */
    });
  });

  // =========================================================================
  // Atomic single-transaction updateChat / updateProject
  // =========================================================================
  describe('updateChat atomic single-transaction semantics', () => {
    it('should return undefined when chat does not exist', async () => {
      const provider = new IndexedDbStorageProvider();
      const result = await provider.updateChat('chat_missing', { name: 'never' });
      expect(result).toBeUndefined();
    });

    it('should accept a full chat replacement when update.id matches chatId', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);
      const replacement: Chat = {
        ...chat,
        name: 'Replaced',
        messages: [userMessage('full')],
        updatedAt: chat.updatedAt + 1000,
      };

      const result = await provider.updateChat(chat.id, replacement);
      const stored = await provider.getChat(chat.id);

      expect(result?.name).toBe('Replaced');
      expect(stored?.name).toBe('Replaced');
      expect(stored?.messages).toEqual([userMessage('full')]);
    });

    it('should bump updatedAt by default and respect noUpdatedAt: true', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      // Wait a tick so Date.now() can advance past the createChat timestamp
      await sleep(2);

      const bumped = await provider.updateChat(chat.id, { name: 'bump' });
      expect(bumped?.updatedAt).toBeGreaterThan(chat.updatedAt);

      const preserved = await provider.updateChat(chat.id, { name: 'no-bump' }, { noUpdatedAt: true });
      expect(preserved?.updatedAt).toBe(bumped?.updatedAt);
    });
  });

  // =========================================================================
  // KeyedMutex serialises concurrent mutations per chatId
  // =========================================================================
  describe('per-chatId mutex serialises submissions', () => {
    it('should observe submission order on the resolved values when many writers race the same chat', async () => {
      const writers = 20;
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      const results = await Promise.all(
        Array.from({ length: writers }, async (_, index) => provider.patchChat(chat.id, 'name', `n-${index}`)),
      );

      // Each result should reflect a strictly increasing updatedAt. Mutex
      // submissions are FIFO so results[i].name === `n-${i}` and timestamps
      // are non-decreasing.
      const names = results.map((r) => r?.name);
      expect(names).toEqual(Array.from({ length: writers }, (_, index) => `n-${index}`));

      const stored = await provider.getChat(chat.id);
      expect(stored?.name).toBe(`n-${writers - 1}`);
    });
  });

  describe('updateProject atomic single-transaction semantics', () => {
    it('should return undefined when project does not exist', async () => {
      const provider = new IndexedDbStorageProvider();
      const result = await provider.updateProject('project_missing', { name: 'never' });
      expect(result).toBeUndefined();
    });

    it('should preserve both name and description when concurrent updateProject calls race', async () => {
      const iterations = 50;
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const name = `name-${i}`;
        const description = `desc-${i}`;

        await Promise.all([
          provider.updateProject(project.id, { name }),
          provider.updateProject(project.id, { description }),
        ]);

        const final = await provider.getProject(project.id);
        expect(final?.name).toBe(name);
        expect(final?.description).toBe(description);
      }
      /* oxlint-enable no-await-in-loop */
    });
  });

  // =========================================================================
  // touchProject + chat cascade → parent Project.updatedAt
  // =========================================================================
  describe('touchProject', () => {
    it('should bump updatedAt and leave other fields unchanged', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const nameBefore = project.name;
      await sleep(2);

      const result = await provider.touchProject(project.id);
      const stored = await provider.getProject(project.id);

      expect(result?.updatedAt).toBeGreaterThan(project.updatedAt);
      expect(stored?.name).toBe(nameBefore);
      expect(stored?.updatedAt).toBe(result?.updatedAt);
    });

    it('should return undefined when project does not exist', async () => {
      const provider = new IndexedDbStorageProvider();
      const result = await provider.touchProject('project_missing');
      expect(result).toBeUndefined();
    });

    it('should no-op when project is soft-deleted', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      await provider.deleteProject(project.id);
      const afterDelete = await provider.getProject(project.id);
      expect(afterDelete?.deletedAt).toBeDefined();

      const touchResult = await provider.touchProject(project.id);
      expect(touchResult).toBeUndefined();

      const afterTouch = await provider.getProject(project.id);
      expect(afterTouch?.updatedAt).toBe(afterDelete?.updatedAt);
    });

    it('should serialize concurrent touchProject calls on the same project', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);

      await Promise.all(
        Array.from({ length: 30 }, async () => {
          await provider.touchProject(project.id);
        }),
      );

      const stored = await provider.getProject(project.id);
      expect(stored?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
    });
  });

  describe('chat activity cascades to parent Project.updatedAt', () => {
    it('should bump project when createChat completes', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const before = project.updatedAt;
      await sleep(2);

      const chat = await provider.createChat(project.id, { name: 'New', messages: [] });
      const proj = await provider.getProject(project.id);

      expect(proj?.updatedAt).toBeGreaterThan(before);
      expect(proj?.updatedAt).toBeGreaterThanOrEqual(chat.updatedAt);
    });

    it('should bump project on updateChat by default and not when noUpdatedAt', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const chat = await provider.createChat(project.id, { name: 'A', messages: [] });
      await sleep(2);

      const afterCreate = (await provider.getProject(project.id))!.updatedAt;

      const bumped = await provider.updateChat(chat.id, { name: 'B' });
      const projAfterBump = await provider.getProject(project.id);
      expect(projAfterBump?.updatedAt).toBeGreaterThan(afterCreate);
      expect(projAfterBump?.updatedAt).toBeGreaterThanOrEqual(bumped!.updatedAt);

      const frozen = await provider.updateChat(chat.id, { name: 'C' }, { noUpdatedAt: true });
      const projAfterNoBump = await provider.getProject(project.id);
      expect(projAfterNoBump?.updatedAt).toBe(projAfterBump?.updatedAt);
      expect(frozen?.updatedAt).toBe(bumped?.updatedAt);
    });

    it('should bump project on patchChat', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const chat = await provider.createChat(project.id, { name: 'x', messages: [] });
      const p0 = (await provider.getProject(project.id))!.updatedAt;
      await sleep(2);

      await provider.patchChat(chat.id, 'messages', [userMessage('hi')]);
      const p1 = (await provider.getProject(project.id))!.updatedAt;
      expect(p1).toBeGreaterThan(p0);
    });

    it('should not bump project when clearMessageEdit is a no-op', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const chat = await provider.createChat(project.id, { name: 'x', messages: [] });
      const p0 = (await provider.getProject(project.id))!.updatedAt;
      await sleep(2);

      await provider.clearMessageEdit(chat.id, 'nonexistent');
      const p1 = (await provider.getProject(project.id))!.updatedAt;
      expect(p1).toBe(p0);
    });

    it('should bump project on softDeleteChat', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const chat = await provider.createChat(project.id, { name: 'x', messages: [] });
      const p0 = (await provider.getProject(project.id))!.updatedAt;
      await sleep(2);

      await provider.softDeleteChat(chat.id);
      const p1 = (await provider.getProject(project.id))!.updatedAt;
      expect(p1).toBeGreaterThan(p0);
    });

    it('should not bump soft-deleted project when chat is patched', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const chat = await provider.createChat(project.id, { name: 'x', messages: [] });
      await provider.deleteProject(project.id);
      const pDeleted = await provider.getProject(project.id);
      const frozenUpdatedAt = pDeleted!.updatedAt;
      await sleep(2);

      await provider.patchChat(chat.id, 'name', 'renamed');
      const pAfter = await provider.getProject(project.id);
      expect(pAfter?.updatedAt).toBe(frozenUpdatedAt);
    });
  });

  // =========================================================================
  // patchChat<K extends keyof Chat>
  // =========================================================================
  describe('patchChat field-scoped writer', () => {
    it('should write only the named field, leaving every other field byte-identical', async () => {
      const provider = new IndexedDbStorageProvider();
      const seeded = await provider.createChat('resource_test', {
        name: 'Original',
        messages: [userMessage('hello')],
        draft: draftMessage('seed-draft'),
        messageEdits: { 'msg-1': draftMessage('seed-edit') },
      });
      const before = structuredClone(seeded);

      await provider.patchChat(seeded.id, 'name', 'Renamed');

      const after = await provider.getChat(seeded.id);
      expect(after?.name).toBe('Renamed');
      expect(after?.messages).toEqual(before.messages);
      expect(after?.draft).toEqual(before.draft);
      expect(after?.messageEdits).toEqual(before.messageEdits);
      expect(after?.id).toBe(before.id);
      expect(after?.resourceId).toBe(before.resourceId);
      expect(after?.createdAt).toBe(before.createdAt);
    });

    it('should bump updatedAt', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);
      await sleep(2);

      const result = await provider.patchChat(chat.id, 'name', 'Bumped');
      expect(result?.updatedAt).toBeGreaterThan(chat.updatedAt);
    });

    it('should return undefined when chat does not exist', async () => {
      const provider = new IndexedDbStorageProvider();
      const result = await provider.patchChat('chat_missing', 'name', 'Whatever');
      expect(result).toBeUndefined();
    });

    it('should preserve both writes when patchChat for different keys race', async () => {
      const iterations = 100;
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const draft = draftMessage(`d-${i}`);
        const messages = [userMessage(`m-${i}`)];

        await Promise.all([
          provider.patchChat(chat.id, 'draft', draft),
          provider.patchChat(chat.id, 'messages', messages),
        ]);

        const final = await provider.getChat(chat.id);
        expect(final?.draft).toEqual(draft);
        expect(final?.messages).toEqual(messages);
      }
      /* oxlint-enable no-await-in-loop */
    });

    it('should clear an optional field when value is undefined', async () => {
      const provider = new IndexedDbStorageProvider();
      const seeded = await provider.createChat('resource_test', {
        name: 'WithError',
        messages: [],
        error: sampleError('bad'),
      });
      expect(seeded.error?.title).toBe('bad');

      await provider.patchChat(seeded.id, 'error', undefined);

      const after = await provider.getChat(seeded.id);
      expect(after?.error).toBeUndefined();
    });
  });

  // =========================================================================
  // setMessageEdit / clearMessageEdit
  // =========================================================================
  describe('setMessageEdit / clearMessageEdit', () => {
    it('should create the messageEdits map if absent and store the named entry', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);
      expect(chat.messageEdits).toBeUndefined();

      const result = await provider.setMessageEdit(chat.id, 'msg-1', draftMessage('edit-1'));

      expect(result?.messageEdits).toBeDefined();
      expect(result?.messageEdits?.['msg-1']?.parts[0]).toEqual({ type: 'text', text: 'edit-1' });
    });

    it('should replace only the named entry, leaving siblings untouched', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'Test',
        messages: [],
        messageEdits: {
          'msg-keep': draftMessage('keep-original'),
          'msg-replace': draftMessage('replace-original'),
        },
      });

      const result = await provider.setMessageEdit(chat.id, 'msg-replace', draftMessage('replaced'));

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
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'Test',
        messages: [],
        messageEdits: {
          'msg-keep': draftMessage('stay'),
          'msg-remove': draftMessage('remove-me'),
        },
      });

      const result = await provider.clearMessageEdit(chat.id, 'msg-remove');

      expect(result?.messageEdits?.['msg-remove']).toBeUndefined();
      expect(result?.messageEdits?.['msg-keep']?.parts[0]).toEqual({ type: 'text', text: 'stay' });
    });

    it('should be a no-op (no updatedAt bump) when clearing a non-existent entry', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      const result = await provider.clearMessageEdit(chat.id, 'msg-never-existed');

      expect(result?.updatedAt).toBe(chat.updatedAt);
    });

    it('should preserve disjoint message-edit writes when concurrent setMessageEdit calls race', async () => {
      const iterations = 30;
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const a = draftMessage(`a-${i}`);
        const b = draftMessage(`b-${i}`);

        await Promise.all([provider.setMessageEdit(chat.id, 'msg-a', a), provider.setMessageEdit(chat.id, 'msg-b', b)]);

        const final = await provider.getChat(chat.id);
        expect(final?.messageEdits?.['msg-a']?.parts[0]).toEqual({ type: 'text', text: `a-${i}` });
        expect(final?.messageEdits?.['msg-b']?.parts[0]).toEqual({ type: 'text', text: `b-${i}` });
      }
      /* oxlint-enable no-await-in-loop */
    });

    it('should preserve other entries when setMessageEdit and clearMessageEdit race on the same chat', async () => {
      const iterations = 30;
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'Test',
        messages: [],
        messageEdits: { 'msg-keep': draftMessage('initial-keep') },
      });

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        await Promise.all([
          provider.setMessageEdit(chat.id, 'msg-keep', draftMessage(`keep-${i}`)),
          provider.clearMessageEdit(chat.id, 'msg-removable'),
        ]);

        const final = await provider.getChat(chat.id);
        expect(final?.messageEdits?.['msg-keep']?.parts[0]).toEqual({
          type: 'text',
          text: `keep-${i}`,
        });
        expect(final?.messageEdits?.['msg-removable']).toBeUndefined();
      }
      /* oxlint-enable no-await-in-loop */
    });
  });

  // =========================================================================
  // Chat.activeModel + Chat.activeKernel are first-class fields
  // and patchChat round-trips them just like every other top-level field.
  // =========================================================================
  describe('activeModel + activeKernel are top-level Chat fields', () => {
    it('should round-trip activeModel through patchChat', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      const result = await provider.patchChat(chat.id, 'activeModel', 'gpt-5.4-medium');

      expect(result?.activeModel).toBe('gpt-5.4-medium');
      const stored = await provider.getChat(chat.id);
      expect(stored?.activeModel).toBe('gpt-5.4-medium');
    });

    it('should round-trip activeKernel through patchChat', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      const result = await provider.patchChat(chat.id, 'activeKernel', 'manifold');

      expect(result?.activeKernel).toBe('manifold');
      const stored = await provider.getChat(chat.id);
      expect(stored?.activeKernel).toBe('manifold');
    });

    it('should clear activeModel when patched with undefined', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'WithModel',
        messages: [],
        activeModel: 'seed-model',
      });
      expect(chat.activeModel).toBe('seed-model');

      await provider.patchChat(chat.id, 'activeModel', undefined);

      const stored = await provider.getChat(chat.id);
      expect(stored?.activeModel).toBeUndefined();
    });

    it('should preserve activeModel when patching an unrelated field', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'WithModel',
        messages: [],
        activeModel: 'gpt-5.4-medium',
        activeKernel: 'manifold',
      });

      await provider.patchChat(chat.id, 'name', 'Renamed');

      const stored = await provider.getChat(chat.id);
      expect(stored?.activeModel).toBe('gpt-5.4-medium');
      expect(stored?.activeKernel).toBe('manifold');
    });
  });

  // =========================================================================
  // duplicateChat carries activeModel + activeKernel onto the copy.
  // =========================================================================
  describe('duplicateChat carries activeModel + activeKernel', () => {
    it('should copy activeModel and activeKernel into the duplicated chat', async () => {
      const provider = new IndexedDbStorageProvider();
      const original = await provider.createChat('resource_test', {
        name: 'Original',
        messages: [],
        activeModel: 'gpt-5.4-medium',
        activeKernel: 'manifold',
      });

      const copy = await provider.duplicateChat(original.id);

      expect(copy.id).not.toBe(original.id);
      expect(copy.activeModel).toBe('gpt-5.4-medium');
      expect(copy.activeKernel).toBe('manifold');
    });

    it('should leave duplicate fields undefined when the source chat had none', async () => {
      const provider = new IndexedDbStorageProvider();
      const original = await provider.createChat('resource_test', {
        name: 'Original',
        messages: [],
      });

      const copy = await provider.duplicateChat(original.id);

      expect(copy.activeModel).toBeUndefined();
      expect(copy.activeKernel).toBeUndefined();
    });
  });

  // =========================================================================
  // softDeleteChat
  // =========================================================================
  describe('softDeleteChat', () => {
    it('should set deletedAt and bump updatedAt atomically', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);
      await sleep(2);

      const result = await provider.softDeleteChat(chat.id);

      expect(result?.deletedAt).toBeDefined();
      expect(result?.deletedAt).toBeGreaterThanOrEqual(chat.createdAt);
      expect(result?.updatedAt).toBeGreaterThan(chat.updatedAt);
    });

    it('should return undefined when chat does not exist', async () => {
      const provider = new IndexedDbStorageProvider();
      const result = await provider.softDeleteChat('chat_missing');
      expect(result).toBeUndefined();
    });
  });
});
