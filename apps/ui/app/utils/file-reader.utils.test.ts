import { describe, expect, it } from 'vitest';
import { createImportedProjectFiles } from '#utils/file-reader.utils.js';
import type { FileMap } from '#utils/file-reader.utils.js';

const bytes = (value: number): Uint8Array<ArrayBuffer> => new Uint8Array([value]);
const parameterRecordBytes = new TextEncoder().encode(
  '{"recordVersion":2,"profile":"future","groups":{"default":{"values":{"exact":"1.2300"}}}}',
);

const createFiles = (): FileMap =>
  new Map([
    ['main.ts', { filename: 'main.ts', content: bytes(1) }],
    ['.tau/cache', { filename: '.tau/cache', content: bytes(2) }],
    ['.tau/cache/geometry/hash.bin', { filename: '.tau/cache/geometry/hash.bin', content: bytes(3) }],
    ['.tau/cache-file', { filename: '.tau/cache-file', content: bytes(4) }],
    [
      '.tau/parameters/main.json',
      {
        filename: '.tau/parameters/main.json',
        content: parameterRecordBytes,
      },
    ],
    ['.tau/renders/preview.webp', { filename: '.tau/renders/preview.webp', content: bytes(6) }],
    ['node_modules/replicad/index.js', { filename: 'node_modules/replicad/index.js', content: bytes(7) }],
  ]);

describe('createImportedProjectFiles', () => {
  it('excludes every cache-class path and keeps the rest', () => {
    const result = createImportedProjectFiles(createFiles(), 'main.ts');

    expect(Object.keys(result)).toEqual([
      'main.ts',
      '.tau/cache-file',
      '.tau/parameters/main.json',
      '.tau/renders/preview.webp',
    ]);
    expect(result['.tau/parameters/main.json']?.content).toBe(parameterRecordBytes);
  });

  it('rejects an excluded selected main file', () => {
    expect(() => createImportedProjectFiles(createFiles(), '.tau/cache/geometry/hash.bin')).toThrow(
      'selected main file is regenerable cache content',
    );
  });

  it('rejects a selected main file that is absent', () => {
    expect(() => createImportedProjectFiles(createFiles(), 'missing.ts')).toThrow(
      'selected main file "missing.ts" is not present',
    );
  });
});
