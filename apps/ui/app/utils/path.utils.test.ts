import { describe, expect, it } from 'vitest';
import { joinPath, normalizePath } from '#utils/path.utils.js';

describe('normalizePath', () => {
  it('should normalize a simple path', () => {
    expect(normalizePath('/builds/id/main.scad')).toBe('/builds/id/main.scad');
  });

  it('should remove redundant slashes', () => {
    expect(normalizePath('//builds//id//main.scad')).toBe('/builds/id/main.scad');
  });

  it('should handle double slashes at the start', () => {
    expect(normalizePath('//builds/id/main.scad')).toBe('/builds/id/main.scad');
  });

  it('should handle path without leading slash', () => {
    expect(normalizePath('builds/id/main.scad')).toBe('/builds/id/main.scad');
  });

  it('should handle empty path', () => {
    expect(normalizePath('')).toBe('/');
  });

  it('should handle root path', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('should handle multiple consecutive slashes', () => {
    expect(normalizePath('///builds///id///main.scad///')).toBe('/builds/id/main.scad');
  });
});

describe('joinPath', () => {
  describe('basic joining', () => {
    it('should join two relative paths', () => {
      expect(joinPath('root', 'file.txt')).toBe('/root/file.txt');
    });

    it('should join multiple segments', () => {
      expect(joinPath('/root', 'dir', 'subdir', 'file.txt')).toBe('/root/dir/subdir/file.txt');
    });

    it('should join root with relative path', () => {
      expect(joinPath('/', 'builds', 'id', 'main.scad')).toBe('/builds/id/main.scad');
    });
  });

  describe('absolute path handling', () => {
    it('should reset to absolute path when encountered', () => {
      expect(joinPath('/root', '/absolute', 'file.txt')).toBe('/absolute/file.txt');
    });

    it('should handle absolute path as first argument', () => {
      expect(joinPath('/builds/id/main.scad')).toBe('/builds/id/main.scad');
    });

    it('should handle root directory with absolute path (the original bug case)', () => {
      expect(joinPath('/', '/builds/hero-qrcode-v2/main.scad')).toBe('/builds/hero-qrcode-v2/main.scad');
    });

    it('should reset multiple times with multiple absolute paths', () => {
      expect(joinPath('/first', '/second', '/third')).toBe('/third');
    });
  });

  describe('empty segment handling', () => {
    it('should ignore empty strings', () => {
      expect(joinPath('/root', '', 'file.txt')).toBe('/root/file.txt');
    });

    it('should handle all empty strings', () => {
      expect(joinPath('', '', '')).toBe('/');
    });

    it('should handle empty string at start', () => {
      expect(joinPath('', 'builds', 'file.txt')).toBe('/builds/file.txt');
    });
  });

  describe('edge cases', () => {
    it('should return root for no arguments', () => {
      expect(joinPath()).toBe('/');
    });

    it('should handle single relative segment', () => {
      expect(joinPath('file.txt')).toBe('/file.txt');
    });

    it('should handle single absolute segment', () => {
      expect(joinPath('/file.txt')).toBe('/file.txt');
    });

    it('should handle paths with redundant slashes', () => {
      // Each path starting with / is treated as absolute, so //file.txt resets the path
      expect(joinPath('//root//', '//dir//', '//file.txt')).toBe('/file.txt');
    });

    it('should normalize the final result', () => {
      expect(joinPath('/root/', '/dir/', 'file.txt')).toBe('/dir/file.txt');
    });
  });

  describe('real-world scenarios', () => {
    it('should work for file manager root with build path', () => {
      expect(joinPath('/', '/builds/hero-qrcode-v2/main.scad')).toBe('/builds/hero-qrcode-v2/main.scad');
    });

    it('should work for build-specific file manager', () => {
      expect(joinPath('/builds/abc123', 'main.scad')).toBe('/builds/abc123/main.scad');
    });

    it('should work for nested directory creation', () => {
      expect(joinPath('/builds', 'abc123', 'src', 'lib', 'utils.ts')).toBe('/builds/abc123/src/lib/utils.ts');
    });
  });
});
