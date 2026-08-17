import { expectTypeOf, it, describe } from 'vitest';
import type { FileStat } from '@taucad/types';
import type { FileSystemProvider } from '#types.js';

describe('FileSystemProvider wire types', () => {
  it('stat and lstat resolve to FileStat from @taucad/types', () => {
    expectTypeOf<Awaited<ReturnType<FileSystemProvider['stat']>>>().toEqualTypeOf<FileStat>();
    expectTypeOf<Awaited<ReturnType<FileSystemProvider['lstat']>>>().toEqualTypeOf<FileStat>();
  });

  it('readdirWithStats entries extend FileStat', () => {
    expectTypeOf<NonNullable<FileSystemProvider['readdirWithStats']>>().returns.resolves.toEqualTypeOf<
      Array<{ name: string } & FileStat>
    >();
  });
});
