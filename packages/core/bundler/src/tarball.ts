import { ArchiveError, gunzip as gunzipArchive, readTarEntries as readArchiveTarEntries } from '@taucad/archive-core';
import type { ArchiveContents, ArchiveEntry } from '@taucad/archive-core';

/** One regular file read from a package tarball, relative to the package root. @internal */
export type TarEntry = ArchiveEntry;

/** Regular files of a tarball plus the paths of entries that were not extracted. @internal */
export type TarContents = ArchiveContents;

/** Upper bound for one unpacked package; a larger tarball is refused rather than buffered. */
const maximumUnpackedBytes = 256 * 1024 * 1024;
const maximumEntries = 100_000;

/**
 * Decompress gzip bytes with the platform `DecompressionStream`, bounded to 256 MiB of output.
 * @param bytes - Gzip-compressed bytes, such as an npm registry tarball.
 * @returns The decompressed bytes.
 * @throws {Error} When the data is not gzip or decompresses beyond the budget.
 * @internal
 */
export const gunzip = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  gunzipArchive(bytes, { maximumUnpackedBytes });

/**
 * Read the regular files of an uncompressed npm package tarball the way npm does: the first folder is stripped
 * (`package/`, or a publisher's own folder name), and symlinks, hardlinks and devices are never extracted.
 * @param bytes - Uncompressed tar bytes, for example from {@link gunzip}.
 * @returns Package-relative regular files plus the skipped entry paths.
 * @throws {Error} When an entry path is empty, absolute, contains a backslash or `..`, or the archive is malformed or too large.
 * @internal
 */
export const readTarEntries = (bytes: Uint8Array<ArrayBuffer>): TarContents => {
  try {
    return readArchiveTarEntries(bytes, { maximumUnpackedBytes, maximumEntries, stripComponents: 1, links: 'skip' });
  } catch (error) {
    if (error instanceof ArchiveError && error.reason === 'unsafe-path') {
      throw new Error(`Tar entry path '${error.path}' escapes the package folder.`, { cause: error });
    }
    throw error;
  }
};
