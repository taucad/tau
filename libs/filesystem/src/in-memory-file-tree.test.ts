import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryFileTree } from '#in-memory-file-tree.js';

type BuildEntry = Parameters<InMemoryFileTree['build']>[0][number];

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
describe('InMemoryFileTree', () => {
  let tree: InMemoryFileTree;

  beforeEach(() => {
    tree = new InMemoryFileTree();
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
