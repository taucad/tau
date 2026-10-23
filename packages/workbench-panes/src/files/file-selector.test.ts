import { describe, expect, it } from 'vitest';
import { createStaticDataSource } from '#files/file-selector.jsx';

describe('createStaticDataSource', () => {
  it('should list a folder folders first, each implied by the paths under it', async () => {
    const source = createStaticDataSource([
      { path: 'src/main.ts', size: 100 },
      { path: 'README.md', size: 200 },
      { path: 'src/utils/helpers.ts', size: 50 },
    ]);

    expect(await source.loadDirectory('')).toEqual([
      { name: 'src', path: 'src', isFolder: true, size: undefined },
      { name: 'README.md', path: 'README.md', isFolder: false, size: 200 },
    ]);
    expect(await source.loadDirectory('src')).toEqual([
      { name: 'utils', path: 'src/utils', isFolder: true, size: undefined },
      { name: 'main.ts', path: 'src/main.ts', isFolder: false, size: 100 },
    ]);
    expect(await source.loadDirectory('missing')).toEqual([]);
  });

  it('should find files by name anywhere in the tree, ignoring case', async () => {
    const source = createStaticDataSource([
      { path: 'src/Main.ts', size: 100 },
      { path: 'src/utils/helpers.ts', size: 50 },
      { path: 'main/README.md', size: 200 },
    ]);

    expect(await source.searchFiles('main')).toEqual([
      { name: 'Main.ts', path: 'src/Main.ts', isFolder: false, size: 100 },
    ]);
  });
});
