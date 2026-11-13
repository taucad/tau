// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { createLazyBundledTypesReads } from '#machines/bundled-types-lazy.js';

/**
 * A fresh profile's `/node_modules` route, mounted as the worker mounts it and
 * not yet installed: its backing directory does not exist.
 *
 * @returns The service, for disposal, and the rooted handle on the route.
 */
async function createUninstalledMount(): Promise<{
  service: WorkspaceFileService;
  root: ReturnType<WorkspaceFileService['createRootedFileSystem']>;
}> {
  const providerRegistry = new ProviderRegistry();
  const rootScope = { backend: 'memory', storageRootKey: 'memory:test-root' } as const;
  const nodeModulesScope = { backend: 'memory', storageRootKey: 'memory:test-node-modules' } as const;
  const mountTable = new MountTable();
  mountTable.mount('/', await providerRegistry.getProvider(rootScope), { ...rootScope, class: 'authored' });
  mountTable.mount('/node_modules', await providerRegistry.getProvider(nodeModulesScope), {
    ...nodeModulesScope,
    providerBasePath: 'tau-node-modules',
    class: 'derived',
  });
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  return { service, root: service.createRootedFileSystem('/node_modules') };
}

describe('lazy bundled types reads', () => {
  it('keeps startup idle and shares a complete installation across readers', async () => {
    const gate = Promise.withResolvers<void>();
    let complete = false;
    const install = vi.fn(async () => {
      await gate.promise;
      complete = true;
    });
    const surface = {
      readdir: vi.fn(async () => (complete ? ['kernel'] : [])),
      readFile: vi.fn(async () => (complete ? 'types' : 'partial')),
      stat: vi.fn(async (path: string) => ({ type: 'dir', path })),
      watch: vi.fn(() => () => undefined),
      writeFile: vi.fn(async () => {
        throw new Error('read-only');
      }),
    };
    const wrap = createLazyBundledTypesReads(install);
    const lazy = wrap(surface);
    const otherConnection = wrap({ readdir: vi.fn(async () => (complete ? ['kernel'] : [])) });

    expect(install).not.toHaveBeenCalled();
    await expect(lazy.stat('')).resolves.toEqual({ type: 'dir', path: '' });
    expect(install).not.toHaveBeenCalled();
    lazy.watch();
    await expect(lazy.writeFile()).rejects.toThrow('read-only');
    expect(install).not.toHaveBeenCalled();

    const listing = lazy.readdir();
    const content = lazy.readFile();
    const childStat = lazy.stat('kernel/index.d.ts');
    const otherListing = otherConnection.readdir();
    expect(install).toHaveBeenCalledTimes(1);
    expect(surface.readdir).not.toHaveBeenCalled();
    expect(surface.readFile).not.toHaveBeenCalled();
    expect(surface.stat).toHaveBeenCalledTimes(1);

    gate.resolve();
    await expect(listing).resolves.toEqual(['kernel']);
    await expect(content).resolves.toBe('types');
    await expect(childStat).resolves.toEqual({ type: 'dir', path: 'kernel/index.d.ts' });
    await expect(otherListing).resolves.toEqual(['kernel']);
    await expect(lazy.readdir()).resolves.toEqual(['kernel']);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('propagates an installation failure and retries on the next read', async () => {
    const install = vi.fn().mockRejectedValueOnce(new Error('OPFS unavailable')).mockResolvedValueOnce(undefined);
    const readdir = vi.fn(async () => ['kernel']);
    const wrap = createLazyBundledTypesReads(install);
    const lazy = wrap({ readdir });
    const otherConnection = wrap({ readdir });

    await expect(lazy.readdir()).rejects.toThrow('OPFS unavailable');
    expect(readdir).not.toHaveBeenCalled();
    await expect(otherConnection.readdir()).resolves.toEqual(['kernel']);
    expect(install).toHaveBeenCalledTimes(2);
  });

  it('should answer the root probe as a directory before the first installation creates it', async () => {
    const { service, root } = await createUninstalledMount();
    try {
      const install = vi.fn(async () => undefined);
      const lazy = createLazyBundledTypesReads(install)(root);

      await expect(root.stat('')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(lazy.stat('')).resolves.toMatchObject({ type: 'dir' });
      expect(install).not.toHaveBeenCalled();
    } finally {
      service.dispose();
    }
  });

  it('should still refuse a root probe that fails for another reason', async () => {
    const refusal = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const install = vi.fn(async () => undefined);
    const lazy = createLazyBundledTypesReads(install)({
      stat: vi.fn(async () => {
        throw refusal;
      }),
    });

    await expect(lazy.stat('')).rejects.toBe(refusal);
    expect(install).not.toHaveBeenCalled();
  });
});
