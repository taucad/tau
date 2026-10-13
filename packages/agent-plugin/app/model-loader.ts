import { tauViewerReadLimit, tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerModel, TauViewerReadResult } from '@taucad/mcp/viewer-protocol';
import type { Artifact } from '@taucad/runtime';

/** Calls one Tau tool and returns its structured result. */
export type CallTool = (name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;

const isReadResult = (value: unknown): value is TauViewerReadResult =>
  typeof value === 'object' && value !== null && 'data' in value && 'totalBytes' in value && 'offset' in value;

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
export const decodeBase64 = (data: string): Uint8Array<ArrayBuffer> => {
  let end = data.length;
  while (end > 0 && data[end - 1] === '=') {
    end -= 1;
  }
  if (end % 4 === 1) {
    throw new Error('The model slice is not valid base64.');
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
 * Decode an `app_read` slice: base64, then gzip when the server used it.
 *
 * @param result - The reply.
 * @returns The model's bytes for that range.
 */
const sliceOf = async (result: TauViewerReadResult): Promise<Uint8Array<ArrayBuffer>> => {
  const native = (Uint8Array as unknown as { fromBase64?: FromBase64 }).fromBase64;
  const bytes = native === undefined ? decodeBase64(result.data) : native(result.data);
  if (result.encoding !== 'gzip') {
    return bytes;
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * Hex SHA-256 of the assembled model, where the page runs in a secure context that has Web Crypto.
 *
 * @param bytes - The model.
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

/** The encodings this page can undo: gzip wherever the browser decompresses streams. */
const encodings = typeof DecompressionStream === 'function' ? (['gzip'] as const) : undefined;

/**
 * Read a shown model through `app_read`, one reply-sized range at a time (blueprint D4, W9).
 *
 * @param callTool - The bridge's tool call.
 * @param model - The model `show_model` returned.
 * @param onProgress - Receives the bytes read so far.
 * @returns The model as the artifact the viewer draws.
 * @throws Error when a reply does not continue where the last one stopped, the size changes, or the assembled bytes
 *   are not the digest `show_model` gave: the server pins a range to the file's size, mtime and inode, which a
 *   same-size rewrite within a coarse mtime can keep.
 */
export const loadModel = async (
  callTool: CallTool,
  model: TauViewerModel,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Artifact> => {
  const bytes = new Uint8Array(model.byteLength);
  let offset = 0;
  while (offset < model.byteLength) {
    // oxlint-disable-next-line no-await-in-loop -- each range starts where the last one ended.
    const result = await callTool(tauViewerToolName.appRead, {
      modelId: model.id,
      offset,
      length: Math.min(tauViewerReadLimit, model.byteLength - offset),
      ...(encodings === undefined ? {} : { encodings }),
    });
    if (!isReadResult(result) || result.offset !== offset || result.totalBytes !== model.byteLength) {
      throw new Error(`${model.path} changed while it was loading.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- the slice is decoded before the next range is asked for, so one reply is held at a time.
    const chunk = await sliceOf(result);
    if (chunk.length === 0) {
      throw new Error(`${model.path} ended early while it was loading.`);
    }
    if (chunk.length !== result.byteLength) {
      throw new Error(`${model.path} changed while it was loading.`);
    }
    bytes.set(chunk, offset);
    offset += chunk.length;
    onProgress?.(offset, model.byteLength);
  }
  const digest = await digestOf(bytes);
  if (digest !== undefined && digest !== model.sha256) {
    throw new Error(`${model.path} changed while it was loading.`);
  }
  return model.mimeType === 'image/svg+xml'
    ? { mimeType: model.mimeType, content: new TextDecoder().decode(bytes) }
    : { mimeType: model.mimeType, content: bytes };
};
