/**
 * The viewer page's side of `app_read`: reading a file the server holds one reply-sized range at a time, and decoding
 * each slice. The page imports this module, so it holds no SDK, no zod and no Node built-ins.
 */

import { tauViewerReadLimit } from '#viewer-protocol.js';
import type { TauViewerReadEncoding, TauViewerReadResult } from '#viewer-protocol.js';

/**
 * Reads one range of the file: the page's call to `app_read` or `app_read_artifact` with the range's fields added to
 * the tool's own arguments. It resolves to the tool's structured result.
 *
 * @public
 */
export type TauViewerRangeRead = (
  range: Readonly<{
    offset: number;
    length: number;
    encodings?: readonly TauViewerReadEncoding[];
  }>,
) => Promise<unknown>;

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Each ASCII code's six-bit value, or -1 outside the alphabet. */
const base64Values = new Int8Array(128).fill(-1);
for (const [value, character] of [...base64Alphabet].entries()) {
  base64Values[character.codePointAt(0)!] = value;
}

/**
 * Decode base64 into a fresh buffer, for engines without `Uint8Array.fromBase64`.
 *
 * One pass over a lookup table: a 4 MiB slice is about 5.6 million characters, so the decoder allocates nothing per
 * character.
 *
 * @param data - Base64 text, padded or not.
 * @returns The bytes.
 * @throws Error on a character outside the base64 alphabet, or a dangling last character.
 */
const decodeBase64 = (data: string): Uint8Array<ArrayBuffer> => {
  let end = data.length;
  while (end > 0 && data[end - 1] === '=') {
    end -= 1;
  }
  if (end % 4 === 1) {
    throw new Error('The slice is not valid base64.');
  }
  const bytes = new Uint8Array(Math.floor((end * 3) / 4));
  const digit = (index: number): number => {
    const value = base64Values[data.codePointAt(index) ?? 128] ?? -1;
    if (value < 0) {
      throw new Error(`Invalid base64 character ${JSON.stringify(data[index])}.`);
    }
    return value;
  };
  let written = 0;
  let index = 0;
  /* Four characters carry 24 bits, three bytes; a typed array keeps the low eight bits of what it is given. */
  for (; index + 4 <= end; index += 4) {
    const value = digit(index) * 262_144 + digit(index + 1) * 4096 + digit(index + 2) * 64 + digit(index + 3);
    bytes[written] = value / 65_536;
    bytes[written + 1] = value / 256;
    bytes[written + 2] = value;
    written += 3;
  }
  /* A short last group of two or three characters carries one or two bytes. */
  if (index < end) {
    const third = index + 2 < end ? digit(index + 2) * 64 : 0;
    const value = digit(index) * 262_144 + digit(index + 1) * 4096 + third;
    bytes[written] = value / 65_536;
    if (index + 2 < end) {
      bytes[written + 1] = value / 256;
    }
  }
  return bytes;
};

/** `Uint8Array.fromBase64` where the engine has it (Chromium 140+, Safari 18.2+, Firefox 133+). */
type FromBase64 = (data: string) => Uint8Array<ArrayBuffer>;

/**
 * Decode one `app_read` slice: base64, then gzip when the server used it.
 *
 * @param result - The reply.
 * @returns The file's bytes for that range.
 * @public
 */
export const decodeTauViewerSlice = async (result: TauViewerReadResult): Promise<Uint8Array<ArrayBuffer>> => {
  const native = (Uint8Array as unknown as { fromBase64?: FromBase64 }).fromBase64;
  const bytes = native === undefined ? decodeBase64(result.data) : native(result.data);
  if (result.encoding !== 'gzip') {
    return bytes;
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const isReadResult = (value: unknown): value is TauViewerReadResult =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { data?: unknown }).data === 'string' &&
  typeof (value as { offset?: unknown }).offset === 'number' &&
  typeof (value as { byteLength?: unknown }).byteLength === 'number' &&
  typeof (value as { totalBytes?: unknown }).totalBytes === 'number';

/** What {@link readTauViewerBytes} reads. @public */
export type ReadTauViewerBytesInput = Readonly<{
  /** Reads one range. */
  read: TauViewerRangeRead;
  /** The file's size, as the server reported it. */
  byteLength: number;
  /** Hex SHA-256 the assembled bytes must have; checked where the page has Web Crypto. */
  sha256?: string | undefined;
  /** Names the file in errors. */
  label: string;
  /** Receives the bytes read so far after each range. */
  onProgress?: ((loaded: number, total: number) => void) | undefined;
  signal?: AbortSignal | undefined;
}>;

/** The encodings this engine can undo: gzip wherever it decompresses streams. */
const encodings: readonly TauViewerReadEncoding[] | undefined =
  typeof DecompressionStream === 'function' ? ['gzip'] : undefined;

/**
 * Hex SHA-256 of the assembled bytes, where the page runs in a secure context that has Web Crypto.
 *
 * @param bytes - The file.
 * @returns The digest, or `undefined` without `crypto.subtle`.
 */
const digestOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<string | undefined> => {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (subtle === undefined) {
    return undefined;
  }
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Read a file the server holds, one reply-sized range at a time, each range starting where the last one stopped. It
 * offers gzip wherever the page can undo it.
 *
 * @param input - How to read a range, the file's size, digest and label, and progress and cancellation.
 * @returns The file's bytes.
 * @throws Error "<label> changed while it was loading." when a reply does not continue where the last one stopped, the
 *   size changes, a slice is not the length it claims, or the bytes are not the digest: the server pins each range to
 *   the file's size, mtime and inode, which a same-size rewrite within a coarse mtime can keep. "<label> ended early
 *   while it was loading." when a reply carries nothing.
 * @public
 */
export const readTauViewerBytes = async (input: ReadTauViewerBytesInput): Promise<Uint8Array<ArrayBuffer>> => {
  const { byteLength, label } = input;
  const changed = (): Error => new Error(`${label} changed while it was loading.`);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    input.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- each range starts where the last one ended.
    const result = await input.read({
      offset,
      length: Math.min(tauViewerReadLimit, byteLength - offset),
      ...(encodings === undefined ? {} : { encodings }),
    });
    if (!isReadResult(result) || result.offset !== offset || result.totalBytes !== byteLength) {
      throw changed();
    }
    // oxlint-disable-next-line no-await-in-loop -- the slice is decoded before the next range is asked for, so one reply is held at a time.
    const chunk = await decodeTauViewerSlice(result);
    if (chunk.length === 0) {
      throw new Error(`${label} ended early while it was loading.`);
    }
    if (chunk.length !== result.byteLength || offset + chunk.length > byteLength) {
      throw changed();
    }
    bytes.set(chunk, offset);
    offset += chunk.length;
    input.onProgress?.(offset, byteLength);
  }
  if (input.sha256 !== undefined) {
    const digest = await digestOf(bytes);
    if (digest !== undefined && digest !== input.sha256) {
      throw changed();
    }
  }
  return bytes;
};
