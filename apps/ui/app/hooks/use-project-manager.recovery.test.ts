/* eslint-disable @typescript-eslint/naming-convention -- Test fixtures use React component names and literal workspace file paths. */
/**
 * Recovery rows of the library (charter I8; app-state orchestration A0.4).
 *
 * Characterisation of `ProjectManagerProvider` as it is today, except where a
 * row is written `it.fails`: there today's code breaks the invariant its title
 * names, and the failure is that invariant's own assertion. The fixing lane
 * flips the row and never deletes it.
 *
 * Ordering is held by deferred promises. `settle` drains every pending
 * continuation through the fake clock, which fires nothing: none of these
 * paths owns a timer.
 */
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Chat } from '@taucad/chat';
import type {
  ProjectDiscoveryResult,
  ProjectLocator,
  ProjectRouteVerification,
  WatchEvent,
  WatchRequest,
} from '@taucad/filesystem';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { Project } from '@taucad/types';
import { defaultPanelState } from '@taucad/ui-core/constants/editor.constants';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { FileManagerProxy } from '#machines/file-manager.machine.types.js';
import type { PendingProjectOperation } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';

const fakeProject: Project = createProjectFixture({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Test Project',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const fakeLocator: ProjectLocator = {
  backend: 'opfs',
  storageRootKey: 'opfs:origin',
  relativeDirectory: 'test-project',
};
const completeRoots: ProjectDiscoveryResult['roots'] = [{ status: 'complete', root: { backend: 'opfs' } }];
const validProjectDiscovery: ProjectDiscoveryResult = {
  roots: completeRoots,
  entries: [
    { status: 'valid', projectId: fakeProject.id, manifest: projectToManifest(fakeProject), locator: fakeLocator },
  ],
};
const emptyDiscovery: ProjectDiscoveryResult = { roots: completeRoots, entries: [] };
const manifestBytes = serializeProjectManifest(projectToManifest(fakeProject));
const operationId = 'req_aaaaaaaaaaaaaaaaaaaaa';
/** A creation a reload interrupted: this tab replays it from the journal. */
const pendingCreate: Extract<PendingProjectOperation, { kind: 'create' }> = {
  operationId,
  kind: 'create',
  backend: 'opfs',
  providerBasePath: fakeLocator.relativeDirectory,
  projectId: fakeProject.id,
  manifest: projectToManifest(fakeProject),
  library: { projectId: fakeProject.id, lastActivityAt: 10 },
  files: {},
  editorState: {
    projectId: fakeProject.id,
    openFiles: [],
    activePaneId: undefined,
    focusedChatId: undefined,
    panelState: defaultPanelState,
    fileSidebars: {},
    graphicsBackendPreferences: {},
    updatedAt: 10,
  },
};
/** The same creation, rooted in a workspace folder this tab can lose and get back. */
const workspaceId = 'wsp_dead';
const pendingWorkspaceCreate: Extract<PendingProjectOperation, { kind: 'create' }> = {
  ...pendingCreate,
  backend: 'webaccess',
  workspaceId,
};
const returnedWorkspace = {
  workspace: { workspaceId, name: 'Workspace' },
  handle: mock<FileSystemDirectoryHandle>({ kind: 'directory', name: 'tau-workspace' }),
};
/**
 * Journal the workspace-rooted creation and make its workspace known to this tab. Its folder's handle is gone
 * until `workspaceReturns` hands it back, so until then every write into it fails `workspace-unavailable`.
 */
const useWorkspaceRow = (): void => {
  mockWebAccessAvailable = true;
  journal = [pendingWorkspaceCreate];
  mockListWorkspaces.mockResolvedValue([{ workspaceId }]);
};
/** Whether the folder's handle is held; the handle store mounts a workspace root only then. */
let workspaceConnected = false;
const workspaceReturns = (): void => {
  workspaceConnected = true;
  mockGetWorkspace.mockResolvedValue(returnedWorkspace);
};
/** The journal's rows: completing an operation deletes its row, as the worker does. */
let journal: PendingProjectOperation[] = [];
const failedRecovery = (reason: string) => ({
  operationId,
  projectId: fakeProject.id,
  kind: 'create',
  status: 'failed',
  reason,
});

// ── File manager double ─────────────────────────────────────────────────────

const nativeWatches = new Set<(event: WatchEvent) => void>();
const watchReady = (_request: WatchRequest, listener: (event: WatchEvent) => void) => {
  nativeWatches.add(listener);
  return {
    ready: Promise.resolve(),
    closed: new Promise<void>(() => {
      /* This watch stays open until fixture disposal. */
    }),
    dispose: () => {
      nativeWatches.delete(listener);
    },
  };
};
/** A manifest write or delete heard by the discovery watch: it moves the discovery epoch. */
const emitManifestChange = (path: string): void => {
  for (const listener of nativeWatches) {
    listener({ type: 'delete', path });
  }
};
const mockListProjectManifests = vi.fn<() => Promise<ProjectDiscoveryResult>>();
const mockVerifyProjectRoute = vi.fn<(input: { projectId: string }) => Promise<ProjectRouteVerification>>();
const mockCommitPendingProjectDirectory = vi.fn<FileManagerProxy['commitPendingProjectDirectory']>();
const mockPermanentlyDeleteProjectDirectory = vi.fn<FileManagerProxy['permanentlyDeleteProjectDirectory']>();
const mockSyncProjectRoots = vi.fn<() => Promise<void>>();
const mockReadFile = vi.fn(async (path: string) => {
  if (path.endsWith('/.tau/library.json')) {
    throw new Error(`ENOENT: ${path}`);
  }
  return manifestBytes;
});
/* One object for every render, as the provider's file manager is: a fresh one
 * per render would re-run every effect keyed on it and move the epoch. */
const mockFileManager = {
  workerChangeChannel: { watchReady },
  // Chat metadata is not what these rows observe: its watches stay quiet.
  watchRecordFile: () => ({
    ready: Promise.resolve(),
    closed: new Promise<void>(() => {
      /* This watch stays open until fixture disposal. */
    }),
    dispose: () => undefined,
  }),
  recordFiles: {
    readFile: mockReadFile,
    writeFile: vi.fn(async () => undefined),
    writeFiles: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ type: 'file', size: 12, mtimeMs: 1_700_000_000_000 })),
    exists: vi.fn(async () => false),
    rmdir: vi.fn(async (path: string) => {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }),
  },
  client: {
    listProjectManifests: mockListProjectManifests,
    verifyProjectRoute: mockVerifyProjectRoute,
    commitPendingProjectDirectory: mockCommitPendingProjectDirectory,
    permanentlyDeleteProjectDirectory: mockPermanentlyDeleteProjectDirectory,
  },
  workspace: { syncProjectRoots: mockSyncProjectRoots },
  scopedStorage: { readShallowDirectory: vi.fn(async () => []) },
};
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => mockFileManager }));

// ── Durable route configuration double ──────────────────────────────────────

/** Route configs by project id: what the handle store holds. */
const routeConfigs = new Map<string, ProjectFileSystemConfig>();
const mockSetProjectFileSystemConfig = vi.fn(async (config: ProjectFileSystemConfig) => {
  routeConfigs.set(config.projectId, config);
});
const mockDeleteProjectFileSystemConfig = vi.fn(async (projectId: string) => {
  routeConfigs.delete(projectId);
});
const mockListWorkspaces = vi.fn<() => Promise<Array<{ workspaceId: string }>>>();
/** The retained handle of a workspace: absent while its folder is disconnected. */
const mockGetWorkspace =
  vi.fn<
    (workspaceId: string) => Promise<{ workspace: { workspaceId: string; name: string }; handle: unknown } | undefined>
  >();
/** Whether this tab may write through a held folder handle; `prompt` means the person must grant it again. */
const mockCheckHandlePermission = vi.fn<(handle: unknown) => Promise<'granted' | 'prompt' | 'denied'>>();
let projectRootConfigurationListener: (() => void) | undefined;
vi.mock('#filesystem/handle-store.js', () => ({
  requestHomeStoragePersistence: vi.fn(async () => undefined),
  createWorkspace: vi.fn(),
  createNodeWorkspace: vi.fn(),
  getWorkspaceMetadata: vi.fn(async () => undefined),
  isNodeWorkspaceConnected: vi.fn(async () => true),
  isNodeWorkspace: (workspace: { path?: string }) => workspace.path !== undefined,
  listWorkspaces: mockListWorkspaces,
  setProjectFileSystemConfig: mockSetProjectFileSystemConfig,
  getProjectFileSystemConfig: vi.fn(async (projectId: string) => routeConfigs.get(projectId)),
  getHomeStorageBackend: vi.fn(async () => 'opfs'),
  getProjectCreationLocation: vi.fn(async () => ({ location: { kind: 'home' }, repaired: undefined })),
  setProjectCreationLocation: vi.fn(async () => undefined),
  getWorkspace: mockGetWorkspace,
  checkHandlePermission: mockCheckHandlePermission,
  requestHandlePermission: vi.fn(async () => true),
  deleteProjectFileSystemConfig: mockDeleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs: vi.fn(async () => [...routeConfigs.values()]),
  pinHomeStorageBackend: vi.fn(async (backend: 'indexeddb' | 'opfs') => backend),
  subscribeProjectRootConfigurationChanges: (listener: () => void) => {
    projectRootConfigurationListener = listener;
    return () => {
      projectRootConfigurationListener = undefined;
    };
  },
  applyProjectFileSystemConfigChanges: vi.fn(
    async ({ upserts, deletes }: { upserts: readonly ProjectFileSystemConfig[]; deletes: readonly string[] }) => {
      await Promise.all(upserts.map(async (config) => mockSetProjectFileSystemConfig(config)));
      await Promise.all(deletes.map(async (projectId) => mockDeleteProjectFileSystemConfig(projectId)));
    },
  ),
  repairWorkspaceBindings: vi.fn(),
}));
/** Another tab announced a root-configuration change: a re-picked workspace is one. */
const announceRootConfigurationChange = (): void => {
  projectRootConfigurationListener?.();
};

vi.mock('#filesystem/build-skew.js', () => ({
  buildId: 1,
  isBuildSuperseded: () => false,
  subscribeBuildSkew: () => () => undefined,
}));
/** Whether this browser can hold a workspace folder; only the workspace row turns it on. */
let mockWebAccessAvailable = false;
vi.mock('#constants/browser.constants.js', () => ({
  isFileSystemAccessSupported: false,
  directoryPicker: () => ({ available: mockWebAccessAvailable, backend: 'webaccess', pick: async () => undefined }),
  webAccessDirectoryPicker: () => undefined,
}));
vi.mock('#chat-clients/use-project-name-client.js', () => ({
  useProjectNameClient: () => ({ generate: vi.fn(async () => 'Unnamed') }),
}));
vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: string) => [defaultValue, vi.fn()],
}));

// ── Object-store worker double ──────────────────────────────────────────────

const mockGetPendingProjectOperations = vi.fn<() => Promise<PendingProjectOperation[]>>();
const mockResumeResources = vi.fn<(operationId: string) => Promise<readonly Chat[]>>();
const mockCompletePending = vi.fn<(operationId: string) => Promise<void>>();
const mockBeginPermanentDeleteProject = vi.fn<(projectId: string, storage: unknown) => Promise<string>>();
const mockPrepareProjectCreation = vi.fn<(input: unknown) => Promise<PendingProjectOperation>>();
vi.mock('#hooks/project-manager.machine.js', async () => {
  const xstate = await import('xstate');
  return {
    projectManagerMachine: xstate.setup({}).createMachine({
      id: 'projectManager',
      initial: 'ready',
      context: { worker: undefined, wrappedWorker: undefined, error: undefined },
      states: { ready: {} },
    }),
  };
});
vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    waitFor: vi.fn(async () => ({
      matches: (state: string) => state === 'ready',
      context: {
        wrappedWorker: {
          getPendingProjectOperations: mockGetPendingProjectOperations,
          resumePendingProjectOperationResources: mockResumeResources,
          completePendingProjectOperation: mockCompletePending,
          beginPermanentDeleteProject: mockBeginPermanentDeleteProject,
          prepareProjectCreation: mockPrepareProjectCreation,
          getProjectLibraryState: async (projectId: string): Promise<ProjectLibraryState> => ({
            projectId,
            lastActivityAt: 10,
          }),
          getProjectLibraryStates: async (projectIds: readonly string[]) =>
            projectIds.map((projectId): ProjectLibraryState => ({ projectId, lastActivityAt: 10 })),
          createProjectLibraryState: async (state: ProjectLibraryState) => state,
          createProjectLibraryStates: async (states: readonly ProjectLibraryState[]) => [...states],
          deleteProjectResources: vi.fn(async () => undefined),
          setProjectDisclosure: vi.fn(async () => false),
        },
      },
    })),
  };
});

const { ProjectManagerProvider, useProjectManager } = await import('#hooks/use-project-manager.js');

const createHarness = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, undefined, children),
    );
  };
  return renderHook(() => useProjectManager(), { wrapper });
};

/** Drain every pending continuation; the fake clock yields once and fires nothing. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

/** Mount, read the journal and run the bootstrap discovery, then let its recovery loop run as far as it can. */
const bootstrap = async () => {
  const view = createHarness();
  await act(async () => view.result.current.getProjectListing());
  await settle();
  return view;
};

/** Hold the replay at its resources step: the directory is committed and its route config written. */
const holdReplayAtResources = () => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  mockResumeResources.mockImplementationOnce(async () => {
    reached.resolve();
    await release.promise;
    return [];
  });
  return {
    reached: reached.promise,
    release: () => {
      release.resolve();
    },
  };
};

describe('useProjectManager recovery (I8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    for (const mock of [
      mockListProjectManifests,
      mockVerifyProjectRoute,
      mockCommitPendingProjectDirectory,
      mockPermanentlyDeleteProjectDirectory,
      mockSyncProjectRoots,
      mockGetPendingProjectOperations,
      mockResumeResources,
      mockCompletePending,
      mockBeginPermanentDeleteProject,
      mockPrepareProjectCreation,
      mockListWorkspaces,
      mockGetWorkspace,
      mockCheckHandlePermission,
    ]) {
      mock.mockReset();
    }
    routeConfigs.clear();
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    mockVerifyProjectRoute.mockResolvedValue({ status: 'discovery-required' });
    mockCommitPendingProjectDirectory.mockResolvedValue({ status: 'committed' });
    mockPermanentlyDeleteProjectDirectory.mockResolvedValue({ status: 'deleted' });
    mockSyncProjectRoots.mockResolvedValue(undefined);
    journal = [pendingCreate];
    mockGetPendingProjectOperations.mockImplementation(async () => [...journal]);
    mockResumeResources.mockResolvedValue([]);
    mockCompletePending.mockImplementation(async (completed) => {
      journal = journal.filter((operation) => operation.operationId !== completed);
    });
    mockListWorkspaces.mockResolvedValue([]);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCheckHandlePermission.mockResolvedValue('granted');
    workspaceConnected = false;
    mockWebAccessAvailable = false;
    mockBeginPermanentDeleteProject.mockResolvedValue('req_bbbbbbbbbbbbbbbbbbbbb');
    mockPrepareProjectCreation.mockRejectedValue(new Error('No creation is prepared in these rows'));
    projectRootConfigurationListener = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── settleRecovery: when retries stop ─────────────────────────────────────

  describe('the retry budget', () => {
    it('I8: should stop replaying at once when a recovery fails for a terminal reason', async () => {
      mockCommitPendingProjectDirectory.mockRejectedValue(new Error('write failed'));
      const { result } = await bootstrap();
      expect(result.current.recoveries).toEqual([expect.objectContaining(failedRecovery('filesystem-error'))]);
      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledOnce();

      // Neither a root-configuration change nor a creation of the same id replays it.
      act(() => {
        announceRootConfigurationChange();
      });
      await settle();
      await act(async () => {
        await expect(
          result.current.createProject({
            id: fakeProject.id,
            chat: false,
            project: fakeProject,
            files: {},
            location: { kind: 'home' },
          }),
        ).rejects.toThrow(`An earlier creation of this project has not finished on this device: ${fakeProject.id}`);
      });

      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledOnce();
      expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
      expect(result.current.recoveries).toEqual([expect.objectContaining(failedRecovery('filesystem-error'))]);
    });

    it('I8: should stop replaying a retryable failure at its third attempt', async () => {
      /* The folder's handle is held, but write permission on it has lapsed: each attempt stops on the UI thread
       * before it reaches storage, as resolveWorkspaceForWrite raises workspace-unavailable there. */
      useWorkspaceRow();
      workspaceReturns();
      mockCheckHandlePermission.mockResolvedValue('prompt');
      const { result } = await bootstrap();
      expect(mockCheckHandlePermission).toHaveBeenCalledOnce();

      for (const attempts of [2, 3, 3, 3]) {
        act(() => {
          announceRootConfigurationChange();
        });
        // oxlint-disable-next-line no-await-in-loop -- each change settles before the next is announced
        await settle();
        expect(mockCheckHandlePermission).toHaveBeenCalledTimes(attempts);
      }
      expect(mockCommitPendingProjectDirectory).not.toHaveBeenCalled();

      // After its third settled attempt the row is failed, with its reason, and still in the journal.
      expect(result.current.recoveries).toEqual([expect.objectContaining(failedRecovery('workspace-unavailable'))]);
      expect(mockCompletePending).not.toHaveBeenCalled();
      expect(journal).toEqual([pendingWorkspaceCreate]);
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
        status: 'recovery-failed',
        recovery: { operationId, reason: 'workspace-unavailable' },
      });
    });
  });

  // ── A failure whose cause clears ──────────────────────────────────────────

  describe('a workspace-unavailable failure', () => {
    it('I8: should be replayed when the workspace returns, and not before', async () => {
      useWorkspaceRow();
      // Discovery sees the workspace folder only while its handle is held; the replay roots the project there.
      mockListProjectManifests.mockImplementation(async () => {
        if (!workspaceConnected) {
          return { roots: [], entries: [] };
        }
        return {
          roots: [
            {
              status: 'complete',
              root: { backend: 'webaccess', workspaceId, directoryHandle: returnedWorkspace.handle },
            },
          ],
          entries: [
            {
              status: 'valid',
              projectId: fakeProject.id,
              manifest: projectToManifest(fakeProject),
              locator: {
                ...fakeLocator,
                backend: 'webaccess',
                storageRootKey: `webaccess:${workspaceId}`,
                workspaceId,
              },
            },
          ],
        };
      });
      const { result } = await bootstrap();
      // The first attempt could not reach the folder; the row is still held. Its status is RowAccounted's question.
      expect(mockCommitPendingProjectDirectory).not.toHaveBeenCalled();
      expect(result.current.recoveries).toEqual([expect.objectContaining({ operationId, projectId: fakeProject.id })]);

      // The folder's handle comes back, but a manifest change and a listing refresh do not replay the row.
      workspaceReturns();
      act(() => {
        emitManifestChange('/test-project/tau.json');
      });
      await act(async () => result.current.getProjectListing());
      await settle();
      expect(mockCommitPendingProjectDirectory).not.toHaveBeenCalled();

      // The re-picked workspace republishes the route configuration.
      act(() => {
        announceRootConfigurationChange();
      });
      await settle();

      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledOnce();
      expect(mockCompletePending).toHaveBeenCalledExactlyOnceWith(operationId);
      expect(journal).toEqual([]);
      expect(result.current.recoveries).toEqual([]);
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
        status: 'ready',
        project: { id: fakeProject.id },
      });
    });
  });

  // ── Red rows: retryable failures ──────────────────────────────────────────

  describe('a retryable failure before its third attempt', () => {
    it.fails('I8: should not read as failed after its first workspace-unavailable attempt', async () => {
      useWorkspaceRow();
      const { result } = await bootstrap();
      expect(result.current.recoveries).toEqual([expect.objectContaining({ operationId, projectId: fakeProject.id })]);

      // RowAccounted: a row becomes failed only on a terminal reason or on its third settled attempt.
      expect(result.current.recoveries.map((recovery) => recovery.status)).not.toContain('failed');
    });

    it.fails('I8: should not spend replay attempts on root changes while the workspace is still gone', async () => {
      useWorkspaceRow();
      const { result } = await bootstrap();
      expect(result.current.recoveries).toEqual([expect.objectContaining({ operationId, projectId: fakeProject.id })]);

      /* Five changes announced for other reasons while the folder is still disconnected: more than any attempt
       * budget a counting scheme could spend on them and still replay the row below. */
      for (const _change of [1, 2, 3, 4, 5]) {
        act(() => {
          announceRootConfigurationChange();
        });
        // oxlint-disable-next-line no-await-in-loop -- each change settles before the next is announced
        await settle();
      }
      // The folder is re-picked, which republishes the route configuration.
      workspaceReturns();
      act(() => {
        announceRootConfigurationChange();
      });
      await settle();

      // RetryOnlyWhenCleared: the row is replayed once its workspace returns, and it settles.
      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledOnce();
      expect(mockCompletePending).toHaveBeenCalledExactlyOnceWith(operationId);
    });
  });

  // ── The person discards a row ─────────────────────────────────────────────

  describe('a failed row the person discards', () => {
    it('I8: should keep the failed row until the person discards it, then delete its journal row', async () => {
      mockCommitPendingProjectDirectory.mockRejectedValue(new Error('write failed'));
      mockListProjectManifests.mockResolvedValue(emptyDiscovery);
      const first = await bootstrap();
      const { result } = first;

      // Nothing but the person drops the row: not a listing refresh, not another tab's change.
      await act(async () => result.current.getProjectListing());
      act(() => {
        announceRootConfigurationChange();
      });
      await settle();
      expect(result.current.recoveries).toEqual([expect.objectContaining(failedRecovery('filesystem-error'))]);
      expect(mockCompletePending).not.toHaveBeenCalled();
      expect(journal).toEqual([pendingCreate]);

      await act(async () => result.current.discardRecovery(operationId));

      expect(mockCompletePending).toHaveBeenCalledExactlyOnceWith(operationId);
      expect(journal).toEqual([]);
      expect(result.current.recoveries).toEqual([]);
      await act(async () => {
        await expect(result.current.getProjectListing()).resolves.toMatchObject({ recoveries: [] });
      });
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'missing' });

      /* A reload forgets this tab's attempts, so a row still in the journal would be replayed from scratch.
       * The discarded row is not. */
      first.unmount();
      const commits = mockCommitPendingProjectDirectory.mock.calls.length;
      const reloaded = await bootstrap();
      expect(mockCommitPendingProjectDirectory).toHaveBeenCalledTimes(commits);
      expect(reloaded.result.current.recoveries).toEqual([]);
    });
  });

  // ── RecoveryGatesMutation ─────────────────────────────────────────────────

  describe('a mutation issued while recovery is replaying', () => {
    it('I8: should hold a creation of the same id until the replay settles', async () => {
      const replay = holdReplayAtResources();
      const { result } = await bootstrap();
      await act(async () => replay.reached);

      const creation = result.current.createProject({
        id: fakeProject.id,
        chat: false,
        project: fakeProject,
        files: {},
        location: { kind: 'home' },
      });
      // Observed before the replay is released, so its refusal is never unhandled.
      const refused = expect(creation).rejects.toThrow(`That project is already on this device: ${fakeProject.id}`);
      await settle();
      // Held behind the replay: it has read nothing of the journal since bootstrap.
      expect(mockGetPendingProjectOperations).toHaveBeenCalledOnce();
      expect(mockPrepareProjectCreation).not.toHaveBeenCalled();

      mockGetPendingProjectOperations.mockResolvedValue([]);
      replay.release();
      await settle();

      expect(mockCompletePending).toHaveBeenCalledExactlyOnceWith(operationId);
      await refused;
      expect(mockPrepareProjectCreation).not.toHaveBeenCalled();
    });

    it.fails('I8: should not journal a permanent delete of the project while its replay is in flight', async () => {
      const replay = holdReplayAtResources();
      const { result } = await bootstrap();
      await act(async () => replay.reached);
      expect(result.current.recoveries).toEqual([
        expect.objectContaining({ operationId, projectId: fakeProject.id, status: 'recovering' }),
      ]);

      // Its outcome is not this row's question: only when it journals is.
      const deletion = Promise.allSettled([result.current.permanentlyDeleteProject(fakeProject.id)]);
      await settle();

      expect(mockBeginPermanentDeleteProject).not.toHaveBeenCalled();
      replay.release();
      await act(async () => deletion);
    });
  });
});
