/**
 * A source a person chose on this host for an import (W7.4, charter D12).
 *
 * A person who picks a folder or opens a file with Tau is the admission
 * event: the host process that showed the picker (or received the file from
 * the operating system) mints an opaque grant for it, and only the grant
 * crosses to the importer. Everything the importer asks of the source — a
 * directory's rows, a preview, the copy itself — names the grant and a plain
 * relative path inside it, and is resolved here, by the authority, so no host
 * path ever enters the mutation vocabulary (I6).
 *
 * The grant pins the chosen entry by its device and inode as it was when the
 * person chose it, and every use requires the entry at the grant's path to be
 * that one, not a link: a folder or file swapped for a link afterwards is
 * refused. A path inside it is walked without following a link, a file is
 * opened without following one, and the opened descriptor is then proved to be
 * the very file the path names inside the grant by walking it again and
 * comparing identities. Bytes are only ever read through that held descriptor,
 * so a directory swapped for a link and back between the checks cannot carry
 * them in from elsewhere: the second walk would see another inode. A hard link
 * names the same inode from two places and is imported as the file it is, as a
 * browser folder import does.
 *
 * These checks are only as strong as the file system's identities and times.
 * FAT and exFAT have no inodes: Node reports a number derived from the entry's
 * place, which a rename can reuse, and their modification times are coarse
 * (2 s on FAT, 10 ms on exFAT) with no change time. An SMB share reports the
 * server's file id where it has one and a synthesized number where it does
 * not, and its times are what the server and the client's cache report. ReFS
 * file ids are 128 bits, wider than the 64-bit inode Node sees, so two files
 * can share one. On those volumes an identity match is weaker evidence and a
 * write within the time resolution can go unseen. A write through a shared
 * memory mapping changes the bytes without always moving mtime or ctime until
 * it is flushed, so a concurrent mmap writer is not detected either: the copy
 * can hold bytes from before and after its write. The facts are hashed from
 * the landed copy, so they always describe exactly the bytes that landed.
 *
 * @module
 */

import { constants } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { maximumImportSourceRows } from '#backend/node/protocol.js';
import type { NodeFsImportSourceRow } from '#backend/node/protocol.js';
import type { ImportCopyReceipt, NodeFsProvider } from '#backend/node/provider.js';

/**
 * The identity of a chosen entry: its device and inode as decimal strings,
 * so it crosses any structured-clone channel unchanged.
 *
 * @public
 */
export type ImportSourceIdentity = Readonly<{ dev: string; ino: string }>;

/**
 * A source a person chose: a folder, or one file, pinned by its identity.
 *
 * @public
 */
export type ImportSourceGrant = Readonly<{
  /** The absolute host path the person chose, its links resolved when it was chosen. */
  path: string;
  kind: 'directory' | 'file';
  /** The entry at `path` when it was chosen: every use requires the same one there. */
  identity: ImportSourceIdentity;
}>;

const optionalFlag = (flag: number | undefined): number => flag ?? 0;
/* Read-only, never through a final link, never blocking on a FIFO. */
const sourceOpenFlags = constants.O_RDONLY + optionalFlag(constants.O_NOFOLLOW) + optionalFlag(constants.O_NONBLOCK);
const directoryOpenFlags = sourceOpenFlags + optionalFlag(constants.O_DIRECTORY);

const refuse = (code: string, reason: string, relative: string): never => {
  throw Object.assign(new Error(`${code}: ${reason}: ${relative === '' ? '.' : relative}`), { code });
};

/**
 * Where a held descriptor can be named as a path that opens the very same
 * inode, without resolving any directory again: Linux's `/proc/self/fd/<n>`.
 * Elsewhere there is none, and bytes are read through the descriptor itself.
 *
 * @param fd - An open descriptor.
 * @returns The path, or `undefined` on a platform without one.
 * @public
 */
export const heldDescriptorPath = (fd: number): string | undefined =>
  process.platform === 'linux' ? `/proc/self/fd/${String(fd)}` : undefined;

/**
 * The identity a grant records for an entry a person chose: its links
 * resolved, the entry itself never a link.
 *
 * @param chosen - The chosen path.
 * @param kind - Whether a folder or a file was chosen.
 * @returns The resolved path and its identity.
 * @throws When the entry is not the kind that was chosen.
 * @public
 */
export const importSourceIdentity = async (
  chosen: string,
  kind: ImportSourceGrant['kind'],
): Promise<Readonly<{ path: string; identity: ImportSourceIdentity }>> => {
  const resolved = await fs.realpath(chosen);
  const stats = await fs.lstat(resolved, { bigint: true });
  if (kind === 'directory' ? !stats.isDirectory() : !stats.isFile()) {
    return refuse('EACCES', `the chosen entry is not a ${kind === 'directory' ? 'folder' : 'file'}`, '');
  }
  return { path: resolved, identity: { dev: String(stats.dev), ino: String(stats.ino) } };
};

const sameIdentity = (stats: BigIntStats, identity: ImportSourceIdentity): boolean =>
  String(stats.dev) === identity.dev && String(stats.ino) === identity.ino;

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

/*
 * The entry a relative path names inside a grant, walked by `lstat` without
 * following a link: the grant's own entry must still be the one chosen, and
 * no segment may be a link. A file grant names its one file by its own name.
 */
const walk = async (
  grant: ImportSourceGrant,
  relative: string,
): Promise<Readonly<{ absolute: string; stats: BigIntStats }>> => {
  const segments = segmentsOf(relative);
  const root = await fs.lstat(grant.path, { bigint: true });
  if (root.isSymbolicLink() || !sameIdentity(root, grant.identity)) {
    return refuse('EACCES', 'the chosen source was replaced since it was chosen', relative);
  }
  if (grant.kind === 'file') {
    if (segments.length > 1 || (segments.length === 1 && segments[0] !== path.basename(grant.path))) {
      return refuse('EACCES', 'not a path inside the chosen source', relative);
    }
    return { absolute: grant.path, stats: root };
  }
  let absolute = grant.path;
  let stats = root;
  for (const segment of segments) {
    absolute = path.join(absolute, segment);
    // oxlint-disable-next-line no-await-in-loop -- each segment is checked before the next is entered.
    stats = await fs.lstat(absolute, { bigint: true });
    if (stats.isSymbolicLink()) {
      return refuse('ELOOP', 'refusing to follow a symbolic link in an import source', relative);
    }
  }
  return { absolute, stats };
};

/*
 * Open the entry a path names inside a grant and prove the descriptor is it:
 * walk, open without following a final link, then walk again and require the
 * path to name the descriptor's own inode. A swap anywhere along the path
 * between the two walks leaves the descriptor on another inode, and is refused.
 */
const openProved = async (grant: ImportSourceGrant, relative: string, directory: boolean): Promise<FileHandle> => {
  const { absolute } = await walk(grant, relative);
  const handle = await fs.open(absolute, directory ? directoryOpenFlags : sourceOpenFlags).catch((error: unknown) => {
    throw (error as NodeJS.ErrnoException).code === 'ELOOP'
      ? Object.assign(new Error(`ELOOP: refusing to follow a symbolic link in an import source: ${relative}`), {
          code: 'ELOOP',
        })
      : error;
  });
  try {
    const held = await handle.stat({ bigint: true });
    const named = await walk(grant, relative);
    if (named.stats.dev !== held.dev || named.stats.ino !== held.ino) {
      return refuse('ESTALE', 'the import source moved while it was opened', relative);
    }
    if (directory ? !held.isDirectory() : !held.isFile()) {
      return refuse('EOPNOTSUPP', directory ? 'not a folder' : 'not a regular file', relative);
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
};

/**
 * Open one file of a grant for reading, proved to be the file the path names
 * inside the grant. The caller reads through the handle and closes it.
 *
 * @param grant - The chosen source.
 * @param relative - The file inside it; a file grant's own name for a file grant.
 * @returns The open handle.
 * @throws `EACCES` outside the source, `ELOOP` through a link, `ESTALE` when it moved, `EOPNOTSUPP` for a non-file.
 * @public
 */
export const openImportSourceFile = async (grant: ImportSourceGrant, relative: string): Promise<FileHandle> =>
  openProved(grant, relative, false);

const rowOf = async (absolute: string, name: string): Promise<NodeFsImportSourceRow | undefined> => {
  const stats = await fs.lstat(absolute).catch(() => undefined);
  if (stats === undefined) {
    return undefined;
  }
  const kind = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'other';
  return { name, kind, size: kind === 'file' ? stats.size : 0, mtimeMs: stats.mtimeMs };
};

/**
 * One page of one directory of a grant, listed by `lstat`: each row's kind (a
 * link and a special file named as such), size and modification time, at most
 * {@link maximumImportSourceRows} rows from `offset` in the directory's own
 * order. On Linux the rows are read through the held, proved directory; on
 * other platforms the directory's identity is checked again after the page. A
 * file grant lists its one file at `''`.
 *
 * @param grant - The chosen source.
 * @param relative - The directory inside it.
 * @param offset - Rows of this directory already read.
 * @returns The page, and whether more rows follow.
 * @public
 */
export const listImportSource = async (
  grant: ImportSourceGrant,
  relative: string,
  offset = 0,
): Promise<Readonly<{ rows: NodeFsImportSourceRow[]; more: boolean }>> => {
  if (grant.kind === 'file') {
    if (relative !== '') {
      return refuse('ENOTDIR', 'a chosen file has no directories', relative);
    }
    const { absolute } = await walk(grant, path.basename(grant.path));
    const row = offset > 0 ? undefined : await rowOf(absolute, path.basename(grant.path));
    return { rows: row === undefined ? [] : [row], more: false };
  }
  /* Windows opens no directory as a descriptor: there the directory is walked to, and checked again after. */
  const handle = process.platform === 'win32' ? undefined : await openProved(grant, relative, true);
  try {
    const named = handle === undefined ? await walk(grant, relative) : undefined;
    if (named !== undefined && !named.stats.isDirectory()) {
      return refuse('ENOTDIR', 'not a folder', relative);
    }
    const held = named?.stats ?? (await handle!.stat({ bigint: true }));
    const through = handle === undefined ? undefined : heldDescriptorPath(handle.fd);
    let base = through ?? named?.absolute;
    if (base === undefined) {
      const walked = await walk(grant, relative);
      base = walked.absolute;
    }
    const directory = await fs.opendir(base);
    const names: string[] = [];
    let seen = 0;
    let more = false;
    try {
      for await (const entry of directory) {
        if (seen >= offset + maximumImportSourceRows) {
          more = true;
          break;
        }
        if (seen >= offset) {
          names.push(entry.name);
        }
        seen += 1;
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
    const rows = await Promise.all(names.map(async (name) => rowOf(path.join(base, name), name)));
    /* Read by path where no descriptor path exists: the directory must still be the held one. */
    if (through === undefined) {
      const again = await walk(grant, relative);
      if (again.stats.dev !== held.dev || again.stats.ino !== held.ino) {
        return refuse('ESTALE', 'the import source moved while it was listed', relative);
      }
    }
    return { rows: rows.filter((row): row is NodeFsImportSourceRow => row !== undefined), more };
  } finally {
    await handle?.close();
  }
};

/**
 * One range of one file of a grant, for a review's preview, read through the
 * proved descriptor.
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
  const handle = await openImportSourceFile(grant, relative);
  try {
    const stats = await handle.stat();
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
 * The grant a host holds for a client, or a refusal: a grant it never minted,
 * let go, or minted for someone else is not the client's to name.
 *
 * @param resolve - The host's grant resolver, when it holds any.
 * @param grant - The grant the client named.
 * @returns The chosen source.
 * @throws An `EACCES` error for a grant this host does not hold for the client.
 * @public
 */
export const importSourceGrant = async (
  resolve: ((grant: string) => ImportSourceGrant | undefined | Promise<ImportSourceGrant | undefined>) | undefined,
  grant: string,
): Promise<ImportSourceGrant> =>
  (await resolve?.(grant)) ?? refuse('EACCES', 'refusing an import source this host did not grant', '');

/**
 * Copy files of a grant into a root (W7.4): each landed by the provider's
 * copy through a descriptor opened and proved inside the grant when its turn
 * comes. A source that does not open is that entry's refusal; the others
 * still land.
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
): Promise<ImportCopyReceipt[]> =>
  provider.copyImportFiles(
    entries.map((entry) => ({
      path: entry.path,
      size: entry.size,
      open: async () => openImportSourceFile(grant, entry.from),
    })),
  );
