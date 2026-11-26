/**
 * The discovery budget of each library mutation (project-library fast-path blueprint FW0, Performance targets).
 *
 * Each row runs one mutation through a started `ProjectLibrary`, with the listing query mounted as the library page
 * mounts it, on the 386-directory profile (`createLibraryProfile`: 84 projects in Home, 302 in one folder, three ids
 * with a copy in each), and counts what the library asks of the authority until everything it started has settled:
 * full discovery scans, targeted route verifications and direct `tau.json` record reads. `discovery-budget.ceiling.json`
 * holds each mutation to its counts, with the discovery reads and browser calls they cost at the per-call figures the
 * filesystem cost test measures. Counts are the minimum for one tab: no observation runs, so no watch adds a pass.
 */
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { projectToManifest } from '@taucad/types';
import { ProjectLibrary } from '#runtime/project-library.js';
import type { ProjectLibraryServices } from '#runtime/project-library.js';
import {
  createLibraryProfile,
  libraryProfileFolderId,
  libraryProfileHomeId,
  libraryProfileWorkspaceId,
} from '#runtime/project-library.fixture.js';
import type { LibraryProfile, LibraryProfileRoute } from '#runtime/project-library.fixture.js';
import type { ProjectManagerWorker, ProjectLibraryRootFacade } from '#types/project-library-io.types.js';
import type { ProjectListing } from '#runtime/project-library-storage.js';
import { ProjectManagerProvider } from '#hooks/project-manager-provider.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { ProjectManagerContextType } from '#hooks/use-project-manager.js';

/** The profile the `handle-store` double reads and writes: the current row's. */
const current = vi.hoisted(() => ({ profile: undefined as LibraryProfile | undefined }));

vi.mock('@taucad/files-ui/filesystem/handle-store', async (importOriginal) => {
  /* `libraryProfileFolderId`, spelled out: the fixture imports this module, so the factory cannot import it. */
  const workspaceId = 'wsp_libraryprofile0000000';
  const routes = (): Map<string, LibraryProfileRoute> => current.profile!.routes;
  const workspace = {
    workspaceId,
    name: 'tau-workspace',
    slug: 'tau-workspace',
    lastConnectedAt: 0,
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getProjectFileSystemConfig: async (projectId: string) => routes().get(projectId),
    getAllProjectFileSystemConfigs: async () => [...routes().values()],
    setProjectFileSystemConfig: async (config: LibraryProfileRoute) => {
      routes().set(config.projectId, config);
    },
    deleteProjectFileSystemConfig: async (projectId: string) => {
      routes().delete(projectId);
    },
    applyProjectFileSystemConfigChanges: async ({
      upserts,
      deletes,
    }: Readonly<{ upserts: readonly LibraryProfileRoute[]; deletes: readonly string[] }>) => {
      for (const projectId of deletes) {
        routes().delete(projectId);
      }
      for (const config of upserts) {
        routes().set(config.projectId, config);
      }
    },
    listWorkspaces: async () => [workspace],
    getWorkspace: async (id: string) => (id === workspaceId ? { workspace, handle: {} } : undefined),
    getWorkspaceMetadata: async (id: string) => (id === workspaceId ? workspace : undefined),
    checkHandlePermission: async () => 'granted',
    getHomeStorageBackend: async () => 'opfs',
    pinHomeStorageBackend: async (backend: string) => backend,
    requestHomeStoragePersistence: async () => undefined,
    getProjectCreationLocation: async () => ({ location: { kind: 'home' } }),
    setProjectCreationLocation: async () => undefined,
    subscribeProjectRootConfigurationChanges: () => () => undefined,
  };
});

vi.mock('@taucad/files-ui/constants/browser.constants', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  directoryPicker: () => ({ available: true, backend: 'webaccess', pick: async () => undefined }),
}));

type UnitCost = Readonly<{ fileReads: number; listings: number; browserCalls: number }>;
/**
 * The unit rows the filesystem cost test measures: a full read, a warm pass, a directory re-read, a sweep, a
 * verification, a probe of one location and one root listing (FW3).
 */
const unitRows = ['scan', 'warmPass', 'directoryRead', 'sweep', 'verification', 'probe', 'listing'] as const;
type Ceiling = Readonly<Record<(typeof unitRows)[number], UnitCost>> &
  Readonly<{ mutations: Readonly<Record<string, Readonly<Budget>>> }>;

/** What one mutation cost. */
type Budget = {
  /** Full discovery reads of every directory (FW2: only the first pass after a reload or a reset). */
  scans: number;
  /** Directories a warm pass re-read because evidence marked them. */
  directoryReads: number;
  /** Identity sweeps: `verifyAbsent` proving from storage whether any directory carries an id. */
  sweeps: number;
  verifications: number;
  /** Known locations read under their locks (FW3): the library's probes and those of the authority's delete. */
  probes: number;
  /** Fresh listings of a root's child names (FW3). */
  listings: number;
  /** `tau.json` reads through the record client, outside a scan or a verification. */
  recordReads: number;
  discoveryReads: number;
  browserCalls: number;
};

const ceiling = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'discovery-budget.ceiling.json'), 'utf8'),
) as Ceiling;

function notCalled(): never {
  throw new Error('not called in the budget profile');
}

/** The app's services over the profile's worker and chat store. */
const servicesOf = (profile: LibraryProfile): ProjectLibraryServices<ProjectManagerWorker> => ({
  startObjectStore: () => ({
    worker: { terminate: () => undefined } as unknown as Worker,
    wrappedWorker: profile.worker,
  }),
  reportFault: () => undefined,
  reportWorkerFailed: () => undefined,
  buildSkew: { isSuperseded: () => false, subscribe: () => () => undefined },
  createChatStore: () => profile.chatStore,
  clearLegacyListing: () => undefined,
  projectTemplates: {
    createEntrylessProject: (projectName) => {
      const { $schema: _schema, ...manifest } = projectToManifest({
        name: projectName,
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.ts' } },
      });
      return manifest;
    },
    createInitialProject: notCalled,
    getKernelOption: notCalled,
    getKernelDependencies: notCalled,
    getKernelProjectTemplate: notCalled,
  },
  buildUserMessage: notCalled,
  cloudIntent: { set: () => undefined },
  isCaughtUp: () => true,
});

type Harness = Readonly<{
  profile: LibraryProfile;
  library: ProjectLibrary<ProjectManagerWorker>;
  queryClient: QueryClient;
  manager: () => ProjectManagerContextType;
  /** Stop this library, as a reload of its tab does: what it was doing never settles. */
  stop: () => void;
}>;

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  current.profile = undefined;
});

/** Settles once nothing the library started is in flight: no query fetches and no pass runs, for a few turns. */
const settle = async (harness: Pick<Harness, 'library' | 'queryClient'>): Promise<void> => {
  let quiet = 0;
  for (let turn = 0; quiet < 5; turn += 1) {
    if (turn > 2000) {
      throw new Error('The library did not settle');
    }
    // oxlint-disable-next-line no-await-in-loop -- Each turn lets the library's own work run.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const idle =
      harness.queryClient.isFetching() === 0 && harness.library.discovery.getSnapshot().matches({ pass: 'idle' });
    quiet = idle ? quiet + 1 : 0;
  }
};

/** A started library over a fresh profile, with the listing query mounted and its first listing published. */
const startLibrary = async (profile: LibraryProfile = createLibraryProfile()): Promise<Harness> => {
  current.profile = profile;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /* Mounted as `QueryClientProvider` mounts it, so a regained focus reaches the listing query. */
  queryClient.mount();
  const library = new ProjectLibrary<ProjectManagerWorker>({
    queryClient,
    rootFiles: () => profile.rootFiles,
    services: servicesOf(profile),
  });
  library.start();
  /* The library page's listing query, as `useProjects` mounts it. */
  const observer = new QueryObserver(queryClient, { ...library.listingQuery, staleTime: 3000 });
  const unsubscribe = observer.subscribe(() => undefined);
  const managerServices = {
    generateProjectName: notCalled,
    seedChatPermission: async () => undefined,
    removeChatPermission: async () => undefined,
    prepareFirstProjectTour: async () => undefined,
  };
  const { result, unmount } = renderHook(() => useProjectManager(), {
    wrapper: ({ children }: { children?: ReactNode }) =>
      createElement(
        ProjectManagerProvider<ProjectManagerWorker, ProjectLibraryRootFacade, unknown>,
        { library, services: managerServices },
        children,
      ),
  });
  let stopped = false;
  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    unmount();
    unsubscribe();
    library.stop();
    queryClient.unmount();
    queryClient.clear();
  };
  stops.push(stop);
  const harness = { profile, library, queryClient, manager: () => result.current, stop };
  await settle(harness);
  expect(queryClient.getQueryData(['projects'])).toBeDefined();
  return harness;
};

/** The mutations of the blueprint's scan table (Finding 2), each on the profile. */
const homeId = libraryProfileHomeId;
const chatId = `chat_${homeId(13)}`;
const mutations: Readonly<Record<string, (harness: Harness) => Promise<unknown>>> = {
  /* W0's Delete this copy: the folder copy of a project whose route binds its Home copy. */
  'delete-copy': async ({ library, profile }) =>
    library.commands.permanentlyDeleteProject(homeId(0), profile.locatorOf('workspace', 'copy-000')),
  /* A trashed project's only directory. */
  'permanent-delete': async ({ library }) => library.commands.permanentlyDeleteProject(homeId(3)),
  'use-this-folder': async ({ library, profile }) =>
    library.workspaceCommands.chooseProjectDirectory(profile.locatorOf('workspace', 'copy-001'), homeId(1)),
  create: async ({ library }) =>
    library.commands.createProject({ kernel: 'auto', projectName: 'Budget', location: { kind: 'home' }, chat: false }),
  duplicate: async ({ library }) => library.commands.duplicateProject(homeId(10)),
  rename: async ({ library }) => library.commands.updateProject(homeId(11), { name: 'Renamed' }),
  trash: async ({ library }) => library.commands.trashProject(homeId(12)),
  restore: async ({ library }) => library.commands.restoreProject(homeId(3)),
  'chat-create': async ({ manager }) => manager().createChat(homeId(13), { name: 'Chat', messages: [] }),
  'chat-soft-delete': async ({ manager }) => manager().softDeleteChat(chatId),
  'chat-delete': async ({ manager }) => manager().deleteChat(chatId),
  'chat-purge': async ({ manager }) => manager().purgeChat(chatId),
  'chat-recency': async ({ library }) => library.touchChatRecency(chatId, Date.now()),
  /* The window regains focus once the listing is stale (`staleTime: 3000`). */
  'window-focus': async () => {
    vi.setSystemTime(Date.now() + 4000);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  },
};

/**
 * What `counts` cost at the per-call figures the ceiling's `scan` and `verification` rows carry. Those rows are held to
 * the unit costs the filesystem cost test measures (`packages/filesystem/src/testing/discovery-unit-cost.json`), so
 * they cannot drift from the authority's real cost.
 */
const budgetOf = ({
  scans,
  directoryReads,
  sweeps,
  verifications,
  probes,
  listings,
  recordReads,
}: Readonly<{
  scans: number;
  directoryReads: number;
  sweeps: number;
  verifications: number;
  probes: number;
  listings: number;
  recordReads: number;
}>): Budget => {
  const units = [
    [scans, ceiling.scan],
    [directoryReads, ceiling.directoryRead],
    [sweeps, ceiling.sweep],
    [verifications, ceiling.verification],
    [probes, ceiling.probe],
    [listings, ceiling.listing],
  ] as const;
  return {
    scans,
    directoryReads,
    sweeps,
    verifications,
    probes,
    listings,
    recordReads,
    discoveryReads: units.reduce((sum, [count, unit]) => sum + count * (unit.fileReads + unit.listings), 0),
    browserCalls: units.reduce((sum, [count, unit]) => sum + count * unit.browserCalls, 0),
  };
};

describe('discovery budget per library mutation', () => {
  it('should charge every unit at the cost the filesystem measures', () => {
    const unitCost = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '../../../../packages/filesystem/src/testing/discovery-unit-cost.json'),
        'utf8',
      ),
    ) as Readonly<Record<(typeof unitRows)[number], unknown>>;

    expect(Object.fromEntries(unitRows.map((row) => [row, ceiling[row]]))).toEqual(
      Object.fromEntries(unitRows.map((row) => [row, unitCost[row]])),
    );
  });

  it('should hold one budget row for every mutation it runs, and no other', () => {
    expect(Object.keys(ceiling.mutations).toSorted()).toEqual(Object.keys(mutations).toSorted());
  });

  it.each(Object.keys(mutations))('should hold %s to its committed ceiling', async (name) => {
    const harness = await startLibrary();
    harness.profile.reset();

    await act(async () => {
      await mutations[name]!(harness);
      await settle(harness);
    });

    const measured = budgetOf(harness.profile.counts());
    const committed = ceiling.mutations[name];
    const report = `${name} measured ${JSON.stringify(measured)}; ceiling ${JSON.stringify(committed)}`;
    for (const key of [
      'scans',
      'directoryReads',
      'sweeps',
      'verifications',
      'probes',
      'listings',
      'recordReads',
      'discoveryReads',
      'browserCalls',
    ] as const) {
      expect(measured[key], `${report}: ${key} rose above its ceiling`).toBeLessThanOrEqual(committed?.[key] ?? 0);
      expect(measured[key], `${report}: ${key} fell below its ceiling; lower the ceiling to match`).toBe(
        committed?.[key],
      );
    }
  });

  it('should profile the library the filesystem cost test measures', () => {
    const profile = createLibraryProfile();
    expect(profile.shape).toEqual({ home: 84, workspace: 302, duplicates: 3 });
    expect(libraryProfileWorkspaceId(0)).toMatch(/^proj_[\dA-Za-z]{21}$/u);
    expect(libraryProfileFolderId).toBe('wsp_libraryprofile0000000');
  });
});

/* Fast-path blueprint FW1: what removing the scans nothing needs must keep. */
describe('mutations that change no disk fact', () => {
  it('should move no epoch for a chat recency touch, and list the project at its new activity', async () => {
    const harness = await startLibrary();
    const { epoch } = harness.library.discovery.getSnapshot().context;
    const touchedAt = 1_800_000_000_000;

    await act(async () => {
      await harness.library.touchChatRecency(chatId, touchedAt);
      await settle(harness);
    });

    expect(harness.library.discovery.getSnapshot().context.epoch).toBe(epoch);
    const listing = harness.queryClient.getQueryData<ProjectListing>(['projects']);
    expect(listing?.projects.find((project) => project.projectId === homeId(13))?.library.lastActivityAt).toBe(
      touchedAt,
    );
  });

  it('should list a trashed project as trashed with no scan', async () => {
    const harness = await startLibrary();
    harness.profile.reset();

    await act(async () => {
      await harness.library.commands.trashProject(homeId(12));
      await settle(harness);
    });

    const listing = harness.queryClient.getQueryData<ProjectListing>(['projects']);
    expect(listing?.projects.find((project) => project.projectId === homeId(12))?.library.deletedAt).toBeDefined();
    expect(harness.profile.counts().scans).toBe(0);
  });
});

describe('listing rows refreshed with no scan', () => {
  it('should keep the newer listing when an earlier refresh of the same pass finishes last', async () => {
    const harness = await startLibrary();
    const projectId = homeId(12);
    const { worker } = harness.profile;
    await worker.trashProject(projectId);
    /* The first refresh reads the rows while the project is in the Trash, and its read answers only once released. */
    const released = Promise.withResolvers<void>();
    const readStates = worker.getProjectLibraryStates.bind(worker);
    vi.spyOn(worker, 'getProjectLibraryStates').mockImplementationOnce(async (projectIds) => {
      const states = await readStates(projectIds);
      await released.promise;
      return states;
    });
    const earlier = harness.library.refreshListingRows();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    /* Restore, and a second refresh of the same pass reads and publishes the restored row first. */
    await worker.restoreProject(projectId);
    await harness.library.refreshListingRows();
    const deletedAtOf = (): number | undefined =>
      harness.queryClient
        .getQueryData<ProjectListing>(['projects'])
        ?.projects.find((project) => project.projectId === projectId)?.library.deletedAt;
    expect(deletedAtOf()).toBeUndefined();

    released.resolve();
    await earlier;

    expect(deletedAtOf()).toBeUndefined();
  });
});

describe('a copy delete proves the other copy from disk', () => {
  it('should journal a copy delete with copy once it has read the route copy', async () => {
    const harness = await startLibrary();
    const begin = vi.spyOn(harness.profile.worker, 'beginPermanentDeleteProject');

    await act(async () => {
      await harness.library.commands.permanentlyDeleteProject(
        homeId(0),
        harness.profile.locatorOf('workspace', 'copy-000'),
      );
      await settle(harness);
    });

    expect(begin.mock.calls.map((call) => call[2])).toEqual([{ copy: true }]);
  });

  /* Review B1, FW3: a copy no route binds is proven by a probe of it, never by the index, which may still list a gone copy. */
  it('should ask for the Trash when the index lists an unbound copy that is gone from disk', async () => {
    const harness = await startLibrary();
    const begin = vi.spyOn(harness.profile.worker, 'beginPermanentDeleteProject');
    /* The pass lists the folder copy no route binds; the disk no longer holds it, and no evidence says so. */
    harness.profile.removeDirectory('workspace', 'copy-000');
    harness.profile.reset();

    await act(async () => {
      await expect(harness.library.commands.permanentlyDeleteProject(homeId(0))).rejects.toThrow(
        'Permanent delete is available only for trashed projects',
      );
      await settle(harness);
    });

    expect(begin.mock.calls.map((call) => call[2])).toEqual([undefined]);
    expect(harness.profile.counts()).toMatchObject({ scans: 0, sweeps: 0, probes: 1 });
  });

  it('should journal a copy delete whose other copy vanished without copy, so the Trash check applies', async () => {
    const harness = await startLibrary();
    const begin = vi.spyOn(harness.profile.worker, 'beginPermanentDeleteProject');
    /* The pass still lists the route's copy; the disk no longer holds it. */
    harness.profile.removeDirectory('home', 'home-000');
    harness.profile.reset();

    await act(async () => {
      await expect(
        harness.library.commands.permanentlyDeleteProject(
          homeId(0),
          harness.profile.locatorOf('workspace', 'copy-000'),
        ),
      ).rejects.toThrow('Permanent delete is available only for trashed projects');
      await settle(harness);
    });

    expect(begin.mock.calls.map((call) => call[2])).toEqual([undefined]);
    expect(harness.profile.counts()).toMatchObject({ scans: 0, verifications: 0, probes: 1 });
  });

  it('should not count a read of the target as proof when the route moves onto it mid-precheck', async () => {
    const harness = await startLibrary();
    const begin = vi.spyOn(harness.profile.worker, 'beginPermanentDeleteProject');
    /* The pass still lists the Home copy; the disk no longer holds it, so the target is the last copy. */
    harness.profile.removeDirectory('home', 'home-000');
    /* After the precheck read the route (it bound the Home copy) and before the probe reads, "Use this folder" rebinds
     * the route onto the very copy being deleted, as `chooseProjectDirectory` would with no mutation gate. */
    harness.profile.onVerification((projectId) => {
      if (projectId === homeId(0)) {
        harness.profile.routes.set(projectId, {
          projectId,
          backend: 'webaccess',
          workspaceId: libraryProfileFolderId,
          providerBasePath: 'copy-000',
        });
      }
    });

    await act(async () => {
      await expect(
        harness.library.commands.permanentlyDeleteProject(
          homeId(0),
          harness.profile.locatorOf('workspace', 'copy-000'),
        ),
      ).rejects.toThrow('Permanent delete is available only for trashed projects');
      await settle(harness);
    });

    expect(begin.mock.calls.map((call) => call[2])).toEqual([undefined]);
  });

  /* FW3, copy proof held through the journal: the proof the journal waived the Trash on is taken again by the
   * authority under the project's lock with the removal. Another tab deleting the other copy after this tab's probe
   * and before its removal (here, as the journal row is written) leaves this copy where it is. */
  it('should leave the copy and keep the project state when the other copy goes between the journal and the removal', async () => {
    const harness = await startLibrary();
    const { worker } = harness.profile;
    const projectId = homeId(0);
    const journal = worker.beginPermanentDeleteProject.bind(worker);
    vi.spyOn(worker, 'beginPermanentDeleteProject').mockImplementationOnce(async (...args) => {
      const operationId = await journal(...args);
      /* Another tab's delete of the Home copy, the last other copy, settles now. */
      harness.profile.removeDirectory('home', 'home-000');
      return operationId;
    });
    harness.profile.reset();

    await act(async () => {
      await expect(
        harness.library.commands.permanentlyDeleteProject(
          projectId,
          harness.profile.locatorOf('workspace', 'copy-000'),
        ),
      ).rejects.toMatchObject({ reason: 'identity-conflict' });
      await settle(harness);
    });

    /* The folder copy is still on disk: nothing was removed, and the id's device state stayed. The failed row hides it
     * until the person discards the row (DF11). */
    await expect(harness.profile.rootFiles.get().client.verifyAbsent(projectId)).resolves.toEqual({
      status: 'present',
      locators: [harness.profile.locatorOf('workspace', 'copy-000')],
    });
    await expect(worker.getProjectLibraryState(projectId)).resolves.toBeDefined();
    const [row] = await worker.getPendingProjectOperations();
    expect(row).toMatchObject({ kind: 'permanent-delete', projectId, copy: true });
  });

  it('should reclaim nothing when the authority cannot tell what remains, and keep the row for the folder', async () => {
    const harness = await startLibrary();
    const { worker } = harness.profile;
    const projectId = homeId(0);
    const { client } = harness.profile.rootFiles.get();
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockResolvedValueOnce({
      status: 'deleted',
      remaining: [],
      absence: 'unknown',
    });

    await act(async () => {
      await expect(
        harness.library.commands.permanentlyDeleteProject(
          projectId,
          harness.profile.locatorOf('workspace', 'copy-000'),
        ),
      ).rejects.toMatchObject({ reason: 'workspace-unavailable' });
      await settle(harness);
    });

    await expect(worker.getProjectLibraryState(projectId)).resolves.toBeDefined();
    expect(harness.profile.routes.has(projectId)).toBe(true);
  });
});

/*
 * The blueprint's delay test (Performance targets, method 3), in the library: every discovery pass answers late, here
 * not at all until released, and a copy delete still completes within 1 s, because nothing it waits for is a pass.
 */
describe('a copy delete while every discovery pass is held (FW3)', () => {
  it('should complete within 1 s with no pass answering', async () => {
    const harness = await startLibrary();
    const { client } = harness.profile.rootFiles.get();
    const release = Promise.withResolvers<void>();
    const list = client.listProjectManifests.bind(client);
    const held = vi.spyOn(client, 'listProjectManifests').mockImplementation(async () => {
      await release.promise;
      return list();
    });
    onTestFinished(() => {
      release.resolve();
    });
    const projectId = homeId(0);

    const started = performance.now();
    await harness.library.commands.permanentlyDeleteProject(
      projectId,
      harness.profile.locatorOf('workspace', 'copy-000'),
    );
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(1000);
    await expect(harness.profile.worker.getPendingProjectOperations()).resolves.toEqual([]);
    await expect(client.verifyAbsent(projectId)).resolves.toEqual({
      status: 'present',
      locators: [harness.profile.locatorOf('home', 'home-000')],
    });
    /* A pass was asked for, the one the settled row owes, and none answered while the delete ran. */
    expect(held).toHaveBeenCalled();
  });
});

/*
 * S3 and S4 (fast-path FW3): a permanent delete whose tab reloads after each row of the blueprint's crash table. The
 * first library stops where the row says, with its work never settling; a second library over the same disk, journal and
 * stores replays what the journal holds. Nothing is lost that the person kept, the route never stays bound to a missing
 * copy, and the journal ends empty. The interrupted removals inside the authority are replayed by the filesystem's own
 * test of each state (`project-directories.targeted-verification.test.ts`).
 */
describe('a permanent delete across a reload after each row of the crash table (S3, S4)', () => {
  const never = async (): Promise<never> =>
    new Promise<never>(() => {
      /* Never settles: the tab reloaded. */
    });
  type Row = Readonly<{
    name: string;
    /** The project and copy deleted; with no locator, the route's copy. */
    projectId: string;
    locator?: Readonly<{ root: 'home' | 'workspace'; relativeDirectory: string }>;
    /** Stop the first library at this row; resolves once it is there. */
    crashAt: (profile: LibraryProfile) => Promise<void>;
    /** What the disk and the stores hold once the second library has replayed. */
    expected: Readonly<{ carrying: readonly string[]; route: string | undefined; state: boolean }>;
  }>;
  const hangAfter = async <Arguments extends unknown[], Result>(
    target: Record<string, unknown>,
    method: string,
    run: (original: (...arguments_: Arguments) => Promise<Result>, ...arguments_: Arguments) => Promise<Result>,
  ): Promise<void> => {
    const reached = Promise.withResolvers<void>();
    const original = (target[method] as (...arguments_: Arguments) => Promise<Result>).bind(target);
    vi.spyOn(target as Record<string, (...arguments_: Arguments) => Promise<Result>>, method).mockImplementationOnce(
      async (...arguments_: Arguments) => {
        await run(original, ...arguments_);
        reached.resolve();
        return never();
      },
    );
    return reached.promise;
  };
  const clientOf = (profile: LibraryProfile): Record<string, unknown> =>
    profile.rootFiles.get().client as unknown as Record<string, unknown>;
  const rows: readonly Row[] = [
    {
      name: 'the probe, before the journal row',
      projectId: homeId(0),
      locator: { root: 'workspace', relativeDirectory: 'copy-000' },
      crashAt: async (profile) =>
        hangAfter(
          profile.worker as unknown as Record<string, unknown>,
          'beginPermanentDeleteProject',
          async () => undefined,
        ),
      expected: { carrying: ['home-000', 'copy-000'], route: 'home-000', state: true },
    },
    {
      name: 'the journal row',
      projectId: homeId(0),
      locator: { root: 'workspace', relativeDirectory: 'copy-000' },
      crashAt: async (profile) =>
        hangAfter(
          profile.worker as unknown as Record<string, unknown>,
          'beginPermanentDeleteProject',
          async (journal, ...rest) => journal(...rest),
        ),
      expected: { carrying: ['home-000'], route: 'home-000', state: true },
    },
    {
      name: 'the directory removed, before any settle write',
      projectId: homeId(0),
      locator: { root: 'workspace', relativeDirectory: 'copy-000' },
      crashAt: async (profile) =>
        hangAfter(clientOf(profile), 'permanentlyDeleteProjectDirectory', async (remove, ...rest) => remove(...rest)),
      expected: { carrying: ['home-000'], route: 'home-000', state: true },
    },
    {
      name: 'the route write, before the row completes',
      /* The route binds the Home copy, which is the one deleted: the settle moves the route to the folder copy. */
      projectId: homeId(1),
      locator: { root: 'home', relativeDirectory: 'home-001' },
      crashAt: async (profile) =>
        hangAfter(
          profile.worker as unknown as Record<string, unknown>,
          'completePendingProjectOperation',
          async () => undefined,
        ),
      expected: { carrying: ['copy-001'], route: 'copy-001', state: true },
    },
    {
      name: "part of a sole copy's reclaim",
      /* The trashed Home project: its only directory. */
      projectId: homeId(3),
      crashAt: async (profile) =>
        hangAfter(
          profile.worker as unknown as Record<string, unknown>,
          'deleteProjectResources',
          async (reclaim, ...rest) => reclaim(...rest),
        ),
      expected: { carrying: [], route: undefined, state: false },
    },
  ];

  it.each(rows)('should recover a crash after $name', async ({ projectId, locator, crashAt, expected }) => {
    const first = await startLibrary();
    const { profile } = first;
    const crashed = crashAt(profile);
    void first.library.commands.permanentlyDeleteProject(
      projectId,
      locator === undefined ? undefined : profile.locatorOf(locator.root, locator.relativeDirectory),
    );
    await crashed;
    first.stop();
    vi.restoreAllMocks();

    const second = await startLibrary(profile);
    await act(async () => {
      await settle(second);
    });

    await expect(profile.worker.getPendingProjectOperations()).resolves.toEqual([]);
    const absence = await profile.rootFiles.get().client.verifyAbsent(projectId);
    expect(absence.status === 'present' ? absence.locators.map((found) => found.relativeDirectory) : []).toEqual(
      expected.carrying,
    );
    /* S3: the route binds a copy that is there, or is gone with the project. */
    expect(profile.routes.get(projectId)?.providerBasePath).toBe(expected.route);
    await expect(profile.worker.getProjectLibraryState(projectId).then((state) => state !== undefined)).resolves.toBe(
      expected.state,
    );
  });
});
