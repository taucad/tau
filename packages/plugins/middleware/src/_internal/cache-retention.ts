/**
 * Shared on-disk retention for the cache middlewares.
 *
 * `geometryCache` and `parameterCache` are separate public subpath entries, so
 * neither may import the other; this internal module is the single owner of the
 * prune policy both configure through identical `maxEntries`/`maxAge` options.
 */

import type { KernelFileSystem } from '@taucad/runtime/types';

/**
 * Clean up old cache entries to prevent unbounded cache growth.
 * Deletes entries older than `maxAge` and keeps only `maxEntries` most recent files.
 */
export async function cleanupOldCacheEntries({
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
}): Promise<void> {
  try {
    const files = await filesystem.readdirStat(cacheDirectory);

    // Filter to only this cache's own entries; a sibling cache may share the directory.
    const cacheFiles = files.filter((file) => file.type === 'file' && file.name.endsWith(extension));

    if (cacheFiles.length === 0) {
      return;
    }

    const now = Date.now();
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
  } catch {
    // Cleanup errors are non-fatal - silently ignore
  }
}
