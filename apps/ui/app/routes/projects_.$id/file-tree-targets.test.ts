import { describe, expect, it } from 'vitest';
import {
  areAllPathsAlreadyInDirectory,
  createFileTreeMoveEdits,
  getFileTreeParentDirectory,
  joinFileTreePath,
  resolveFileTreeTargetDirectory,
} from '#routes/projects_.$id/file-tree-targets.js';

const folderPaths = new Set(['public', 'public/models']);

const getTargetData = (path: string): { isFolder: boolean } | undefined =>
  folderPaths.has(path) ? { isFolder: true } : path ? { isFolder: false } : undefined;

describe('file-tree-targets', () => {
  describe('joinFileTreePath', () => {
    it('should join root paths without a leading slash', () => {
      expect(joinFileTreePath('', 'main.ts')).toBe('main.ts');
    });

    it('should join nested paths with one slash', () => {
      expect(joinFileTreePath('public/models', '/honeycomb.js')).toBe('public/models/honeycomb.js');
    });
  });

  describe('getFileTreeParentDirectory', () => {
    it('should return root for root-level files', () => {
      expect(getFileTreeParentDirectory('main.ts')).toBe('');
    });

    it('should return the parent for nested files', () => {
      expect(getFileTreeParentDirectory('public/models/honeycomb.js')).toBe('public/models');
    });
  });

  describe('resolveFileTreeTargetDirectory', () => {
    it('should resolve missing and root targets to the root directory', () => {
      expect(resolveFileTreeTargetDirectory({ targetPath: undefined, getTargetData })).toBe('');
      expect(resolveFileTreeTargetDirectory({ targetPath: '', getTargetData })).toBe('');
    });

    it('should resolve folder targets to themselves', () => {
      expect(resolveFileTreeTargetDirectory({ targetPath: 'public/models', getTargetData })).toBe('public/models');
    });

    it('should resolve nested file targets to their parent directory', () => {
      expect(resolveFileTreeTargetDirectory({ targetPath: 'public/models/honeycomb.js', getTargetData })).toBe(
        'public/models',
      );
    });

    it('should resolve root-level file targets to root', () => {
      expect(resolveFileTreeTargetDirectory({ targetPath: 'package.json', getTargetData })).toBe('');
    });

    it('should resolve missing nested targets to their parent directory', () => {
      const missingData = (): undefined => undefined;

      expect(resolveFileTreeTargetDirectory({ targetPath: 'src/missing.ts', getTargetData: missingData })).toBe('src');
    });
  });

  describe('createFileTreeMoveEdits', () => {
    it('should skip read-only paths and no-op moves', () => {
      const edits = createFileTreeMoveEdits({
        sourcePaths: ['public/models/honeycomb.js', 'node_modules/pkg/index.d.ts', 'public/models/box-corner.js'],
        targetDirectory: 'public/models',
        isReadOnlyPath: (path) => path.startsWith('node_modules'),
      });

      expect(edits).toEqual([]);
    });

    it('should create move edits for writable paths', () => {
      const edits = createFileTreeMoveEdits({
        sourcePaths: ['public/models/honeycomb.js'],
        targetDirectory: 'src',
        isReadOnlyPath: () => false,
      });

      expect(edits).toEqual([{ source: 'public/models/honeycomb.js', target: 'src/honeycomb.js' }]);
    });
  });

  describe('areAllPathsAlreadyInDirectory', () => {
    it('should return true when every source already belongs to the target directory', () => {
      expect(areAllPathsAlreadyInDirectory(['public/models/a.js', 'public/models/b.js'], 'public/models')).toBe(true);
    });

    it('should return false when any source belongs to a different directory', () => {
      expect(areAllPathsAlreadyInDirectory(['public/models/a.js', 'src/b.js'], 'public/models')).toBe(false);
    });
  });
});
