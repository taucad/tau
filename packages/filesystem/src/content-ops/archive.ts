/**
 * ZIP encoding, the one place it lives (charter D2, D15).
 *
 * @module
 */

import { joinRelativePath } from '@taucad/utils/path';
import type { ContentFileSystem } from '#content-ops/contents.js';
import { walk } from '#content-ops/walk.js';
import type { WalkOptions } from '#content-ops/walk.js';
import type { FileSystemProvider } from '#types.js';
import { zipStream } from '#content-ops/zip-writer.js';
import type { ZipSource } from '#content-ops/zip-writer.js';

/** The refusal an archive over its caller's ceiling answers. @public */
export const archiveTooLargeCode = 'ARCHIVE_TOO_LARGE';

/** The slice of the port an archive reads through: a file streams where the surface can. @public */
export type ArchiveFileSystem = ContentFileSystem & Partial<Pick<FileSystemProvider, 'readFileStream'>>;

/** What an archive may hold, beyond the walk's own filter. @public */
export type ArchiveOptions = WalkOptions & {
  /**
   * Byte ceiling for this archive; unbounded when omitted. The archive streams
   * one entry at a time, so its size no longer bounds what is resident: a
   * ceiling is the caller's policy, not the writer's memory guard.
   */
  readonly maxBytes?: number;
};

/**
 * How many archive bytes {@link archive} gathers in script memory before they
 * join its blob: with the entry in flight, the most it holds at once.
 *
 * @public
 */
export const archiveBlobBatchBytes: number = 1024 * 1024;

/** A one-chunk stream over bytes already read, for a surface without `readFileStream`. */
const streamOf = (bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> =>
  new ReadableStream({
    start: (controller) => {
      controller.enqueue(bytes);
      controller.close();
    },
  });

/**
 * Stream a directory's subtree as a ZIP archive (S14).
 *
 * Each file is opened as the writer reaches it and deflated as it is read,
 * through `readFileStream` where the surface has one, so what is in memory is
 * one entry's chunks in flight, never the tree. With `maxBytes`, a file whose
 * declared size would pass the ceiling refuses before it is opened, and the
 * bytes actually read are counted as they pass, so a file that grew refuses too.
 *
 * @param filesystem - Provider, rooted filesystem or composed view to read through.
 * @param path       - Root-relative directory to archive; `''` is the surface's own root.
 * @param options    - Optional caller filter, abort signal and byte ceiling.
 * @returns The archive's bytes; the stream errors with the refusal or the failed read.
 * @public
 */
export function archiveStream(
  filesystem: ArchiveFileSystem,
  path: string,
  options?: ArchiveOptions,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const ceiling = options?.maxBytes ?? Number.POSITIVE_INFINITY;
  let archivedBytes = 0;
  const refusal = (): Error =>
    Object.assign(new Error(`Archive of '${path}' exceeds its ${String(ceiling)}-byte ceiling.`), {
      code: archiveTooLargeCode,
    });
  const signal = options?.signal;

  const open = async (filePath: string): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> => {
    const source =
      filesystem.readFileStream === undefined
        ? streamOf(await filesystem.readFile(filePath))
        : filesystem.readFileStream(filePath, signal === undefined ? undefined : { signal });
    if (ceiling === Number.POSITIVE_INFINITY) {
      return source;
    }
    return source.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        transform: (chunk, controller) => {
          archivedBytes += chunk.byteLength;
          if (archivedBytes > ceiling) {
            controller.error(refusal());
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );
  };

  async function* sources(): AsyncGenerator<ZipSource> {
    let declaredBytes = 0;
    for await (const { relativePath, kind } of walk(filesystem, path, options)) {
      if (kind !== 'file') {
        continue;
      }
      const filePath = joinRelativePath(path, relativePath);
      // oxlint-disable-next-line no-await-in-loop -- The writer pulls one entry at a time; its size is read as it is reached.
      const { size } = await filesystem.stat(filePath);
      declaredBytes += size;
      if (declaredBytes > ceiling) {
        throw refusal();
      }
      yield { name: relativePath, size, open: async () => open(filePath) };
    }
  }

  return zipStream(sources(), signal);
}

/**
 * Package a directory's subtree into a ZIP archive.
 *
 * The archive is {@link archiveStream}'s bytes gathered into a `Blob` a batch
 * at a time, so script memory holds at most one batch: the browser keeps the
 * blob's bytes, paging a large one to disk.
 *
 * @param filesystem - Provider, rooted filesystem or composed view to read through.
 * @param path       - Root-relative directory to archive; `''` is the surface's own root.
 * @param options    - Optional caller filter, abort signal and byte ceiling.
 * @returns ZIP archive as a `Blob`.
 * @throws An `Error` carrying `code: 'ARCHIVE_TOO_LARGE'` when the subtree exceeds `maxBytes`.
 * @public
 */
export async function archive(filesystem: ArchiveFileSystem, path: string, options?: ArchiveOptions): Promise<Blob> {
  const reader = archiveStream(filesystem, path, options).getReader();
  let blob = new Blob([], { type: 'application/zip' });
  let batch: Array<Uint8Array<ArrayBuffer>> = [];
  let batchBytes = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- The archive is read in order, one chunk at a time.
    const { done, value } = await reader.read();
    if (!done) {
      batch.push(value);
      batchBytes += value.byteLength;
    }
    if (done || batchBytes >= archiveBlobBatchBytes) {
      blob = new Blob([blob, ...batch], { type: 'application/zip' });
      batch = [];
      batchBytes = 0;
    }
    if (done) {
      return blob;
    }
  }
}
