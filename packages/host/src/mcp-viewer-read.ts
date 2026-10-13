/**
 * Byte ranges of a shown model for `app_read` (agent plugin UI blueprint W9, G9).
 *
 * A range reads only its own bytes, so a 50 MB model costs one reply-sized buffer per call rather than the whole file
 * and its digest. The file is pinned when it is shown by its size, modification time and inode; a range from a file
 * that no longer matches is refused, and the page shows the model again. A slice is gzipped when the page can undo it
 * and the result is at least a tenth smaller: mesh buffers of repeated or quantised values shrink, float noise does
 * not, and the page then pays nothing for trying.
 */

import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import type { TauViewerReadEncoding, TauViewerReadResult } from '@taucad/mcp/viewer-protocol';

const gzipped = promisify(gzip);

/** A gzipped slice is used only when it is at most this share of the raw one. */
const worthwhile = 0.9;

/** Which file a shown model is: what `stat` said when it was shown. */
export type ModelFileIdentity = Readonly<{ size: number; mtimeMs: number; ino: number }>;

/** The model's bytes and identity, read once from a single open of the file. */
export type ModelFileSnapshot = Readonly<{ bytes: Uint8Array<ArrayBuffer>; identity: ModelFileIdentity }>;

const identityOf = ({ size, mtimeMs, ino }: ModelFileIdentity): ModelFileIdentity => ({ size, mtimeMs, ino });

const sameFile = (left: ModelFileIdentity, right: ModelFileIdentity): boolean =>
  left.size === right.size && left.mtimeMs === right.mtimeMs && left.ino === right.ino;

/**
 * Read a model file once, with the identity later ranges are checked against.
 *
 * @param absolutePath - The file.
 * @returns Its bytes and identity, or `undefined` when it cannot be read.
 */
export const snapshotModelFile = async (absolutePath: string): Promise<ModelFileSnapshot | undefined> => {
  const handle = await open(absolutePath, 'r').catch(() => undefined);
  if (handle === undefined) {
    return undefined;
  }
  try {
    const identity = identityOf(await handle.stat());
    const bytes = new Uint8Array(identity.size);
    let filled = 0;
    while (filled < bytes.length) {
      // oxlint-disable-next-line no-await-in-loop -- one read may return fewer bytes than asked; the next continues it.
      const { bytesRead } = await handle.read(bytes, filled, bytes.length - filled, filled);
      if (bytesRead === 0) {
        return undefined;
      }
      filled += bytesRead;
    }
    return { bytes, identity };
  } finally {
    await handle.close();
  }
};

/** Why a range was refused. */
export type ModelRangeRefusal = Readonly<{ refused: 'missing' | 'changed' }>;

/**
 * Read one range of a shown model.
 *
 * @param input - The file, the identity it was shown with, the range, and the encodings the page can undo.
 * @returns The slice as `app_read` returns it, or why it was refused.
 */
export const readModelRange = async (
  input: Readonly<{
    absolutePath: string;
    identity: ModelFileIdentity;
    offset: number;
    length: number;
    encodings?: readonly TauViewerReadEncoding[] | undefined;
  }>,
): Promise<TauViewerReadResult | ModelRangeRefusal> => {
  const handle = await open(input.absolutePath, 'r').catch(() => undefined);
  if (handle === undefined) {
    return { refused: 'missing' };
  }
  let slice: Uint8Array<ArrayBuffer>;
  try {
    if (!sameFile(identityOf(await handle.stat()), input.identity)) {
      return { refused: 'changed' };
    }
    const offset = Math.min(input.offset, input.identity.size);
    const buffer = Buffer.alloc(Math.min(input.length, input.identity.size - offset));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    if (bytesRead !== buffer.length) {
      return { refused: 'changed' };
    }
    slice = buffer;
  } finally {
    await handle.close();
  }
  const offset = Math.min(input.offset, input.identity.size);
  const base = { offset, byteLength: slice.length, totalBytes: input.identity.size };
  if (input.encodings?.includes('gzip') === true && slice.length > 0) {
    const packed = await gzipped(slice);
    if (packed.length <= slice.length * worthwhile) {
      return { ...base, encoding: 'gzip', data: packed.toString('base64') };
    }
  }
  return { ...base, data: Buffer.from(slice.buffer, slice.byteOffset, slice.length).toString('base64') };
};
