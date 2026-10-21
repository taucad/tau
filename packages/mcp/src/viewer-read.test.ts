import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { tauViewerReadLimit } from '#viewer-protocol.js';
import type { TauViewerReadResult } from '#viewer-protocol.js';
import { decodeTauViewerSlice, readTauViewerBytes } from '#viewer-read.js';
import type { TauViewerRangeRead } from '#viewer-read.js';

const bytes = new Uint8Array(tauViewerReadLimit + 1000).map((_, index) => index % 7);
const sha256 = createHash('sha256').update(bytes).digest('hex');

type Range = Parameters<TauViewerRangeRead>[0];

/** A server holding `file`, answering each range as `app_read` does. */
const serving =
  (
    file: Uint8Array<ArrayBuffer>,
    encode: (slice: Uint8Array<ArrayBuffer>) => Pick<TauViewerReadResult, 'data' | 'encoding'> = plain,
  ) =>
  async ({ offset, length }: Range): Promise<TauViewerReadResult> => {
    const slice = file.subarray(offset, offset + length);
    return {
      offset,
      byteLength: slice.length,
      totalBytes: file.length,
      ...encode(slice),
    };
  };

function plain(slice: Uint8Array<ArrayBuffer>): Pick<TauViewerReadResult, 'data'> {
  return { data: Buffer.from(slice).toString('base64') };
}

describe('readTauViewerBytes', () => {
  it('should read one reply-sized range at a time, offer gzip and undo it, and check the digest', async () => {
    const ranges: Range[] = [];
    const answer = serving(bytes, (slice) => ({
      encoding: 'gzip',
      data: gzipSync(slice).toString('base64'),
    }));
    const progress: number[] = [];
    const read = await readTauViewerBytes({
      read: async (range) => {
        ranges.push(range);
        return answer(range);
      },
      byteLength: bytes.length,
      sha256,
      label: 'surface.glb',
      onProgress: (loaded) => progress.push(loaded),
    });

    expect(ranges).toEqual([
      { offset: 0, length: tauViewerReadLimit, encodings: ['gzip'] },
      { offset: tauViewerReadLimit, length: 1000, encodings: ['gzip'] },
    ]);
    expect(progress).toEqual([tauViewerReadLimit, bytes.length]);
    // `toEqual` walks a 4 MiB array element by element; comparing bytes natively keeps the test fast.
    expect(Buffer.from(read).equals(bytes)).toBe(true);
  });

  it('should refuse a slice that is not the range it claims, a size that changed, or bytes off the digest', async () => {
    const input = { byteLength: bytes.length, label: 'surface.glb' };
    await expect(
      readTauViewerBytes({
        ...input,
        read: async () => ({
          offset: 0,
          byteLength: 10,
          totalBytes: bytes.length,
          data: Buffer.alloc(4).toString('base64'),
        }),
      }),
    ).rejects.toThrow('surface.glb changed while it was loading.');
    await expect(readTauViewerBytes({ ...input, read: serving(bytes.subarray(1)) })).rejects.toThrow(
      'surface.glb changed while it was loading.',
    );
    const rewritten = bytes.map((value, index) => (index === bytes.length - 1 ? value + 1 : value));
    await expect(readTauViewerBytes({ ...input, sha256, read: serving(rewritten) })).rejects.toThrow(
      'surface.glb changed while it was loading.',
    );
    await expect(
      readTauViewerBytes({
        ...input,
        read: async () => ({
          offset: 0,
          byteLength: 0,
          totalBytes: bytes.length,
          data: '',
        }),
      }),
    ).rejects.toThrow('surface.glb ended early while it was loading.');
  });

  it('should stop before the next range once aborted', async () => {
    const controller = new AbortController();
    const answer = serving(bytes);
    const read = readTauViewerBytes({
      read: async (range) => {
        controller.abort(new Error('closed'));
        return answer(range);
      },
      byteLength: bytes.length,
      label: 'surface.glb',
      signal: controller.signal,
    });
    await expect(read).rejects.toThrow('closed');
  });
});

describe('decodeTauViewerSlice', () => {
  const slice = (data: string): TauViewerReadResult => ({
    offset: 0,
    byteLength: 0,
    totalBytes: 0,
    data,
  });

  it('should match Node for padded and unpadded base64, without the engine decoder', async () => {
    const native = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64');
    Reflect.deleteProperty(Uint8Array, 'fromBase64');
    try {
      for (const length of [0, 1, 2, 3, 4, 5, 255]) {
        const data = Buffer.from(Array.from({ length }, (_, index) => (index * 37) % 256));
        // oxlint-disable-next-line no-await-in-loop -- each length is checked in turn.
        expect(await decodeTauViewerSlice(slice(data.toString('base64')))).toEqual(new Uint8Array(data));
        // oxlint-disable-next-line no-await-in-loop -- as above.
        expect(await decodeTauViewerSlice(slice(data.toString('base64').replace(/=+$/u, '')))).toEqual(
          new Uint8Array(data),
        );
      }
      await expect(decodeTauViewerSlice(slice('QUJD*A=='))).rejects.toThrow('Invalid base64 character "*"');
      await expect(decodeTauViewerSlice(slice('QUJDR'))).rejects.toThrow('not valid base64');
    } finally {
      if (native !== undefined) {
        Object.defineProperty(Uint8Array, 'fromBase64', native);
      }
    }
  });
});
