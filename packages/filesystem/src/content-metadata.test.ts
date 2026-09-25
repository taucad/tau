import { describe, expect, it, vi } from 'vitest';
import {
  countLineBytes,
  countTextLines,
  fileStatFromBytes,
  fileStatFromFile,
  getFileContentMetadata,
  headSniffByteLength,
  seemsBinary,
} from '#content-metadata.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * Build a `File`-shaped stat source whose full-content read is observable and
 * whose declared size can exceed the bytes actually materialised.
 *
 * @param options - Declared `size`, the leading bytes, and the modification time.
 * @returns The fake file plus spies for the sliced and full reads.
 */
const fakeFile = (options: { size: number; head: Uint8Array<ArrayBuffer>; lastModified: number }) => {
  const arrayBuffer = vi.fn(async () => new Uint8Array(options.head).buffer);
  const slice = vi.fn((start: number, end: number) => ({
    arrayBuffer: async () => options.head.slice(start, end).buffer,
  }));
  return {
    file: { size: options.size, lastModified: options.lastModified, slice, arrayBuffer } as unknown as File,
    arrayBuffer,
    slice,
  };
};

describe('content metadata', () => {
  it('should count an empty text file as one line', () => {
    expect(countTextLines('')).toBe(1);
    expect(getFileContentMetadata(new Uint8Array()).contentKind).toBe('text');
    expect(getFileContentMetadata(new Uint8Array())).toEqual({ contentKind: 'text', lineCount: 1 });
  });

  it('should count a trailing newline using read_file split semantics', () => {
    expect(getFileContentMetadata(encode('a\nb\n'))).toEqual({ contentKind: 'text', lineCount: 3 });
  });

  it('should classify BOM-prefixed content as text even when NUL follows', () => {
    expect(getFileContentMetadata(new Uint8Array([0xef, 0xbb, 0xbf, 0x00]))).toEqual({
      contentKind: 'text',
      lineCount: 1,
    });
  });

  it('should classify NUL bytes inside the sniff window as binary', () => {
    const bytes = new Uint8Array(headSniffByteLength);
    bytes.fill(0x41);
    bytes[headSniffByteLength - 1] = 0x00;

    expect(seemsBinary(bytes)).toBe(true);
    expect(getFileContentMetadata(bytes)).toEqual({ contentKind: 'binary' });
  });

  it('should compute exact line count for large text buffers', () => {
    const text = Array.from({ length: 4096 }, (_, index) => `line-${index}`).join('\n');

    expect(getFileContentMetadata(encode(text))).toEqual({ contentKind: 'text', lineCount: 4096 });
  });

  it('should create file stats with byte size and content metadata', () => {
    expect(fileStatFromBytes(encode('one\ntwo'), 123)).toEqual({
      type: 'file',
      size: 7,
      mtimeMs: 123,
      contentKind: 'text',
      lineCount: 2,
    });
  });

  it('should count newline bytes without decoding', () => {
    expect(countLineBytes(new Uint8Array())).toBe(1);
    expect(countLineBytes(encode('a\nb\n'))).toBe(3);
    expect(countLineBytes(encode('one\ntwo'))).toBe(countTextLines('one\ntwo'));
  });
});

describe('fileStatFromFile', () => {
  it('should read no content at all for an empty file', async () => {
    const { file, arrayBuffer, slice } = fakeFile({ size: 0, head: new Uint8Array(), lastModified: 7 });

    await expect(fileStatFromFile(file)).resolves.toEqual({
      type: 'file',
      size: 0,
      mtimeMs: 7,
      contentKind: 'text',
      lineCount: 1,
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(slice).not.toHaveBeenCalled();
  });

  it('should classify a huge binary file from the sniff window without a full read', async () => {
    const head = new Uint8Array(headSniffByteLength);
    head[10] = 0x00;
    const { file, arrayBuffer, slice } = fakeFile({ size: 50_000_000, head, lastModified: 99 });

    await expect(fileStatFromFile(file)).resolves.toEqual({
      type: 'file',
      size: 50_000_000,
      mtimeMs: 99,
      contentKind: 'binary',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalledWith(0, headSniffByteLength);
  });

  it('should reuse the sniff window as the content for files that fit inside it', async () => {
    const head = encode('a\nb\n');
    const { file, arrayBuffer } = fakeFile({ size: head.byteLength, head, lastModified: 1 });

    await expect(fileStatFromFile(file)).resolves.toEqual({
      type: 'file',
      size: 4,
      mtimeMs: 1,
      contentKind: 'text',
      lineCount: 3,
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('should count lines exactly for text larger than the sniff window', async () => {
    const head = encode(`${'x'.repeat(headSniffByteLength)}\ntail`);
    const { file, arrayBuffer } = fakeFile({ size: head.byteLength, head, lastModified: 2 });

    await expect(fileStatFromFile(file)).resolves.toMatchObject({ contentKind: 'text', lineCount: 2 });
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
