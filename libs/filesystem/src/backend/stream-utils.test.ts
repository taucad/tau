import { describe, expect, it } from 'vitest';
import { bufferToStream } from '#backend/stream-utils.js';
import type { FileReadStreamOptions } from '#types.js';

const readAll = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

describe('bufferToStream byte ranges', () => {
  it.each([
    ['negative position', { position: -1 }],
    ['fractional position', { position: 0.5 }],
    ['NaN position', { position: Number.NaN }],
    ['infinite position', { position: Number.POSITIVE_INFINITY }],
    ['negative length', { length: -1 }],
    ['fractional length', { length: 1.5 }],
    ['infinite length', { length: Number.NEGATIVE_INFINITY }],
    ['unsafe length', { length: Number.MAX_SAFE_INTEGER + 1 }],
  ] satisfies ReadonlyArray<readonly [string, FileReadStreamOptions]>)('rejects %s', (_name, options) => {
    expect(() => bufferToStream(new Uint8Array([1, 2, 3]), options)).toThrow(RangeError);
  });

  it('supports zero length, positions past EOF, and valid slices', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await expect(readAll(bufferToStream(bytes, { position: 1, length: 2 }))).resolves.toEqual(new Uint8Array([2, 3]));
    await expect(readAll(bufferToStream(bytes, { position: 1, length: 0 }))).resolves.toEqual(new Uint8Array());
    await expect(readAll(bufferToStream(bytes, { position: 10 }))).resolves.toEqual(new Uint8Array());
  });
});
