import { expectTypeOf, it, describe } from 'vitest';
import type { FileStat } from '@taucad/types';
import type { DirectoryStatRow, FileSystemProvider } from '#types.js';

declare const provider: FileSystemProvider;

describe('FileSystemProvider wire types', () => {
  it('stat and lstat resolve to FileStat from @taucad/types', () => {
    expectTypeOf(provider.stat('log')).resolves.toEqualTypeOf<FileStat>();
    const legacy: FileSystemProvider['stat'] = async (_path: string): Promise<FileStat> => ({
      type: 'dir',
      size: 0,
      mtimeMs: 0,
    });
    expectTypeOf(legacy).toExtend<FileSystemProvider['stat']>();
    expectTypeOf<Awaited<ReturnType<FileSystemProvider['lstat']>>>().toEqualTypeOf<FileStat>();
  });

  it('lists head metadata with content facts only when known (I3)', () => {
    type Listing = NonNullable<FileSystemProvider['readdirWithStats']>;
    expectTypeOf<Listing>().toBeCallableWith('');
    expectTypeOf<Listing>().parameters.toEqualTypeOf<[path: string]>();
    expectTypeOf<{ name: 'a'; type: 'file'; size: 1; mtimeMs: 0 }>().toExtend<DirectoryStatRow>();
  });

  it('keeps appendFile optional on third-party providers', () => {
    expectTypeOf<FileSystemProvider['appendFile']>().toEqualTypeOf<
      ((path: string, data: Uint8Array<ArrayBuffer> | string) => Promise<void>) | undefined
    >();
  });
});
