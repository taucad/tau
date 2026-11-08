/**
 * A source a person chose on this host for an import (W7.4, charter D12).
 *
 * A person who picks a folder or opens a file with Tau is the admission
 * event: the host process that showed the picker (or received the file from
 * the operating system) mints an opaque grant for it, and only the grant
 * crosses to the importer. Everything the importer asks of the source — a
 * directory's rows, a preview, the copy itself — names the grant and a plain
 * relative path inside it, and is resolved here, by the authority, so no host
 * path ever enters the mutation vocabulary (I6). A path that leaves the
 * source, by `..` or by a link anywhere along it, is refused, and a link is
 * listed as one so the importer counts it as skipped, never followed.
 *
 * @module
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { NodeFsImportSourceRow } from '#backend/node/protocol.js';
import type { ImportCopyReceipt, ImportFileCopy, NodeFsProvider } from '#backend/node/provider.js';

/**
 * A source a person chose: a folder, or one file.
 *
 * @public
 */
export type ImportSourceGrant = Readonly<{
  /** The absolute host path the person chose. */
  path: string;
  kind: 'directory' | 'file';
}>;

const refuse = (code: string, reason: string, relative: string): never => {
  throw Object.assign(new Error(`${code}: ${reason}: ${relative === '' ? '.' : relative}`), { code });
};

const segmentsOf = (relative: string): string[] => {
  if (relative === '') {
    return [];
  }
  const segments = relative.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('\\'))) {
    return refuse('EACCES', 'not a path inside the chosen source', relative);
  }
  return segments;
};

const isContained = (base: string, target: string): boolean => {
  const relative = path.relative(base, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

/**
 * Resolve a relative path inside a grant to the host entry it names, walking
 * each segment without following a link.
 *
 * @param grant - The chosen source.
 * @param relative - A `/`-separated path inside it; `''` is the source itself. A file grant names its file by its own name.
 * @returns The absolute entry, inside the source's real location.
 * @throws An `EACCES` error for a path outside the source, `ELOOP` for one through a link, `ENOENT` when it is gone.
 * @public
 */
export const resolveImportSourcePath = async (grant: ImportSourceGrant, relative: string): Promise<string> => {
  const segments = segmentsOf(relative);
  if (grant.kind === 'file') {
    /* A file grant holds one entry: the file, by its own name. */
    if (segments.length > 1 || (segments.length === 1 && segments[0] !== path.basename(grant.path))) {
      return refuse('EACCES', 'not a path inside the chosen source', relative);
    }
    const real = await fs.realpath(grant.path);
    const stats = await fs.lstat(real);
    return stats.isFile() ? real : refuse('EACCES', 'the chosen file is no longer a regular file', relative);
  }
  const base = await fs.realpath(grant.path);
  let current = base;
  for (const segment of segments) {
    current = path.join(current, segment);
    // oxlint-disable-next-line no-await-in-loop -- each segment is checked before the next is entered.
    const stats = await fs.lstat(current);
    if (stats.isSymbolicLink()) {
      return refuse('ELOOP', 'refusing to follow a symbolic link in an import source', relative);
    }
  }
  /* Belt and braces: a rename between the checks above cannot carry the entry out of the source unseen. */
  const real = await fs.realpath(current);
  return isContained(base, real) && real === current
    ? real
    : refuse('EACCES', 'not inside the chosen source', relative);
};

const rowOf = async (absolute: string, name: string): Promise<NodeFsImportSourceRow | undefined> => {
  const stats = await fs.lstat(absolute).catch(() => undefined);
  if (stats === undefined) {
    return undefined;
  }
  const kind = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'other';
  return { name, kind, size: kind === 'file' ? stats.size : 0, mtimeMs: stats.mtimeMs };
};

/**
 * One directory of a grant, listed by `lstat`: each row's kind (a link and a
 * special file named as such), size and modification time. A file grant
 * lists its one file at `''`.
 *
 * @param grant - The chosen source.
 * @param relative - The directory inside it.
 * @returns The rows, sorted by name so a listing is stable.
 * @public
 */
export const listImportSource = async (
  grant: ImportSourceGrant,
  relative: string,
): Promise<NodeFsImportSourceRow[]> => {
  if (grant.kind === 'file') {
    if (relative !== '') {
      return refuse('ENOTDIR', 'a chosen file has no directories', relative);
    }
    const file = await resolveImportSourcePath(grant, path.basename(grant.path));
    const row = await rowOf(file, path.basename(grant.path));
    return row === undefined ? [] : [row];
  }
  const directory = await resolveImportSourcePath(grant, relative);
  const names = await fs.readdir(directory);
  const rows = await Promise.all(names.map(async (name) => rowOf(path.join(directory, name), name)));
  return rows
    .filter((row): row is NodeFsImportSourceRow => row !== undefined)
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
};

/**
 * One range of one file of a grant, for a review's preview.
 *
 * @param grant - The chosen source.
 * @param relative - The file inside it.
 * @param range - Where the range starts, and the most bytes it answers.
 * @returns At most `maximumBytes` bytes from `position`; fewer at the end of the file.
 * @public
 */
export const readImportSource = async (
  grant: ImportSourceGrant,
  relative: string,
  range: Readonly<{ position: number; maximumBytes: number }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const file = await resolveImportSourcePath(grant, relative);
  const handle = await fs.open(file, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return refuse('EOPNOTSUPP', 'not a regular file', relative);
    }
    const bytes = new Uint8Array(Math.max(0, Math.min(range.maximumBytes, stats.size - range.position)));
    let filled = 0;
    for (let read = -1; read !== 0 && filled < bytes.byteLength; filled += read) {
      // oxlint-disable-next-line no-await-in-loop -- a file is read one chunk after another.
      ({ bytesRead: read } = await handle.read(bytes, filled, bytes.byteLength - filled, range.position + filled));
    }
    return bytes.slice(0, filled);
  } finally {
    await handle.close();
  }
};

/**
 * The grant a host minted, or a refusal: a grant it never minted, or let go,
 * is not the client's to name.
 *
 * @param resolve - The host's grant resolver, when it holds any.
 * @param grant - The grant the client named.
 * @returns The chosen source.
 * @throws An `EACCES` error for a grant this host does not hold.
 * @public
 */
export const importSourceGrant = (
  resolve: ((grant: string) => ImportSourceGrant | undefined) | undefined,
  grant: string,
): ImportSourceGrant => resolve?.(grant) ?? refuse('EACCES', 'refusing an import source this host did not grant', '');

/**
 * Copy files of a grant into a root (W7.4): each source resolved inside the
 * grant, then landed by the provider's copy. A source that does not resolve
 * is that entry's refusal; the others still land.
 *
 * @param provider - The root's provider.
 * @param grant - The chosen source.
 * @param entries - Each file's path inside the source, its path in the root, and its listed size.
 * @returns One receipt per entry, in order.
 * @public
 */
export const copyFromImportGrant = async (
  provider: NodeFsProvider,
  grant: ImportSourceGrant,
  entries: ReadonlyArray<Readonly<{ from: string; path: string; size: number }>>,
): Promise<ImportCopyReceipt[]> => {
  const resolved = await Promise.all(
    entries.map(async (entry) =>
      resolveImportSourcePath(grant, entry.from).then(
        (from) => ({ from }),
        (error: unknown) => ({ error }),
      ),
    ),
  );
  const copies: ImportFileCopy[] = [];
  const positions: number[] = [];
  const receipts = Array.from<ImportCopyReceipt>({ length: entries.length });
  for (const [index, outcome] of resolved.entries()) {
    if ('error' in outcome) {
      receipts[index] = { outcome: 'failed', error: outcome.error };
    } else {
      copies.push({ path: entries[index]!.path, from: outcome.from, size: entries[index]!.size });
      positions.push(index);
    }
  }
  const landed = copies.length === 0 ? [] : await provider.copyImportFiles(copies);
  for (const [position, receipt] of landed.entries()) {
    receipts[positions[position]!] = receipt;
  }
  return receipts;
};
