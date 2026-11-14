/**
 * The project library service (app state orchestration charter D9; plan § 4 A2, A3b; inventory L3, L5, L6).
 *
 * The library owns its actors, starts them and the worker once, publishes a snapshot React reads, and exposes the
 * ports the chat store and the project runtime call. The chat ports run over the library's own chat store, built over
 * the record client of the root file facade the runtime builds over `rootFiles` (A4b; the D15 binding is gone): a port
 * called before the facade exists waits for it and is delivered, never dropped, and a replaced record client leaves no
 * waiter behind.
 *
 * The chat store and the metadata read owner are doubles here, keyed by the facade's record client: these rows are
 * about which record client serves a call, and the observations they would wait on are the hook suites' subject.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { flush } from '@taucad/xstate-testing/clock';
import type { Chat } from '@taucad/chat';
import type { EditorStateInput } from '@taucad/ui-core/types/editor.types';
import { defaultPanelState } from '@taucad/ui-core/constants/editor.constants';
import {
  ProjectLibrary,
  selectLibraryError,
  selectLibraryIsLoading,
  selectLibraryWorkspaceConnection,
} from '#runtime/project-library.js';
import type { ProjectLibraryFileManager } from '#runtime/project-library-storage.js';
import { testRootFiles } from '#runtime/project-library.fixture.js';
import type { TestRootFiles } from '#runtime/project-library.fixture.js';
import { projectListCountCookieName, projectListShapeStore } from '#lib/project-list-shape.lib.js';
import type { ChatStorage } from '#types/storage.types.js';

const worker = vi.hoisted(() => ({
  getEditorState: vi.fn(async (projectId: string) => ({ projectId, openFiles: [] })),
  updateEditorState: vi.fn(async () => undefined),
}));

/** The chat store each record client stands for. */
const stores = vi.hoisted(() => new WeakMap<WeakKey, unknown>());

vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

vi.mock('comlink', () => ({ wrap: vi.fn(() => worker) }));

vi.mock('#db/chat-file-storage.js', () => ({
  createChatFileStore: ({ client }: { client: WeakKey }) => stores.get(client),
}));

/* A read owner that admits every read at once: no observation runs in these rows. */
vi.mock('#runtime/project-library-observations.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createMetadataReadOwner: (source: ChatStorage) => ({
    connect: () => () => undefined,
    hold: () => undefined,
    ready: () => undefined,
    fail: () => undefined,
    read: async <Value>(operation: (store: ChatStorage) => Promise<Value>) => operation(source),
    settle: async () => undefined,
  }),
}));

vi.mock('#filesystem/handle-store.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createNodeWorkspace: vi.fn(async (path: string) => ({
    workspaceId: 'wsp_node',
    backend: 'node',
    path,
    name: 'workspace',
    slug: 'workspace',
    minted: false,
  })),
}));

const notCalled = async (): Promise<never> => {
  throw new Error('not called in this test');
};

const chatOf = (id: string): Chat => ({ id, resourceId: 'p1', name: id, messages: [], createdAt: 0, updatedAt: 0 });

type ChatPorts = Pick<ChatStorage, 'getChat' | 'patchChat'>;

/** A facade whose record client stands for a chat store that records the facade it came from. */
const facadeNamed = (
  name: string,
  { chats, syncProjectRoots }: Readonly<{ chats?: Partial<ChatPorts>; syncProjectRoots?: () => Promise<void> }> = {},
): ProjectLibraryFileManager => {
  const recordFiles = {
    readFile: notCalled,
    writeFile: notCalled,
    exists: notCalled,
    readdir: notCalled,
    unlink: notCalled,
    rmdir: notCalled,
  };
  const store: ChatPorts = {
    getChat: async (chatId) => chatOf(`${name}:${chatId}`),
    patchChat: notCalled,
    ...chats,
  };
  stores.set(recordFiles, store);
  return {
    recordFiles,
    watchRecordFile: () => {
      throw new Error('not called in this test');
    },
    workspace: { syncProjectRoots: syncProjectRoots ?? notCalled },
  } as unknown as ProjectLibraryFileManager;
};

/** The same parts in a new object, as the facade republishes when only its change channel moved. */
const republished = (fileManager: ProjectLibraryFileManager): ProjectLibraryFileManager => ({ ...fileManager });

const libraries: ProjectLibrary[] = [];
/** A library over `rootFiles`, or over none yet: the runtime builds the facade after the library. */
const createLibrary = (
  queryClient = new QueryClient(),
  rootFiles: () => TestRootFiles | undefined = () => undefined,
): ProjectLibrary => {
  const library = new ProjectLibrary({ queryClient, rootFiles });
  libraries.push(library);
  return library;
};

/** A library over a facade a row replaces. */
const libraryOver = (first: ProjectLibraryFileManager): Readonly<{ library: ProjectLibrary; root: TestRootFiles }> => {
  const root = testRootFiles(first);
  return { library: createLibrary(new QueryClient(), () => root), root };
};

afterEach(() => {
  for (const library of libraries.splice(0)) {
    library.stop();
  }
  worker.getEditorState.mockClear();
  worker.updateEditorState.mockClear();
});

describe('ProjectLibrary', () => {
  it('should create its actors unstarted, and start them and the worker once (row L3)', async () => {
    const library = createLibrary();
    expect(library.projectManager.getSnapshot().value).toBe('initializing');
    expect(selectLibraryIsLoading(library.getSnapshot())).toBe(true);

    library.start();
    library.start();
    await flush();

    expect(library.projectManager.getSnapshot().value).toBe('ready');
    expect(library.workspaceConnection.getSnapshot().value).toBe('idle');
    expect(selectLibraryIsLoading(library.getSnapshot())).toBe(false);
    expect(selectLibraryError(library.getSnapshot())).toBeUndefined();

    const { worker: started } = library.projectManager.getSnapshot().context;
    library.stop();
    expect(library.projectManager.getSnapshot().status).toBe('stopped');
    /* `stop()` runs no `exit`, so the library releases the worker itself. */
    expect(started?.terminate).toHaveBeenCalledOnce();
    expect(library.workspaceConnection.getSnapshot().status).toBe('stopped');
  });

  it('should keep its snapshot, and each field of it, until the actor behind that field changes', async () => {
    const library = createLibrary();
    const before = library.getSnapshot();
    expect(library.getSnapshot()).toBe(before);
    const listener = vi.fn();
    library.subscribe(listener);

    library.start();
    await flush();

    expect(listener).toHaveBeenCalled();
    const after = library.getSnapshot();
    expect(after).not.toBe(before);
    /* Only the project manager moved, so the workspace connection's state is the same object. */
    expect(selectLibraryWorkspaceConnection(after)).toBe(selectLibraryWorkspaceConnection(before));
  });

  it('should follow the root file facade the runtime built, with no provider (A4b)', async () => {
    const { createAppRuntime, selectRuntimeProjectLibrary, selectRuntimeRootFileFacade } =
      await import('#runtime/app-runtime.js');
    const runtime = createAppRuntime({ idleFileManagers: true });
    const library = selectRuntimeProjectLibrary(runtime);
    /* Nothing is mounted: the library reads the runtime's facade over `rootFiles`, not a binding a provider supplies. */
    const facade = selectRuntimeRootFileFacade(runtime).get();
    expect(library.files.get()).toEqual({ client: facade.recordFiles, watchRecordFile: facade.watchRecordFile });
  });

  it('should hold a port called before the facade exists, and deliver it once the library follows it', async () => {
    const slot: { root?: TestRootFiles } = {};
    const library = createLibrary(new QueryClient(), () => slot.root);
    let settled = false;
    const call = (async () => {
      const chat = await library.getChat('c1', 'p1');
      settled = true;
      return chat;
    })();
    await flush();
    expect(settled).toBe(false);

    const root = testRootFiles(facadeNamed('first'));
    slot.root = root;
    library.start();

    await expect(call).resolves.toMatchObject({ id: 'first:c1' });
  });

  it('should resume a waiting call on the facade current when it resumes, so a replaced one leaves no waiter', async () => {
    const slot: { root?: TestRootFiles } = {};
    const library = createLibrary(new QueryClient(), () => slot.root);
    const waiting = library.getChat('c1');

    /* The worker is replaced in one pass: the first facade, then the next, before the waiter resumes. */
    const root = testRootFiles(facadeNamed('first'));
    slot.root = root;
    library.start();
    root.replace(facadeNamed('replaced'));

    await expect(waiting).resolves.toMatchObject({ id: 'replaced:c1' });
    await expect(library.getChat('c2')).resolves.toMatchObject({ id: 'replaced:c2' });
  });

  it('should ask a read again of the records that replaced the ones it ran on (a new root worker)', async () => {
    const running = Promise.withResolvers<Chat | undefined>();
    const { library, root } = libraryOver(facadeNamed('old', { chats: { getChat: async () => running.promise } }));
    const call = library.getChat('c1');
    await flush();

    root.replace(facadeNamed('new'));
    running.reject(new Error('Chat observation was disposed.'));

    await expect(call).resolves.toMatchObject({ id: 'new:c1' });
  });

  it('should keep serving reads when a provider over it unmounts: nothing releases the facade (A4b, B9)', async () => {
    const { library } = libraryOver(facadeNamed('only'));
    library.start();
    /* A provider's unmount touched the binding before A4b; the facade is the runtime's and is not released. */
    await expect(library.getChat('c1')).resolves.toMatchObject({ id: 'only:c1' });
    await expect(library.getChat('c2')).resolves.toMatchObject({ id: 'only:c2' });
  });

  it('should hand a write running on replaced records its own outcome, never repeat it', async () => {
    const running = Promise.withResolvers<Chat | undefined>();
    const replacementPatch = vi.fn(notCalled);
    const { library, root } = libraryOver(facadeNamed('old', { chats: { patchChat: async () => running.promise } }));
    const call = library.patchChat('c1', 'name', 'renamed');
    await flush();

    root.replace(facadeNamed('new', { chats: { patchChat: replacementPatch } }));
    running.reject(new Error('Chat observation was disposed.'));

    await expect(call).rejects.toThrow('Chat observation was disposed.');
    expect(replacementPatch).not.toHaveBeenCalled();
  });

  it('should keep the own failure of a read when the facade republished the same record client meanwhile', async () => {
    const running = Promise.withResolvers<Chat | undefined>();
    let attempts = 0;
    const only = facadeNamed('only', {
      chats: {
        getChat: async () => {
          attempts += 1;
          return running.promise;
        },
      },
    });
    const { library, root } = libraryOver(only);
    const call = library.getChat('c1');
    await flush();

    root.replace(republished(only));
    running.reject(new Error('unreadable'));

    await expect(call).rejects.toThrow('unreadable');
    expect(attempts).toBe(1);
  });

  it('should keep the failure of a read whose records nothing replaced', async () => {
    const { library } = libraryOver(
      facadeNamed('only', {
        chats: {
          getChat: async () => {
            throw new Error('unreadable');
          },
        },
      }),
    );

    await expect(library.getChat('c1')).rejects.toThrow('unreadable');
  });

  it('should notify its file facade only when the record client or the watch changes', () => {
    const slot: { root?: TestRootFiles } = {};
    const library = createLibrary(new QueryClient(), () => slot.root);
    const listener = vi.fn();
    library.files.subscribe(listener);
    expect(library.files.get()).toBeUndefined();

    const first = facadeNamed('first');
    const root = testRootFiles(first);
    slot.root = root;
    library.start();
    expect(listener).toHaveBeenCalledOnce();
    expect(library.files.get()).toEqual({
      client: first.recordFiles,
      watchRecordFile: first.watchRecordFile,
    });

    /* The same parts republished: nothing to restart. */
    root.replace(republished(first));
    expect(listener).toHaveBeenCalledOnce();

    /* A replaced root worker gives a new record client. */
    root.replace(facadeNamed('replaced'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should run its own workspace connection services over the facade current when the machine runs them (A3b)', async () => {
    const replaced = vi.fn(notCalled);
    const mounted = vi.fn(async () => {
      throw new Error('stop here');
    });
    const { library, root } = libraryOver(facadeNamed('first', { syncProjectRoots: replaced }));
    library.start();
    root.replace(facadeNamed('second', { syncProjectRoots: mounted }));

    library.workspaceConnection.send({ type: 'beginSelection', operationId: 'op1' });
    library.workspaceConnection.send({
      type: 'workspaceSelected',
      operationId: 'op1',
      selection: { backend: 'node', path: '/tmp/workspace' },
    });
    await flush();

    expect(mounted).toHaveBeenCalledOnce();
    expect(replaced).not.toHaveBeenCalled();
    expect(selectLibraryWorkspaceConnection(library.getSnapshot())).toMatchObject({ phase: 'failed' });
  });

  it('should read and write editor state through the worker only once the project manager is ready (A6a)', async () => {
    const library = createLibrary();
    const read = library.getEditorState('p1');
    await flush();
    expect(worker.getEditorState).not.toHaveBeenCalled();

    library.start();

    await expect(read).resolves.toEqual({ projectId: 'p1', openFiles: [] });
    const editorState: EditorStateInput = {
      projectId: 'p1',
      openFiles: [],
      activePaneId: undefined,
      focusedChatId: undefined,
      panelState: defaultPanelState,
      fileSidebars: {},
      graphicsBackendPreferences: {},
    };
    await library.updateEditorState(editorState);
    expect(worker.updateEditorState).toHaveBeenCalledOnce();
    await expect(library.getReadiedWorker()).resolves.toBe(worker);
  });

  it('should invalidate the project listing and a project chat listing in its query client', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const library = createLibrary(queryClient);

    await library.invalidateProjectListing();
    await library.invalidateChatListing('p1');

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['projects'], ['chats', 'p1']]);
  });

  describe('listing snapshot (A13)', () => {
    const entry = (id: string, lastActivityAt: number, deletedAt?: number) => ({
      projectId: id,
      manifest: { name: `Name ${id}` },
      library: { lastActivityAt, ...(deletedAt === undefined ? {} : { deletedAt }) },
      locator: { backend: 'indexeddb' },
      slugs: { workspaceSlug: 'home', projectSlug: id },
    });
    const listing = (...projects: Array<ReturnType<typeof entry>>) => ({
      projects,
      conflicts: [],
      recoveries: [],
      workspaceBindingRepairs: [],
    });

    afterEach(() => {
      globalThis.localStorage.clear();
      projectListShapeStore.reset();
    });

    it('should remember a fetched project listing, and one published with setQueryData, with only the count in the cookie', async () => {
      const queryClient = new QueryClient();
      const library = createLibrary(queryClient);
      library.start();

      await queryClient.query({
        queryKey: ['projects'],
        queryFn: async () => listing(entry('older', 1), entry('newer', 9), entry('trashed', 5, 6)),
      });
      expect(library.listingSnapshot.get()).toEqual({
        count: 2,
        projects: [
          {
            id: 'newer',
            name: 'Name newer',
            lastActivityAt: 9,
            slugs: { workspaceSlug: 'home', projectSlug: 'newer' },
          },
          {
            id: 'older',
            name: 'Name older',
            lastActivityAt: 1,
            slugs: { workspaceSlug: 'home', projectSlug: 'older' },
          },
        ],
      });
      expect(document.cookie).toContain(`${projectListCountCookieName}=2`);
      expect(document.cookie).not.toContain('Name');

      /* A workspace connect or disconnect publishes its listing without a fetch. */
      queryClient.setQueryData(['projects'], listing(entry('other', 3)));
      expect(library.listingSnapshot.get()?.projects?.map((project) => project.id)).toEqual(['other']);
    });

    it("should remember a project's chat listing, live and owned chats only, and nothing once stopped", async () => {
      const queryClient = new QueryClient();
      const library = createLibrary(queryClient);
      library.start();
      queryClient.setQueryData(['projects'], listing(entry('p1', 1)));

      queryClient.setQueryData(
        ['chats', 'p1', 'records', 'source', { includeDeleted: false }],
        [
          { id: 'c1', resourceId: 'p1', name: 'One', createdAt: 1, updatedAt: 1 },
          { id: 'c2', resourceId: 'p1', name: 'Two', createdAt: 2, updatedAt: 2, deletedAt: 3 },
        ],
      );
      expect(library.listingSnapshot.get()?.projects?.[0]).toMatchObject({
        chatCount: 1,
        chats: [{ id: 'c1', name: 'One', createdAt: 1, updatedAt: 1 }],
      });

      library.stop();
      queryClient.setQueryData(['projects'], listing(entry('after-stop', 1)));
      expect(library.listingSnapshot.get()?.projects?.map((project) => project.id)).toEqual(['p1']);
    });

    /* D9: the listing query is the library's own; the snapshot above remembers what it lands. */
    it('should list every project, deleted ones included, through its listing query (A4b)', async () => {
      const library = createLibrary(new QueryClient());
      const listed = listing(entry('older', 1), entry('trashed', 5, 6)) as unknown as Awaited<
        ReturnType<ProjectLibrary['getProjectListing']>
      >;
      const getProjectListing = vi.spyOn(library, 'getProjectListing').mockResolvedValue(listed);

      expect(library.listingQuery.queryKey).toEqual(['projects']);
      await expect(library.listingQuery.queryFn({ signal: new AbortController().signal })).resolves.toBe(listed);
      expect(getProjectListing).toHaveBeenCalledExactlyOnceWith({ includeDeleted: true });
    });
  });
});
