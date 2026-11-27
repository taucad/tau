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
import { locatorToPendingStorage } from '#runtime/project-library-storage.js';
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

/** The ids the library's published listing shows. */
const listedProjectIds = (harness: Pick<Harness, 'queryClient'>): string[] =>
  harness.queryClient.getQueryData<ProjectListing>(['projects'])?.projects.map((project) => project.projectId) ?? [];

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
  /* The operator's ruling, "cancel and say so" (FW3 review B1): the delete removed nothing, so its row completes, the
   * project stays listed with its state and route, and the caller is told why with a typed outcome. */
  it('should cancel the delete and keep the project listed when the other copy goes between the journal and the removal', async () => {
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
    const route = harness.profile.routes.get(projectId);

    let outcome: unknown;
    let routeAfter: unknown;
    await act(async () => {
      outcome = await harness.library.commands.permanentlyDeleteProject(
        projectId,
        harness.profile.locatorOf('workspace', 'copy-000'),
      );
      /* Read before the pass the settled row owes: that pass rebinds the route away from the copy the other tab
       * deleted, which is discovery's work and not the cancelled delete's. */
      routeAfter = harness.profile.routes.get(projectId);
      await settle(harness);
    });

    expect(outcome).toMatchObject({
      status: 'cancelled',
      cancellation: { projectId, reason: 'absent', unavailable: [] },
    });
    await expect(worker.getPendingProjectOperations()).resolves.toEqual([]);
    expect(listedProjectIds(harness)).toContain(projectId);
    await expect(worker.getProjectLibraryState(projectId)).resolves.toBeDefined();
    expect(routeAfter).toEqual(route);
    await expect(harness.profile.rootFiles.get().client.verifyAbsent(projectId)).resolves.toEqual({
      status: 'present',
      locators: [harness.profile.locatorOf('workspace', 'copy-000')],
    });
  });

  it('should cancel and name the folder when the other copy could not be read', async () => {
    const harness = await startLibrary();
    const projectId = homeId(0);
    const { client } = harness.profile.rootFiles.get();
    const away = harness.profile.locatorOf('home', 'home-000');
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockResolvedValueOnce({
      status: 'copy-unproven',
      reason: 'unknown',
      unavailable: [away],
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await harness.library.commands.permanentlyDeleteProject(
        projectId,
        harness.profile.locatorOf('workspace', 'copy-000'),
      );
      await settle(harness);
    });

    expect(outcome).toMatchObject({
      status: 'cancelled',
      cancellation: { projectId, reason: 'unknown', unavailable: [away] },
    });
    await expect(harness.profile.worker.getPendingProjectOperations()).resolves.toEqual([]);
    expect(listedProjectIds(harness)).toContain(projectId);
  });

  /* Review N1: after a restart a picked folder waits on its permission prompt and the index is empty; the authority
   * cannot tell whether another copy exists, and the cancel says so instead of "the only copy". */
  it('should cancel with an unknown reason when the authority could not tell, naming no folder', async () => {
    const harness = await startLibrary();
    const projectId = homeId(0);
    const { client } = harness.profile.rootFiles.get();
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockResolvedValueOnce({
      status: 'copy-unproven',
      reason: 'unknown',
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await harness.library.commands.permanentlyDeleteProject(
        projectId,
        harness.profile.locatorOf('workspace', 'copy-000'),
      );
      await settle(harness);
    });

    expect(outcome).toMatchObject({
      status: 'cancelled',
      cancellation: { projectId, reason: 'unknown', unavailable: [] },
    });
  });

  /* Review N2: a row this tab saw fail proves nothing either way, and is not left out of the proof: after M2 its
   * directory is whole (it failed before the manifest went) or has no manifest, which a probe reads vacant. */
  it('should not leave out of the proof a directory whose delete row failed in this tab', async () => {
    const harness = await startLibrary();
    const { profile } = harness;
    const { client } = profile.rootFiles.get();
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockResolvedValueOnce({ status: 'unidentifiable' });
    await act(async () => {
      await expect(
        harness.library.commands.permanentlyDeleteProject(homeId(1), profile.locatorOf('workspace', 'copy-001')),
      ).rejects.toMatchObject({ reason: 'identity-conflict' });
      await settle(harness);
    });
    const probe = vi.spyOn(client, 'probeProjectDirectories');

    await act(async () => {
      await harness.library.commands.permanentlyDeleteProject(homeId(0), profile.locatorOf('workspace', 'copy-000'));
      await settle(harness);
    });

    const excluded = probe.mock.calls.flatMap(([request]) => request.exclude ?? []);
    expect(excluded.map((left) => left.relativeDirectory)).not.toContain('copy-001');
  });

  /* Review N3: only the refusal of an authority from before FW3 degrades; any other probe failure fails the command. */
  it('should fail, not fall back, when the probe fails for another reason', async () => {
    const harness = await startLibrary();
    const { profile, library } = harness;
    const { client } = profile.rootFiles.get();
    vi.spyOn(client, 'probeProjectDirectories').mockRejectedValue(new Error('The folder is busy.'));
    const discover = vi.spyOn(client, 'listProjectManifests');
    const route = profile.routes.get(homeId(1));

    await act(async () => {
      await expect(
        library.workspaceCommands.chooseProjectDirectory(profile.locatorOf('workspace', 'copy-001'), homeId(1)),
      ).rejects.toThrow('The folder is busy.');
      await expect(
        library.commands.permanentlyDeleteProject(homeId(0), profile.locatorOf('workspace', 'copy-000')),
      ).rejects.toThrow('The folder is busy.');
      await expect(
        library.commands.createProject({
          kernel: 'auto',
          projectName: 'Busy',
          location: { kind: 'home' },
          chat: false,
        }),
      ).rejects.toThrow('The folder is busy.');
    });

    expect(profile.routes.get(homeId(1))).toEqual(route);
    expect(discover).not.toHaveBeenCalled();
  });

  /* Two tabs over one journal and one authority delete the last two copies: tab 2 proves tab 1's copy, and tab 1's
   * whole delete lands before tab 2 journals (the race the copy proof held through the journal closes). Tab 1's copy
   * is deleted, tab 2's delete is cancelled, and the project stays listed in both tabs. */
  it('should cancel the second of two tabs deleting the last two copies, and keep the project listed in both', async () => {
    const first = await startLibrary();
    const second = await startLibrary(first.profile);
    const projectId = homeId(0);
    const { profile } = first;
    const journal = profile.worker.beginPermanentDeleteProject.bind(profile.worker);
    let firstOutcome: unknown;
    vi.spyOn(profile.worker, 'beginPermanentDeleteProject').mockImplementationOnce(async (...args) => {
      /* Tab 2 has proven tab 1's copy; tab 1's delete of it runs to the end before tab 2's row is written. */
      firstOutcome = await first.library.commands.permanentlyDeleteProject(
        projectId,
        profile.locatorOf('home', 'home-000'),
      );
      return journal(...args);
    });

    let secondOutcome: unknown;
    await act(async () => {
      secondOutcome = await second.library.commands.permanentlyDeleteProject(
        projectId,
        profile.locatorOf('workspace', 'copy-000'),
      );
      await settle(first);
      await settle(second);
    });

    expect(firstOutcome).toEqual({ status: 'deleted' });
    expect(secondOutcome).toMatchObject({ status: 'cancelled', cancellation: { projectId } });
    await expect(profile.worker.getPendingProjectOperations()).resolves.toEqual([]);
    await expect(profile.rootFiles.get().client.verifyAbsent(projectId)).resolves.toEqual({
      status: 'present',
      locators: [profile.locatorOf('workspace', 'copy-000')],
    });
    await act(async () => {
      await first.queryClient.refetchQueries({ queryKey: ['projects'] });
      await second.queryClient.refetchQueries({ queryKey: ['projects'] });
      await settle(first);
      await settle(second);
    });
    expect(listedProjectIds(first)).toContain(projectId);
    expect(listedProjectIds(second)).toContain(projectId);
  });

  /* Review M2 at the page: tab 1 is inside its removal of one copy (or died there); tab 2, already open, deletes the
   * other copy. The copy under tab 1's pending delete proves nothing, so tab 2 asks for the Trash, and once tab 1's
   * removal lands one copy is still there. */
  it("should ask for the Trash when the only other copy is under another tab's unfinished delete", async () => {
    const first = await startLibrary();
    const { profile } = first;
    const second = await startLibrary(profile);
    const projectId = homeId(0);
    const { client } = profile.rootFiles.get();
    const remove = client.permanentlyDeleteProjectDirectory.bind(client);
    const reached = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockImplementationOnce(async (input) => {
      reached.resolve();
      await resume.promise;
      return remove(input);
    });
    const firstDelete = first.library.commands.permanentlyDeleteProject(
      projectId,
      profile.locatorOf('workspace', 'copy-000'),
    );
    await reached.promise;
    const begin = vi.spyOn(profile.worker, 'beginPermanentDeleteProject');

    await act(async () => {
      await expect(
        second.library.commands.permanentlyDeleteProject(projectId, profile.locatorOf('home', 'home-000')),
      ).rejects.toThrow('Permanent delete is available only for trashed projects');
    });
    resume.resolve();
    await act(async () => {
      await firstDelete;
      await settle(first);
      await settle(second);
    });

    expect(begin.mock.calls.map((call) => call[2])).toEqual([undefined]);
    await expect(profile.rootFiles.get().client.verifyAbsent(projectId)).resolves.toEqual({
      status: 'present',
      locators: [profile.locatorOf('home', 'home-000')],
    });
  });

  /* Review m3: an authority from before FW3 refuses the probe. Every caller degrades to what it did before. */
  it('should create, bind and delete as before when the authority refuses the probe', async () => {
    const harness = await startLibrary();
    const { profile, library } = harness;
    const { client } = profile.rootFiles.get();
    /* What the bridge answers for a method the authority does not serve. */
    vi.spyOn(client, 'probeProjectDirectories').mockRejectedValue(new Error('Unknown method: probeProjectDirectories'));
    const listed = vi.spyOn(client, 'listProjectManifests');

    await act(async () => {
      await library.commands.createProject({
        kernel: 'auto',
        projectName: 'Older',
        location: { kind: 'home' },
        chat: false,
      });
      await library.workspaceCommands.chooseProjectDirectory(profile.locatorOf('workspace', 'copy-001'), homeId(1));
      /* No proof of the other copy: the delete asks for the Trash. */
      await expect(
        library.commands.permanentlyDeleteProject(homeId(0), profile.locatorOf('workspace', 'copy-000')),
      ).rejects.toThrow('Permanent delete is available only for trashed projects');
      await settle(harness);
    });

    expect(listed).toHaveBeenCalled();
    expect(profile.routes.get(homeId(1))?.providerBasePath).toBe('copy-001');
  });

  it("should settle a sole copy's delete from the sweep when the authority answers no remainder", async () => {
    const harness = await startLibrary();
    const { profile } = harness;
    const projectId = homeId(3);
    const { client } = profile.rootFiles.get();
    const remove = client.permanentlyDeleteProjectDirectory.bind(client);
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockImplementationOnce(async (input) => {
      const result = await remove(input);
      /* An authority from before FW3 answers the status alone. */
      const older: Awaited<ReturnType<typeof remove>> =
        result.status === 'deleted' || result.status === 'absent' ? { status: result.status } : result;
      return older;
    });

    await act(async () => {
      await harness.library.commands.permanentlyDeleteProject(projectId);
      await settle(harness);
    });

    await expect(profile.worker.getPendingProjectOperations()).resolves.toEqual([]);
    await expect(profile.worker.getProjectLibraryState(projectId)).resolves.toBeUndefined();
  });

  /* Review M1 at the page: a remaining copy that is the deleted directory under another spelling is a conflict. */
  it('should not settle on a remaining copy that names the deleted folder in another case', async () => {
    const harness = await startLibrary();
    const { profile } = harness;
    const projectId = homeId(0);
    const { client } = profile.rootFiles.get();
    vi.spyOn(client, 'permanentlyDeleteProjectDirectory').mockResolvedValueOnce({
      status: 'deleted',
      remaining: [profile.locatorOf('workspace', 'COPY-000')],
    });

    await act(async () => {
      await expect(
        harness.library.commands.permanentlyDeleteProject(projectId, profile.locatorOf('workspace', 'copy-000')),
      ).rejects.toMatchObject({ reason: 'identity-conflict' });
      await settle(harness);
    });

    await expect(profile.worker.getProjectLibraryState(projectId)).resolves.toBeDefined();
  });

  it('should not bind a folder whose copy is under a pending delete', async () => {
    const harness = await startLibrary();
    const { profile } = harness;
    const projectId = homeId(1);
    await profile.worker.beginPermanentDeleteProject(
      projectId,
      locatorToPendingStorage(profile.locatorOf('workspace', 'copy-001')),
      {
        copy: true,
      },
    );

    await expect(
      harness.library.workspaceCommands.chooseProjectDirectory(profile.locatorOf('workspace', 'copy-001'), projectId),
    ).rejects.toThrow('This folder no longer holds that project.');
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

  /* B1 after a reload: the row the crashed tab journaled with `copy` is replayed, the other copy has gone meanwhile, and
   * the replay cancels: the row completes, the project stays listed, and the notice waits where recoveries surface. */
  it('should cancel a replayed copy delete whose other copy went while the tab was away, and say so', async () => {
    const first = await startLibrary();
    const { profile } = first;
    const projectId = homeId(0);
    const crashed = hangAfter(clientOf(profile), 'permanentlyDeleteProjectDirectory', async () => undefined);
    void first.library.commands.permanentlyDeleteProject(projectId, profile.locatorOf('workspace', 'copy-000'));
    await crashed;
    first.stop();
    vi.restoreAllMocks();
    profile.removeDirectory('home', 'home-000');

    const second = await startLibrary(profile);
    await act(async () => {
      await settle(second);
    });

    await expect(profile.worker.getPendingProjectOperations()).resolves.toEqual([]);
    expect(listedProjectIds(second)).toContain(projectId);
    await expect(profile.worker.getProjectLibraryState(projectId)).resolves.toBeDefined();
    expect(second.library.getSnapshot().cancelledDeletes).toEqual([
      expect.objectContaining({ projectId, unavailable: [] }),
    ]);
    second.library.dismissCancelledDelete(second.library.getSnapshot().cancelledDeletes[0]!.operationId);
    expect(second.library.getSnapshot().cancelledDeletes).toEqual([]);
  });

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

/*
 * Fast path FW4: what nobody waits on one by one runs in the background lane. The library asks for it by name: the
 * orphan sweep's identity sweep, and the recovery reads of library rows over connections that declared the lane.
 */
describe('the background lane in the library (FW4)', () => {
  it('should ask the authority for the orphan sweep in the background lane', async () => {
    const profile = createLibraryProfile();
    const orphanId = 'proj_orphan00000000000000';
    profile.routes.set(orphanId, { projectId: orphanId, backend: 'opfs', providerBasePath: 'gone' });
    const verifyAbsent = vi.spyOn(profile.rootFiles.get().client, 'verifyAbsent');

    await startLibrary(profile);

    expect(verifyAbsent).toHaveBeenCalledWith(orphanId, { lane: 'background' });
    expect(profile.routes.has(orphanId)).toBe(false);
  });

  it('should recover missing library rows through the background record client', async () => {
    const profile = createLibraryProfile();
    const facade = profile.rootFiles.get();
    const backgroundReads: string[] = [];
    const interactiveReads: string[] = [];
    const read = facade.recordFiles.readFile;
    vi.spyOn(facade.recordFiles, 'readFile').mockImplementation((async (path: string, encoding?: 'utf8') => {
      interactiveReads.push(path);
      return encoding === undefined ? read(path) : read(path, encoding);
    }) as typeof read);
    profile.rootFiles.replace({
      ...facade,
      backgroundRecordFiles: {
        ...facade.recordFiles,
        readFile: (async (path: string, encoding?: 'utf8') => {
          backgroundReads.push(path);
          return encoding === undefined ? read(path) : read(path, encoding);
        }) as typeof read,
      },
    });
    const recovered = homeId(5);
    const getStates = profile.worker.getProjectLibraryStates.bind(profile.worker);
    vi.spyOn(profile.worker, 'getProjectLibraryStates').mockImplementation(async (projectIds) => {
      const states = await getStates(projectIds);
      return states.filter((state) => state.projectId !== recovered);
    });

    const harness = await startLibrary(profile);

    expect(listedProjectIds(harness)).toContain(recovered);
    expect(backgroundReads).toContain(`/projects/${recovered}/.tau/library.json`);
    expect(interactiveReads.filter((path) => path.startsWith(`/projects/${recovered}/`))).toEqual([]);
  });
});
