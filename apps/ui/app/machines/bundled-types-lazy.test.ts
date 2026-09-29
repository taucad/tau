import { describe, expect, it, vi } from 'vitest';
import { createLazyBundledTypesReads } from '#machines/bundled-types-lazy.js';

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
});
