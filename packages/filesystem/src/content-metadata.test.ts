import { describe, expect, it } from 'vitest';
import {
  countTextLines,
  fileStatFromBytes,
  getFileContentMetadata,
  headSniffByteLength,
  seemsBinary,
} from '#content-metadata.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

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
});
