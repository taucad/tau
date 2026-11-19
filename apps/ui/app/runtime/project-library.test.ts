/**
 * The app's binding of the project library (`@taucad/files-ui/runtime/project-library`): the rows that need the app's
 * runtime, worker, chat store and device storage. The service's own rows are files-ui's suites.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as Cookies from 'es-cookie';
import { flush } from '@taucad/xstate-testing/clock';
import { ProjectLibrary } from '#runtime/project-library.js';
import { testRootFiles } from '#runtime/project-library.fixture.js';
import { mock } from 'vitest-mock-extended';
import type { ChatStorage } from '@taucad/files-ui/types/chat-storage.types';
import type { ProjectLibraryFacade } from '#runtime/file-manager-facade.js';

const worker = vi.hoisted(() => ({
  getEditorState: vi.fn(async (projectId: string) => ({ projectId, openFiles: [] })),
}));

vi.mock('#hooks/object-store-worker.js', () => ({
  createObjectStoreWorker: () => ({ terminate: vi.fn() }),
}));

vi.mock('comlink', () => ({ wrap: vi.fn(() => worker) }));

vi.mock('#db/chat-file-storage.js', () => ({
  createChatFileStore: () => ({ getChatsForResource: async () => [] }),
}));

/* A read owner that admits every read at once: no observation runs in these rows. */
vi.mock('@taucad/files-ui/runtime/project-library-observations', async (importOriginal) => ({
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

const libraries: ProjectLibrary[] = [];

afterEach(() => {
  for (const library of libraries.splice(0)) {
    library.stop();
  }
  globalThis.localStorage.clear();
});

describe('ProjectLibrary (app binding)', () => {
  it('should start the app object-store worker and read through it once the project manager is ready', async () => {
    const library = new ProjectLibrary({ queryClient: new QueryClient() });
    libraries.push(library);

    library.start();
    await flush();

    await expect(library.getEditorState('p1')).resolves.toEqual({ projectId: 'p1', openFiles: [] });
    await expect(library.getReadiedWorker()).resolves.toBe(worker);
  });

  it('should clear the project listing snapshot an earlier build left on the device when it starts', () => {
    globalThis.localStorage.setItem('tau-project-listing', '{"v":1,"projects":[{"name":"Secret"}]}');
    globalThis.localStorage.setItem('tau-project-list-count', '{"count":2}');
    Cookies.set('tau-project-count', '2', { path: '/' });
    const library = new ProjectLibrary({ queryClient: new QueryClient() });
    libraries.push(library);

    library.start();

    expect(globalThis.localStorage.getItem('tau-project-listing')).toBeNull();
    expect(globalThis.localStorage.getItem('tau-project-list-count')).toBeNull();
    expect(Cookies.get('tau-project-count')).toBeUndefined();
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

  it('should read the registry and the chat store the app runtime composed it with', async () => {
    const { createAppRuntime, selectRuntimeProjectLibrary } = await import('#runtime/app-runtime.js');
    const runtime = createAppRuntime({ idleFileManagers: true });
    const library = selectRuntimeProjectLibrary(runtime);
    /* Neither refuses for want of the registry or the chat store, which a library built without them would. */
    await expect(library.commands.closeProjectSession('p1')).resolves.toBeUndefined();
    await expect(library.commands.verifyProjectQuiescent('p1')).resolves.toBeUndefined();
    const root = testRootFiles(mock<ProjectLibraryFacade>());
    const unwired = new ProjectLibrary({ queryClient: new QueryClient(), rootFiles: () => root });
    libraries.push(unwired);
    await expect(unwired.commands.closeProjectSession('p1')).rejects.toThrow('built without the sessions registry');
  });
});
