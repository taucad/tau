import type { FileStat } from '#types/file.types.js';

/**
 * Minimal Node.js-compatible stat shape with method-based type detection.
 * Matches `fs.Stats` from Node.js, ZenFS, BrowserFS, and similar libraries.
 *
 * @public
 */
export type NativeStats = {
  size: number;
  mtimeMs: number;
  isDirectory(): boolean;
};

/**
 * Convert a Node.js-style stat result to a kernel-compatible FileStat.
 * Eliminates the repeated `isDirectory() ? 'dir' : 'file'` pattern.
 *
 * @public
 */
export function toFileStat(stats: NativeStats): FileStat {
  if (stats.isDirectory()) {
    return {
      type: 'dir',
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  }

  return {
    type: 'file',
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    contentKind: 'binary',
  };
}
