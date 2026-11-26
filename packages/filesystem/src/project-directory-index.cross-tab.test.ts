// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from '@taucad/utils/id';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProjectDirectoryIndex } from '#project-directory-index.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import { countProviderCalls } from '#testing/counting-provider.js';
import type { CountingProvider } from '#testing/counting-provider.js';

/**
 * S5 and A2 (b, c) of the discovery index: two tabs over one Home, each its own authority, with no observer. What tab
 * A creates, adopts, renames and deletes is listed by tab B's next pass, through the notice A publishes and B takes
 * before its mount filter, at the cost index-contract review A7 states: 1 listing and 2 reads after a create, an adopt
 * or a rename, 1 listing after a delete. A notice that follows a lost one makes every root of B cold.
 */

const id = (index: number): string => `proj_x${String(index).padStart(20, '0')}`;
const manifestBytes = (name: string): Uint8Array<ArrayBuffer> =>
  serializeProjectManifest(
    projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
  );

type Tab = Readonly<{ service: WorkspaceFileService; index: ProjectDirectoryIndex; calls: CountingProvider }>;

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  vi.unstubAllGlobals();
});

const writeInto = async (
  root: ReturnType<typeof createMockRootHandle>,
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> => {
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

/** Two tabs over one Home in OPFS, with three projects and one adoptable directory. */
const twoTabs = async (): Promise<Readonly<{ a: Tab; b: Tab; home: ReturnType<typeof createMockRootHandle> }>> => {
  const home = createMockRootHandle();
  for (let index = 0; index < 3; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
    await writeInto(home, `p-${index}/tau.json`, manifestBytes(`P ${index}`));
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
    await writeInto(
      home,
      `p-${index}/${projectIdentityPath}`,
      serializeProjectIdentity({ version: 1, projectId: id(index) }),
    );
  }
  await writeInto(home, 'loose/.tau/chats/keep.json', new TextEncoder().encode('{}'));
  vi.stubGlobal('FileSystemObserver', undefined);
  vi.stubGlobal('navigator', {
    storage: { getDirectory: async () => home },
    /* One process: a lock is granted at once. */
    locks: {
      request: async (_name: string, _options: unknown, grant: () => Promise<unknown>) => grant(),
      query: async () => ({ held: [], pending: [] }),
    },
  });
  const databasePrefix = `tau-cross-tab-${randomUuid()}`;
  const tab = async (): Promise<Tab> => {
    const registry = new ProviderRegistry({ databasePrefix });
    const rootKey = `memory:cross-tab-${randomUuid()}`;
    const mountTable = new MountTable();
    mountTable.mount('/', await registry.getProvider({ backend: 'memory', storageRootKey: rootKey }), {
      class: 'authored',
      backend: 'memory',
      storageRootKey: rootKey,
    });
    const index = new ProjectDirectoryIndex();
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable,
      discoveryIndex: index,
    });
    const calls = countProviderCalls(await registry.getProvider({ backend: 'opfs' }));
    await service.configureProjectRoots({
      projects: [0, 1, 2].map((index) => ({ backend: 'opfs', projectId: id(index), providerBasePath: `p-${index}` })),
      roots: [{ backend: 'opfs' }],
    });
    await service.listProjectManifests();
    disposers.push(() => {
      calls.restore();
      service.dispose();
    });
    return { service, index, calls };
  };
  return { a: await tab(), b: await tab(), home };
};

/** Wait for B to take the notice A published, then run B's next pass and report what it cost. */
const nextPass = async (
  b: Tab,
): Promise<Readonly<{ ids: Map<string, string | undefined>; listings: number; fileReads: number }>> => {
  const [home] = await b.service.getRootStatuses();
  await vi.waitFor(() => {
    const view = b.index.view(home!.storageRootKey);
    expect(view !== undefined && (view.dirty.length > 0 || !view.namesListed)).toBe(true);
  });
  b.calls.reset();
  const result = await b.service.listProjectManifests();
  const { listings, fileReads } = b.calls.counts();
  return {
    ids: new Map(
      result.entries.map((entry) => [
        entry.locator.relativeDirectory,
        'projectId' in entry ? entry.projectId : undefined,
      ]),
    ),
    listings,
    fileReads,
  };
};

describe('a sibling tab, with no observer (S5)', () => {
  it('should list what a sibling creates with 1 listing and 2 reads', async () => {
    const { a, b } = await twoTabs();

    await a.service.commitPendingProjectDirectory({
      projectId: id(9),
      providerBasePath: 'created',
      scope: { backend: 'opfs' },
      files: {},
      manifest: manifestBytes('Created'),
    });
    const pass = await nextPass(b);

    expect(pass.ids.get('created')).toBe(id(9));
    expect({ listings: pass.listings, fileReads: pass.fileReads }).toEqual({ listings: 1, fileReads: 2 });
  });

  it('should list what a sibling adopts with 1 listing and 2 reads', async () => {
    const { a, b } = await twoTabs();
    const [home] = await a.service.getRootStatuses();

    const adopted = await a.service.adoptProjectDirectory({
      backend: 'opfs',
      storageRootKey: home!.storageRootKey,
      relativeDirectory: 'loose',
    });
    const pass = await nextPass(b);

    expect(pass.ids.get('loose')).toBe(adopted.projectId);
    expect({ listings: pass.listings, fileReads: pass.fileReads }).toEqual({ listings: 1, fileReads: 2 });
  });

  it('should list what a sibling renames with at most 1 listing and 2 reads', async () => {
    const { a, b } = await twoTabs();

    await a.service.createRootedFileSystem(`/projects/${id(1)}`).writeFile('tau.json', manifestBytes('Renamed'));
    const pass = await nextPass(b);
    const listing = await b.service.listProjectManifests();

    const renamed = listing.entries.find((entry) => entry.locator.relativeDirectory === 'p-1');
    expect(renamed?.status === 'valid' ? renamed.manifest.name : undefined).toBe('Renamed');
    expect(pass.listings).toBeLessThanOrEqual(1);
    expect(pass.fileReads).toBe(2);
  });

  it('should stop listing what a sibling deletes with 1 listing', async () => {
    const { a, b } = await twoTabs();

    await expect(
      a.service.permanentlyDeleteProjectDirectory({
        projectId: id(2),
        providerBasePath: 'p-2',
        scope: { backend: 'opfs' },
      }),
    ).resolves.toEqual({ status: 'deleted' });
    const pass = await nextPass(b);

    expect(pass.ids.has('p-2')).toBe(false);
    expect({ listings: pass.listings, fileReads: pass.fileReads }).toEqual({ listings: 1, fileReads: 0 });
  });

  it('should make every root cold on a notice that follows a lost one (A2 c)', async () => {
    const { b } = await twoTabs();
    const [home] = await b.service.getRootStatuses();
    const ghost = new BroadcastChannel('tau-fs-changes');
    disposers.push(() => {
      ghost.close();
    });
    const notice = (seq: number): unknown => ({
      tabId: 'ghost-tab',
      seq,
      changes: [
        { type: 'write', path: '/scratch/x', authority: { storageRootKey: 'memory:elsewhere', providerBasePath: '' } },
      ],
    });

    ghost.postMessage(notice(1));
    ghost.postMessage(notice(3));

    await vi.waitFor(() => {
      expect(b.index.view(home!.storageRootKey)?.currency).toBe('cold');
    });
  });
});
