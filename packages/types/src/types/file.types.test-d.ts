import { expectTypeOf, it, describe } from 'vitest';
import type { FileStat, FileStatEntry } from '#types/file.types.js';

describe('FileStat', () => {
  it('is a readonly object type for stat results', () => {
    expectTypeOf<FileStat['type']>().toEqualTypeOf<'file' | 'dir'>();
    expectTypeOf<FileStat['size']>().toEqualTypeOf<number>();
    expectTypeOf<FileStat['mtimeMs']>().toEqualTypeOf<number>();
  });
});

describe('FileStatEntry', () => {
  it('extends FileStat with path and name', () => {
    expectTypeOf<FileStatEntry>().toExtend<FileStat & { path: string; name: string }>();
  });
});
