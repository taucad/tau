// @vitest-environment node
import { readdir } from 'node:fs/promises';

import { createMockFileSystem } from '@taucad/runtime-testing';
import { describe, expect, it } from 'vitest';

import { createDotnetWorkspaceMirror } from '#dotnet-workspace-mirror.js';

const file = (
  name: string,
): { name: string; path: string; type: 'file'; size: number; mtimeMs: number; contentKind: 'text' } => ({
  name,
  path: name,
  type: 'file',
  size: 4,
  mtimeMs: 0,
  contentKind: 'text',
});
const directory = (name: string): { name: string; path: string; type: 'dir'; size: number; mtimeMs: number } => ({
  name,
  path: name,
  type: 'dir',
  size: 0,
  mtimeMs: 0,
});
const listings = new Map<string, readonly unknown[]>([
  [
    '',
    [
      file('Program.cs'),
      directory('Helpers'),
      directory('bin'),
      directory('obj'),
      directory('.vs'),
      file('Lib.dll'),
      file('Tool.exe'),
      file('Model.pdb'),
      file('thumbnail.webp'),
    ],
  ],
  ['Helpers', [file('Shape.cs')]],
]);

describe('createDotnetWorkspaceMirror', () => {
  it('should leave build output, IDE state, compiled binaries and the kernel exclusions out of the mirror', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'code' });
    filesystem.mocks.readdirStat.mockImplementation(async (path: string) => {
      const listing = listings.get(path);
      if (listing === undefined) {
        throw new Error(`The mirror listed an excluded directory: ${path}`);
      }
      return listing;
    });
    const mirror = await createDotnetWorkspaceMirror({
      temporaryPrefix: 'tau-dotnet-mirror-',
      displayName: 'Sample',
      excludedPaths: ['thumbnail.webp'],
    });
    try {
      await expect(mirror.sync(filesystem)).resolves.toEqual(['Helpers/Shape.cs', 'Program.cs']);
      const mirrored = await readdir(mirror.workspacePath);

      expect(mirrored.toSorted()).toEqual(['Helpers', 'Program.cs']);
    } finally {
      await mirror.cleanup();
    }
  });
});
