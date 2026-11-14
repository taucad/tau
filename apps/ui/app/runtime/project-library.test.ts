/**
 * The project library service (app state orchestration charter D9; plan § 4 A2, A3b; inventory L3, L5, L6).
 *
 * The library owns its actors, starts them and the worker once, publishes a snapshot React reads, and exposes the
 * ports the chat store and the project runtime call. Since A3b the chat ports run over the library's own chat store,
 * built over the record client of the one transitional binding `ProjectManagerProvider` supplies in render (D15
 * ruling): a port called before the first binding waits for it and is delivered, never dropped, and a replaced binding
 * leaves no waiter behind.
 *
 * The chat store and the metadata read owner are doubles here, keyed by the binding's record client: these rows are
 * about which binding serves a call, and the observations they would wait on are the hook suites' subject.
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
import type { ProjectLibraryBinding } from '#runtime/project-library.js';
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

/** A binding whose record client stands for a chat store that records the binding it came from. */
const bindingNamed = (
  name: string,
  { chats, syncProjectRoots }: Readonly<{ chats?: Partial<ChatPorts>; syncProjectRoots?: () => Promise<void> }> = {},
): ProjectLibraryBinding => {
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
    fileManager: {
      recordFiles,
      watchRecordFile: () => {
        throw new Error('not called in this test');
      },
      workspace: { syncProjectRoots: syncProjectRoots ?? notCalled },
    } as unknown as ProjectLibraryBinding['fileManager'],
  };
};

/** The same facade, as a re-render hands it over again. */
const rebound = (binding: ProjectLibraryBinding): ProjectLibraryBinding => ({
  fileManager: { ...binding.fileManager },
});

const libraries: ProjectLibrary[] = [];
const createLibrary = (queryClient = new QueryClient()): ProjectLibrary => {
  const library = new ProjectLibrary({ queryClient });
  libraries.push(library);
  return library;
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

  it('should hold a port called before the first binding, and deliver it once the binding arrives (D15 ruling)', async () => {
    const library = createLibrary();
    let settled = false;
    const call = (async () => {
      const chat = await library.getChat('c1', 'p1');
      settled = true;
      return chat;
    })();
    await flush();
    expect(settled).toBe(false);

    library.bind(bindingNamed('first'));

    await expect(call).resolves.toMatchObject({ id: 'first:c1' });
  });

  it('should resume a waiting call on the binding current when it resumes, so a replaced binding leaves no waiter', async () => {
    const library = createLibrary();
    const waiting = library.getChat('c1');

    /* A provider remount in one pass: the first mount's binding, then the remount's, before the waiter resumes. */
    library.bind(bindingNamed('unmounted'));
    library.bind(bindingNamed('remounted'));

    await expect(waiting).resolves.toMatchObject({ id: 'remounted:c1' });
    await expect(library.getChat('c2')).resolves.toMatchObject({ id: 'remounted:c2' });
  });

  it('should ask a read again of the binding that replaced the one whose provider disposed it (B9)', async () => {
    const library = createLibrary();
    const running = Promise.withResolvers<Chat | undefined>();
    library.bind(bindingNamed('old', { chats: { getChat: async () => running.promise } }));
    const call = library.getChat('c1');
    await flush();

    /* The provider's order at a remount: the new render binds, the old cleanup releases and fails its reads, the new
     * setup resumes. */
    library.bind(bindingNamed('new'));
    library.release();
    running.reject(new Error('Chat observation was disposed.'));
    library.resume();

    await expect(call).resolves.toMatchObject({ id: 'new:c1' });
  });

  it('should ask a read again when its provider disposed it before the replacement bound (B9)', async () => {
    const library = createLibrary();
    const running = Promise.withResolvers<Chat | undefined>();
    library.bind(bindingNamed('old', { chats: { getChat: async () => running.promise } }));
    const call = library.getChat('c1');
    await flush();

    /* The provider's cleanup releases its binding, then fails its reads; the remount binds later. */
    library.release();
    running.reject(new Error('Chat observation was disposed.'));
    await flush();
    library.bind(bindingNamed('new'));

    await expect(call).resolves.toMatchObject({ id: 'new:c1' });
  });

  it('should ask a read again when its provider released and resumed it while it ran (StrictMode)', async () => {
    const library = createLibrary();
    const first = Promise.withResolvers<Chat | undefined>();
    let attempts = 0;
    library.bind(
      bindingNamed('only', {
        chats: {
          getChat: async (chatId) => {
            attempts += 1;
            return attempts === 1 ? first.promise : chatOf(`only:${chatId}`);
          },
        },
      }),
    );
    const call = library.getChat('c1');
    await flush();

    /* The effect's cleanup and setup run back to back, then the first attempt's disposal is seen. */
    library.release();
    library.resume();
    first.reject(new Error('Chat observation was disposed.'));

    await expect(call).resolves.toMatchObject({ id: 'only:c1' });
    expect(attempts).toBe(2);
  });

  it('should hold ports while released, and deliver them on the same binding once its provider resumes', async () => {
    const library = createLibrary();
    library.bind(bindingNamed('only'));
    library.release();
    let settled = false;
    const call = (async () => {
      const chat = await library.getChat('c1');
      settled = true;
      return chat;
    })();
    await flush();
    expect(settled).toBe(false);

    library.resume();

    await expect(call).resolves.toMatchObject({ id: 'only:c1' });
  });

  it('should hand a write running on a replaced binding its own outcome, never repeat it', async () => {
    const library = createLibrary();
    const running = Promise.withResolvers<Chat | undefined>();
    const replacementPatch = vi.fn(notCalled);
    library.bind(bindingNamed('old', { chats: { patchChat: async () => running.promise } }));
    const call = library.patchChat('c1', 'name', 'renamed');
    await flush();

    library.bind(bindingNamed('new', { chats: { patchChat: replacementPatch } }));
    running.reject(new Error('Chat observation was disposed.'));

    await expect(call).rejects.toThrow('Chat observation was disposed.');
    expect(replacementPatch).not.toHaveBeenCalled();
  });

  it('should keep the own failure of a read when a re-render rebound its provider meanwhile', async () => {
    const library = createLibrary();
    const running = Promise.withResolvers<Chat | undefined>();
    let attempts = 0;
    const only = bindingNamed('only', {
      chats: {
        getChat: async () => {
          attempts += 1;
          return running.promise;
        },
      },
    });
    library.bind(only);
    const call = library.getChat('c1');
    await flush();

    library.bind(rebound(only));
    running.reject(new Error('unreadable'));

    await expect(call).rejects.toThrow('unreadable');
    expect(attempts).toBe(1);
  });

  it('should keep the failure of a read whose binding no other replaced', async () => {
    const library = createLibrary();
    library.bind(
      bindingNamed('only', {
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
    const library = createLibrary();
    const listener = vi.fn();
    library.files.subscribe(listener);
    expect(library.files.get()).toBeUndefined();

    const first = bindingNamed('first');
    library.bind(first);
    expect(listener).toHaveBeenCalledOnce();
    expect(library.files.get()).toEqual({
      client: first.fileManager.recordFiles,
      watchRecordFile: first.fileManager.watchRecordFile,
    });

    /* A re-render with the same facade: nothing to restart. */
    library.bind(rebound(first));
    expect(listener).toHaveBeenCalledOnce();

    /* A replaced root worker gives a new record client. */
    library.bind(bindingNamed('replaced'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should run its own workspace connection services over the binding current when the machine runs them (A3b)', async () => {
    const library = createLibrary();
    const replaced = vi.fn(notCalled);
    const mounted = vi.fn(async () => {
      throw new Error('stop here');
    });
    library.start();
    library.bind(bindingNamed('first', { syncProjectRoots: replaced }));
    library.bind(bindingNamed('second', { syncProjectRoots: mounted }));

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
});
