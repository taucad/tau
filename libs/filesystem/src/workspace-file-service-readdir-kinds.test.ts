/**
 * Directory walks must take entry kinds from `readdirEntries` instead of a
 * `stat` per child, so deleting, copying, and exporting a tree stays O(entries)
 * instead of O(bytes).
 */

// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { FileSystemProvider } from '#types.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';

type Counters = Record<'stat' | 'readFile' | 'readdir' | 'readdirEntries' | 'readdirWithStats', number>;

/**
 * Wrap a provider so every routed call is counted.
 *
 * @param target - Provider to observe.
 * @returns The observing provider and its live counters.
 */
const countingProvider = (target: FileSystemProvider): { provider: FileSystemProvider; counts: Counters } => {
  const counts: Counters = { stat: 0, readFile: 0, readdir: 0, readdirEntries: 0, readdirWithStats: 0 };
  const provider = new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object) as unknown;
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => {
        if (property in counts) {
          counts[property as keyof Counters]++;
        }
        return (value as (...callArgs: unknown[]) => unknown).apply(object, args);
      };
    },
  });
  return { provider, counts };
};

let databaseSequence = 0;

const createService = async () => {
  const providerRegistry = new ProviderRegistry({ databasePrefix: `tau-readdir-kinds-${databaseSequence++}` });
  const source = countingProvider(
    await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:source' }),
  );
  const target = countingProvider(
    await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:target' }),
  );

  const mountTable = new MountTable();
  mountTable.mount('/', source.provider, { backend: 'memory', storageRootKey: 'memory:source' });
  mountTable.mount('/other', target.provider, { backend: 'memory', storageRootKey: 'memory:target' });

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });

  return { service, source, target };
};

describe('directory walks use entry kinds', () => {
  let context: Awaited<ReturnType<typeof createService>>;

  beforeEach(async () => {
    context = await createService();
    await context.service.writeFile('/tree/a.txt', 'a\nb');
    await context.service.writeFile('/tree/b.bin', new Uint8Array([0, 1, 2, 3]));
    await context.service.writeFile('/tree/nested/c.txt', 'c');
    await context.service.writeFile('/tree/nested/deep/d.txt', 'd');
  });

  it('should remove a tree without reading or statting any child', async () => {
    const before = { ...context.source.counts };

    await context.service.rmdir('/tree', { recursive: true });

    expect(context.source.counts.readFile - before.readFile).toBe(0);
    expect(context.source.counts.stat - before.stat).toBe(0);
    expect(context.source.counts.readdirEntries - before.readdirEntries).toBe(3);
    await expect(context.service.exists('/tree')).resolves.toBe(false);
  });

  it('should copy across providers with exactly one read per file', async () => {
    const before = { ...context.source.counts };

    await context.service.move('/tree', '/other/tree');

    expect(context.source.counts.readFile - before.readFile).toBe(4);
    await expect(context.service.readFile('/other/tree/nested/deep/d.txt', 'utf8')).resolves.toBe('d');
    await expect(context.service.exists('/tree')).resolves.toBe(false);
  });

  it('should collect directory contents without statting each child', async () => {
    const before = { ...context.source.counts };

    const contents = await context.service.getDirectoryContents('/tree');

    expect(Object.keys(contents).sort()).toEqual(['a.txt', 'b.bin', 'nested/c.txt', 'nested/deep/d.txt']);
    expect(context.source.counts.readFile - before.readFile).toBe(4);
    expect(context.source.counts.stat - before.stat).toBe(0);
  });
});
