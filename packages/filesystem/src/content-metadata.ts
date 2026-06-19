import type { FileContentMetadata, FileStat } from '@taucad/types';

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
 * Rebuild content metadata as an exact discriminated shape.
 *
 * @param metadata - Existing file content metadata.
 * @returns A normalized text or binary metadata object.
 * @public
 */
export const fileMetadataFields = (metadata: FileContentMetadata): FileContentMetadata =>
  metadata.contentKind === 'text' ? { contentKind: 'text', lineCount: metadata.lineCount } : { contentKind: 'binary' };

/**
 * Classify raw file bytes and compute exact text line count when applicable.
 *
 * @param bytes - Raw file bytes.
 * @returns Binary metadata, or text metadata with exact line count.
 * @public
 */
export function getFileContentMetadata(bytes: Uint8Array<ArrayBuffer>): FileContentMetadata {
  if (seemsBinary(bytes.slice(0, headSniffByteLength))) {
    return { contentKind: 'binary' };
  }

  return {
    contentKind: 'text',
    lineCount: countTextLines(new TextDecoder().decode(bytes)),
  };
}

/**
 * Build a file stat from known bytes and modification time.
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
    ...fileMetadataFields(getFileContentMetadata(bytes)),
  };
}
