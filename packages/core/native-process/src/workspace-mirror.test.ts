import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { createMockFileSystem } from '@taucad/runtime-testing';
import { describe, expect, it } from 'vitest';

import { createWorkspaceMirror } from '#workspace-mirror.js';

describe('large native workspaces', () => {
  it.each([
    { name: 'a file larger than 32 MiB', count: 1, size: 32 * 1024 * 1024 + 1 },
    { name: 'more than 10,000 files', count: 10_001, size: 1 },
    { name: 'more than 512 MiB in total', count: 17, size: 32 * 1024 * 1024 },
  ])('should mirror $name byte-exactly', { timeout: 180_000 }, async ({ count, size }) => {
    const bytes = new Uint8Array(size).fill(37);
    const names = Array.from({ length: count }, (_, index) => `asset-${String(index)}.bin`);
    const filesystem = createMockFileSystem({ readFileResult: () => bytes });
    filesystem.mocks.readdirStat.mockResolvedValue(
      names.map((name) => ({ name, path: name, type: 'file', size, mtimeMs: 0, contentKind: 'binary' })),
    );
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-large-mirror-', displayName: 'Test' });
    try {
      await expect(mirror.sync(filesystem)).resolves.toEqual(names.toSorted());
      const expected = createHash('sha256').update(bytes).digest('hex');
      for (const name of [names[0]!, names.at(-1)!]) {
        // oxlint-disable-next-line no-await-in-loop -- inspect the two boundary files sequentially.
        const actual = await readFile(join(mirror.workspacePath, name));
        expect(createHash('sha256').update(actual).digest('hex')).toBe(expected);
      }
      filesystem.mocks.readFile.mockClear();
      await mirror.sync(filesystem);
      expect(filesystem.mocks.readFile).not.toHaveBeenCalled();
    } finally {
      await mirror.cleanup();
    }
    await expect(stat(mirror.rootPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should preserve the physical file when only its source timestamp changes', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'unchanged' });
    filesystem.mocks.readdirStat.mockResolvedValue([
      { name: 'main.cs', path: 'main.cs', type: 'file', size: 9, mtimeMs: 1, contentKind: 'text' },
    ]);
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-unchanged-mirror-', displayName: 'Test' });
    try {
      await mirror.sync(filesystem);
      const before = await stat(join(mirror.workspacePath, 'main.cs'));
      filesystem.mocks.readdirStat.mockResolvedValue([
        { name: 'main.cs', path: 'main.cs', type: 'file', size: 9, mtimeMs: 2, contentKind: 'text' },
      ]);
      await mirror.sync(filesystem);
      expect(filesystem.mocks.readFile).toHaveBeenCalledTimes(2);
      const after = await stat(join(mirror.workspacePath, 'main.cs'));
      expect(after.ino).toBe(before.ino);
      expect(await readFile(join(mirror.workspacePath, 'main.cs'), 'utf8')).toBe('unchanged');
    } finally {
      await mirror.cleanup();
    }
  });

  it('should mirror a file beyond 32 directory levels', async () => {
    const path = `${'nested/'.repeat(40)}main.cs`;
    const filesystem = createMockFileSystem({ readFileResult: 'source' });
    filesystem.mocks.readdirStat.mockImplementation(async (directory: string) => {
      const depth = directory === '' ? 0 : directory.split('/').length;
      const name = depth === 40 ? 'main.cs' : 'nested';
      return [
        {
          name,
          path: directory ? `${directory}/${name}` : name,
          type: depth === 40 ? 'file' : 'dir',
          size: depth === 40 ? 6 : 0,
          mtimeMs: 0,
          contentKind: 'text',
        },
      ];
    });
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-deep-mirror-', displayName: 'Test' });
    try {
      await expect(mirror.sync(filesystem)).resolves.toEqual([path]);
      expect(await readFile(join(mirror.workspacePath, path), 'utf8')).toBe('source');
    } finally {
      await mirror.cleanup();
    }
  });
});
