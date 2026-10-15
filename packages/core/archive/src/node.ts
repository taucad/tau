/* oxlint-disable no-bitwise -- permission bits are a bit field. */
import { createHash } from 'node:crypto';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, toNamespacedPath } from 'node:path';

import { resolveLinkTarget } from '#archive-entry.js';
import type { ArchiveEntry } from '#archive-entry.js';
import { ArchiveError } from '#archive-error.js';
import { mapConcurrent } from '#bounded-stream.js';

/**
 * One written file as a receipt records it.
 * @public
 */
export type WrittenFile = {
  /** POSIX path relative to `root`, whatever the host's separator. */
  readonly path: string;
  readonly byteLength: number;
  /** Lowercase hex sha256 of the bytes written; for a symlink, of the file it resolves to. */
  readonly sha256: string;
  /** Permission bits applied (POSIX) or recorded (Windows); for a symlink, its target's. */
  readonly mode: number;
  readonly symlinkTarget?: string;
};

/**
 * Input of {@link writeArchiveEntries}.
 * @public
 */
export type WriteArchiveEntriesInput = {
  /** Absolute directory everything is written under; created when missing. */
  readonly root: string;
  /** POSIX directory under `root` the entries are relative to; default the root itself. */
  readonly destination?: string;
  readonly entries: readonly ArchiveEntry[];
  /** `'symlink'` creates links (the POSIX default); `'copy'` writes each link's resolved file instead (the Windows default). */
  readonly links?: 'symlink' | 'copy';
  readonly signal?: AbortSignal;
};

const defaultFileMode = 0o644;
const permissionBits = 0o777;
const maximumLinkHops = 40;
const writeConcurrency = 32;
const isWindows = process.platform === 'win32';

const unsafe = (path: string): ArchiveError =>
  new ArchiveError('EXTRACTION_REFUSED', `Path '${path}' escapes the extraction root.`, {
    reason: 'unsafe-path',
    path,
  });

// Root-relative POSIX segments; refuses anything a Windows or POSIX volume would resolve outside the root.
const safeSegments = (path: string): string[] => {
  const segments = path.split('/');
  const invalid = (segment: string): boolean =>
    segment.length === 0 ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('\\') ||
    segment.includes('\0') ||
    (isWindows && segment.includes(':'));
  if (path.length === 0 || segments.some((segment) => invalid(segment))) {
    throw unsafe(path);
  }
  return segments;
};

// Follow a link chain inside the entry set to the regular file it names.
const resolveFile = (entry: ArchiveEntry, byPath: ReadonlyMap<string, ArchiveEntry>): ArchiveEntry => {
  let current = entry;
  for (let hop = 0; hop < maximumLinkHops && current.symlinkTarget !== undefined; hop += 1) {
    const target = resolveLinkTarget(current.path, current.symlinkTarget);
    const next = target === undefined ? undefined : byPath.get(target);
    if (next === undefined) {
      throw new ArchiveError(
        'EXTRACTION_REFUSED',
        `Symlink '${entry.path}' -> '${entry.symlinkTarget}' does not resolve to a file inside the extraction root.`,
        { reason: 'escaping-link', path: entry.path },
      );
    }
    current = next;
  }
  if (current.symlinkTarget !== undefined) {
    throw new ArchiveError('EXTRACTION_REFUSED', `Symlink '${entry.path}' forms a loop.`, {
      reason: 'escaping-link',
      path: entry.path,
    });
  }
  return current;
};

/**
 * Write extracted entries below `root`, hashing each file's bytes as they are written, so the returned rows are
 * the receipt of exactly what reached the disk. Every path must stay inside the root; files are created
 * exclusively, so a path written twice (by two payloads, or merged by a case-insensitive volume) is refused.
 * Modes are applied on POSIX and recorded on Windows; Windows paths use the `\\?\` namespace; a symlink must
 * resolve inside the entry set to a regular file and is copied as that file when `links` is `'copy'`.
 * @param input - Root, destination, entries, link handling and signal.
 * @returns One row per entry, in input order, with POSIX root-relative paths and lowercase hex sha256.
 * @throws {ArchiveError} `EXTRACTION_REFUSED` for an unsafe path (`unsafe-path`), a dangling, escaping or looping
 * link (`escaping-link`) or a path that already exists (`duplicate-path`).
 * @public
 */
export const writeArchiveEntries = async (input: WriteArchiveEntriesInput): Promise<WrittenFile[]> => {
  const { root, entries, signal, links = isWindows ? 'copy' : 'symlink' } = input;
  const prefix = input.destination === undefined || input.destination === '.' ? [] : safeSegments(input.destination);
  const byPath = new Map<string, ArchiveEntry>();
  for (const entry of entries) {
    safeSegments(entry.path);
    byPath.set(entry.path, entry);
  }
  const rows = entries.map((entry): { entry: ArchiveEntry; row: WrittenFile } => {
    const file = resolveFile(entry, byPath);
    const row: WrittenFile = {
      path: [...prefix, entry.path].join('/'),
      byteLength: file.bytes.byteLength,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      mode: (file.mode ?? defaultFileMode) & permissionBits,
      ...(entry.symlinkTarget === undefined ? {} : { symlinkTarget: entry.symlinkTarget }),
    };
    return { entry, row };
  });
  const absolute = (path: string): string => toNamespacedPath(join(root, ...path.split('/')));
  const directories = new Set([prefix.join('/'), ...rows.map(({ row }) => row.path.split('/').slice(0, -1).join('/'))]);
  for (const directory of [...directories].toSorted()) {
    signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- parents before children
    await mkdir(absolute(directory), { recursive: true });
  }
  await mapConcurrent(rows, writeConcurrency, async ({ entry, row }) => {
    signal?.throwIfAborted();
    const target = absolute(row.path);
    try {
      if (entry.symlinkTarget !== undefined && links === 'symlink') {
        await symlink(entry.symlinkTarget, target);
        return;
      }
      await writeFile(target, resolveFile(entry, byPath).bytes, { flag: 'wx', mode: row.mode });
      if (!isWindows) {
        await chmod(target, row.mode);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ArchiveError(
          'EXTRACTION_REFUSED',
          `'${row.path}' was already written; two entries name it or the volume merges their case.`,
          { reason: 'duplicate-path', path: row.path, cause: error },
        );
      }
      throw error;
    }
  });
  return rows.map(({ row }) => row);
};
