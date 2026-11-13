/**
 * The project library service (app state orchestration charter D9; plan § 4 A2; inventory L3, L6).
 *
 * The library owns the project-manager and workspace-connection actors, starts them and the worker once, publishes a
 * snapshot React reads, and exposes the ports the chat store and the project runtime call. In this cut the ports that
 * still need React reach it through one transitional binding `ProjectManagerProvider` supplies in render (D15 ruling):
 * a port called before the first binding waits for it and is delivered, never dropped, and a replaced binding leaves
 * no waiter behind.
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

const worker = vi.hoisted(() => ({
  getEditorState: vi.fn(async (projectId: string) => ({ projectId, openFiles: [] })),
  updateEditorState: vi.fn(async () => undefined),
}));

vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

vi.mock('comlink', () => ({ wrap: vi.fn(() => worker) }));

const notCalled = async (): Promise<never> => {
  throw new Error('not called in this test');
};

const chatOf = (id: string): Chat => ({ id, resourceId: 'p1', name: id, messages: [], createdAt: 0, updatedAt: 0 });

/** A binding whose every port records the binding it came from. */
const bindingNamed = (name: string, overrides: Partial<ProjectLibraryBinding> = {}): ProjectLibraryBinding => ({
  files: {
    client: {
      readFile: notCalled,
      writeFile: notCalled,
      exists: notCalled,
      readdir: notCalled,
      unlink: notCalled,
      rmdir: notCalled,
    },
    watchRecordFile: () => {
      throw new Error('not called in this test');
    },
  },
  chats: {
    getChat: async (chatId) => chatOf(`${name}:${chatId}`),
    patchChat: notCalled,
    adoptLegacyChatPlacement: notCalled,
    touchChatRecency: async (chatId) => chatOf(`${name}:${chatId}`),
    consumeChatStartupRequest: notCalled,
    commitCancelledDraftRestore: notCalled,
    getChatRecordsForResource: async () => [],
    createNavigationRepairChat: notCalled,
  },
  touchProject: async () => undefined,
  connection: { registerWorkspace: notCalled, mountWorkspace: notCalled, prepareWorkspaceCatalog: notCalled },
  ...overrides,
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

    library.stop();
    expect(library.projectManager.getSnapshot().status).toBe('stopped');
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
    const waiting = library.touchChatRecency('c1', 1);

    /* A provider remount in one pass: the first mount's binding, then the remount's, before the waiter resumes. */
    library.bind(bindingNamed('unmounted'));
    library.bind(bindingNamed('remounted'));

    await expect(waiting).resolves.toMatchObject({ id: 'remounted:c1' });
    await expect(library.touchChatRecency('c2', 2)).resolves.toMatchObject({ id: 'remounted:c2' });
  });

  it('should hand a call already running on a binding the remount replaced its own outcome, not a hang', async () => {
    const library = createLibrary();
    const running = Promise.withResolvers<Chat | undefined>();
    library.bind(
      bindingNamed('old', { chats: { ...bindingNamed('old').chats, getChat: async () => running.promise } }),
    );
    const call = library.getChat('c1');
    await flush();

    /* The provider unmounts, which disposes its metadata reads, and the remount binds again. */
    library.bind(bindingNamed('new'));
    running.reject(new Error('Chat observation was disposed.'));

    await expect(call).rejects.toThrow('Chat observation was disposed.');
    await expect(library.getChat('c1')).resolves.toMatchObject({ id: 'new:c1' });
  });

  it('should notify its file facade only when the record client or the watch changes', () => {
    const library = createLibrary();
    const listener = vi.fn();
    library.files.subscribe(listener);
    expect(library.files.get()).toBeUndefined();

    const first = bindingNamed('first');
    library.bind(first);
    expect(listener).toHaveBeenCalledOnce();
    expect(library.files.get()).toBe(first.files);

    /* A re-render with the same facade: nothing to restart. */
    library.bind({ ...bindingNamed('again'), files: first.files });
    expect(listener).toHaveBeenCalledOnce();

    /* A replaced root worker gives a new record client. */
    library.bind(bindingNamed('replaced'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should invoke the workspace connection services of the binding current when the machine runs them', async () => {
    const library = createLibrary();
    const registered = vi.fn(async () => {
      throw new Error('stop here');
    });
    library.start();
    library.bind(bindingNamed('first'));
    library.bind(
      bindingNamed('second', {
        connection: { registerWorkspace: registered, mountWorkspace: notCalled, prepareWorkspaceCatalog: notCalled },
      }),
    );

    library.workspaceConnection.send({ type: 'beginSelection', operationId: 'op1' });
    library.workspaceConnection.send({
      type: 'workspaceSelected',
      operationId: 'op1',
      selection: { backend: 'node', path: '/tmp/workspace' },
    });
    await flush();

    expect(registered).toHaveBeenCalledOnce();
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
