/**
 * Shared on-disk retention for the cache middlewares.
 *
 * `geometryCache` and `parameterCache` are separate public subpath entries, so
 * neither may import the other; this internal module is the single owner of the
 * prune policy both configure through identical `maxEntries`/`maxAge` options.
 */

import type { KernelFileSystem } from '@taucad/runtime/types';

type CacheRetentionSnapshot = {
  readonly paths: readonly string[];
  readonly nextExpiry: number;
};

type CacheRetentionState = CacheRetentionSnapshot & {
  readonly maxAge: number;
  readonly maxEntries: number;
};

/**
 * Clean up old cache entries to prevent unbounded cache growth.
 * Deletes entries older than `maxAge` and keeps only `maxEntries` most recent files.
 *
 * @returns The exact retained paths and next expiry after a successful scan.
 */
const cleanupOldCacheEntries = async ({
  filesystem,
  cacheDirectory,
  extension,
  maxAge,
  maxEntries,
}: {
  /** The filesystem for file operations */
  filesystem: KernelFileSystem;
  /** The cache directory path */
  cacheDirectory: string;
  /** File extension identifying this cache's own entries (e.g. `.bin`, `.json`) */
  extension: string;
  /** Maximum age for cache entries. Milliseconds. */
  maxAge: number;
  /** Maximum number of cache entries to keep */
  maxEntries: number;
}): Promise<CacheRetentionSnapshot | undefined> => {
  try {
    const files = await filesystem.readdirStat(cacheDirectory);

    // Filter to only this cache's own entries; a sibling cache may share the directory.
    const cacheFiles = files.filter((file) => file.type === 'file' && file.name.endsWith(extension));
    const now = Date.now();

    if (cacheFiles.length === 0) {
      return { paths: [], nextExpiry: now + maxAge };
    }

    const filesToDelete: string[] = [];

    // First pass: identify files older than maxAge
    for (const file of cacheFiles) {
      const age = now - file.mtimeMs;
      if (age > maxAge) {
        filesToDelete.push(file.path);
      }
    }

    // Second pass: if still over maxEntries, delete oldest files
    const remainingFiles = cacheFiles.filter((file) => !filesToDelete.includes(file.path));

    if (remainingFiles.length > maxEntries) {
      // Sort by modification time (oldest first)
      remainingFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

      // Delete oldest files to get under maxEntries
      const excessCount = remainingFiles.length - maxEntries;
      for (let index = 0; index < excessCount; index++) {
        const file = remainingFiles[index];
        if (file) {
          filesToDelete.push(file.path);
        }
      }
    }

    // Delete identified files
    await Promise.all(filesToDelete.map(async (path) => filesystem.unlink(path)));
    const deletedPaths = new Set(filesToDelete);
    const retainedFiles = remainingFiles.filter(({ path }) => !deletedPaths.has(path));
    let nextExpiry = now + maxAge;
    for (const { mtimeMs } of retainedFiles) {
      nextExpiry = Math.min(nextExpiry, mtimeMs + maxAge);
    }
    return {
      paths: retainedFiles.map(({ path }) => path),
      nextExpiry,
    };
  } catch {
    // Cleanup errors are non-fatal - silently ignore
    return undefined;
  }
};

/**
 * Coalesce retention scans while the exact post-prune count and age deadline remain valid.
 *
 * @returns A registration-local retention operation.
 */
export const createCacheRetentionTracker = (): ((options: {
  filesystem: KernelFileSystem;
  cacheDirectory: string;
  extension: string;
  writtenPath: string;
  maxAge: number;
  maxEntries: number;
}) => Promise<void>) => {
  const stateByFilesystem = new WeakMap<KernelFileSystem, CacheRetentionState>();

  return async ({ filesystem, cacheDirectory, extension, writtenPath, maxAge, maxEntries }) => {
    const state = stateByFilesystem.get(filesystem);
    const now = Date.now();
    const knownPath = state?.paths.includes(writtenPath) ?? false;
    if (
      state?.maxAge === maxAge &&
      state.maxEntries === maxEntries &&
      now < state.nextExpiry &&
      (knownPath || state.paths.length < maxEntries)
    ) {
      stateByFilesystem.set(filesystem, {
        ...state,
        paths: knownPath ? state.paths : [...state.paths, writtenPath],
        nextExpiry: Math.min(state.nextExpiry, now + maxAge),
      });
      return;
    }

    const snapshot = await cleanupOldCacheEntries({
      filesystem,
      cacheDirectory,
      extension,
      maxAge,
      maxEntries,
    });
    if (snapshot) {
      stateByFilesystem.set(filesystem, { ...snapshot, maxAge, maxEntries });
    }
  };
};
