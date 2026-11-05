import type { FileContentMetadata, FileStat, StatContentMetadata } from '@taucad/types';

/**
 * Number of leading bytes inspected by `seemsBinary`. Mirrors VS Code's
 * `ZERO_BYTE_DETECTION_BUFFER_MAX_LEN` (512).
 *
 * @public
 */
export const headSniffByteLength = 512;

const utf8Bom = [0xef, 0xbb, 0xbf];
const utf16BeBom = [0xfe, 0xff];
const utf16LeBom = [0xff, 0xfe];
const utf32BeBom = [0x00, 0x00, 0xfe, 0xff];
const utf32LeBom = [0xff, 0xfe, 0x00, 0x00];

const startsWith = (buffer: Uint8Array<ArrayBuffer>, prefix: readonly number[]): boolean => {
  if (buffer.length < prefix.length) {
    return false;
  }
  for (const [index, byte] of prefix.entries()) {
    if (buffer[index] !== byte) {
      return false;
    }
  }
  return true;
};

/**
 * Content-driven binary heuristic mirroring VS Code's
 * `detectEncodingFromBuffer`. No filename or extension is consulted.
 *
 * @param head - Leading bytes from the file content.
 * @returns `true` when the byte prefix indicates binary content.
 * @public
 */
export function seemsBinary(head: Uint8Array<ArrayBuffer>): boolean {
  if (head.length === 0) {
    return false;
  }

  if (
    startsWith(head, utf32LeBom) ||
    startsWith(head, utf32BeBom) ||
    startsWith(head, utf8Bom) ||
    startsWith(head, utf16LeBom) ||
    startsWith(head, utf16BeBom)
  ) {
    return false;
  }

  const limit = Math.min(head.length, headSniffByteLength);
  for (let i = 0; i < limit; i++) {
    if (head[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Count text lines using the same observable semantics as `read_file`.
 *
 * @param text - Decoded text content.
 * @returns Number of logical lines using `split('\n')` semantics.
 * @public
 */
export const countTextLines = (text: string): number => text.split('\n').length;

/**
 * Count text lines straight from bytes — same semantics as {@link countTextLines}
 * without decoding the buffer into a string first.
 *
 * @param bytes - Raw file bytes.
 * @returns Number of logical lines.
 * @public
 */
export function countLineBytes(bytes: Uint8Array<ArrayBuffer>): number {
  let lines = 1;
  let index = bytes.indexOf(0x0a);
  while (index !== -1) {
    lines++;
    index = bytes.indexOf(0x0a, index + 1);
  }
  return lines;
}

/**
 * The content facts a stat may carry, keeping only what is known (I3).
 *
 * @param metadata - Facts as a stat, listing row or index entry holds them.
 * @returns Text with its count when measured, binary, or nothing when unmeasured.
 * @public
 */
export const fileMetadataFields = (metadata: StatContentMetadata): StatContentMetadata => {
  if (metadata.contentKind === 'binary') {
    return { contentKind: 'binary' };
  }
  if (metadata.contentKind === 'text') {
    return metadata.lineCount === undefined
      ? { contentKind: 'text' }
      : { contentKind: 'text', lineCount: metadata.lineCount };
  }
  return {};
};

/**
 * Classify raw file bytes and compute exact text line count when applicable.
 *
 * For bytes already in hand: the write path, a lazy `facts` request, a
 * read-back. Never called to answer a metadata request (I3).
 *
 * @param bytes - Raw file bytes.
 * @returns Binary metadata, or text metadata with exact line count.
 * @public
 */
export function getFileContentMetadata(bytes: Uint8Array<ArrayBuffer>): FileContentMetadata {
  if (seemsBinary(bytes.subarray(0, headSniffByteLength))) {
    return { contentKind: 'binary' };
  }

  return {
    contentKind: 'text',
    lineCount: countLineBytes(bytes),
  };
}

/**
 * Build a file stat from bytes already in hand (an in-memory filesystem's own
 * store), so the facts are known without a read.
 *
 * @param bytes - Raw file bytes.
 * @param mtimeMs - Modification timestamp in milliseconds.
 * @returns File stat with byte size and content metadata.
 * @public
 */
export function fileStatFromBytes(bytes: Uint8Array<ArrayBuffer>, mtimeMs: number): FileStat {
  return {
    type: 'file',
    size: bytes.byteLength,
    mtimeMs,
    ...getFileContentMetadata(bytes),
  };
}
