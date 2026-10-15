/* oxlint-disable no-bitwise -- permission bits are a bit field. */
import { chmod, lstat, readdir, readlink, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { hashFile } from '#preparation/preparation-store.js';
import type { PreparationPlugin, SealClosureRefusal } from '#preparation/preparation-host.types.js';
import type { DependencyTarget, ReceiptFile } from '#preparation/preparation.types.js';

const hashConcurrency = 8;
const executableBits = 0o111;

const posix = (path: string): string => (sep === '/' ? path : path.split(sep).join('/'));

/**
 * The receipt rows of every file under `root` that `known` does not list, after normalising each regular file's
 * mode to `0o644` (or `0o755` when any execute bit is set) so the rows do not depend on the host's umask.
 * @param root - Closure root.
 * @param known - Closure-relative paths already receipted.
 * @param signal - Aborts the walk.
 * @returns The new rows, sorted by path.
 */
const receiptAddedFiles = async (
  root: string,
  known: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<ReceiptFile[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const added = entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((path) => ({ path, relativePath: posix(relative(root, path)) }))
    .filter(({ relativePath }) => relativePath !== 'receipt.json' && !known.has(relativePath));
  const rows: ReceiptFile[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < added.length) {
      const { path, relativePath } = added[next]!;
      next += 1;
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- each lane hashes one file at a time
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        // A link is receipted as the file it resolves to, as the payload writer does.
        // oxlint-disable-next-line no-await-in-loop -- ditto
        const [symlinkTarget, sha256, resolved] = await Promise.all([
          readlink(path),
          hashFile(path, signal),
          stat(path),
        ]);
        rows.push({
          path: relativePath,
          byteLength: resolved.size,
          sha256,
          mode: resolved.mode & 0o777,
          symlinkTarget,
        });
        continue;
      }
      const mode = (stats.mode & executableBits) === 0 ? 0o644 : 0o755;
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await chmod(path, mode);
      // oxlint-disable-next-line no-await-in-loop -- ditto
      rows.push({ path: relativePath, byteLength: stats.size, sha256: await hashFile(path, signal), mode });
    }
  };
  await Promise.all(Array.from({ length: hashConcurrency }, lane));
  return rows.toSorted((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
};

/**
 * A seal step's refusal raised while a closure is repaired, so the attempt that reuses it ends `blocked` with the
 * refusal's reason and detail rather than failing.
 * @internal
 */
export class SealRefused extends Error {
  public override readonly name = 'SealRefused';
  public readonly refusal: SealClosureRefusal;

  public constructor(refusal: SealClosureRefusal) {
    super(refusal.message);
    this.refusal = refusal;
  }
}

/**
 * Run a plugin's seal step over a closure root and receipt the files it added.
 * @internal
 * @param input - The plugin, the closure and the payload rows already receipted.
 * @returns The added rows, or the plugin's refusal.
 */
export const runSealStep = async (input: {
  readonly plugin: PreparationPlugin;
  readonly dependency: string;
  readonly target: DependencyTarget;
  readonly root: string;
  readonly files: readonly ReceiptFile[];
  readonly signal: AbortSignal;
}): Promise<{ readonly rows: readonly ReceiptFile[] } | { readonly refusal: SealClosureRefusal }> => {
  const { plugin, root, files, signal } = input;
  if (plugin.seal === undefined) {
    return { rows: [] };
  }
  const refusal = await plugin.seal({
    package: plugin.package,
    dependency: input.dependency,
    target: input.target,
    root,
    files,
    signal,
  });
  signal.throwIfAborted();
  if (refusal !== undefined) {
    return { refusal };
  }
  return { rows: await receiptAddedFiles(root, new Set(files.map(({ path }) => path)), signal) };
};
