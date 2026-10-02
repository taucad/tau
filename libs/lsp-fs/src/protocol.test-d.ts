import { expectTypeOf, describe, it } from 'vitest';

import type { FileStat, FileType, FsContentWire } from '#protocol.js';

describe('lsp-fs protocol wire types', () => {
  it('models FileStat', () => {
    // oxlint-disable-next-line @typescript-eslint/no-deprecated -- vitest expectTypeOf; migrate when stable replacement ships
    expectTypeOf<FileStat>().toMatchTypeOf<{
      type: FileType;
      ctime: number;
      mtime: number;
      size: number;
    }>();
  });

  it('models fs/content wire envelope', () => {
    // oxlint-disable-next-line @typescript-eslint/no-deprecated -- vitest expectTypeOf; migrate when stable replacement ships
    expectTypeOf<FsContentWire>().toMatchTypeOf<{ dataBase64: string }>();
  });
});
