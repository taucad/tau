/* oxlint-disable no-bitwise -- the zip CRC is bit arithmetic. */
/**
 * One import entry decoded and digested in a single pass (charter D12, I2).
 *
 * The compute worker runs this over the `Blob` it was handed: it reads the one
 * range the entry occupies, inflates it into a buffer sized by the declared
 * size (a stream that runs past it, or ends short, is refused as damaged: the
 * bytes, not the header, decide), checks the zip CRC, and computes the git
 * blob id and SHA-256 of exactly those bytes. The bytes go back once, with
 * their digests and content kind, for the authority to write; nothing is
 * hashed again.
 *
 * @module
 */

import { getFileContentMetadata } from '#content-metadata.js';
import { ImportRefusedError } from '#importer/limits.js';
import { zipEntryDataOffset, zipLocalHeaderBytes } from '#importer/zip.js';
import type { ZipEntry } from '#importer/zip.js';
import type { ContentFacts } from '#types.js';

/**
 * What to decode: a range of a `Blob`, stored or deflated inside a zip, or a
 * whole file.
 *
 * @public
 */
export type ImportDecodeRequest = Readonly<{
  blob: Blob;
  /** The entry's path, for a refusal's message. */
  path: string;
  /** The size the source declares; the decoded bytes must match it exactly. */
  size: number;
  /** Present for a zip entry: where its local header is and how it is stored. */
  zip?: Readonly<Pick<ZipEntry, 'localHeaderOffset' | 'compressedSize' | 'method' | 'crc32'>>;
}>;

/**
 * One decoded entry: its bytes and the facts measured from them.
 *
 * @public
 */
export type ImportDecodedEntry = Readonly<{
  data: Uint8Array<ArrayBuffer>;
  facts: ContentFacts & Readonly<{ blobOid: string; sha256: string }>;
}>;

/**
 * The decode an import runs per entry: the compute worker's, or
 * {@link createInlineImportDecoder} where there is none.
 *
 * @public
 */
export type ImportDecoder = (request: ImportDecodeRequest) => Promise<ImportDecodedEntry>;

/**
 * A one-shot digest, lowercase hex.
 *
 * @public
 */
export type ImportHash = (algorithm: 'sha1' | 'sha256', bytes: Uint8Array<ArrayBuffer>) => Promise<string>;

const hex = (digest: ArrayBuffer): string =>
  [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * WebCrypto's digest: the hash wherever `crypto.subtle` exists.
 *
 * @param algorithm - SHA-1 or SHA-256.
 * @param bytes - The bytes.
 * @returns The digest, lowercase hex.
 * @public
 */
export const subtleImportHash: ImportHash = async (algorithm, bytes) => {
  const { subtle } = globalThis.crypto;
  return hex(await subtle.digest(algorithm === 'sha1' ? 'SHA-1' : 'SHA-256', bytes));
};

let crcTable: Uint32Array | undefined;
const table = (): Uint32Array => {
  if (crcTable === undefined) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) === 0 ? value >>> 1 : 0xed_b8_83_20 ^ (value >>> 1);
      }
      crcTable[index] = value >>> 0;
    }
  }
  return crcTable;
};

/**
 * The zip CRC-32 of some bytes.
 *
 * @param bytes - The bytes.
 * @returns The unsigned CRC.
 * @public
 */
export const crc32 = (bytes: Uint8Array<ArrayBuffer>): number => {
  const lookup = table();
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = lookup[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

const damaged = (path: string, cause?: unknown): ImportRefusedError =>
  new ImportRefusedError('corrupt', { path, ...(cause === undefined ? {} : { cause }) });

/* A stream of the range where the host can stream a `Blob`, else its bytes whole (jsdom has no `Blob.stream`). */
const rangeStream = (blob: Blob): ReadableStream<Uint8Array<ArrayBuffer>> => {
  if (typeof blob.stream === 'function') {
    return blob.stream();
  }
  return new ReadableStream({
    pull: async (controller) => {
      controller.enqueue(new Uint8Array(await blob.arrayBuffer()));
      controller.close();
    },
  });
};

/**
 * Decode one entry and digest it in the same pass.
 *
 * @param request - The entry.
 * @param hash - The digest to use; WebCrypto's by default.
 * @returns The bytes and their facts.
 * @throws ImportRefusedError `corrupt` when the bytes do not decode to exactly the declared size and CRC.
 * @public
 */
export const decodeImportEntry = async (
  request: ImportDecodeRequest,
  hash: ImportHash = subtleImportHash,
): Promise<ImportDecodedEntry> => {
  const { blob, path, size, zip } = request;
  let range = blob;
  if (zip === undefined) {
    if (blob.size !== size) {
      throw new ImportRefusedError('corrupt', { path, message: 'A file changed while it was being imported.' });
    }
  } else {
    const header = new Uint8Array(
      await blob.slice(zip.localHeaderOffset, zip.localHeaderOffset + zipLocalHeaderBytes).arrayBuffer(),
    );
    const start = zipEntryDataOffset(header, { ...zip, name: path, size, directory: false, symlink: false });
    if (start + zip.compressedSize > blob.size) {
      throw damaged(path);
    }
    range = blob.slice(start, start + zip.compressedSize);
  }
  /* The git object header goes first in the same buffer, so the blob id is one digest over one allocation. */
  const prefix = new TextEncoder().encode(`blob ${String(size)}\0`);
  const framed = new Uint8Array(prefix.byteLength + size);
  framed.set(prefix);
  let written = prefix.byteLength;
  let stream = rangeStream(range);
  if (zip?.method === 'deflate') {
    stream = stream.pipeThrough(
      new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >,
    );
  }
  const reader = stream.getReader();
  try {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      if (written + read.value.byteLength > framed.byteLength) {
        throw damaged(path);
      }
      framed.set(read.value, written);
      written += read.value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof ImportRefusedError ? error : damaged(path, error);
  }
  if (written !== framed.byteLength) {
    throw damaged(path);
  }
  const data = framed.subarray(prefix.byteLength);
  if (zip !== undefined && crc32(data) !== zip.crc32) {
    throw damaged(path);
  }
  const [blobOid, sha256] = await Promise.all([hash('sha1', framed), hash('sha256', data)]);
  return { data, facts: { ...getFileContentMetadata(data), blobOid, sha256 } };
};

/**
 * The decode run in the caller's own realm, for a host with no compute worker
 * and for tests.
 *
 * @param hash - The digest to use; WebCrypto's by default.
 * @returns A decoder.
 * @public
 */
export const createInlineImportDecoder =
  (hash: ImportHash = subtleImportHash): ImportDecoder =>
  async (request) =>
    decodeImportEntry(request, hash);
