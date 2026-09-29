import { expectTypeOf, it, describe } from 'vitest';
import type { ExportFile, FileStat, FileStatEntry, FileTreeContentMetadata, FileTreeEntry } from '#types/file.types.js';
import type { MediaType, MimeType } from '#types/mime-types.types.js';

describe('open export media types', () => {
  it('retains known MIME literals while admitting new media types', () => {
    expectTypeOf<MimeType>().toExtend<MediaType>();
    expectTypeOf<'model/gltf-binary'>().toExtend<MediaType>();
    expectTypeOf<'application/vnd.example.cad'>().toExtend<MediaType>();
    const file: ExportFile = {
      name: 'part.cad',
      bytes: new Uint8Array(),
      mimeType: 'application/vnd.example.cad',
    };
    expectTypeOf(file.mimeType).toEqualTypeOf<MediaType>();
  });
});

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
  it('keeps classification while allowing unknown text line counts in file entries', () => {
    expectTypeOf<Extract<FileTreeEntry, { type: 'file' }>>().toExtend<FileTreeContentMetadata>();
  });
});
