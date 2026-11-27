import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import type { FileSystemProvider } from '#types.js';
import { ProjectIndexes } from '#project-index/project-indexes.js';
import type { IndexRootResolution } from '#project-index/project-indexes.js';
import { tauPathPolicy } from '#path-registry.js';

/**
 * A permanent delete forgets only what reads or holds the removed bytes (project-library fast-path FW5), where it once
 * dropped every Project Index. Roots here are authority paths; each resolves to a provider and a provider path, as the
 * authority's mount table resolves them.
 */

/** A memory provider whose mtimes key facts, so an index root persists a snapshot. */
const durableProvider = async (directories: readonly string[]): Promise<MemoryProvider> => {
  const provider = new MemoryProvider();
  Object.defineProperty(provider, 'capabilities', { value: { ...provider.capabilities, trustworthyMtime: true } });
  for (const directory of directories) {
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup, in order.
    await provider.mkdir(directory, { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- Fixture setup, in order.
    await provider.writeFile(`${directory}/main.ts`, 'export {};');
  }
  return provider;
};

type Table = Map<string, () => IndexRootResolution>;

/** Index roots over a resolution table a test can change, as a route revoke changes the mount table. */
const indexesOver = (table: Table): ProjectIndexes =>
  new ProjectIndexes({
    resolve: (root) => {
      const resolution = table.get(root);
      if (resolution === undefined) {
        throw new Error(`No mount resolves ${root}`);
      }
      return resolution();
    },
    policy: tauPathPolicy,
    tab: () => ({ tabId: 'tab-a', seq: 0 }),
    persistDelayMilliseconds: 60_000,
  });

const at =
  (provider: FileSystemProvider, path: string, persist = false) =>
  (): IndexRootResolution => ({
    provider,
    path,
    ...(persist ? { persist: { lockName: `tau-index:test:${path}` } } : {}),
  });

describe('ProjectIndexes.forgetRemovedDirectory', () => {
  it('should drop the roots that read the removed directory, record it removed where a root holds it, and keep every other root warm', async () => {
    const provider = await durableProvider(['x', 'x/inner', 'y']);
    const other = await durableProvider(['x']);
    const table: Table = new Map([
      ['/projects/x', at(provider, 'x')],
      /* The same directory under another route, such as a preview, and a root inside it, such as a checkout. */
      ['/preview/x', at(provider, 'x')],
      ['/checkouts/c', at(provider, 'x/inner')],
      ['/projects/y', at(provider, 'y')],
      /* A root that holds the removed directory: the provider's whole tree. */
      ['/home', at(provider, '')],
      /* Another provider's directory with the same path is other bytes. */
      ['/elsewhere', at(other, 'x')],
    ]);
    const indexes = indexesOver(table);
    for (const root of table.keys()) {
      // oxlint-disable-next-line no-await-in-loop -- Each root opens in turn.
      await indexes.ready(root);
    }
    expect(indexes.get('/home')?.entry('x/main.ts')).toBeDefined();

    indexes.forgetRemovedDirectory({ provider, path: 'x' });

    expect(indexes.get('/projects/x')).toBeUndefined();
    expect(indexes.get('/preview/x')).toBeUndefined();
    expect(indexes.get('/checkouts/c')).toBeUndefined();
    expect(indexes.get('/projects/y')?.entry('main.ts')).toBeDefined();
    expect(indexes.get('/elsewhere')?.entry('main.ts')).toBeDefined();
    const home = indexes.get('/home');
    expect(home?.entry('y/main.ts')).toBeDefined();
    expect(home?.entry('x')).toBeUndefined();
    expect(home?.entry('x/main.ts')).toBeUndefined();
  });

  /** Two roots whose snapshot writes are held before the disk, until `gate` resolves. */
  const gatedWrites = async () => {
    const provider = await durableProvider(['x', 'y']);
    const table: Table = new Map([
      ['/projects/x', at(provider, 'x', true)],
      ['/projects/y', at(provider, 'y', true)],
    ]);
    const indexes = indexesOver(table);
    await indexes.ready('/projects/x');
    await indexes.ready('/projects/y');
    indexes.addFile('/projects/x/b.ts', { size: 1 });
    indexes.addFile('/projects/y/b.ts', { size: 1 });
    const gate = Promise.withResolvers<void>();
    const reached = { x: Promise.withResolvers<void>(), y: Promise.withResolvers<void>() };
    const mkdir = provider.mkdir.bind(provider);
    vi.spyOn(provider, 'mkdir').mockImplementation(async (path, options) => {
      if (path.includes('.tau/index')) {
        reached[path.startsWith('x/') ? 'x' : 'y'].resolve();
        await gate.promise;
      }
      return mkdir(path, options);
    });
    const writeFile = vi.spyOn(provider, 'writeFile');
    const snapshotWrites = (directory: string): number =>
      writeFile.mock.calls.filter(([path]) => String(path).startsWith(`${directory}/.tau/index`)).length;
    return { provider, table, indexes, gate, reached, snapshotWrites };
  };

  it('should stop a snapshot write into the removed directory before the disk, and let every other root write', async () => {
    const { provider, indexes, gate, reached, snapshotWrites } = await gatedWrites();
    const writingX = indexes.persist('/projects/x');
    const writingY = indexes.persist('/projects/y');
    await Promise.all([reached.x.promise, reached.y.promise]);

    indexes.forgetRemovedDirectory({ provider, path: 'x' });
    gate.resolve();

    expect(await writingX).toBe('skipped');
    expect(await writingY).toBe('written');
    expect(snapshotWrites('x')).toBe(0);
    expect(snapshotWrites('y')).toBeGreaterThan(0);
  });

  it('should stop a write where it began, though the route was revoked and its root now resolves elsewhere', async () => {
    const { provider, table, indexes, gate, reached, snapshotWrites } = await gatedWrites();
    const writingX = indexes.persist('/projects/x');
    await reached.x.promise;
    /* The delete revokes the route first: the root falls through to other bytes and its index is evicted. */
    table.set('/projects/x', at(provider, 'fallen-through'));
    indexes.evict('/projects/x');

    indexes.forgetRemovedDirectory({ provider, path: 'x' });
    gate.resolve();

    expect(await writingX).toBe('skipped');
    expect(snapshotWrites('x')).toBe(0);
  });

  /* Review M1: one root's writes at two directories, the route re-pointed between them ("Use this folder"). */
  it('should stop the earlier write of a root re-pointed since, when the directory it writes into is removed', async () => {
    const provider = await durableProvider(['d1', 'd2']);
    const table: Table = new Map([['/projects/x', at(provider, 'd1', true)]]);
    const indexes = indexesOver(table);
    await indexes.ready('/projects/x');
    indexes.addFile('/projects/x/b.ts', { size: 1 });
    const gate = Promise.withResolvers<void>();
    const reached = Promise.withResolvers<void>();
    const mkdir = provider.mkdir.bind(provider);
    vi.spyOn(provider, 'mkdir').mockImplementation(async (path, options) => {
      if (path.startsWith('d1/.tau/index')) {
        reached.resolve();
        await gate.promise;
      }
      return mkdir(path, options);
    });
    const writeFile = vi.spyOn(provider, 'writeFile');
    const first = indexes.persist('/projects/x');
    await reached.promise;
    table.set('/projects/x', at(provider, 'd2', true));
    indexes.evict('/projects/x');
    await indexes.ready('/projects/x');
    indexes.addFile('/projects/x/c.ts', { size: 1 });
    expect(await indexes.persist('/projects/x')).toBe('written');

    indexes.forgetRemovedDirectory({ provider, path: 'd1' });
    gate.resolve();

    expect(await first).toBe('skipped');
    expect(writeFile.mock.calls.filter(([path]) => String(path).startsWith('d1/.tau/index'))).toEqual([]);
  });

  /* Review m4: two folders another program edits may overlap (a picked folder and its subfolder, nested Node roots),
   * and nothing here can prove they do not: an index over another such provider reads bytes that may be gone. */
  it('should drop the roots of another externally edited provider, which may overlap the removed directory', async () => {
    const editedBy = async (directories: readonly string[]): Promise<MemoryProvider> => {
      const provider = await durableProvider(directories);
      Object.defineProperty(provider, 'capabilities', {
        value: { ...provider.capabilities, externallyEdited: true },
      });
      return provider;
    };
    const folder = await editedBy(['sub/x', 'y']);
    const subfolder = await editedBy(['x']);
    const private_ = await durableProvider(['x']);
    const table: Table = new Map([
      ['/projects/y', at(folder, 'y')],
      ['/projects/sub-x', at(subfolder, 'x')],
      ['/projects/private-x', at(private_, 'x')],
    ]);
    const indexes = indexesOver(table);
    for (const root of table.keys()) {
      // oxlint-disable-next-line no-await-in-loop -- Each root opens in turn.
      await indexes.ready(root);
    }

    indexes.forgetRemovedDirectory({ provider: folder, path: 'sub/x' });

    expect(indexes.get('/projects/sub-x')).toBeUndefined();
    expect(indexes.get('/projects/y')).toBeDefined();
    expect(indexes.get('/projects/private-x')).toBeDefined();
  });

  /* Review nit: the removed directory's logical path under the holder is itself a mount prefix (a preview over it). */
  it('should record the removal in a holder whose logical path for it is a mount prefix', async () => {
    const provider = await durableProvider(['x', 'y']);
    const table: Table = new Map([['/home', at(provider, '')]]);
    const indexes = new ProjectIndexes({
      resolve: (root) => {
        const resolution = table.get(root);
        if (resolution === undefined) {
          throw new Error(`No mount resolves ${root}`);
        }
        return resolution();
      },
      mountPrefixes: () => ['/home', '/home/x'],
      policy: tauPathPolicy,
      tab: () => ({ tabId: 'tab-a', seq: 0 }),
      persistDelayMilliseconds: 60_000,
    });
    await indexes.ready('/home');
    expect(indexes.get('/home')?.entry('x/main.ts')).toBeDefined();

    indexes.forgetRemovedDirectory({ provider, path: 'x' });

    expect(indexes.get('/home')?.entry('x')).toBeUndefined();
    expect(indexes.get('/home')?.entry('y/main.ts')).toBeDefined();
  });
});
