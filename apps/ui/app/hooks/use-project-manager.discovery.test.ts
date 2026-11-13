/* eslint-disable @typescript-eslint/naming-convention -- Test fixtures use React component names and literal workspace file paths. */
/**
 * Discovery rows of the library (charter I7, I9; app-state orchestration A0.4).
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
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type {
  ProjectDiscoveryResult,
  ProjectLocator,
  ProjectRouteVerification,
  WatchEvent,
  WatchRequest,
} from '@taucad/filesystem';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { Project } from '@taucad/types';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import type { PendingProjectOperation } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';
import type { ProjectListing } from '#hooks/use-project-manager.js';

const fakeProject: Project = createProjectFixture({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Test Project',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const orphanProjectId = 'proj_ccccccccccccccccccccc';
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
/** A route config whose directory no pass discovers: an orphan the newest pass prunes. */
const orphanConfig: ProjectFileSystemConfig = { projectId: orphanProjectId, backend: 'opfs', providerBasePath: 'gone' };
const projectConfig: ProjectFileSystemConfig = {
  projectId: fakeProject.id,
  backend: 'opfs',
  providerBasePath: fakeLocator.relativeDirectory,
};
const manifestBytes = serializeProjectManifest(projectToManifest(fakeProject));

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
    rmdir: vi.fn(async () => undefined),
  },
  client: {
    listProjectManifests: mockListProjectManifests,
    verifyProjectRoute: mockVerifyProjectRoute,
  },
  workspace: { syncProjectRoots: mockSyncProjectRoots },
  scopedStorage: { readShallowDirectory: vi.fn(async () => []) },
};
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => mockFileManager }));

// ── Durable route configuration double ──────────────────────────────────────

const mockGetAllProjectFileSystemConfigs = vi.fn<() => Promise<ProjectFileSystemConfig[]>>();
const mockGetProjectFileSystemConfig = vi.fn<(projectId: string) => Promise<ProjectFileSystemConfig | undefined>>();
const mockSetProjectFileSystemConfig = vi.fn<(config: ProjectFileSystemConfig) => Promise<void>>();
const mockDeleteProjectFileSystemConfig = vi.fn<(projectId: string) => Promise<void>>();
const mockApplyProjectFileSystemConfigChanges = vi.fn(
  async ({ upserts, deletes }: { upserts: readonly ProjectFileSystemConfig[]; deletes: readonly string[] }) => {
    await Promise.all(upserts.map(async (config) => mockSetProjectFileSystemConfig(config)));
    await Promise.all(deletes.map(async (projectId) => mockDeleteProjectFileSystemConfig(projectId)));
  },
);
const mockListWorkspaces = vi.fn<() => Promise<Array<{ workspaceId: string }>>>();
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
  getProjectFileSystemConfig: mockGetProjectFileSystemConfig,
  getHomeStorageBackend: vi.fn(async () => 'opfs'),
  getProjectCreationLocation: vi.fn(async () => ({ location: { kind: 'home' }, repaired: undefined })),
  setProjectCreationLocation: vi.fn(async () => undefined),
  getWorkspace: vi.fn(async () => undefined),
  checkHandlePermission: vi.fn(async () => 'granted'),
  requestHandlePermission: vi.fn(async () => true),
  deleteProjectFileSystemConfig: mockDeleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs: mockGetAllProjectFileSystemConfigs,
  pinHomeStorageBackend: vi.fn(async (backend: 'indexeddb' | 'opfs') => backend),
  subscribeProjectRootConfigurationChanges: (listener: () => void) => {
    projectRootConfigurationListener = listener;
    return () => {
      projectRootConfigurationListener = undefined;
    };
  },
  applyProjectFileSystemConfigChanges: mockApplyProjectFileSystemConfigChanges,
  repairWorkspaceBindings: vi.fn(),
}));

// ── Build-skew write stop double ────────────────────────────────────────────

let mockBuildSuperseded = false;
const buildSkewListeners = new Set<() => void>();
vi.mock('#filesystem/build-skew.js', () => ({
  buildId: 1,
  isBuildSuperseded: () => mockBuildSuperseded,
  subscribeBuildSkew: (listener: () => void) => {
    buildSkewListeners.add(listener);
    return () => {
      buildSkewListeners.delete(listener);
    };
  },
}));
/** The server named a build: every skew listener hears it, as `build-skew.ts` notifies them. */
const announceBuildSkew = (): void => {
  for (const listener of buildSkewListeners) {
    listener();
  }
};

vi.mock('#constants/browser.constants.js', () => ({
  isFileSystemAccessSupported: false,
  directoryPicker: () => ({ available: false, backend: 'webaccess', pick: async () => undefined }),
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
const mockGetProjectLibraryState = vi.fn<(projectId: string) => Promise<ProjectLibraryState | undefined>>();
const mockDeleteProjectResources = vi.fn<(projectId: string) => Promise<void>>();
/** Runs at the next readiness wait for the worker (`getReadiedWorker`), then clears itself. */
let onWorkerRead: (() => void) | undefined;
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
    waitFor: vi.fn(async () => {
      onWorkerRead?.();
      return {
        matches: (state: string) => state === 'ready',
        context: {
          wrappedWorker: {
            getPendingProjectOperations: mockGetPendingProjectOperations,
            getProjectLibraryState: mockGetProjectLibraryState,
            getProjectLibraryStates: async (projectIds: readonly string[]) =>
              projectIds.map((projectId): ProjectLibraryState => ({ projectId, lastActivityAt: 10 })),
            createProjectLibraryState: async (state: ProjectLibraryState) => state,
            createProjectLibraryStates: async (states: readonly ProjectLibraryState[]) => [...states],
            deleteProjectResources: mockDeleteProjectResources,
          },
        },
      };
    }),
  };
});

const { ProjectManagerProvider, useProjectManager } = await import('#hooks/use-project-manager.js');
const { ProjectLibrary } = await import('#runtime/project-library.js');
/* A2: the provider is over a library the runtime builds with its query client; each wrapper's client gets one here. */
const libraries = new WeakMap<QueryClient, InstanceType<typeof ProjectLibrary>>();
const libraryFor = (queryClient: QueryClient): InstanceType<typeof ProjectLibrary> => {
  let library = libraries.get(queryClient);
  if (library === undefined) {
    library = new ProjectLibrary({ queryClient });
    library.start();
    libraries.set(queryClient, library);
    startedLibraries.push(library);
  }
  return library;
};
/* A wrapper's library outlives its tree, as the runtime's does: stop it with the case. */
const startedLibraries: Array<InstanceType<typeof ProjectLibrary>> = [];
afterEach(() => {
  for (const library of startedLibraries.splice(0)) {
    library.stop();
  }
});

const createHarness = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /** Every listing written into the one `['projects']` key, in order: the catalog a person sees. */
  const publishedListings: ProjectListing[] = [];
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success' && event.query.queryKey[0] === 'projects') {
      publishedListings.push(event.query.state.data as ProjectListing);
    }
  });
  const wrapper = function Wrapper({ children }: { readonly children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ProjectManagerProvider, { library: libraryFor(queryClient) }, children),
    );
  };
  return { ...renderHook(() => useProjectManager(), { wrapper }), publishedListings };
};

/** Drain every pending continuation; the fake clock yields once and fires nothing. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

/** A scan that reports when it starts and returns `result` only once released. */
const heldScan = (result: ProjectDiscoveryResult) => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  mockListProjectManifests.mockImplementationOnce(async () => {
    started.resolve();
    await release.promise;
    return result;
  });
  return {
    started: started.promise,
    release: () => {
      release.resolve();
    },
  };
};

describe('useProjectManager discovery (I7, I9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    for (const mock of [
      mockListProjectManifests,
      mockVerifyProjectRoute,
      mockGetAllProjectFileSystemConfigs,
      mockGetProjectFileSystemConfig,
      mockGetPendingProjectOperations,
      mockGetProjectLibraryState,
      mockSyncProjectRoots,
      mockListWorkspaces,
      mockDeleteProjectResources,
      mockSetProjectFileSystemConfig,
      mockDeleteProjectFileSystemConfig,
    ]) {
      mock.mockReset();
    }
    mockListProjectManifests.mockResolvedValue(validProjectDiscovery);
    mockVerifyProjectRoute.mockResolvedValue({ status: 'discovery-required' });
    mockGetAllProjectFileSystemConfigs.mockResolvedValue([]);
    mockGetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockGetPendingProjectOperations.mockResolvedValue([]);
    mockGetProjectLibraryState.mockImplementation(async (projectId) => ({ projectId, lastActivityAt: 10 }));
    mockSyncProjectRoots.mockResolvedValue(undefined);
    mockListWorkspaces.mockResolvedValue([]);
    mockDeleteProjectResources.mockResolvedValue(undefined);
    mockSetProjectFileSystemConfig.mockResolvedValue(undefined);
    mockDeleteProjectFileSystemConfig.mockResolvedValue(undefined);
    mockBuildSuperseded = false;
    projectRootConfigurationListener = undefined;
    onWorkerRead = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Epoch fence ───────────────────────────────────────────────────────────

  describe('a pass superseded by a newer epoch', () => {
    it('I7: should not apply the superseded pass to the listing, the route snapshot or the orphan sweep', async () => {
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([projectConfig]);
      const { result } = createHarness();
      await act(async () => result.current.getProjectListing());
      expect(mockListProjectManifests).toHaveBeenCalledOnce();

      /* A later listing's pass sees no project under a complete root, so applying
       * it would list nothing and prune the project's route as an orphan. */
      const stale = heldScan(emptyDiscovery);
      const listing = result.current.getProjectListing();
      await act(async () => stale.started);
      act(() => {
        emitManifestChange('/test-project/tau.json');
      });
      stale.release();

      await act(async () => {
        await expect(listing).resolves.toMatchObject({ projects: [{ projectId: fakeProject.id }] });
      });
      expect(mockListProjectManifests).toHaveBeenCalledTimes(3);
      expect(mockDeleteProjectResources).not.toHaveBeenCalled();
      expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();

      // Route access reads the current pass's snapshot, never the superseded one.
      await act(async () => {
        await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({
          status: 'ready',
        });
      });
      expect(mockVerifyProjectRoute).not.toHaveBeenCalled();
      expect(mockListProjectManifests).toHaveBeenCalledTimes(3);
    });

    it.fails.each(['scans', 'makes its last read before writing'] as const)(
      'I7: should not write route configs from a pass superseded by a newer epoch while it %s',
      async (moment) => {
        // The stale pass finds the project with no route config, so applying it upserts one.
        const stale = moment === 'scans' ? heldScan(validProjectDiscovery) : undefined;
        if (moment === 'makes its last read before writing') {
          mockListProjectManifests.mockResolvedValueOnce(validProjectDiscovery);
          // `listWorkspaces` is the pass's last read before its writes.
          mockListWorkspaces.mockImplementationOnce(async () => {
            emitManifestChange('/test-project/tau.json');
            return [];
          });
        }
        mockListProjectManifests.mockResolvedValue(emptyDiscovery);
        const { result } = createHarness();

        const listing = result.current.getProjectListing();
        if (stale) {
          await act(async () => stale.started);
          // The project's manifest is deleted while the pass is still scanning.
          act(() => {
            emitManifestChange('/test-project/tau.json');
          });
          stale.release();
        }
        await act(async () => {
          await expect(listing).resolves.toMatchObject({ projects: [] });
        });

        expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      },
    );

    it.fails('I7: should not prune orphans from a pass whose epoch moved while it readied the worker', async () => {
      // The first pass holds an orphan; once the epoch moves, the current pass holds none.
      mockGetAllProjectFileSystemConfigs
        .mockResolvedValueOnce([projectConfig, orphanConfig])
        .mockResolvedValue([projectConfig]);
      // `listWorkspaces` is the pass's last read before its prune: arm the next worker wait.
      mockListWorkspaces.mockImplementationOnce(async () => {
        onWorkerRead = () => {
          onWorkerRead = undefined;
          emitManifestChange('/test-project/tau.json');
        };
        return [];
      });
      const { result } = createHarness();

      await act(async () => {
        await expect(result.current.getProjectListing()).resolves.toMatchObject({
          projects: [{ projectId: fakeProject.id }],
        });
      });
      expect(mockListProjectManifests).toHaveBeenCalledTimes(2);

      expect(mockDeleteProjectResources).not.toHaveBeenCalled();
    });

    it.fails.each(['scans', 'enriches its listing'] as const)(
      'I7: should not publish a workspace catalog from a pass superseded by a newer epoch while it %s',
      async (moment) => {
        const stale = moment === 'scans' ? heldScan(validProjectDiscovery) : undefined;
        if (moment === 'enriches its listing') {
          mockListProjectManifests.mockResolvedValueOnce(validProjectDiscovery);
          // The pass reads workspaces once; the listing's enrichment reads them again before the publish.
          mockListWorkspaces.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
            emitManifestChange('/test-project/tau.json');
            return [];
          });
        }
        mockListProjectManifests.mockResolvedValue(emptyDiscovery);
        const { result, publishedListings } = createHarness();

        const refresh = result.current.refreshWorkspaceCatalog();
        if (stale) {
          await act(async () => stale.started);
          // The project's manifest is deleted while the pass is still scanning.
          act(() => {
            emitManifestChange('/test-project/tau.json');
          });
          stale.release();
        }
        await act(async () => refresh);
        await settle();

        expect(
          publishedListings.flatMap((listing) => listing.projects.map(({ projectId }) => projectId)),
        ).not.toContain(fakeProject.id);
      },
    );
  });

  // ── Write stop ────────────────────────────────────────────────────────────

  describe('a pass skipped during a write stop', () => {
    it('I9: should redo the skipped pass once when the stop ends, and not again on a later notice', async () => {
      mockBuildSuperseded = true;
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([orphanConfig]);
      const { result } = createHarness();
      await act(async () => result.current.getProjectListing());
      expect(mockListProjectManifests).toHaveBeenCalledOnce();
      expect(mockDeleteProjectFileSystemConfig).not.toHaveBeenCalled();

      mockBuildSuperseded = false;
      act(() => {
        announceBuildSkew();
      });
      await settle();

      expect(mockListProjectManifests).toHaveBeenCalledTimes(2);
      expect(mockDeleteProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith(orphanProjectId);
      expect(mockSetProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith(projectConfig);

      // The redo cleared the skip: a second notice with nothing skipped runs no pass.
      act(() => {
        announceBuildSkew();
      });
      await settle();

      expect(mockListProjectManifests).toHaveBeenCalledTimes(2);
      expect(mockDeleteProjectFileSystemConfig).toHaveBeenCalledOnce();
    });

    it('I9: should let a pass still in flight end before redoing the writes it skipped', async () => {
      mockGetAllProjectFileSystemConfigs
        .mockResolvedValueOnce([projectConfig])
        .mockResolvedValueOnce([orphanConfig])
        .mockResolvedValue([]);
      const { result } = createHarness();
      await act(async () => result.current.getProjectListing());
      expect(mockListProjectManifests).toHaveBeenCalledOnce();

      // A newer tab announces itself while the next pass deletes the orphan's resources.
      mockDeleteProjectResources.mockImplementationOnce(async () => {
        mockBuildSuperseded = true;
      });
      const rootsSynced = Promise.withResolvers<void>();
      const rootsSyncStarted = Promise.withResolvers<void>();
      mockSyncProjectRoots.mockImplementationOnce(async () => {
        rootsSyncStarted.resolve();
        await rootsSynced.promise;
      });
      // A catalog refresh runs one pass and never retries it on an epoch move.
      const refresh = result.current.refreshWorkspaceCatalog();
      await act(async () => rootsSyncStarted.promise);
      // The pass skipped its upsert and is still applying the deletes when the stop ends.
      expect(mockSetProjectFileSystemConfig).not.toHaveBeenCalled();
      mockBuildSuperseded = false;
      act(() => {
        announceBuildSkew();
      });
      await settle();
      expect(mockListProjectManifests).toHaveBeenCalledTimes(2);

      rootsSynced.resolve();
      await act(async () => refresh);
      await settle();

      expect(mockListProjectManifests).toHaveBeenCalledTimes(3);
      expect(mockSetProjectFileSystemConfig).toHaveBeenCalledExactlyOnceWith(projectConfig);
      expect(mockListProjectManifests.mock.invocationCallOrder[2]).toBeGreaterThan(
        mockSyncProjectRoots.mock.invocationCallOrder[0]!,
      );
    });
  });

  // ── Another tab's root configuration ──────────────────────────────────────

  describe('a root-configuration change announced by another tab', () => {
    it('I7: should supersede the pass in flight and list what the next pass reads', async () => {
      const stale = heldScan(validProjectDiscovery);
      mockListProjectManifests.mockResolvedValue(emptyDiscovery);
      const { result } = createHarness();

      const listing = result.current.getProjectListing();
      await act(async () => stale.started);
      act(() => {
        projectRootConfigurationListener?.();
      });
      await settle();
      expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
      stale.release();

      await act(async () => {
        await expect(listing).resolves.toMatchObject({ projects: [] });
      });
      expect(mockListProjectManifests).toHaveBeenCalledTimes(2);
      // The routes another tab wrote are applied before the pass that lists them reads.
      expect(mockSyncProjectRoots.mock.invocationCallOrder[0]).toBeLessThan(
        mockListProjectManifests.mock.invocationCallOrder[1]!,
      );
      // The change replays no bootstrap work.
      expect(mockGetPendingProjectOperations).toHaveBeenCalledOnce();
    });

    it('I7: should drop the route snapshot so route access reads again', async () => {
      mockGetAllProjectFileSystemConfigs.mockResolvedValue([projectConfig]);
      const { result } = createHarness();
      await act(async () => result.current.getProjectListing());
      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toMatchObject({ status: 'ready' });
      expect(mockVerifyProjectRoute).not.toHaveBeenCalled();

      act(() => {
        projectRootConfigurationListener?.();
      });
      await settle();
      mockVerifyProjectRoute.mockResolvedValue({ status: 'unavailable' });

      await expect(result.current.getProjectRouteAccess(fakeProject.id)).resolves.toEqual({ status: 'unavailable' });
      expect(mockVerifyProjectRoute).toHaveBeenCalledExactlyOnceWith({ projectId: fakeProject.id });
      expect(mockSyncProjectRoots).toHaveBeenCalledOnce();
    });
  });
});
