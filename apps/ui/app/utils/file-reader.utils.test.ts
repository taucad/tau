import { describe, expect, it } from 'vitest';
import { createImportedProjectFiles } from '#utils/file-reader.utils.js';
import type { FileMap } from '#utils/file-reader.utils.js';

const bytes = (value: number): Uint8Array<ArrayBuffer> => new Uint8Array([value]);

const createFiles = (): FileMap =>
  new Map([
    ['main.ts', { filename: 'main.ts', content: bytes(1) }],
    ['.tau/cache', { filename: '.tau/cache', content: bytes(2) }],
    ['.tau/cache/geometry/hash.bin', { filename: '.tau/cache/geometry/hash.bin', content: bytes(3) }],
    ['.tau/cache-file', { filename: '.tau/cache-file', content: bytes(4) }],
    ['.tau/parameters/main.json', { filename: '.tau/parameters/main.json', content: bytes(5) }],
    ['.tau/renders/preview.webp', { filename: '.tau/renders/preview.webp', content: bytes(6) }],
  ]);

describe('createImportedProjectFiles', () => {
  it('excludes only the derived cache subtree', () => {
    const result = createImportedProjectFiles(createFiles(), 'main.ts');

    expect(Object.keys(result)).toEqual([
      'main.ts',
      '.tau/cache-file',
      '.tau/parameters/main.json',
      '.tau/renders/preview.webp',
    ]);
  });

  it('rejects an excluded selected main file', () => {
    expect(() => createImportedProjectFiles(createFiles(), '.tau/cache/geometry/hash.bin')).toThrow(
      'selected main file is inside the derived .tau/cache directory',
    );
  });

  it('rejects a selected main file that is absent', () => {
    expect(() => createImportedProjectFiles(createFiles(), 'missing.ts')).toThrow(
      'selected main file "missing.ts" is not present',
    );
  });
});
