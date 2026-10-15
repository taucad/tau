/* oxlint-disable no-bitwise -- permission bits are a bit field. */
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { hashFile } from '#preparation/preparation-store.js';
import type { ClosureReceipt, ReceiptFile } from '#preparation/preparation.types.js';

const verifyConcurrency = 8;
const isWindows = process.platform === 'win32';

/**
 * What a full re-verification of one sealed closure found.
 * @internal
 */
export type TreeDifferences = {
  /** Receipt rows whose file is missing or differs in size, mode, link target or bytes. */
  readonly changed: readonly ReceiptFile[];
  /** Closure-relative paths of files the receipt does not list. */
  readonly extra: readonly string[];
};

const posix = (path: string): string => (sep === '/' ? path : path.split(sep).join('/'));

const rowMatches = async (root: string, row: ReceiptFile, signal: AbortSignal): Promise<boolean> => {
  const path = join(root, ...row.path.split('/'));
  try {
    const stats = await lstat(path);
    if (row.symlinkTarget !== undefined && stats.isSymbolicLink()) {
      return (await readlink(path)) === row.symlinkTarget;
    }
    // A link copied as its file (Windows) is verified as that file.
    if (!stats.isFile() || stats.size !== row.byteLength || (!isWindows && (stats.mode & 0o777) !== row.mode)) {
      return false;
    }
    return (await hashFile(path, signal)) === row.sha256;
  } catch {
    signal.throwIfAborted();
    return false;
  }
};

/**
 * Re-verify every file of a sealed closure against its receipt, hashing with bounded concurrency. This is the
 * seconds-scale repair-time check, never a per-launch one.
 * @internal
 * @param receipt - The closure's receipt; `root` is where it is now.
 * @param signal - Aborts the walk.
 * @returns The rows that no longer match and the files the receipt does not list.
 */
export const verifyClosureTree = async (
  receipt: Pick<ClosureReceipt, 'root' | 'files'>,
  signal: AbortSignal,
): Promise<TreeDifferences> => {
  const listed = new Set(receipt.files.map((row) => row.path));
  const entries = await readdir(receipt.root, { recursive: true, withFileTypes: true });
  const extra = entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => posix(relative(receipt.root, join(entry.parentPath, entry.name))))
    .filter((path) => path !== 'receipt.json' && !listed.has(path))
    .toSorted();
  const changed: ReceiptFile[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < receipt.files.length) {
      const row = receipt.files[next]!;
      next += 1;
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- each lane hashes one file at a time
      if (!(await rowMatches(receipt.root, row, signal))) {
        changed.push(row);
      }
    }
  };
  await Promise.all(Array.from({ length: verifyConcurrency }, lane));
  return { changed: changed.toSorted((left, right) => (left.path < right.path ? -1 : 1)), extra };
};

/**
 * Re-verify one sealed closure against the receipt beside it, file by file: what a host runs when a kernel's worker
 * exits before its handshake (D8), so the refusal can name the damaged file. Seconds, never per launch.
 * @param root - The closure root, which holds `receipt.json`.
 * @param signal - Aborts the walk.
 * @returns Closure-relative paths of the files that are missing, differ from their rows or are not listed, sorted;
 *   empty when the closure is intact; `undefined` when `root` holds no readable receipt (it is not sealed).
 * @public
 * @example <caption>Name what a failed handshake found</caption>
 * ```typescript
 * import { reverifyClosure } from '@taucad/runtime/preparation/node';
 *
 * const damaged = await reverifyClosure(closureRoot, AbortSignal.timeout(300_000));
 * ```
 */
export const reverifyClosure = async (root: string, signal: AbortSignal): Promise<readonly string[] | undefined> => {
  let files: unknown;
  try {
    files = (JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8')) as { readonly files?: unknown }).files;
  } catch {
    return undefined;
  }
  const rows = (value: unknown): value is ReceiptFile[] =>
    Array.isArray(value) &&
    value.every((row: unknown) => {
      const file = (typeof row === 'object' ? (row ?? {}) : {}) as Partial<Record<keyof ReceiptFile, unknown>>;
      return typeof file.path === 'string' && typeof file.sha256 === 'string' && typeof file.byteLength === 'number';
    });
  if (!rows(files)) {
    return undefined;
  }
  const found = await verifyClosureTree({ root, files }, signal);
  return [...found.changed.map((row) => row.path), ...found.extra].toSorted();
};
