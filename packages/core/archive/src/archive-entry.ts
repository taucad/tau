import { ArchiveError } from '#archive-error.js';
import type { ArchiveLimits } from '#bounded-stream.js';

/**
 * One extracted entry, relative to the extraction root, with POSIX separators.
 * @public
 */
export type ArchiveEntry = {
  readonly path: string;
  /** File contents; empty for a symlink. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** POSIX permission bits as recorded by the archive; absent when the archive records none. */
  readonly mode?: number;
  /** Set for a symlink whose target resolves inside the extraction root; relative, as the archive spells it. */
  readonly symlinkTarget?: string;
};

/**
 * The entries of an archive plus the names it did not extract.
 * @public
 */
export type ArchiveContents = {
  readonly entries: readonly ArchiveEntry[];
  /** Entries above the stripped prefix, and every link or special file when `links` is `'skip'`. */
  readonly skipped: readonly string[];
};

/**
 * How a reader treats links and special files.
 *
 * - `'contained'`: keep symlinks whose target stays inside the extraction root; refuse escaping links, hardlinks,
 *   devices and FIFOs.
 * - `'skip'`: extract regular files only and list every other entry in `skipped` (what npm does).
 * @public
 */
export type ArchiveLinkPolicy = 'contained' | 'skip';

/**
 * Options of the tar and zip readers.
 * @public
 */
export type ReadArchiveOptions = ArchiveLimits & {
  /** Leading path segments dropped from every entry name; entries with no segment left are skipped. Default 0. */
  readonly stripComponents?: number;
  /** Default `'contained'`. */
  readonly links?: ArchiveLinkPolicy;
};

/**
 * Split an entry name into its relative segments, dropping empty and `.` segments.
 * @internal
 * @param name - Entry name as the archive spells it.
 * @returns The segments.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` (`unsafe-path`) for an empty, absolute, backslashed or `..` name.
 */
export const entrySegments = (name: string): string[] => {
  const segments = name.split('/');
  if (name.length === 0 || name.startsWith('/') || name.includes('\\') || segments.includes('..')) {
    throw new ArchiveError('EXTRACTION_REFUSED', `Archive entry path '${name}' escapes the extraction root.`, {
      reason: 'unsafe-path',
      path: name,
    });
  }
  return segments.filter((segment) => segment.length > 0 && segment !== '.');
};

/**
 * Resolve a symlink target against the link's own directory, inside the extraction root.
 * @internal
 * @param path - The link's root-relative path.
 * @param target - The link target as recorded.
 * @returns The root-relative path the link points at, or `undefined` when it leaves the root or is absolute.
 */
export const resolveLinkTarget = (path: string, target: string): string | undefined => {
  if (target.length === 0 || target.startsWith('/') || target.includes('\\') || target.includes('\0')) {
    return undefined;
  }
  const resolved = path.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') {
      if (resolved.length === 0) {
        return undefined;
      }
      resolved.pop();
    } else if (segment.length > 0 && segment !== '.') {
      resolved.push(segment);
    }
  }
  return resolved.length === 0 ? undefined : resolved.join('/');
};

/**
 * Pairs of paths that differ only by case. A case-insensitive volume (the macOS and Windows defaults) would
 * merge each pair into one file, so a manifest generator rejects a closure that has any.
 * @param paths - Root-relative POSIX paths.
 * @returns Each colliding pair, the earlier path first, in input order.
 * @public
 */
export const findCaseCollisions = (paths: Iterable<string>): Array<readonly [string, string]> => {
  const seen = new Map<string, string>();
  const collisions: Array<readonly [string, string]> = [];
  for (const path of paths) {
    const folded = path.toLowerCase();
    const earlier = seen.get(folded);
    if (earlier === undefined) {
      seen.set(folded, path);
    } else if (earlier !== path) {
      collisions.push([earlier, path]);
    }
  }
  return collisions;
};

/**
 * Throw the cap error when an archive declares more entries than the caller admits.
 * @internal
 * @param count - Entries seen so far, including the next one.
 * @param maximumEntries - Caller's cap.
 * @param label - Archive kind for the message.
 */
export const assertEntryCount = (count: number, maximumEntries: number, label: string): void => {
  if (count > maximumEntries) {
    throw new ArchiveError('EXTRACTION_REFUSED', `${label} has more than ${maximumEntries} entries.`, {
      reason: 'limit',
    });
  }
};
