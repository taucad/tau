import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';
import type { TauViewerModel, TauViewerReadInput } from '@taucad/mcp/viewer-protocol';
import { tauViewerReadLimit } from '@taucad/mcp/viewer-protocol';
import { decodeBase64, loadModel } from '#app/model-loader.js';

const bytes = new Uint8Array(tauViewerReadLimit + 1000).map((_, index) => index % 7);

const model: TauViewerModel = {
  id: 'm1',
  title: 'surface',
  path: 'surface.glb',
  mimeType: 'model/gltf-binary',
  byteLength: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};

describe('loadModel', () => {
  it('should ask for gzip and undo it, one reply-sized range at a time', async () => {
    const calls: TauViewerReadInput[] = [];
    const artifact = await loadModel(async (_name, args) => {
      const input = args as TauViewerReadInput;
      calls.push(input);
      const slice = bytes.subarray(input.offset, input.offset + input.length);
      return {
        offset: input.offset,
        byteLength: slice.length,
        totalBytes: bytes.length,
        encoding: 'gzip',
        data: gzipSync(slice).toString('base64'),
      };
    }, model);

    expect(calls.map(({ offset, length }) => [offset, length])).toEqual([
      [0, tauViewerReadLimit],
      [tauViewerReadLimit, 1000],
    ]);
    expect(calls.every((call) => call.encodings?.includes('gzip'))).toBe(true);
    // `toEqual` walks a 4 MiB array element by element; comparing bytes natively keeps the test fast.
    expect(Buffer.from(artifact.content as Uint8Array<ArrayBuffer>).equals(bytes)).toBe(true);
  });

  it('should refuse a slice whose length is not the range it claims', async () => {
    const short = loadModel(
      async () => ({ offset: 0, byteLength: 10, totalBytes: bytes.length, data: Buffer.alloc(4).toString('base64') }),
      model,
    );
    await expect(short).rejects.toThrow('changed while it was loading');
  });

  it('should refuse ranges that assemble bytes other than the digest it was shown', async () => {
    const rewritten = bytes.map((value, index) => (index === bytes.length - 1 ? value + 1 : value));
    const mixed = loadModel(async (_name, args) => {
      const input = args as TauViewerReadInput;
      const slice = rewritten.subarray(input.offset, input.offset + input.length);
      return {
        offset: input.offset,
        byteLength: slice.length,
        totalBytes: rewritten.length,
        data: Buffer.from(slice).toString('base64'),
      };
    }, model);
    await expect(mixed).rejects.toThrow('changed while it was loading');
  });
});

describe('decodeBase64', () => {
  it('should match Node for padded and unpadded text', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255]) {
      const data = Buffer.from(Array.from({ length }, (_, index) => (index * 37) % 256));
      expect(decodeBase64(data.toString('base64'))).toEqual(new Uint8Array(data));
      expect(decodeBase64(data.toString('base64').replace(/=+$/u, ''))).toEqual(new Uint8Array(data));
    }
  });

  it('should refuse text outside the alphabet and a dangling last character', () => {
    expect(() => decodeBase64('QUJD*A==')).toThrow('Invalid base64 character "*"');
    expect(() => decodeBase64('QUJDR')).toThrow('not valid base64');
  });
});
