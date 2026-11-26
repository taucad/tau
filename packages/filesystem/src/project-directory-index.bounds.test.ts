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
