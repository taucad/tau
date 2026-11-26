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
import { afterEach, describe, expect, it, vi } from 'vitest';
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

type Ceiling = Readonly<{
  scan: Readonly<{ fileReads: number; listings: number; browserCalls: number }>;
  verification: Readonly<{ fileReads: number; listings: number; browserCalls: number }>;
  mutations: Readonly<Record<string, Readonly<Budget>>>;
}>;

/** What one mutation cost. */
type Budget = {
  scans: number;
  verifications: number;
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
const startLibrary = async (): Promise<Harness> => {
  const profile = createLibraryProfile();
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
  stops.push(() => {
    unmount();
    unsubscribe();
    library.stop();
    queryClient.unmount();
    queryClient.clear();
  });
  const harness = { profile, library, queryClient, manager: () => result.current };
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
  verifications,
  recordReads,
}: Readonly<{ scans: number; verifications: number; recordReads: number }>): Budget => ({
  scans,
  verifications,
  recordReads,
  discoveryReads:
    scans * (ceiling.scan.fileReads + ceiling.scan.listings) +
    verifications * (ceiling.verification.fileReads + ceiling.verification.listings),
  browserCalls: scans * ceiling.scan.browserCalls + verifications * ceiling.verification.browserCalls,
});

describe('discovery budget per library mutation', () => {
  it('should charge a scan and a verification at the unit costs the filesystem measures', () => {
    const unitCost = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '../../../../packages/filesystem/src/testing/discovery-unit-cost.json'),
        'utf8',
      ),
    ) as Readonly<{ scan: unknown; verification: unknown }>;

    expect({ scan: ceiling.scan, verification: ceiling.verification }).toEqual({
      scan: unitCost.scan,
      verification: unitCost.verification,
    });
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
    for (const key of ['scans', 'verifications', 'recordReads', 'discoveryReads', 'browserCalls'] as const) {
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
