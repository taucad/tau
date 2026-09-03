// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createMockFileSystem } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it } from 'vitest';

import { createWorkspaceMirror } from '#workspace-mirror.js';

const mirrors: Array<Awaited<ReturnType<typeof createWorkspaceMirror>>> = [];

afterEach(async () => {
  await Promise.all(
    mirrors.splice(0).map(async (mirror) => {
      await mirror.cleanup();
    }),
  );
});

const mirror = async () => {
  const value = await createWorkspaceMirror();
  mirrors.push(value);
  return value;
};

describe('Build123d workspace mirror', () => {
  it('projects sorted rooted files atomically, skips private/cache content, and removes stale files', async () => {
    const files = new Map([
      ['main.py', new TextEncoder().encode('print(1)')],
      ['lib/model.py', new TextEncoder().encode('value = 1')],
      ['skip.pyc', new Uint8Array([1])],
    ]);
    const filesystem = createMockFileSystem({
      readdirResult: (directory) =>
        directory === '' ? ['skip.pyc', '.git', 'main.py', 'lib'] : directory === 'lib' ? ['model.py'] : [],
      readFileResult: (path) => files.get(path)!,
    });
    filesystem.mocks.lstat.mockImplementation(async (path: string) => {
      if (path === '.git' || path === 'lib') {
        return { type: 'dir', size: 0, mtimeMs: 0 };
      }
      return { type: 'file', size: files.get(path)!.byteLength, mtimeMs: 0, contentKind: 'text' };
    });
    const projection = await mirror();
    expect(await projection.sync(filesystem)).toEqual(['lib/model.py', 'main.py']);
    expect(await readFile(join(projection.workspacePath, 'lib/model.py'), 'utf8')).toBe('value = 1');

    const reads = filesystem.mocks.readFile.mock.calls.length;
    expect(await projection.sync(filesystem)).toEqual(['lib/model.py', 'main.py']);
    expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(reads + 2);
    files.delete('lib/model.py');
    filesystem.mocks.readdir.mockImplementation(async (directory: string) => (directory === '' ? ['main.py'] : []));
    expect(await projection.sync(filesystem)).toEqual(['main.py']);
    await expect(readFile(join(projection.workspacePath, 'lib/model.py'))).rejects.toThrow();
  });

  it('rejects case collisions and files that change while read', async () => {
    const projection = await mirror();
    const collision = createMockFileSystem({ readdirResult: ['Part.py', 'part.py'], readFileResult: 'x' });
    collision.mocks.lstat.mockResolvedValue({ type: 'file', size: 1, mtimeMs: 0, contentKind: 'text' });
    await expect(projection.sync(collision)).rejects.toThrow(/case-colliding/);

    const racing = createMockFileSystem({ readdirResult: ['main.py'], readFileResult: 'changed' });
    racing.mocks.lstat.mockResolvedValue({ type: 'file', size: 1, mtimeMs: 0, contentKind: 'text' });
    await expect(projection.sync(racing)).rejects.toThrow(/changed while mirroring/);
  });

  it('enforces depth, per-file, aggregate, and entry limits', async () => {
    const projection = await mirror();
    const deep = createMockFileSystem({ readdirResult: (directory) => [directory ? 'next' : 'root'] });
    deep.mocks.lstat.mockResolvedValue({ type: 'dir', size: 0, mtimeMs: 0 });
    await expect(projection.sync(deep)).rejects.toThrow(/directory levels/);

    const oversized = createMockFileSystem({ readdirResult: ['huge.py'] });
    oversized.mocks.lstat.mockResolvedValue({
      type: 'file',
      size: 32 * 1024 * 1024 + 1,
      mtimeMs: 0,
      contentKind: 'binary',
    });
    await expect(projection.sync(oversized)).rejects.toThrow(/size limits/);

    const aggregateNames = Array.from({ length: 17 }, (_, index) => `${String(index)}.bin`);
    const aggregate = createMockFileSystem({ readdirResult: aggregateNames });
    aggregate.mocks.lstat.mockResolvedValue({
      type: 'file',
      size: 32 * 1024 * 1024,
      mtimeMs: 0,
      contentKind: 'binary',
    });
    await expect(projection.sync(aggregate)).rejects.toThrow(/size limits/);

    const entries = createMockFileSystem({
      readdirResult: Array.from({ length: 10_001 }, (_, index) => `${String(index)}.pyc`),
    });
    entries.mocks.lstat.mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0, contentKind: 'binary' });
    // Bytecode is excluded before it consumes the entry quota.
    await expect(projection.sync(entries)).resolves.toEqual([]);

    entries.mocks.readdir.mockResolvedValue(Array.from({ length: 10_001 }, (_, index) => `${String(index)}.py`));
    await expect(projection.sync(entries)).rejects.toThrow(/size limits/);
  });

  it('rejects non-rooted directory entries', async () => {
    const projection = await mirror();
    const filesystem = createMockFileSystem({ readdirResult: ['../escape.py'] });
    await expect(projection.sync(filesystem)).rejects.toThrow();
  });
});
