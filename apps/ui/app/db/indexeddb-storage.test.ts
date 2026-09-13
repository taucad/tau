// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import type { ProjectManifest } from '@taucad/types';
import { projectToManifest } from '@taucad/types';
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

async function freshProject(provider: IndexedDbStorageProvider): Promise<ProjectLibraryState> {
  return provider.createProjectLibraryState({ projectId: nextProjectId(), lastActivityAt: 1 });
}

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
  // The v11 cutover preserves durable domain rows, drops the chat store a chat
  // no longer lives in (W17), and intentionally clears the incompatible editor
  // layout.
  it('upgrades v9 to v11, preserves domain rows, drops chats, and clears editor layout rows', async () => {
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
    expect(upgraded.version).toBe(11);
    expect([...upgraded.objectStoreNames]).toContain('appUiPreferences');
    /* No migration and no shim (A31/I15): the chat store is gone, and a chat is
     * `.tau/chats/<id>/chat.json` inside its project. */
    expect([...upgraded.objectStoreNames]).not.toContain('chats');
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
    expect(db.version).toBe(11);
    expect([...db.objectStoreNames].sort()).toEqual([
      'appUiPreferences',
      'editor',
      'pendingProjectOperations',
      'projectLibraryStates',
    ]);
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
          deletedAt: (() => undefined) as unknown as ProjectLibraryState['deletedAt'],
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

    /* The chat half of this case moved with the chat: `resumePendingProjectOperationResources`
     * returns the operation's chats and the caller writes them as files (W17),
     * which `chat-file-storage.test.ts` covers. */
    it('uses idempotent puts for replayed editor records', async () => {
      const provider = new IndexedDbStorageProvider();
      const editorState: EditorState = {
        projectId: 'proj_replay',
        openFiles: [],
        activePaneId: undefined,
        focusedChatId: 'chat_replay',
        panelState: defaultPanelState,
        workbenchLayout: undefined,
        viewerLayout: undefined,
        viewSettings: {},
        updatedAt: 1,
      };

      await provider.putEditorStateRecord(editorState);
      await provider.putEditorStateRecord(editorState);

      expect(await provider.getEditorState(editorState.projectId)).toEqual(editorState);
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

  // =========================================================================
  // Atomic single-transaction updateChat / updateProject
  // =========================================================================

  // =========================================================================
  // KeyedMutex serialises concurrent mutations per chatId
  // =========================================================================

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

    it('keeps activity monotonic and preserves the deletion field', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);
      await provider.trashProject(state.projectId, 50);

      await provider.touchProjectActivity(state.projectId, 40);
      expect(await provider.getProjectLibraryState(state.projectId)).toEqual({
        projectId: state.projectId,
        lastActivityAt: 40,
        deletedAt: 50,
      });

      await provider.touchProjectActivity(state.projectId, 30);
      const stored = await provider.getProjectLibraryState(state.projectId);
      expect(stored?.lastActivityAt).toBe(40);
    });

    it('trashes and restores by mutating only deletedAt', async () => {
      const provider = new IndexedDbStorageProvider();
      const state = await freshProject(provider);

      expect(await provider.trashProject(state.projectId, 10)).toEqual({ ...state, deletedAt: 10 });
      expect(await provider.restoreProject(state.projectId)).toEqual(state);
    });

    it('returns undefined for field mutations on a missing row', async () => {
      const provider = new IndexedDbStorageProvider();

      await expect(provider.touchProjectActivity('proj_missing', 1)).resolves.toBeUndefined();
      await expect(provider.trashProject('proj_missing', 1)).resolves.toBeUndefined();
      await expect(provider.restoreProject('proj_missing')).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // patchChat<K extends keyof Chat>
  // =========================================================================

  // =========================================================================
  // Product recency / unread state
  // =========================================================================

  // =========================================================================
  // setMessageEdit / clearMessageEdit
  // =========================================================================

  // =========================================================================
  // Chat.activeExecution + Chat.activeKernel are first-class fields
  // and patchChat round-trips them just like every other top-level field.
  // =========================================================================

  // =========================================================================
  // duplicateChat carries activeExecution + activeKernel onto the copy.
  // =========================================================================

  // =========================================================================
  // softDeleteChat
  // =========================================================================
});
