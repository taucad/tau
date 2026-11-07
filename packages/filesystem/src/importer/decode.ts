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
import { crc32 } from '#importer/crc32.js';
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
  zip?: Readonly<Pick<ZipEntry, 'localHeaderOffset' | 'extentEnd' | 'compressedSize' | 'method' | 'crc32'>>;
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
export type ImportDecoder = (
  request: ImportDecodeRequest,
  options?: ImportDecodeOptions,
) => Promise<ImportDecodedEntry>;

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

/* The entry's bytes, inflated into one buffer after `prefix` bytes, checked against the declared size and CRC. */
const inflate = async (
  request: ImportDecodeRequest,
  prefix: Uint8Array<ArrayBuffer>,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { blob, path, size, zip } = request;
  signal?.throwIfAborted();
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
    /* The local header's own name and extra field count too: its data may not reach the next entry. */
    if (start + zip.compressedSize > zip.extentEnd) {
      throw new ImportRefusedError('corrupt', { path, message: 'An archive entry overlaps the next one.' });
    }
    range = blob.slice(start, start + zip.compressedSize);
  }
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
      signal?.throwIfAborted();
      if (written + read.value.byteLength > framed.byteLength) {
        throw damaged(path);
      }
      framed.set(read.value, written);
      written += read.value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof ImportRefusedError || signal?.aborted === true ? error : damaged(path, error);
  }
  if (written !== framed.byteLength) {
    throw damaged(path);
  }
  if (zip !== undefined && crc32(framed.subarray(prefix.byteLength)) !== zip.crc32) {
    throw damaged(path);
  }
  return framed;
};

/**
 * Options of one decode.
 *
 * @public
 */
export type ImportDecodeOptions = Readonly<{
  /** Stops the decode between chunks; a decode in another realm may ignore it and finish. */
  signal?: AbortSignal;
}>;

/**
 * Decode one entry and digest it in the same pass.
 *
 * @param request - The entry.
 * @param hash - The digest to use; WebCrypto's by default.
 * @param options - A signal that stops the decode between chunks.
 * @returns The bytes and their facts.
 * @throws ImportRefusedError `corrupt` when the bytes do not decode to exactly the declared size and CRC.
 * @public
 */
export const decodeImportEntry = async (
  request: ImportDecodeRequest,
  hash: ImportHash = subtleImportHash,
  options: ImportDecodeOptions = {},
): Promise<ImportDecodedEntry> => {
  /* The git object header goes first in the same buffer, so the blob id is one digest over one allocation. */
  const prefix = new TextEncoder().encode(`blob ${String(request.size)}\0`);
  const framed = await inflate(request, prefix, options.signal);
  const data = framed.subarray(prefix.byteLength);
  const [blobOid, sha256] = await Promise.all([hash('sha1', framed), hash('sha256', data)]);
  return { data, facts: { ...getFileContentMetadata(data), blobOid, sha256 } };
};

/**
 * Read one entry's bytes without digesting them: what a review's preview
 * shows, checked against the declared size and CRC like any decode, and
 * hashed by nothing.
 *
 * @param request - The entry.
 * @param options - A signal that stops the read between chunks.
 * @returns The bytes.
 * @throws ImportRefusedError `corrupt` when the bytes do not decode to exactly the declared size and CRC.
 * @public
 */
export const readImportEntry = async (
  request: ImportDecodeRequest,
  options: ImportDecodeOptions = {},
): Promise<Uint8Array<ArrayBuffer>> => inflate(request, new Uint8Array(0), options.signal);

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
  async (request, options) =>
    decodeImportEntry(request, hash, options);
