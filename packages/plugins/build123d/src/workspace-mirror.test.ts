// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createMockFileSystem } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it } from 'vitest';

import { createWorkspaceMirror } from '#build123d-workspace-mirror.js';

const mirrors: Array<Awaited<ReturnType<typeof createWorkspaceMirror>>> = [];

afterEach(async () => {
  await Promise.all(
    mirrors.splice(0).map(async (mirror) => {
      await mirror.cleanup();
    }),
  );
});

/** Wire a mocked filesystem's batched listing from a directory-to-names description. */
const mockListing = (
  filesystem: ReturnType<typeof createMockFileSystem>,
  names: (directory: string) => string[],
  stat: (path: string) => { type: 'dir' | 'file'; size: number; mtimeMs: number },
): void => {
  filesystem.mocks.readdirStat.mockImplementation(async (directory: string) =>
    names(directory).map((name) => {
      const path = directory === '' ? name : `${directory}/${name}`;
      const entry = stat(path);
      return entry.type === 'dir' ? { ...entry, path, name } : { ...entry, path, name, contentKind: 'binary' };
    }),
  );
};

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
    const filesystem = createMockFileSystem({ readFileResult: (path) => files.get(path)! });
    mockListing(
      filesystem,
      (directory) =>
        directory === ''
          ? ['skip.pyc', '.git', 'main.py', 'lib', 'thumbnail.webp']
          : directory === 'lib'
            ? ['model.py']
            : [],
      (path) =>
        path === '.git' || path === 'lib'
          ? { type: 'dir', size: 0, mtimeMs: 0 }
          : { type: 'file', size: files.get(path)?.byteLength ?? 0, mtimeMs: 0 },
    );
    const projection = await mirror();
    expect(await projection.sync(filesystem)).toEqual(['lib/model.py', 'main.py']);
    expect(await readFile(join(projection.workspacePath, 'lib/model.py'), 'utf8')).toBe('value = 1');

    const reads = filesystem.mocks.readFile.mock.calls.length;
    expect(await projection.sync(filesystem)).toEqual(['lib/model.py', 'main.py']);
    // D6: an unchanged workspace re-reads nothing.
    expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(reads);
    files.delete('lib/model.py');
    mockListing(
      filesystem,
      (directory) => (directory === '' ? ['main.py'] : []),
      (path) => ({ type: 'file', size: files.get(path)?.byteLength ?? 0, mtimeMs: 0 }),
    );
    expect(await projection.sync(filesystem)).toEqual(['main.py']);
    await expect(readFile(join(projection.workspacePath, 'lib/model.py'))).rejects.toThrow();
  });

  it('rejects case collisions and files that change while read', async () => {
    const projection = await mirror();
    const collision = createMockFileSystem({ readFileResult: 'x' });
    mockListing(
      collision,
      () => ['Part.py', 'part.py'],
      () => ({ type: 'file', size: 1, mtimeMs: 0 }),
    );
    await expect(projection.sync(collision)).rejects.toThrow(/case-colliding/);

    const racing = createMockFileSystem({ readFileResult: 'changed' });
    mockListing(
      racing,
      () => ['main.py'],
      () => ({ type: 'file', size: 1, mtimeMs: 0 }),
    );
    await expect(projection.sync(racing)).rejects.toThrow(/changed while mirroring/);
  });

  it('enforces depth, per-file, aggregate, and entry limits', async () => {
    const projection = await mirror();
    const deep = createMockFileSystem();
    mockListing(
      deep,
      (directory) => [directory ? 'next' : 'root'],
      () => ({ type: 'dir', size: 0, mtimeMs: 0 }),
    );
    await expect(projection.sync(deep)).rejects.toThrow(/directory levels/);

    const oversized = createMockFileSystem();
    mockListing(
      oversized,
      () => ['huge.py'],
      () => ({ type: 'file', size: 32 * 1024 * 1024 + 1, mtimeMs: 0 }),
    );
    await expect(projection.sync(oversized)).rejects.toThrow(/size limits/);

    const aggregateNames = Array.from({ length: 17 }, (_, index) => `${String(index)}.bin`);
    const aggregate = createMockFileSystem();
    mockListing(
      aggregate,
      () => aggregateNames,
      () => ({ type: 'file', size: 32 * 1024 * 1024, mtimeMs: 0 }),
    );
    await expect(projection.sync(aggregate)).rejects.toThrow(/size limits/);

    const entries = createMockFileSystem();
    mockListing(
      entries,
      () => Array.from({ length: 10_001 }, (_, index) => `${String(index)}.pyc`),
      () => ({ type: 'file', size: 0, mtimeMs: 0 }),
    );
    // Bytecode is excluded before it consumes the entry quota.
    await expect(projection.sync(entries)).resolves.toEqual([]);

    mockListing(
      entries,
      () => Array.from({ length: 10_001 }, (_, index) => `${String(index)}.py`),
      () => ({ type: 'file', size: 0, mtimeMs: 0 }),
    );
    await expect(projection.sync(entries)).rejects.toThrow(/size limits/);
  });

  it('rejects non-rooted directory entries', async () => {
    const projection = await mirror();
    const filesystem = createMockFileSystem();
    mockListing(
      filesystem,
      () => ['../escape.py'],
      () => ({ type: 'file', size: 1, mtimeMs: 0 }),
    );
    await expect(projection.sync(filesystem)).rejects.toThrow();
  });
});
