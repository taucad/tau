import { expectTypeOf, it, describe } from 'vitest';
import type { FileContentMetadata, FileStat, FileStatEntry, FileTreeEntry } from '#types/file.types.js';

describe('FileStat', () => {
  it('is a readonly object type for stat results', () => {
    expectTypeOf<FileStat['type']>().toEqualTypeOf<'file' | 'dir'>();
    expectTypeOf<FileStat['size']>().toEqualTypeOf<number>();
    expectTypeOf<FileStat['mtimeMs']>().toEqualTypeOf<number>();
  });

  it('requires line counts for text file stats', () => {
    expectTypeOf<Extract<FileStat, { type: 'file'; contentKind: 'text' }>>().toExtend<{
      type: 'file';
      contentKind: 'text';
      lineCount: number;
    }>();
  });

  it('forbids line counts for binary file stats', () => {
    expectTypeOf<Extract<FileStat, { type: 'file'; contentKind: 'binary' }>['lineCount']>().toEqualTypeOf<undefined>();
  });
});

describe('FileStatEntry', () => {
  it('extends FileStat with path and name', () => {
    expectTypeOf<FileStatEntry>().toExtend<FileStat & { path: string; name: string }>();
  });
});

describe('FileTreeEntry', () => {
  it('requires content metadata for file entries', () => {
    expectTypeOf<Extract<FileTreeEntry, { type: 'file' }>>().toExtend<FileContentMetadata>();
  });
});
