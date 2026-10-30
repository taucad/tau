import { createMockFileSystem } from '@taucad/runtime-testing';
import { describe, expect, it } from 'vitest';

import { createPicogkBrowserSnapshot } from '#picogk-browser-snapshot.js';

const file = (name: string, size = 4) => ({ name, path: name, type: 'file', size, mtimeMs: 0 });
const directory = (name: string) => ({ name, path: name, type: 'dir', size: 0, mtimeMs: 0 });
const { signal } = new AbortController();

describe('PicoGK browser snapshot', () => {
  it('should apply native exclusions before reading files and own the included bytes', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'code' });
    filesystem.mocks.readdirStat.mockImplementation(async (path: string) => {
      if (path === 'Helpers') {
        return [file('Shape.cs')];
      }
      if (path !== '') {
        throw new Error('An excluded directory was read.');
      }
      return [
        file('main.cs'),
        directory('Helpers'),
        file('asset.bin'),
        file('Lib.dll'),
        file('App.exe'),
        file('Model.pdb'),
        file('thumbnail.webp'),
        ...['.git', '.hg', '.svn', '.tau', 'node_modules', 'bin', 'obj', '.vs'].map((name) => directory(name)),
      ];
    });
    const cached = new Uint8Array([1, 2, 3, 4]);
    const result = await createPicogkBrowserSnapshot({
      filesystem,
      signal,
      contents: new Map<string, string | Uint8Array<ArrayBuffer>>([
        ['main.cs', 'text'],
        ['asset.bin', cached],
      ]),
    });
    expect(result.files.map(({ path }) => path)).toEqual(['Helpers/Shape.cs', 'asset.bin', 'main.cs']);
    expect(filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith('Helpers/Shape.cs', undefined);
    cached.fill(9);
    expect(result.files[1]!.contents).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('should identify content changes and ignore filesystem listing order', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'code' });
    filesystem.mocks.readdirStat.mockResolvedValue([file('main.cs'), file('asset.bin')]);
    const first = await createPicogkBrowserSnapshot({ filesystem, signal });
    filesystem.mocks.readdirStat.mockResolvedValue([file('asset.bin'), file('main.cs')]);
    const second = await createPicogkBrowserSnapshot({ filesystem, signal });
    expect(second.revision).toBe(first.revision);
    const changed = await createPicogkBrowserSnapshot({
      filesystem,
      signal,
      contents: new Map([['asset.bin', 'edit']]),
    });
    expect(changed.revision).not.toBe(first.revision);
    filesystem.mocks.readdirStat.mockResolvedValue([file('main.cs')]);
    const removed = await createPicogkBrowserSnapshot({ filesystem, signal });
    expect(removed.revision).not.toBe(first.revision);
  });

  it('should disregard a cache entry of the wrong length and reject a changing file', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'code' });
    filesystem.mocks.readdirStat.mockResolvedValue([file('main.cs')]);
    const result = await createPicogkBrowserSnapshot({
      filesystem,
      signal,
      contents: new Map([['main.cs', 'shorter?']]),
    });
    expect(new TextDecoder().decode(result.files[0]!.contents)).toBe('code');
    filesystem.mocks.readFile.mockResolvedValue(new Uint8Array([1]));
    await expect(createPicogkBrowserSnapshot({ filesystem, signal })).rejects.toThrow('changed while mirroring');
  });

  it('should reject colliding paths and traversal outside the authorized root', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'code' });
    filesystem.mocks.readdirStat.mockResolvedValue([file('Main.cs'), file('main.cs')]);
    await expect(createPicogkBrowserSnapshot({ filesystem, signal })).rejects.toThrow('case-colliding');
    filesystem.mocks.readdirStat.mockResolvedValue([file('../outside.cs')]);
    await expect(createPicogkBrowserSnapshot({ filesystem, signal })).rejects.toThrow();
  });

  it('should cancel before walking and after an outstanding file read', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'code' });
    const controller = new AbortController();
    controller.abort();
    await expect(createPicogkBrowserSnapshot({ filesystem, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(filesystem.mocks.readdirStat).not.toHaveBeenCalled();
    const active = new AbortController();
    filesystem.mocks.readdirStat.mockResolvedValue([file('main.cs')]);
    filesystem.mocks.readFile.mockImplementation(async () => {
      active.abort();
      return new Uint8Array(4);
    });
    await expect(createPicogkBrowserSnapshot({ filesystem, signal: active.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
