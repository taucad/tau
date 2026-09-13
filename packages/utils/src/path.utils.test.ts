import { describe, expect, it } from 'vitest';
import { joinPath, joinRelativePath, normalizePath, parentDirectory, canonicalizePath } from '#path.utils.js';

describe('normalizePath', () => {
  it('should normalize a simple path', () => {
    expect(normalizePath('/projects/id/main.scad')).toBe('/projects/id/main.scad');
  });

  it('should remove redundant slashes', () => {
    expect(normalizePath('//projects//id//main.scad')).toBe('/projects/id/main.scad');
  });

  it('should handle double slashes at the start', () => {
    expect(normalizePath('//projects/id/main.scad')).toBe('/projects/id/main.scad');
  });

  it('should handle path without leading slash', () => {
    expect(normalizePath('projects/id/main.scad')).toBe('/projects/id/main.scad');
  });

  it('should handle empty path', () => {
    expect(normalizePath('')).toBe('/');
  });

  it('should handle root path', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('should handle multiple consecutive slashes', () => {
    expect(normalizePath('///projects///id///main.scad///')).toBe('/projects/id/main.scad');
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
      expect(joinPath('/', 'projects', 'id', 'main.scad')).toBe('/projects/id/main.scad');
    });
  });

  describe('absolute path handling', () => {
    it('should reset to absolute path when encountered', () => {
      expect(joinPath('/root', '/absolute', 'file.txt')).toBe('/absolute/file.txt');
    });

    it('should handle absolute path as first argument', () => {
      expect(joinPath('/projects/id/main.scad')).toBe('/projects/id/main.scad');
    });

    it('should handle root directory with absolute path', () => {
      expect(joinPath('/', '/projects/hero-qrcode-v2/main.scad')).toBe('/projects/hero-qrcode-v2/main.scad');
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
      expect(joinPath('', 'projects', 'file.txt')).toBe('/projects/file.txt');
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

    it('should normalize the final result', () => {
      expect(joinPath('/root/', '/dir/', 'file.txt')).toBe('/dir/file.txt');
    });
  });
});

describe('joinRelativePath', () => {
  describe('basic joining', () => {
    it('should join two relative segments', () => {
      expect(joinRelativePath('lib', 'utils.ts')).toBe('lib/utils.ts');
    });

    it('should join multiple segments', () => {
      expect(joinRelativePath('src', 'components', 'App.tsx')).toBe('src/components/App.tsx');
    });

    it('should handle single segment', () => {
      expect(joinRelativePath('main.ts')).toBe('main.ts');
    });
  });

  describe('empty segment handling', () => {
    it('should skip empty segments', () => {
      expect(joinRelativePath('', 'main.ts')).toBe('main.ts');
    });

    it('should skip empty segments in the middle', () => {
      expect(joinRelativePath('lib', '', 'utils.ts')).toBe('lib/utils.ts');
    });

    it('should return empty string for all empty segments', () => {
      expect(joinRelativePath('', '', '')).toBe('');
    });

    it('should return empty string for no arguments', () => {
      expect(joinRelativePath()).toBe('');
    });
  });

  describe('slash handling', () => {
    it('should collapse redundant slashes within segments', () => {
      expect(joinRelativePath('lib/', 'utils.ts')).toBe('lib/utils.ts');
    });

    it('should handle segments with trailing slashes', () => {
      expect(joinRelativePath('src/', 'components/', 'App.tsx')).toBe('src/components/App.tsx');
    });

    it('should handle segments with leading slashes (strips them)', () => {
      expect(joinRelativePath('/lib', 'utils.ts')).toBe('lib/utils.ts');
    });
  });

  describe('file tree key construction', () => {
    it('should build tree keys like readDirectoryActor does', () => {
      expect(joinRelativePath('lib', 'utils.ts')).toBe('lib/utils.ts');
      expect(joinRelativePath('src/components', 'Button.tsx')).toBe('src/components/Button.tsx');
    });

    it('should handle root-level entries (empty parent)', () => {
      expect(joinRelativePath('', 'main.ts')).toBe('main.ts');
    });
  });
});

describe('parentDirectory', () => {
  it('should return parent of a nested path', () => {
    expect(parentDirectory('/projects/abc/main.scad')).toBe('/projects/abc');
  });

  it('should return root for a top-level file', () => {
    expect(parentDirectory('/file.txt')).toBe('/');
  });

  it('should return root for root path', () => {
    expect(parentDirectory('/')).toBe('/');
  });

  it('should handle two-level path', () => {
    expect(parentDirectory('/a/b')).toBe('/a');
  });
});

describe('canonicalizePath', () => {
  it('should normalize duplicate slashes', () => {
    expect(canonicalizePath('//projects//id//main.scad')).toBe('/projects/id/main.scad');
  });

  it('should strip trailing slash', () => {
    expect(canonicalizePath('/projects/abc/')).toBe('/projects/abc');
  });

  it('should preserve root', () => {
    expect(canonicalizePath('/')).toBe('/');
  });

  it('should add leading slash if missing', () => {
    expect(canonicalizePath('projects/abc')).toBe('/projects/abc');
  });

  it('should handle empty string', () => {
    expect(canonicalizePath('')).toBe('/');
  });

  it('should handle multiple trailing slashes', () => {
    expect(canonicalizePath('/projects///')).toBe('/projects');
  });
});
