import type { FileContentMetadata, FileStat, StatContentMetadata } from '@taucad/types';
import type { ContentFacts, FileReadStreamOptions } from '#types.js';

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
export const fileMetadataFields = (
  metadata: Readonly<{ contentKind?: 'text' | 'binary'; lineCount?: number }>,
): StatContentMetadata => {
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

/**
 * Largest file a listing reads in full to count its lines (charter D4, EQ15):
 * a bigger text file is listed with its kind and size only.
 *
 * @public
 */
export const lineCountByteCap = 1024 * 1024;

/** Files one listing measures at once. @public */
export const factsConcurrency = 8;

/** Where content facts are measured from: a provider, a rooted or composed view. @public */
export type ContentFactsSource = Readonly<{
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFileStream?(path: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>>;
}>;

/** One measurement: the facts, when the kind could be learned, and the bytes it read. @public */
export type MeasuredContentFacts = Readonly<{ facts: ContentFacts | undefined; bytesRead: number }>;

/** The first {@link headSniffByteLength} bytes of a file, through a ranged read. */
const readHead = async (source: ContentFactsSource, path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = source.readFileStream!(path, { length: headSniffByteLength }).getReader();
  const head = new Uint8Array(headSniffByteLength);
  let filled = 0;
  try {
    while (filled < headSniffByteLength) {
      // oxlint-disable-next-line no-await-in-loop -- a stream is read chunk by chunk.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const taken = value.subarray(0, headSniffByteLength - filled);
      head.set(taken, filled);
      filled += taken.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return head.slice(0, filled);
};

/**
 * Measure one file's content facts within a byte cap (charter D4).
 *
 * The kind comes from the first 512 bytes, so a binary is never read past
 * them; a text file is read in full only when `lineCount` is asked for and it
 * is no larger than `byteCap`, and is otherwise answered as text with no count.
 * A source with no ranged read pays a whole read for the kind, so it measures
 * only files within the cap and leaves the rest unknown.
 *
 * @param source - What to read from.
 * @param file - The file, in the source's own namespace, and its size from a stat taken before the read.
 * @param options - Whether to count lines, and the largest file read in full.
 * @returns The facts (`undefined` when the kind is unknown) and the bytes read.
 * @public
 */
export async function measureContentFacts(
  source: ContentFactsSource,
  file: Readonly<{ path: string; size: number }>,
  options: Readonly<{ lineCount?: boolean; byteCap?: number }> = {},
): Promise<MeasuredContentFacts> {
  const { path, size } = file;
  const byteCap = options.byteCap ?? Number.POSITIVE_INFINITY;
  const whole = async (): Promise<MeasuredContentFacts> => {
    const bytes = await source.readFile(path);
    return { facts: getFileContentMetadata(bytes), bytesRead: bytes.byteLength };
  };
  if (size <= headSniffByteLength) {
    return whole();
  }
  if (source.readFileStream === undefined) {
    return size <= byteCap ? whole() : { facts: undefined, bytesRead: 0 };
  }
  const head = await readHead(source, path);
  if (seemsBinary(head)) {
    return { facts: { contentKind: 'binary' }, bytesRead: head.byteLength };
  }
  if (options.lineCount !== true || size > byteCap) {
    return { facts: { contentKind: 'text' }, bytesRead: head.byteLength };
  }
  const counted = await whole();
  return { facts: counted.facts, bytesRead: head.byteLength + counted.bytesRead };
}
