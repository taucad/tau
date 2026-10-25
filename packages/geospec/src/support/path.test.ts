// Ported from Tau's `libs/utils/src/path.utils.test.ts` (the resolveRootedPath, assertRootedPath and joinRelativePath cases).
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { assertRootedPath, joinRelativePath, resolveRootedPath } from '#support/path.js';
import type { VirtualPathError } from '#support/path.js';

describe('resolveRootedPath', () => {
  it('should normalize idempotently without escaping the selected root', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('.', '..', 'src', 'nested', 'file.ts', 'προσχέδιο'), { maxLength: 30 }),
        (segments) => {
          const input = segments.join('/');
          try {
            const normalized = resolveRootedPath(input);
            expect(resolveRootedPath(normalized)).toBe(normalized);
            expect(normalized.startsWith('/')).toBe(false);
            expect(normalized.split('/')).not.toContain('..');
          } catch (error) {
            expect(error).toMatchObject<Partial<VirtualPathError>>({ code: 'PATH_OUTSIDE_ROOT' });
          }
        },
      ),
    );
  });

  it.each([
    ['', ''],
    ['.', ''],
    ['./', ''],
    ['main.ts', 'main.ts'],
    ['./src/main.ts', 'src/main.ts'],
    ['src/../main.ts', 'main.ts'],
    ['src//nested/./part.ts', 'src/nested/part.ts'],
    ['προσχέδιο/部品.ts', 'προσχέδιο/部品.ts'],
  ])('should resolve %j to %j', (input, expected) => {
    expect(resolveRootedPath(input)).toBe(expected);
  });

  it.each([
    '/main.ts',
    '//server/share',
    'C:/model.ts',
    String.raw`C:\model.ts`,
    String.raw`\\server\share`,
    'file:///model.ts',
    'https://example.com/model.ts',
    'bad\0path',
  ])('should reject invalid host or absolute path %j', (input) => {
    expect(() => resolveRootedPath(input)).toThrow(
      expect.objectContaining<Partial<VirtualPathError>>({ code: 'INVALID_PATH', metadata: { input } }),
    );
  });

  it.each(['../secret', 'src/../../secret'])('should reject traversal above root for %j', (input) => {
    expect(() => resolveRootedPath(input)).toThrow(
      expect.objectContaining<Partial<VirtualPathError>>({ code: 'PATH_OUTSIDE_ROOT', metadata: { input } }),
    );
  });

  it.each(['', 'main.ts', 'lib/gear.ts', '.tau/AGENTS.md', 'προσχέδιο/部品.ts'])(
    'should leave canonical rooted path %j unchanged',
    (input) => {
      expect(resolveRootedPath(input)).toBe(input);
    },
  );

  it.each(['.', './main.ts', 'lib//gear.ts', 'lib/gear.ts/'])('should expose noncanonical rooted path %j', (input) => {
    expect(resolveRootedPath(input)).not.toBe(input);
  });
});

describe('assertRootedPath', () => {
  it.each(['', 'main.ts', 'lib/gear.ts'])('should return canonical rooted path %j unchanged', (input) => {
    expect(assertRootedPath(input)).toBe(input);
  });

  it.each(['/main.ts', '.', './main.ts', 'lib//gear.ts', 'lib/gear.ts/'])(
    'should reject noncanonical rooted path %j',
    (input) => {
      expect(() => assertRootedPath(input)).toThrow(
        expect.objectContaining<Partial<VirtualPathError>>({ code: 'INVALID_PATH', metadata: { input } }),
      );
    },
  );
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
