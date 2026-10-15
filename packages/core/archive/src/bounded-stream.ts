import { ArchiveError } from '#archive-error.js';

/**
 * Caps every reader takes as input; nothing in this package assumes a default size.
 * @public
 */
export type ArchiveLimits = {
  /** Largest accepted total of decompressed or extracted bytes. */
  readonly maximumUnpackedBytes: number;
  /** Largest accepted number of archive entries, skipped ones included. */
  readonly maximumEntries: number;
};

/**
 * Read a byte stream into one buffer, cancelling it once it exceeds the budget.
 * @internal
 * @param stream - Source stream.
 * @param maximumBytes - Largest accepted total size.
 * @returns The concatenated bytes.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` (`limit`) when the stream is larger than `maximumBytes`.
 */
export const readBoundedStream = async (
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = stream.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- streaming enforces the byte budget before buffering more
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      length += chunk.value.byteLength;
      if (length > maximumBytes) {
        // oxlint-disable-next-line no-await-in-loop -- cancel an oversized stream immediately
        await reader.cancel();
        throw new ArchiveError('EXTRACTION_REFUSED', `Stream exceeds ${maximumBytes} bytes.`, { reason: 'limit' });
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

/**
 * Decompress bytes with the platform `DecompressionStream`, bounded by `maximumBytes`. The input is written
 * straight into the stream while the output is read, so one member costs one stream and no extra copies.
 * @internal
 * @param bytes - Compressed bytes.
 * @param format - `gzip` or `deflate-raw`.
 * @param maximumBytes - Largest accepted output.
 * @returns The decompressed bytes.
 * @throws {TypeError} When the bytes are not in that format.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` (`limit`) when the output exceeds `maximumBytes`.
 */
export const decompress = async (
  bytes: Uint8Array<ArrayBuffer>,
  format: 'gzip' | 'deflate-raw',
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  const writeAll = async (): Promise<void> => {
    await writer.write(bytes);
    await writer.close();
  };
  const written = writeAll();
  try {
    return await readBoundedStream(stream.readable, maximumBytes);
  } finally {
    // The read side owns the outcome; a failed or cancelled read also rejects the pending write.
    await written.catch(() => undefined);
  }
};

/**
 * Decompress gzip bytes with the platform `DecompressionStream`, bounded by the caller's cap.
 * @param bytes - Gzip-compressed bytes, such as an npm tarball or a python-build-standalone archive.
 * @param limits - `maximumUnpackedBytes` bounds the decompressed output.
 * @returns The decompressed bytes.
 * @throws {TypeError} When the bytes are not gzip.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` (`limit`) when the output exceeds the cap.
 * @public
 */
export const gunzip = async (
  bytes: Uint8Array<ArrayBuffer>,
  limits: Pick<ArchiveLimits, 'maximumUnpackedBytes'>,
): Promise<Uint8Array<ArrayBuffer>> => decompress(bytes, 'gzip', limits.maximumUnpackedBytes);

/**
 * Map items through an async function with at most `limit` calls in flight, keeping input order.
 * @internal
 * @param items - Inputs.
 * @param limit - Largest number of concurrent calls.
 * @param map - The async function.
 * @returns Results in input order.
 */
export const mapConcurrent = async <T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- each lane runs one call at a time
      results[index] = await map(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};
