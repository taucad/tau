/**
 * The 386-directory discovery fixture of the project-library fast-path blueprint (FW0): an authority over the
 * operator's profile, Home in OPFS with 84 project directories and one File System Access folder with 302, a few ids
 * carried by a copy in each, and every call the scan makes counted at the provider and at the browser handle.
 *
 * Both roots are the provider family the field runs (`OPFSProvider` extends `FileSystemAccessProvider`), each over an
 * in-memory handle tree whose browser calls are counted (`onBrowserCall`). The directories are written into the handle
 * trees before the providers exist, so no provider cache is warm from the setup. The caller imports
 * `fake-indexeddb/auto` (OPFS keeps its unsettled-create records in IndexedDB) and calls `dispose`.
 *
 * Test-only: reachable through the package's internal `#*` imports and deliberately absent from `exports`.
 *
 * @module
 */
import { vi } from 'vitest';
import { randomUuid } from '@taucad/utils/id';
import { serializeProjectManifest, projectToManifest } from '@taucad/types';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import type { ProjectRootConfig, ProjectRootConfiguration } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProjectDirectoryIndex } from '#project-directory-index.js';
import { workerTimingCounters, workerTimings } from '#worker-timings.js';
import type { WorkerTimingCounter } from '#worker-timings.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import type { MockBrowserCall } from '#testing/mock-handle-factory.js';
import { countProviderCalls } from '#testing/counting-provider.js';
import type { ProviderCallCounts } from '#testing/counting-provider.js';
import type { FileSystemProvider } from '#types.js';

/** How many project directories each root holds, and how many ids a copy in each root shares. @public */
export type DiscoveryProfileShape = Readonly<{
  /** Directories in Home (OPFS). */
  home: number;
  /** Directories in the File System Access folder, the copies included. */
  workspace: number;
  /** Home projects that also have a copy in the folder: each is one more directory carrying the same id. */
  duplicates: number;
  /**
   * Milliseconds each root rounds a written file's modification time down to; `Infinity` keeps every time at 0, an
   * unchanged mtime. Default 1, the clock as it is (`MockRootHandleOptions.timestampGranularity`).
   */
  timestampGranularity?: number;
}>;

/** The operator's profile (blueprint, Problem Statement): 84 in Home, 302 in one folder, a few duplicated ids. @public */
export const operatorDiscoveryProfile: DiscoveryProfileShape = { home: 84, workspace: 302, duplicates: 3 };

/** The id of the Home project at `index`: a valid generated project id. @public */
export const discoveryProfileHomeId = (index: number): string => `proj_h${String(index).padStart(20, '0')}`;

/** The id of the folder project at `index`. @public */
export const discoveryProfileWorkspaceId = (index: number): string => `proj_w${String(index).padStart(20, '0')}`;

/** The discovery counters a scan moves. */
const discoveryCounters = workerTimingCounters.filter((name) => name.startsWith('discovery.'));

/** What one measured operation cost. @public */
export type DiscoveryCost = Readonly<{
  /** Calls the authority made on each root's provider, by method and by kind of question. */
  providers: Readonly<{ home: ProviderCallCounts; workspace: ProviderCallCounts }>;
  /** Browser file calls each root's handles answered, by call. */
  browser: Readonly<{ home: Readonly<Record<string, number>>; workspace: Readonly<Record<string, number>> }>;
  /** Browser file calls across both roots. */
  browserCalls: number;
  /** How far each `discovery.*` worker-timing counter moved. */
  counters: Readonly<Partial<Record<WorkerTimingCounter, number>>>;
}>;

/** The fixture, built. @public */
export type DiscoveryProfile = Readonly<{
  service: WorkspaceFileService;
  /** The authority's discovery index (FW2), so a test can make it cold and measure a full read. */
  index: ProjectDirectoryIndex;
  /** Write one file into a root's handle tree behind the authority's back, as another program would. */
  writeBehind: (root: 'home' | 'workspace', path: string, bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** Remove one entry of a root's handle tree, recursively, behind the authority's back. */
  removeBehind: (root: 'home' | 'workspace', path: string) => Promise<void>;
  /** The providers the authority reads each root through, for a test that injects a fault. */
  providers: Readonly<{ home: FileSystemProvider; workspace: FileSystemProvider }>;
  shape: DiscoveryProfileShape;
  /** Run `operation` and report what it cost, counted from a clean window. */
  measure: <Result>(operation: () => Promise<Result>) => Promise<Readonly<{ result: Result; cost: DiscoveryCost }>>;
  dispose: () => void;
}>;

type MockRoot = ReturnType<typeof createMockRootHandle>;

/** Write one file into a handle tree through the handle API, creating its directories. */
const writeInto = async (root: MockRoot, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  const segments = path.split('/');
  const name = segments.pop()!;
  let directory = root;
  for (const segment of segments) {
    // oxlint-disable-next-line no-await-in-loop -- Each directory is opened inside the last.
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(bytes);
  await writable.close();
};

/** Write one identified project directory: its strict manifest and its generated identity. */
const writeProject = async (
  root: MockRoot,
  { directory, projectId, name }: Readonly<{ directory: string; projectId: string; name: string }>,
): Promise<void> => {
  const manifest = projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } });
  await writeInto(root, `${directory}/tau.json`, serializeProjectManifest(manifest));
  await writeInto(root, `${directory}/${projectIdentityPath}`, serializeProjectIdentity({ version: 1, projectId }));
};

/** A handle tree whose browser calls are tallied while `counting` is on. */
const countedRoot = (
  timestampGranularity: number | undefined,
): Readonly<{
  root: MockRoot;
  tally: Map<MockBrowserCall, number>;
  setCounting: (on: boolean) => void;
}> => {
  const tally = new Map<MockBrowserCall, number>();
  let counting = false;
  const root = createMockRootHandle({
    ...(timestampGranularity === undefined ? {} : { timestampGranularity }),
    onBrowserCall: (call) => {
      if (counting) {
        tally.set(call, (tally.get(call) ?? 0) + 1);
      }
    },
  });
  return {
    root,
    tally,
    setCounting: (on) => {
      counting = on;
    },
  };
};

/** Each discovery counter's total over every kept second. */
const counterTotals = (): Map<WorkerTimingCounter, number> => {
  const { counters } = workerTimings.summarize(0);
  return new Map(discoveryCounters.map((name) => [name, counters[name]?.total ?? 0]));
};

/**
 * Build the fixture: write the directories, configure both roots and let the folder's first poll settle.
 *
 * @param shape - How many directories each root holds; the operator's profile by default.
 * @returns The authority over the fixture and its meter.
 * @public
 */
export async function createDiscoveryProfile(
  shape: DiscoveryProfileShape = operatorDiscoveryProfile,
): Promise<DiscoveryProfile> {
  const home = countedRoot(shape.timestampGranularity);
  const workspace = countedRoot(shape.timestampGranularity);
  for (let index = 0; index < shape.home; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup; order keeps the trees deterministic.
    await writeProject(home.root, {
      directory: `home-${String(index).padStart(3, '0')}`,
      projectId: discoveryProfileHomeId(index),
      name: `Home ${index}`,
    });
  }
  for (let index = 0; index < shape.duplicates; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
    await writeProject(workspace.root, {
      directory: `copy-${String(index).padStart(3, '0')}`,
      projectId: discoveryProfileHomeId(index),
      name: `Home ${index}`,
    });
  }
  for (let index = 0; index < shape.workspace - shape.duplicates; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
    await writeProject(workspace.root, {
      directory: `folder-${String(index).padStart(3, '0')}`,
      projectId: discoveryProfileWorkspaceId(index),
      name: `Folder ${index}`,
    });
  }

  vi.stubGlobal('FileSystemObserver', undefined);
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => home.root } });
  const providerRegistry = new ProviderRegistry({ databasePrefix: `tau-discovery-profile-${randomUuid()}` });
  const rootStorageRootKey = `memory:discovery-profile-${randomUuid()}`;
  const rootProvider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: rootStorageRootKey });
  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, { class: 'authored', backend: 'memory', storageRootKey: rootStorageRootKey });
  const index = new ProjectDirectoryIndex();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
    discoveryIndex: index,
  });
  const workspaceScope = {
    backend: 'webaccess',
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- The in-memory handle tree implements only the members a provider calls, not the DOM's whole `FileSystemDirectoryHandle`; this is the one place it stands in for it.
    directoryHandle: workspace.root as unknown as FileSystemDirectoryHandle,
    workspaceId: 'wsp_discoveryprofile00000',
  } as const;
  const homeInstance = await providerRegistry.getProvider({ backend: 'opfs' });
  const workspaceInstance = await providerRegistry.getProvider(workspaceScope);
  const homeProvider = countProviderCalls(homeInstance);
  const workspaceProvider = countProviderCalls(workspaceInstance);
  /* Every project is routed to its own directory, and a duplicated id to its Home copy, as the library binds them. */
  const projects: ProjectRootConfiguration['projects'] = [
    ...Array.from(
      { length: shape.home },
      (_, index): ProjectRootConfig => ({
        backend: 'opfs',
        projectId: discoveryProfileHomeId(index),
        providerBasePath: `home-${String(index).padStart(3, '0')}`,
      }),
    ),
    ...Array.from(
      { length: shape.workspace - shape.duplicates },
      (_, index): ProjectRootConfig => ({
        backend: 'webaccess',
        workspaceId: workspaceScope.workspaceId,
        projectId: discoveryProfileWorkspaceId(index),
        providerBasePath: `folder-${String(index).padStart(3, '0')}`,
      }),
    ),
  ];
  await service.configureProjectRoots({ projects, roots: [{ backend: 'opfs' }, workspaceScope] });
  await service.pollExternalChanges();

  const measure = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Readonly<{ result: Result; cost: DiscoveryCost }>> => {
    homeProvider.reset();
    workspaceProvider.reset();
    home.tally.clear();
    workspace.tally.clear();
    const before = counterTotals();
    home.setCounting(true);
    workspace.setCounting(true);
    let result: Result;
    try {
      result = await operation();
    } finally {
      home.setCounting(false);
      workspace.setCounting(false);
    }
    const after = counterTotals();
    const browserCalls = [...home.tally.values(), ...workspace.tally.values()].reduce((sum, count) => sum + count, 0);
    return {
      result,
      cost: {
        providers: { home: homeProvider.counts(), workspace: workspaceProvider.counts() },
        browser: { home: Object.fromEntries(home.tally), workspace: Object.fromEntries(workspace.tally) },
        browserCalls,
        counters: Object.fromEntries(
          discoveryCounters.flatMap((name) => {
            const moved = (after.get(name) ?? 0) - (before.get(name) ?? 0);
            return moved === 0 ? [] : [[name, moved]];
          }),
        ),
      },
    };
  };

  return {
    service,
    index,
    writeBehind: async (root, path, bytes) => writeInto(root === 'home' ? home.root : workspace.root, path, bytes),
    removeBehind: async (root, path) => {
      const segments = path.split('/');
      const name = segments.pop()!;
      let directory = root === 'home' ? home.root : workspace.root;
      for (const segment of segments) {
        // oxlint-disable-next-line no-await-in-loop -- Each directory is opened inside the last.
        directory = await directory.getDirectoryHandle(segment);
      }
      await directory.removeEntry(name, { recursive: true });
    },
    providers: { home: homeInstance, workspace: workspaceInstance },
    shape,
    measure,
    dispose: () => {
      homeProvider.restore();
      workspaceProvider.restore();
      service.dispose();
      vi.unstubAllGlobals();
    },
  };
}
