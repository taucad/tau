import { expectTypeOf, it, describe } from 'vitest';
import type { FileStat } from '@taucad/types';
import type { FileSystemProvider, HeadFileStat } from '#types.js';

describe('FileSystemProvider wire types', () => {
  it('stat and lstat resolve to FileStat from @taucad/types', () => {
    expectTypeOf<Awaited<ReturnType<FileSystemProvider['stat']>>>().toEqualTypeOf<FileStat>();
    expectTypeOf<Awaited<ReturnType<FileSystemProvider['lstat']>>>().toEqualTypeOf<FileStat>();
  });

  it('readdirWithStats distinguishes exact and head-only metadata', () => {
    type Listing = NonNullable<FileSystemProvider['readdirWithStats']>;
    expectTypeOf<Listing>().toBeCallableWith('');
    expectTypeOf<Listing>().toBeCallableWith('', { content: 'head' });
    expectTypeOf<HeadFileStat>().not.toExtend<FileStat>();
  });

  it('keeps exact-only third-party provider methods assignable', () => {
    const exactOnly: NonNullable<FileSystemProvider['readdirWithStats']> = async (_path: string) => [];
    expectTypeOf(exactOnly).toExtend<NonNullable<FileSystemProvider['readdirWithStats']>>();
  });

  it('keeps appendFile optional on third-party providers', () => {
    expectTypeOf<FileSystemProvider['appendFile']>().toEqualTypeOf<
      ((path: string, data: Uint8Array<ArrayBuffer> | string) => Promise<void>) | undefined
    >();
  });
});
