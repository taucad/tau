/**
 * ZIP encoding, the one place it lives (charter D2, D15).
 *
 * @module
 */

import { joinRelativePath } from '@taucad/utils/path';
import type { ContentFileSystem } from '#content-ops/contents.js';
import { walk } from '#content-ops/walk.js';
import type { WalkOptions } from '#content-ops/walk.js';

/**
 * Bytes one archive may hold before it refuses.
 *
 * JSZip keeps every file it is handed until it generates, so this ceiling — not
 * the size of the tree — is what bounds an archive's resident bytes. A tree over
 * it answers {@link archiveTooLargeCode} instead of taking the tab down with it.
 *
 * @public
 */
export const archiveByteCeiling: number = 256 * 1024 * 1024;

/** The refusal an archive over its ceiling answers. @public */
export const archiveTooLargeCode = 'ARCHIVE_TOO_LARGE';

/** What an archive may hold, beyond the walk's own filter. @public */
export type ArchiveOptions = WalkOptions & {
  /** Byte ceiling for this archive; {@link archiveByteCeiling} when omitted. */
  readonly maxBytes?: number;
};

/**
 * Package a directory's subtree into a ZIP archive.
 *
 * Each file is read as the walk reaches it and handed straight to the ZIP
 * writer — there is no whole-tree map in front of it — and the running total is
 * checked as it goes, so the writer never receives more than the ceiling plus
 * the file that crossed it.
 *
 * @param filesystem - Provider, rooted filesystem or composed view to read through.
 * @param path       - Root-relative directory to archive; `''` is the surface's own root.
 * @param options    - Optional caller filter, abort signal and byte ceiling.
 * @returns ZIP archive as a `Blob`.
 * @throws An `Error` carrying `code: 'ARCHIVE_TOO_LARGE'` when the subtree exceeds the ceiling.
 * @public
 */
export async function archive(filesystem: ContentFileSystem, path: string, options?: ArchiveOptions): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- JSZip is the library's class name
  const { default: JSZip } = await import('jszip');
  const ceiling = options?.maxBytes ?? archiveByteCeiling;
  const zip = new JSZip();
  let archivedBytes = 0;
  for await (const { relativePath, kind } of walk(filesystem, path, options)) {
    if (kind !== 'file') {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- One file resident at a time is the point of the ceiling.
    const content = await filesystem.readFile(joinRelativePath(path, relativePath));
    archivedBytes += content.byteLength;
    if (archivedBytes > ceiling) {
      throw Object.assign(new Error(`Archive of '${path}' exceeds its ${String(ceiling)}-byte ceiling.`), {
        code: archiveTooLargeCode,
      });
    }
    zip.file(relativePath, content);
  }
  return zip.generateAsync({ type: 'blob' });
}
