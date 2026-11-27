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
import { maxIndexedChildren, ProjectDirectoryIndex, retainedManifestBudgetBytes } from '#project-directory-index.js';
import type { ProjectDirectoryReading } from '#project-directories.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import { workerTimings } from '#worker-timings.js';

/**
 * A5 and S14 of the discovery index: a root past the index's bounds lists correctly, is read on every pass as before
 * the index, and the index's memory stays under its budget. The fixture is a Home of 50,000 child directories, 40 of
 * them projects.
 */

const directories = 50_000;
const projects = 40;
const projectId = (index: number): string => `proj_b${String(index).padStart(20, '0')}`;

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  vi.unstubAllGlobals();
});

const unretained = (): number => workerTimings.summarize(0).counters['discovery.unretained']?.total ?? 0;

describe('a root past the discovery index bounds (A5, S14)', () => {
  it('should list a 50,000-directory root correctly on every pass with the index under its budget', async () => {
    const home = createMockRootHandle();
    for (let index = 0; index < directories; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
      const directory = await home.getDirectoryHandle(`d-${String(index).padStart(5, '0')}`, { create: true });
      if (index % (directories / projects) === 0) {
        const write = async (handle: typeof directory, name: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
          const file = await handle.getFileHandle(name, { create: true });
          const writable = await file.createWritable();
          await writable.write(bytes);
          await writable.close();
        };
        const id = projectId(index / (directories / projects));
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        await write(
          directory,
          'tau.json',
          serializeProjectManifest(
            projectToManifest({ name: id, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
          ),
        );
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        const control = await directory.getDirectoryHandle('.tau', { create: true });
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        await write(
          control,
          projectIdentityPath.split('/').at(-1)!,
          serializeProjectIdentity({ version: 1, projectId: id }),
        );
      }
    }
    vi.stubGlobal('FileSystemObserver', undefined);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => home } });
    const registry = new ProviderRegistry({ databasePrefix: `tau-bounds-${randomUuid()}` });
    const rootKey = `memory:bounds-${randomUuid()}`;
    const mountTable = new MountTable();
    mountTable.mount('/', await registry.getProvider({ backend: 'memory', storageRootKey: rootKey }), {
      class: 'authored',
      backend: 'memory',
      storageRootKey: rootKey,
    });
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable,
      discoveryIndex: index,
    });
    disposers.push(() => {
      service.dispose();
    });
    await service.configureProjectRoots({ projects: [], roots: [{ backend: 'opfs' }] });
    const [status] = await service.getRootStatuses();
    const before = unretained();

    const first = await service.listProjectManifests();
    const second = await service.listProjectManifests();

    for (const pass of [first, second]) {
      expect(pass.roots.map((root) => root.status)).toEqual(['complete']);
      expect(pass.entries.map((entry) => ('projectId' in entry ? entry.projectId : entry.status)).toSorted()).toEqual(
        Array.from({ length: projects }, (_, at) => projectId(at)).toSorted(),
      );
    }
    expect(directories).toBeGreaterThan(maxIndexedChildren);
    expect(index.view(status!.storageRootKey)?.currency).toBe('unindexed');
    expect(index.retainedBytes).toBeLessThanOrEqual(retainedManifestBudgetBytes);
    expect(index.retainedBytes).toBe(0);
    expect(unretained() - before).toBe(2 * directories);
  }, 300_000);

  it('should retain a root under the bound and keep the index under its manifest budget', async () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>({ maxChildren: 10 });
    index.beginColdRead('root');
    const names = Array.from({ length: 10 }, (_, at) => `n-${at}`);

    expect(index.installNames('root', index.namesVersion('root'), names)).toBe(true);
    for (const name of names) {
      index.install('root', name, {
        version: index.version('root', name),
        reading: {
          kind: 'identified',
          projectId: projectId(0),
          manifest: projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
        },
        determined: true,
      });
    }

    expect(index.view('root')).toMatchObject({ currency: 'warm', dirty: [] });
    expect(index.retainedBytes).toBeGreaterThan(0);
    expect(index.retainedBytes).toBeLessThanOrEqual(retainedManifestBudgetBytes);
  });
});

/* FW4 review m8: a warm pass reads evidence interactively, 16 directories at a time, and unretained directories in the
 * background lane. */
describe('a warm pass’s re-reads (FW4 review m8)', () => {
  const build = async (
    count: number,
    budgetBytes?: number,
  ): Promise<
    Readonly<{
      service: WorkspaceFileService;
      registry: ProviderRegistry;
      index: ProjectDirectoryIndex<ProjectDirectoryReading>;
      rootKey: string;
      names: string[];
    }>
  > => {
    const home = createMockRootHandle();
    const names = Array.from({ length: count }, (_, at) => `p-${String(at).padStart(3, '0')}`);
    for (const [at, name] of names.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
      const directory = await home.getDirectoryHandle(name, { create: true });
      const write = async (handle: typeof directory, file: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
        const created = await handle.getFileHandle(file, { create: true });
        const writable = await created.createWritable();
        await writable.write(bytes);
        await writable.close();
      };
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
      await write(
        directory,
        'tau.json',
        serializeProjectManifest(
          projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
        ),
      );
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
      const control = await directory.getDirectoryHandle('.tau', { create: true });
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
      await write(
        control,
        projectIdentityPath.split('/').at(-1)!,
        serializeProjectIdentity({ version: 1, projectId: projectId(at) }),
      );
    }
    vi.stubGlobal('FileSystemObserver', undefined);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => home } });
    const registry = new ProviderRegistry({ databasePrefix: `tau-rereads-${randomUuid()}` });
    const memoryKey = `memory:rereads-${randomUuid()}`;
    const mountTable = new MountTable();
    mountTable.mount('/', await registry.getProvider({ backend: 'memory', storageRootKey: memoryKey }), {
      class: 'authored',
      backend: 'memory',
      storageRootKey: memoryKey,
    });
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>(budgetBytes === undefined ? {} : { budgetBytes });
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable,
      discoveryIndex: index,
    });
    disposers.push(() => {
      service.dispose();
    });
    await service.configureProjectRoots({ projects: [], roots: [{ backend: 'opfs' }] });
    const [status] = await service.getRootStatuses();
    return { service, registry, index, rootKey: status!.storageRootKey, names };
  };

  it('should re-read the directories evidence names 16 at a time, interactively', async () => {
    const { service, registry, index, rootKey, names } = await build(60);
    await service.listProjectManifests();
    const home = await registry.getProvider({ backend: 'opfs' });
    let inFlight = 0;
    let peak = 0;
    const readFile = Reflect.get(Object.getPrototypeOf(home) as Record<string, unknown>, 'readFile') as (
      path: string,
    ) => Promise<unknown>;
    /* Defined through the view, on the provider itself, under the view's count. */
    Object.defineProperty(home, 'readFile', {
      configurable: true,
      writable: true,
      async value(this: unknown, path: string): Promise<unknown> {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        try {
          return await readFile.call(this, path);
        } finally {
          inFlight -= 1;
        }
      },
    });
    index.note(rootKey, names);
    const settle = registry.ioScheduler.beginInteractive('elsewhere');

    try {
      const pass = await service.listProjectManifests();
      expect(pass.entries).toHaveLength(60);
    } finally {
      settle();
    }
    /* Interactive, so not held behind the call in flight elsewhere; 16 directories of two reads each at most. */
    expect(peak).toBe(32);
    expect(registry.ioScheduler.backgroundQueued()).toBe(0);
  });

  it('should re-read the directories it did not retain in the background lane', async () => {
    /* A budget too small for any reading: every directory is unretained, read again on each pass. */
    const { service, registry, index, rootKey } = await build(10, 1);
    await service.listProjectManifests();
    expect(index.view(rootKey)?.unretained).toHaveLength(10);
    const settle = registry.ioScheduler.beginInteractive('elsewhere');
    let queuedPeak = 0;
    const sample = setInterval(() => {
      queuedPeak = Math.max(queuedPeak, registry.ioScheduler.backgroundQueued());
    }, 1);

    try {
      const pass = await service.listProjectManifests();
      expect(pass.entries).toHaveLength(10);
    } finally {
      clearInterval(sample);
      settle();
    }
    expect(queuedPeak).toBeGreaterThan(0);
  });
});
