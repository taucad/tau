// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { FileStatEntry } from '@taucad/types';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';
import { TreeIndex, TreeIndexes } from '#tree-index.js';
import type { WorkspaceFileService } from '#workspace-file-service.js';

type BuildEntry = Parameters<TreeIndex['build']>[0][number];

const textFile = (
  path: string,
  size: number,
  metadata: number | { mtimeMs: number; lineCount?: number },
): BuildEntry => ({
  path,
  type: 'file',
  size,
  mtimeMs: typeof metadata === 'number' ? metadata : metadata.mtimeMs,
  contentKind: 'text',
  lineCount: typeof metadata === 'number' ? 1 : (metadata.lineCount ?? 1),
});

/** Paths in these tests are relative to the virtual tree root (same convention as WorkspaceFileService after scan-root normalization). */
describe('TreeIndex', () => {
  let tree: TreeIndex;

  beforeEach(() => {
    tree = new TreeIndex();
  });

  describe('build', () => {
    it('should build tree from flat file entries', () => {
      tree.build([
        textFile('src/main.ts', 100, { mtimeMs: 1000, lineCount: 8 }),
        textFile('src/utils/helper.ts', 50, { mtimeMs: 2000, lineCount: 4 }),
        textFile('README.md', 200, { mtimeMs: 3000, lineCount: 12 }),
      ]);

      expect(tree.isBuilt).toBe(true);
      expect(tree.readdir('/')).toEqual(expect.arrayContaining(['src', 'README.md']));
      expect(tree.readdir('/src')).toEqual(expect.arrayContaining(['main.ts', 'utils']));
      expect(tree.readdir('/src/utils')).toEqual(['helper.ts']);
    });

    it('should mark tree as built', () => {
      expect(tree.isBuilt).toBe(false);
      tree.build([]);
      expect(tree.isBuilt).toBe(true);
    });
  });

  describe('stat', () => {
    it('should return root node for "/" path', () => {
      tree.build([]);
      const node = tree.stat('/');
      expect(node).toBeDefined();
      expect(node?.type).toBe('dir');
    });

    it('should return file metadata', () => {
      tree.build([textFile('test.txt', 42, { mtimeMs: 5000, lineCount: 3 })]);
      const node = tree.stat('/test.txt');
      expect(node).toBeDefined();
      expect(node?.type).toBe('file');
      expect(node?.size).toBe(42);
      expect(node?.mtimeMs).toBe(5000);
      expect(node).toEqual(expect.objectContaining({ contentKind: 'text', lineCount: 3 }));
    });

    it('should return undefined for non-existent path', () => {
      tree.build([]);
      expect(tree.stat('/nonexistent')).toBeUndefined();
    });
  });

  describe('getDirectoryStat', () => {
    it('should return flat list of all files under a directory', () => {
      tree.build([
        textFile('src/main.ts', 100, 1000),
        textFile('src/lib/utils.ts', 50, 2000),
        textFile('README.md', 200, 3000),
      ]);

      const stats = tree.getDirectoryStat('/');
      expect(stats).toHaveLength(3);

      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['README.md', 'src/lib/utils.ts', 'src/main.ts']);
    });

    it('should return stats relative to the base path', () => {
      tree.build([textFile('src/main.ts', 100, 1000), textFile('src/lib/utils.ts', 50, 2000)]);

      const stats = tree.getDirectoryStat('/src');
      expect(stats).toHaveLength(2);

      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['lib/utils.ts', 'main.ts']);
    });

    it('should return empty array for non-existent directory', () => {
      tree.build([]);
      expect(tree.getDirectoryStat('/nonexistent')).toEqual([]);
    });
  });

  describe('incremental updates', () => {
    it('should add a file and create intermediate directories', () => {
      tree.build([]);

      tree.addFile('/src/main.ts', { size: 100, mtimeMs: 1000, contentKind: 'text', lineCount: 5 });

      expect(tree.stat('/src')).toBeDefined();
      expect(tree.stat('/src')?.type).toBe('dir');
      expect(tree.stat('/src/main.ts')?.size).toBe(100);
    });

    it('should remove a file', () => {
      tree.build([textFile('test.txt', 42, 1000)]);

      tree.removeFile('/test.txt');

      expect(tree.stat('/test.txt')).toBeUndefined();
    });

    it('should not remove a directory via removeFile', () => {
      tree.build([textFile('src/main.ts', 100, 1000)]);

      tree.removeFile('/src');

      expect(tree.stat('/src')).toBeDefined();
    });

    it('should add a directory', () => {
      tree.build([]);

      tree.addDirectory('/a/b/c');

      expect(tree.stat('/a')?.type).toBe('dir');
      expect(tree.stat('/a/b')?.type).toBe('dir');
      expect(tree.stat('/a/b/c')?.type).toBe('dir');
    });

    it('should remove a directory and all contents', () => {
      tree.build([textFile('src/main.ts', 100, 1000), textFile('src/lib/utils.ts', 50, 2000)]);

      tree.removeDirectory('/src');

      expect(tree.stat('/src')).toBeUndefined();
    });

    it('should rename a file', () => {
      tree.build([textFile('old.txt', 42, { mtimeMs: 1000, lineCount: 6 })]);

      tree.rename('/old.txt', '/new.txt');

      expect(tree.stat('/old.txt')).toBeUndefined();
      expect(tree.stat('/new.txt')?.size).toBe(42);
      expect(tree.stat('/new.txt')).toEqual(expect.objectContaining({ contentKind: 'text', lineCount: 6 }));
    });

    it('should rename a directory with all contents', () => {
      tree.build([textFile('old/main.ts', 100, 1000), textFile('old/lib/utils.ts', 50, 2000)]);

      tree.rename('/old', '/new');

      expect(tree.stat('/old')).toBeUndefined();
      expect(tree.stat('/new')).toBeDefined();
      expect(tree.stat('/new/main.ts')?.size).toBe(100);
      expect(tree.stat('/new/lib/utils.ts')?.size).toBe(50);
    });
  });

  describe('clear', () => {
    it('should reset tree to empty state', () => {
      tree.build([textFile('test.txt', 42, 1000)]);

      tree.clear();

      expect(tree.isBuilt).toBe(false);
      expect(tree.readdir('/')).toEqual([]);
    });
  });

  describe('searchFiles', () => {
    beforeEach(() => {
      tree.build([
        textFile('src/main.ts', 100, 1000),
        textFile('src/utils/helper.ts', 50, 2000),
        textFile('src/utils/math.ts', 60, 3000),
        textFile('README.md', 200, 4000),
        textFile('docs/guide.md', 300, 5000),
      ]);
    });

    it('should return matching files by substring', () => {
      const results = tree.searchFiles('helper');
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/utils/helper.ts');
    });

    it('should be case-insensitive', () => {
      const results = tree.searchFiles('HELPER');
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/utils/helper.ts');
    });

    it('should respect maxResults limit', () => {
      const results = tree.searchFiles('.ts', { maxResults: 2 });
      expect(results).toHaveLength(2);
    });

    it('should include directories when includeDirectories is true', () => {
      const results = tree.searchFiles('utils', { includeDirectories: true });
      const types = results.map((r) => r.type);
      expect(types).toContain('dir');
    });

    it('should exclude directories by default', () => {
      const results = tree.searchFiles('utils');
      const types = results.map((r) => r.type);
      expect(types).not.toContain('dir');
    });

    it('should return empty array for no matches', () => {
      const results = tree.searchFiles('nonexistent_xyz');
      expect(results).toEqual([]);
    });

    it('should match on full path, not just basename', () => {
      const results = tree.searchFiles('src/utils');
      expect(results.length).toBeGreaterThanOrEqual(2);
      for (const r of results) {
        expect(r.path.toLowerCase()).toContain('src/utils');
      }
    });

    it('should handle empty query by returning first maxResults files', () => {
      const results = tree.searchFiles('', { maxResults: 3 });
      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.type).toBe('file');
      }
    });
  });

  describe('performance', () => {
    it('should handle getDirectoryStat for 6000+ entries under 20ms', () => {
      const entries: BuildEntry[] = [];
      for (let i = 0; i < 6265; i++) {
        const directory = `dir${Math.floor(i / 100)}`;
        entries.push(textFile(`${directory}/file${i}.ts`, Math.floor(Math.random() * 10_000), Date.now()));
      }
      tree.build(entries);

      const start = performance.now();
      const stats = tree.getDirectoryStat('/');
      const elapsed = performance.now() - start;

      expect(stats).toHaveLength(6265);
      expect(elapsed).toBeLessThan(20);
    });
  });
});

describe('TreeIndexes', () => {
  const file = (path: string): FileStatEntry => ({
    path,
    name: path.split('/').at(-1)!,
    type: 'file',
    size: 1,
    mtimeMs: 0,
    contentKind: 'binary',
  });

  it('keys indexes by root, so one root cold does not evict another warm', () => {
    const indexes = new TreeIndexes();
    indexes.build('/a', [file('one.ts')]);
    indexes.build('/b', [file('two.ts')]);

    expect(indexes.search('/a', 'one')).toMatchObject([{ path: 'one.ts' }]);
    expect(indexes.search('/b', 'two')).toMatchObject([{ path: 'two.ts' }]);
    expect(indexes.search('/c', 'three')).toBeUndefined();
  });

  /* Nested roots are ordinary: `/` and a project route can both be warm, and a
   * write inside the project is a fact for both of them. */
  it('applies one write to every index whose root contains it', () => {
    const indexes = new TreeIndexes();
    indexes.build('/', [file('projects/x/main.ts')]);
    indexes.build('/projects/x', [file('main.ts')]);

    indexes.addFile('/projects/x/added.ts', { size: 2, contentKind: 'binary' });

    expect(
      indexes
        .statTree('/projects/x')
        ?.map((entry) => entry.path)
        .sort(),
    ).toEqual(['added.ts', 'main.ts']);
    expect(indexes.get('/')?.stat('projects/x/added.ts')?.type).toBe('file');
    expect(indexes.statType('/projects/x/added.ts')).toBe('file');
  });

  it('leaves an index a path falls outside of untouched', () => {
    const indexes = new TreeIndexes();
    indexes.build('/a', [file('one.ts')]);

    indexes.addFile('/b/two.ts', { size: 1, contentKind: 'binary' });
    indexes.removeFile('/b/two.ts');

    expect(indexes.statTree('/a')).toMatchObject([{ path: 'one.ts' }]);
    expect(indexes.statTree('/b')).toBeUndefined();
  });

  /* G7: one index holds one mount's tree, because that is all the scan that
   * built it walked. Answering for a path behind a nested mount reports a false
   * empty (or invents entries) where the caller must fall back to a walk. */
  it('does not answer for a path behind a nested mount', () => {
    const indexes = new TreeIndexes(() => ['/', '/projects/x']);
    indexes.build('/', [file('main.ts')]);

    expect(indexes.statTree('/projects/x')).toBeUndefined();
    expect(indexes.statType('/projects/x/src/a.ts')).toBeUndefined();

    indexes.addFile('/projects/x/added.ts', { size: 1, contentKind: 'binary' });

    expect(indexes.get('/')?.stat('projects/x/added.ts')).toBeUndefined();
    expect(indexes.statTree('/')).toMatchObject([{ path: 'main.ts' }]);
  });

  it('drops every index on clear', () => {
    const indexes = new TreeIndexes();
    indexes.build('/a', [file('one.ts')]);

    indexes.clear();

    expect(indexes.get('/a')).toBeUndefined();
    expect(indexes.statTree('/a')).toBeUndefined();
  });
});

/**
 * `TreeIndexes` bookkeeping as the authority drives it: every mutation must
 * leave the per-root index answering the next `statTree`. W5 moved these rows
 * here byte-for-byte from the Service spec because the index owns them.
 */
describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;

  beforeEach(async () => {
    ({ service } = await createWorkspaceFileService());
  });

  // ---------------------------------------------------------------------------
  // In-memory tree integration
  // ---------------------------------------------------------------------------

  describe('in-memory tree integration', () => {
    /* The index is read through the rooted surface since W12d, where the view
     * masks its rows; the invalidation the authority owns is what these pin. */
    const statTree = async (path: string): Promise<FileStatEntry[]> =>
      service.createRootedFileSystem('/').statTree!(path);

    it('should reflect writeFile in subsequent statTree', async () => {
      await service.writeFile('/root/a.txt', 'aaa');
      await statTree('root');

      await service.writeFile('/root/b.txt', 'bb');

      const stats = await statTree('root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'b.txt']);
    });

    it('should reflect mkdir in subsequent statTree', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await statTree('root');

      await service.mkdir('/root/sub');
      await service.writeFile('/root/sub/x.txt', 'x');

      const stats = await statTree('root/sub');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('x.txt');
    });

    it('should reflect unlink in subsequent statTree', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.writeFile('/root/b.txt', 'b');
      await statTree('root');

      await service.unlink('/root/a.txt');

      const stats = await statTree('root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('b.txt');
    });

    it('should reflect a move in subsequent statTree', async () => {
      await service.writeFile('/root/old.txt', 'data');
      await statTree('root');

      await service.move('/root/old.txt', '/root/new.txt');

      const stats = await statTree('root');
      const paths = stats.map((s) => s.path);
      expect(paths).toContain('new.txt');
      expect(paths).not.toContain('old.txt');
    });

    it('should reflect rmdir in subsequent statTree', async () => {
      await service.mkdir('/root/sub', { recursive: true });
      await service.writeFile('/root/a.txt', 'a');
      await statTree('root');

      await service.rmdir('/root/sub');

      const stats = await statTree('root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('a.txt');
    });

    it('should reflect duplicateFile in subsequent statTree', async () => {
      await service.writeFile('/root/src.txt', 'copy');
      await statTree('root');

      await service.createRootedFileSystem('/').duplicate!('root/src.txt', 'root/dst.txt');

      const stats = await statTree('root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['dst.txt', 'src.txt']);
    });

    it('should reflect a rooted copyTree in subsequent statTree', async () => {
      await service.writeFile('/root/src/a.txt', 'aaa');
      await service.writeFile('/root/src/sub/b.txt', 'bb');
      await statTree('root');

      await service.createRootedFileSystem('/').copyTree!('root/src', 'root/dest');

      const stats = await statTree('root/dest');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);
    });
  });
});
