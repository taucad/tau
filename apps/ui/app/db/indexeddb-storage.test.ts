// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError, ProjectManifest } from '@taucad/types';
import { projectToManifest } from '@taucad/types';
import { errorCategory } from '@taucad/types/constants';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import { defaultPanelState } from '#constants/editor.constants.js';
import type { PendingProjectOperation } from '#types/pending-project-operation.types.js';
import type { EditorState } from '#types/editor.types.js';
import type { ProjectLibraryState } from '#types/project.types.js';

const projectOneId = 'proj_one';
const projectTwoId = 'proj_two';

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

let projectSequence = 0;

const nextProjectId = (): string => `proj_${String(projectSequence++).padStart(21, '0')}`;

const sampleManifest = (id = nextProjectId()): ProjectManifest =>
  projectToManifest({
    id,
    name: 'Test Project',
    description: 'test project',
    tags: [],
    assets: { main: { entryPath: 'index.ts' } },
  });

async function freshChat(provider: IndexedDbStorageProvider): Promise<Chat> {
  return provider.createChat('resource_test', {
    name: 'Test Chat',
    messages: [],
  });
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

type TrackedConnection = { readonly db: IDBDatabase; closeCalls: number };

/** Record every connection the provider opens so leaks are observable. */
const trackConnections = (): TrackedConnection[] => {
  const factory = globalThis.indexedDB;
  const openDatabase = factory.open.bind(factory);
  const connections: TrackedConnection[] = [];
  factory.open = ((name: string, version?: number) => {
    const request = openDatabase(name, version);
    request.addEventListener('success', () => {
      const { result: db } = request;
      const entry: TrackedConnection = { db, closeCalls: 0 };
      const close = db.close.bind(db);
      db.close = () => {
        entry.closeCalls++;
        close();
      };
      connections.push(entry);
    });
    return request;
  }) as typeof factory.open;
  return connections;
};

/** Create the pre-v8 database and keep the connection open, as a stale tab would. */
const openStaleLegacyConnection = async (): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('tau-db', 7);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('chats', { keyPath: 'id' }).createIndex('resourceId', 'resourceId', { unique: false });
      db.createObjectStore('editor', { keyPath: 'projectId' });
      db.createObjectStore('pendingProjectOperations', { keyPath: 'operationId' });
      db.createObjectStore('projectLibraryStates', { keyPath: 'projectId' });
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to create the legacy database fixture'));
    });
  });

// ===========================================================================
// Test setup -- reset fake IndexedDB between every test for full isolation.
// IndexedDbStorageProvider uses a fixed `tau-db` name, so we replace the
// global factory rather than using unique DB names per test.
// ===========================================================================

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  projectSequence = 0;
});

describe('IndexedDbStorageProvider', () => {
  // The v10 cutover preserves durable domain rows, adds browser-local chrome
  // preferences, and intentionally clears the incompatible editor layout.
  it('upgrades v9 to v10, preserves domain rows, and clears editor layout rows', async () => {
    const libraryRow: ProjectLibraryState = { projectId: 'proj_kept0000000000000000', lastActivityAt: 42 };
    const chatRow = { id: 'cht_kept', resourceId: 'proj_kept0000000000000000', name: 'Kept chat', messages: [] };
    const editorRow: EditorState = {
      projectId: libraryRow.projectId,
      openFiles: [],
      activePaneId: undefined,
      focusedChatId: chatRow.id,
      panelState: defaultPanelState,
      workbenchLayout: undefined,
      viewerLayout: undefined,
      viewSettings: {},
      updatedAt: 42,
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('tau-db', 9);
      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        const chats = db.createObjectStore('chats', { keyPath: 'id' });
        chats.createIndex('resourceId', 'resourceId', { unique: false });
        chats.put(chatRow);
        db.createObjectStore('editor', { keyPath: 'projectId' }).put(editorRow);
        db.createObjectStore('pendingProjectOperations', { keyPath: 'operationId' });
        db.createObjectStore('projectLibraryStates', { keyPath: 'projectId' }).put(libraryRow);
      });
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to create the v8 database fixture'));
      });
    });

    const provider = new IndexedDbStorageProvider();
    await expect(provider.getProjectLibraryState(libraryRow.projectId)).resolves.toEqual(libraryRow);
    await expect(provider.getChat(chatRow.id)).resolves.toMatchObject({ id: chatRow.id, name: chatRow.name });
    await expect(provider.getEditorState(libraryRow.projectId)).resolves.toBeUndefined();
    await expect(provider.getAppUiPreferences()).resolves.toEqual({ id: 'singleton', projectDisclosure: {} });

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tau-db');
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to reopen the database'));
      });
    });
    expect(upgraded.version).toBe(10);
    expect([...upgraded.objectStoreNames]).toContain('appUiPreferences');
    upgraded.close();
  });

  // A profile that never had the database gets the same stores from the same
  // handler — there is no version-conditional branch left to diverge.
  it('bootstraps every current store on a fresh profile', async () => {
    const provider = new IndexedDbStorageProvider();
    await provider.getProjectLibraryState('proj_missing');

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tau-db');
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to open the database'));
      });
    });
    expect(db.version).toBe(10);
    expect([...db.objectStoreNames].sort()).toEqual([
      'appUiPreferences',
      'chats',
      'editor',
      'pendingProjectOperations',
      'projectLibraryStates',
    ]);
    expect([...db.transaction('chats').objectStore('chats').indexNames]).toEqual(['resourceId']);
    db.close();
  });

  describe('application UI preferences', () => {
    it('persists sparse disclosure overrides and skips no-op writes', async () => {
      const provider = new IndexedDbStorageProvider();

      await expect(provider.getAppUiPreferences()).resolves.toEqual({ id: 'singleton', projectDisclosure: {} });
      await expect(provider.setProjectDisclosure(projectOneId, true)).resolves.toEqual({
        id: 'singleton',
        projectDisclosure: { [projectOneId]: true },
      });
      await expect(new IndexedDbStorageProvider().getAppUiPreferences()).resolves.toEqual({
        id: 'singleton',
        projectDisclosure: { [projectOneId]: true },
      });
      await expect(provider.setProjectDisclosure(projectOneId, true)).resolves.toBeUndefined();
      await expect(provider.setProjectDisclosure(projectOneId, undefined)).resolves.toEqual({
        id: 'singleton',
        projectDisclosure: {},
      });
      await expect(provider.setProjectDisclosure(projectOneId, undefined)).resolves.toBeUndefined();
    });

    it('serialises concurrent field writes to the singleton row', async () => {
      const provider = new IndexedDbStorageProvider();

      for (let iteration = 0; iteration < 100; iteration++) {
        const firstExpanded = iteration % 2 === 0;
        // oxlint-disable-next-line no-await-in-loop -- each iteration verifies one complete serialised update.
        await Promise.all([
          provider.setProjectDisclosure(projectOneId, firstExpanded),
          provider.setProjectDisclosure(projectTwoId, !firstExpanded),
        ]);
        // oxlint-disable-next-line no-await-in-loop -- read after the iteration's writes have settled.
        await expect(provider.getAppUiPreferences()).resolves.toEqual({
          id: 'singleton',
          projectDisclosure: { [projectOneId]: firstExpanded, [projectTwoId]: !firstExpanded },
        });
      }
    });
  });

  it('reads all non-deleted chats without adding an index', async () => {
    const provider = new IndexedDbStorageProvider();
    const first = await provider.createChat('proj_one', { name: 'First', messages: [] });
    const second = await provider.createChat('proj_two', { name: 'Second', messages: [] });
    await provider.softDeleteChat(second.id);

    await expect(provider.getAllChats()).resolves.toMatchObject([{ id: first.id }]);
    await expect(provider.getAllChats({ includeDeleted: true })).resolves.toHaveLength(2);
  });

  // =========================================================================
  // Connection hygiene (DF17): a leaked or upgrade-blocking connection wedges
  // every later schema bump behind a spinner.
  // =========================================================================
  describe('connection hygiene', () => {
    it('closes the connection when another tab requests a version upgrade', async () => {
      const connections = trackConnections();
      const provider = new IndexedDbStorageProvider();
      await provider.getProjectLibraryState('proj_missing');

      expect(connections).toHaveLength(1);
      const tracked = connections[0]!;
      const closesBefore = tracked.closeCalls;
      expect(tracked.db.onversionchange).toBeTypeOf('function');
      tracked.db.onversionchange?.(new Event('versionchange') as unknown as IDBVersionChangeEvent);
      expect(tracked.closeCalls).toBeGreaterThan(closesBefore);
    });

    it('rejects a blocked upgrade with an actionable close-other-tabs error', async () => {
      const stale = await openStaleLegacyConnection();
      const provider = new IndexedDbStorageProvider();

      await expect(provider.getProjectLibraryState('proj_missing')).rejects.toThrow(/other tau tabs/i);
      stale.close();
    });

    it('closes the connection when a transaction aborts', async () => {
      const connections = trackConnections();
      const provider = new IndexedDbStorageProvider();

      await expect(
        provider.createProjectLibraryState({
          projectId: nextProjectId(),
          lastActivityAt: 1,
          // A function is unclonable, so `add` throws and the transaction aborts.
          revisionState: (() => undefined) as unknown as ProjectLibraryState['revisionState'],
        }),
      ).rejects.toThrow();

      expect(connections).toHaveLength(1);
      expect(connections[0]!.closeCalls).toBeGreaterThan(0);
    });
  });

  describe('pending project operations', () => {
    it('round-trips and removes an exact replay record', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const manifest = sampleManifest();
      const operation: PendingProjectOperation = {
        operationId: 'req_pending_create',
        kind: 'duplicate',
        backend: 'opfs',
        providerBasePath: 'test',
        sourceProjectId: project.projectId,
        manifest,
        library: { projectId: manifest.id, lastActivityAt: 3 },
        files: { 'main.ts': { content: new Uint8Array([1]) } },
        chats: [],
      };

      await provider.putPendingProjectOperation(operation);
      const expectedOperation = structuredClone(operation);

      expect(structuredClone(await provider.getPendingProjectOperation(operation.operationId))).toEqual(
        expectedOperation,
      );
      expect(structuredClone(await provider.getPendingProjectOperations())).toEqual([expectedOperation]);

      await provider.deletePendingProjectOperation(operation.operationId);
      expect(await provider.getPendingProjectOperations()).toEqual([]);
    });

    it('uses idempotent puts for replayed chat and editor records', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat: Chat = {
        id: 'chat_replay',
        resourceId: 'proj_replay',
        name: 'Replay',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      };
      const editorState: EditorState = {
        projectId: chat.resourceId,
        openFiles: [],
        activePaneId: undefined,
        focusedChatId: chat.id,
        panelState: defaultPanelState,
        workbenchLayout: undefined,
        viewerLayout: undefined,
        viewSettings: {},
        updatedAt: 1,
      };

      await provider.putChatRecord(chat);
      await provider.putChatRecord(chat);
      await provider.putEditorStateRecord(editorState);
      await provider.putEditorStateRecord(editorState);

      expect(await provider.getChatsForResource(chat.resourceId)).toEqual([chat]);
      expect(await provider.getEditorState(chat.resourceId)).toEqual(editorState);
    });

    it('admits permanent deletion only while the project is atomically trashed', async () => {
      const provider = new IndexedDbStorageProvider();
      const project = await freshProject(provider);
      const operation = {
        operationId: 'req_permanent_delete',
        kind: 'permanent-delete',
        projectId: project.projectId,
        storage: { backend: 'indexeddb', providerBasePath: 'delete' },
      } as const;

      await expect(provider.beginPermanentDeleteProject(operation)).rejects.toThrow(
        'Permanent delete is available only for trashed projects',
      );
      expect(await provider.getPendingProjectOperations()).toEqual([]);

      await provider.trashProject(project.projectId, 42);
      await provider.beginPermanentDeleteProject(operation);
      await expect(provider.restoreProject(project.projectId)).rejects.toThrow(
        'Cannot restore project while permanent deletion is pending',
      );
      expect(await provider.getProjectLibraryState(project.projectId)).toMatchObject({ deletedAt: 42 });
      expect(await provider.getPendingProjectOperations()).toEqual([operation]);
    });

    it('serializes restore against permanent-delete admission across storage instances', async () => {
      const first = new IndexedDbStorageProvider();
      const second = new IndexedDbStorageProvider();
      const project = await freshProject(first);
      await first.trashProject(project.projectId, 42);
      const operation = {
        operationId: 'req_permanent_delete_race',
        kind: 'permanent-delete',
        projectId: project.projectId,
        storage: { backend: 'opfs', providerBasePath: 'delete' },
      } as const;

      const [begin, restore] = await Promise.allSettled([
        first.beginPermanentDeleteProject(operation),
        second.restoreProject(project.projectId),
      ]);
      const finalState = await first.getProjectLibraryState(project.projectId);
      const pending = await first.getPendingProjectOperations();

      expect([begin.status, restore.status].sort()).toEqual(['fulfilled', 'rejected']);
      if (begin.status === 'fulfilled') {
        expect(finalState?.deletedAt).toBe(42);
        expect(pending).toEqual([operation]);
      } else {
        expect(finalState?.deletedAt).toBeUndefined();
        expect(pending).toEqual([]);
      }
    });
  });

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

    it('should bump updatedAt for material changes and return undefined for no-op updates', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      await sleep(2);

      const bumped = await provider.updateChat(chat.id, { name: 'bump' });
      expect(bumped?.updatedAt).toBeGreaterThan(chat.updatedAt);

      await sleep(2);
      const noChange = await provider.updateChat(chat.id, { name: 'bump' });
      const stored = await provider.getChat(chat.id);
      expect(noChange).toBeUndefined();
      expect(stored?.updatedAt).toBe(bumped?.updatedAt);
    });
  });

  describe('chat startup and cancelled-draft atomic mutations', () => {
    it('should consume a matching startup request exactly once', async () => {
      const provider = new IndexedDbStorageProvider();
      const message = userMessage('initial');
      const request = startupRequest(message.id);
      const chat = await provider.createChat('resource_test', {
        name: 'Startup Chat',
        messages: [message],
        startupRequest: request,
      });

      const consumed = await provider.consumeChatStartupRequest(chat.id, request.id);
      const storedAfterConsume = await provider.getChat(chat.id);
      const staleConsume = await provider.consumeChatStartupRequest(chat.id, request.id);

      expect(consumed?.startupRequest).toBeUndefined();
      expect(storedAfterConsume?.startupRequest).toBeUndefined();
      expect(staleConsume).toBeUndefined();
    });

    it('should no-op when the startup request id is stale', async () => {
      const provider = new IndexedDbStorageProvider();
      const message = userMessage('initial');
      const request = startupRequest(message.id);
      const chat = await provider.createChat('resource_test', {
        name: 'Startup Chat',
        messages: [message],
        startupRequest: request,
      });

      const result = await provider.consumeChatStartupRequest(chat.id, 'req_stale');
      const stored = await provider.getChat(chat.id);

      expect(result).toBeUndefined();
      expect(stored?.startupRequest).toEqual(request);
      expect(stored?.updatedAt).toBe(chat.updatedAt);
    });

    it('should commit restored messages, draft, and startup cleanup together', async () => {
      const provider = new IndexedDbStorageProvider();
      const message = userMessage('cancelled');
      const request = startupRequest(message.id);
      const chat = await provider.createChat('resource_test', {
        name: 'Cancelled Startup',
        messages: [message],
        startupRequest: request,
      });
      const draft = draftMessage('cancelled');
      await sleep(2);

      const restored = await provider.commitCancelledDraftRestore(chat.id, {
        messages: [],
        draft,
        clearStartupRequestId: request.id,
      });
      const stored = await provider.getChat(chat.id);

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
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      /* oxlint-disable no-await-in-loop -- race-detection: each iteration must settle before the next */
      for (let i = 0; i < iterations; i++) {
        const text = `cancelled-${i}`;
        const message = userMessage(text);
        const request = startupRequest(message.id, `req_restore_${i}`);
        const draft = draftMessage(text);

        await provider.patchChat(chat.id, 'messages', [message]);
        await provider.patchChat(chat.id, 'draft', undefined);
        await provider.patchChat(chat.id, 'startupRequest', request);

        await Promise.all([
          provider.patchChat(chat.id, 'activeExecution', { kind: 'tau', model: `model-${i}` }),
          provider.commitCancelledDraftRestore(chat.id, {
            messages: [],
            draft,
            clearStartupRequestId: request.id,
          }),
        ]);

        const final = await provider.getChat(chat.id);
        expect(final?.activeExecution).toEqual({ kind: 'tau', model: `model-${i}` });
        expect(final?.messages).toEqual([]);
        expect(final?.draft).toEqual(draft);
        expect(final?.startupRequest).toBeUndefined();
      }
      /* oxlint-enable no-await-in-loop */
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

  describe('project library state', () => {
    it('creates missing library rows in one idempotent batch', async () => {
      const provider = new IndexedDbStorageProvider();
      await provider.createProjectLibraryState({ projectId: projectOneId, lastActivityAt: 1 });

      const states = await provider.createProjectLibraryStates([
        { projectId: projectOneId, lastActivityAt: 999 },
        { projectId: projectTwoId, lastActivityAt: 2 },
      ]);

      expect(states).toEqual([
        { projectId: projectOneId, lastActivityAt: 1 },
        { projectId: projectTwoId, lastActivityAt: 2 },
      ]);
      await expect(provider.getProjectLibraryStates([projectOneId, projectTwoId])).resolves.toHaveLength(2);
    });

    it('creates idempotently without overwriting an existing row', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);

      const result = await provider.createProjectLibraryState({
        projectId: state.projectId,
        lastActivityAt: 999,
      });

      expect(result).toEqual(state);
      expect(await provider.getProjectLibraryState(state.projectId)).toEqual(state);
    });

    it('keeps activity monotonic and preserves deletion/revision fields', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);
      const revisionState = { headTurnId: 'turn_1', supersededTurnIds: ['turn_0'], dirty: true };
      await provider.setProjectRevisionState(state.projectId, revisionState);
      await provider.trashProject(state.projectId, 50);

      await provider.touchProjectActivity(state.projectId, 40);
      expect(await provider.getProjectLibraryState(state.projectId)).toEqual({
        projectId: state.projectId,
        lastActivityAt: 40,
        deletedAt: 50,
        revisionState,
      });

      await provider.touchProjectActivity(state.projectId, 30);
      const stored = await provider.getProjectLibraryState(state.projectId);
      expect(stored?.lastActivityAt).toBe(40);
    });

    it('trashes and restores by mutating only deletedAt', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);
      const revisionState = { headTurnId: 'turn_1', supersededTurnIds: [], dirty: false };
      await provider.setProjectRevisionState(state.projectId, revisionState);

      expect(await provider.trashProject(state.projectId, 10)).toEqual({
        ...state,
        deletedAt: 10,
        revisionState,
      });
      expect(await provider.restoreProject(state.projectId)).toEqual({ ...state, revisionState });
    });

    it('returns undefined for field mutations on a missing row', async () => {
      const provider = new IndexedDbStorageProvider();

      await expect(provider.touchProjectActivity('proj_missing', 1)).resolves.toBeUndefined();
      await expect(provider.trashProject('proj_missing', 1)).resolves.toBeUndefined();
      await expect(provider.restoreProject('proj_missing')).resolves.toBeUndefined();
    });

    it('never changes activity from chat persistence', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);
      const chat = await provider.createChat(state.projectId, { name: 'A', messages: [] });
      await provider.updateChat(chat.id, { name: 'B' });
      await provider.patchChat(chat.id, 'messages', [userMessage('hi')]);
      await provider.softDeleteChat(chat.id);

      expect(await provider.getProjectLibraryState(state.projectId)).toEqual(state);
    });

    it('preserves activity when applying a generated navigation chat name', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);
      const chat = await provider.createNavigationRepairChat(state.projectId);

      const result = await provider.applyGeneratedChatName(chat.id, 'Generated Bracket');

      expect(result?.name).toBe('Generated Bracket');
      expect(result?.updatedAt).toBe(chat.updatedAt);
      expect(await provider.getProjectLibraryState(state.projectId)).toEqual(state);
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

    it('should return undefined and preserve updatedAt when the field value is unchanged', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);
      await sleep(2);

      const result = await provider.patchChat(chat.id, 'name', chat.name);
      const stored = await provider.getChat(chat.id);

      expect(result).toBeUndefined();
      expect(stored?.updatedAt).toBe(chat.updatedAt);
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

    it('should return undefined and preserve updatedAt when setting the same message edit', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);
      const draft = draftMessage('edit-1');
      const first = await provider.setMessageEdit(chat.id, 'msg-1', draft);
      await sleep(2);

      const result = await provider.setMessageEdit(chat.id, 'msg-1', structuredClone(draft));
      const stored = await provider.getChat(chat.id);

      expect(result).toBeUndefined();
      expect(stored?.updatedAt).toBe(first?.updatedAt);
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

      expect(result).toBeUndefined();
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
  // Chat.activeExecution + Chat.activeKernel are first-class fields
  // and patchChat round-trips them just like every other top-level field.
  // =========================================================================
  describe('activeExecution + activeKernel are top-level Chat fields', () => {
    it('should round-trip activeExecution through patchChat', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      const execution = { kind: 'tau', model: 'gpt-5.4-medium' } as const;
      const result = await provider.patchChat(chat.id, 'activeExecution', execution);

      expect(result?.activeExecution).toEqual(execution);
      const stored = await provider.getChat(chat.id);
      expect(stored?.activeExecution).toEqual(execution);
    });

    it('should round-trip activeKernel through patchChat', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await freshChat(provider);

      const result = await provider.patchChat(chat.id, 'activeKernel', 'manifold');

      expect(result?.activeKernel).toBe('manifold');
      const stored = await provider.getChat(chat.id);
      expect(stored?.activeKernel).toBe('manifold');
    });

    it('should clear activeExecution when patched with undefined', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'WithModel',
        messages: [],
        activeExecution: { kind: 'tau', model: 'seed-model' },
      });
      expect(chat.activeExecution).toEqual({ kind: 'tau', model: 'seed-model' });

      await provider.patchChat(chat.id, 'activeExecution', undefined);

      const stored = await provider.getChat(chat.id);
      expect(stored?.activeExecution).toBeUndefined();
    });

    it('should preserve activeExecution when patching an unrelated field', async () => {
      const provider = new IndexedDbStorageProvider();
      const chat = await provider.createChat('resource_test', {
        name: 'WithModel',
        messages: [],
        activeExecution: { kind: 'paseo', connectionId: 'connection-1', agentId: 'claude' },
        activeKernel: 'manifold',
      });

      await provider.patchChat(chat.id, 'name', 'Renamed');

      const stored = await provider.getChat(chat.id);
      expect(stored?.activeExecution).toEqual({ kind: 'paseo', connectionId: 'connection-1', agentId: 'claude' });
      expect(stored?.activeKernel).toBe('manifold');
    });
  });

  // =========================================================================
  // duplicateChat carries activeExecution + activeKernel onto the copy.
  // =========================================================================
  describe('duplicateChat carries activeExecution + activeKernel', () => {
    it('should copy activeExecution and activeKernel into the duplicated chat', async () => {
      const provider = new IndexedDbStorageProvider();
      const original = await provider.createChat('resource_test', {
        name: 'Original',
        messages: [],
        activeExecution: { kind: 'tau', model: 'gpt-5.4-medium' },
        activeKernel: 'manifold',
      });

      const copy = await provider.duplicateChat(original.id);

      expect(copy.id).not.toBe(original.id);
      expect(copy.activeExecution).toEqual({ kind: 'tau', model: 'gpt-5.4-medium' });
      expect(copy.activeKernel).toBe('manifold');
    });

    it('should leave duplicate fields undefined when the source chat had none', async () => {
      const provider = new IndexedDbStorageProvider();
      const original = await provider.createChat('resource_test', {
        name: 'Original',
        messages: [],
      });

      const copy = await provider.duplicateChat(original.id);

      expect(copy.activeExecution).toBeUndefined();
      expect(copy.activeKernel).toBeUndefined();
    });

    it('should not copy one-shot startup intent into the duplicated chat', async () => {
      const provider = new IndexedDbStorageProvider();
      const message = userMessage('initial');
      const original = await provider.createChat('resource_test', {
        name: 'Original',
        messages: [message],
        startupRequest: startupRequest(message.id),
      });

      const copy = await provider.duplicateChat(original.id);

      expect(copy.messages).toEqual(original.messages);
      expect(copy.startupRequest).toBeUndefined();
    });

    it('should not copy one-shot startup intent when duplicating all resource chats', async () => {
      const provider = new IndexedDbStorageProvider();
      const sourceProject = await freshProject(provider);
      const targetProject = await freshProject(provider);
      const message = userMessage('initial');
      const original = await provider.createChat(sourceProject.projectId, {
        name: 'Original',
        messages: [message],
        startupRequest: startupRequest(message.id),
      });

      const mapping = await provider.duplicateResourceChats(sourceProject.projectId, targetProject.projectId);
      const copiedChat = await provider.getChat(mapping[original.id]!);

      expect(copiedChat?.messages).toEqual(original.messages);
      expect(copiedChat?.startupRequest).toBeUndefined();
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
