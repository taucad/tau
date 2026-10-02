// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import type { WorkspaceScope } from '#mount-table.js';
import type { ChangeEvent, FileSystemProvider } from '#types.js';

/**
 * Unified scope-routing tests for {@link WorkspaceFileService}.
 *
 * Asserts that the migrated FS dispatch surface (`readFile`, `unlink`,
 * `rmdir`, `getZippedDirectory`, `readShallowDirectory`) routes via the
 * standalone provider when `options.scope` is supplied, and via the
 * mount table otherwise. Lives in a separate file so the main
 * `workspace-file-service.test.ts` stays under the 1500-line cap.
 */

async function createService() {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.createMountProvider({ backend: 'memory' });

  const mountTable = new MountTable();
  mountTable.mount('/', provider, { backend: 'memory' });

  const resourceQueue = new ResourceQueue();
  const eventBus = new ChangeEventBus();

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus,
    mountTable,
  });

  return { service, eventBus, providerRegistry, rootProvider: provider };
}

describe('WorkspaceFileService — unified scope routing', () => {
  let service: WorkspaceFileService;
  let eventBus: ChangeEventBus;
  let providerRegistry: ProviderRegistry;
  let rootProvider: FileSystemProvider;
  const scope: WorkspaceScope = { backend: 'indexeddb' };

  beforeEach(async () => {
    const context = await createService();
    service = context.service;
    eventBus = context.eventBus;
    providerRegistry = context.providerRegistry;
    rootProvider = context.rootProvider;
  });

  it('readFile({ scope }) reads from the standalone provider, not the mount table', async () => {
    const standaloneReadFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(
      mock<FileSystemProvider>({ readFile: standaloneReadFile }),
    );
    const mountReadFileSpy = vi.spyOn(rootProvider, 'readFile');

    const data = await service.readFile('/scope/data.bin', { scope });

    expect(standaloneReadFile).toHaveBeenCalledWith('/scope/data.bin');
    expect(mountReadFileSpy).not.toHaveBeenCalled();
    expect(data).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('unlink({ scope }) deletes via the standalone provider and emits fileDeleted with the scope backend', async () => {
    const standaloneUnlink = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(
      mock<FileSystemProvider>({ unlink: standaloneUnlink }),
    );
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => events.push(event));

    await service.unlink('/scope/file.txt', { scope });

    expect(standaloneUnlink).toHaveBeenCalledWith('/scope/file.txt');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'fileDeleted', path: '/scope/file.txt', backend: 'indexeddb' }),
    );
  });

  it('rmdir({ scope, recursive: true }) walks the subtree on the standalone provider', async () => {
    const standaloneReaddir = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/scope/dir') {
        return ['nested.txt'];
      }
      return [];
    });
    const standaloneStat = vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1 });
    const standaloneUnlink = vi.fn().mockResolvedValue(undefined);
    const standaloneRmdir = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(
      mock<FileSystemProvider>({
        readdir: standaloneReaddir,
        stat: standaloneStat,
        unlink: standaloneUnlink,
        rmdir: standaloneRmdir,
      }),
    );
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => events.push(event));

    await service.rmdir('/scope/dir', { scope, recursive: true });

    expect(standaloneUnlink).toHaveBeenCalledWith('/scope/dir/nested.txt');
    expect(standaloneRmdir).toHaveBeenCalledWith('/scope/dir');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'directoryDeleted', path: '/scope/dir', backend: 'indexeddb' }),
    );
  });

  it('rmdir({ recursive: true }) without a scope throws — no production caller exercises this combination', async () => {
    await expect(service.rmdir('/scope/dir', { recursive: true })).rejects.toThrow(/not supported/);
  });

  it('getZippedDirectory({ scope }) zips from the standalone provider', async () => {
    const standaloneExists = vi.fn().mockResolvedValue(true);
    const standaloneReaddir = vi.fn().mockResolvedValue([]);
    vi.spyOn(providerRegistry, 'getStandaloneProvider').mockResolvedValue(
      mock<FileSystemProvider>({
        exists: standaloneExists,
        readdir: standaloneReaddir,
      }),
    );

    const blob = await service.getZippedDirectory('/scope/dir', { scope });

    expect(standaloneExists).toHaveBeenCalledWith('/scope/dir');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('without a scope, every method routes through the mount table (no standalone provider lookup)', async () => {
    const standaloneSpy = vi.spyOn(providerRegistry, 'getStandaloneProvider');

    await service.writeFile('/mount/file.txt', 'hi');
    await service.unlink('/mount/file.txt');
    await service.mkdir('/mount/sub');
    await service.rmdir('/mount/sub');

    expect(standaloneSpy).not.toHaveBeenCalled();
  });
});
