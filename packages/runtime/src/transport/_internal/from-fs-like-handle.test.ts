import { describe, expect, it, vi } from 'vitest';
import type { FsLike } from '#transport/_internal/from-fs-like-handle.js';
import { _fromFsLikeHandle } from '#transport/_internal/from-fs-like-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

describe('_fromFsLikeHandle path boundary', () => {
  it.each<readonly [string, (fileSystem: RuntimeFileSystemBase) => Promise<unknown>]>([
    ['readFile', async (fileSystem) => fileSystem.readFile('/../sibling/secret.ts')],
    ['writeFile', async (fileSystem) => fileSystem.writeFile('/../sibling/secret.ts', 'no')],
    ['mkdir', async (fileSystem) => fileSystem.mkdir('/../sibling')],
    ['readdir', async (fileSystem) => fileSystem.readdir('/../sibling')],
    ['unlink', async (fileSystem) => fileSystem.unlink('/../sibling/secret.ts')],
    ['stat', async (fileSystem) => fileSystem.stat('/../sibling/secret.ts')],
    ['rmdir', async (fileSystem) => fileSystem.rmdir('/../sibling')],
    ['rename source', async (fileSystem) => fileSystem.rename('/../sibling/secret.ts', '/safe.ts')],
    ['rename destination', async (fileSystem) => fileSystem.rename('/safe.ts', '/../sibling/secret.ts')],
    ['lstat', async (fileSystem) => fileSystem.lstat('/../sibling/secret.ts')],
    ['exists', async (fileSystem) => fileSystem.exists('/../sibling/secret.ts')],
  ])('rejects above-root traversal for %s before calling the provider', async (_operation, invoke) => {
    const readFile = vi.fn();
    const writeFile = vi.fn(async (): Promise<void> => undefined);
    const mkdir = vi.fn(async (): Promise<void> => undefined);
    const readdir = vi.fn(async (): Promise<string[]> => []);
    const unlink = vi.fn(async (): Promise<void> => undefined);
    const rmdir = vi.fn(async (): Promise<void> => undefined);
    const rename = vi.fn(async (): Promise<void> => undefined);
    const stat = vi.fn(async () => ({ size: 0, mtimeMs: 0, isDirectory: () => false }));
    const lstat = vi.fn(async () => ({ size: 0, mtimeMs: 0, isDirectory: () => false }));
    const fsLike: FsLike = {
      promises: {
        readFile,
        writeFile,
        mkdir,
        readdir,
        unlink,
        rmdir,
        rename,
        stat,
        lstat,
      },
    };
    const handle = _fromFsLikeHandle(fsLike);
    if (handle.kind !== 'inline') {
      throw new Error('Expected an inline filesystem handle.');
    }

    await expect(invoke(handle.create())).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    for (const providerMethod of [readFile, writeFile, mkdir, readdir, unlink, rmdir, rename, stat, lstat]) {
      expect(providerMethod).not.toHaveBeenCalled();
    }
  });
});
