import type { MimeType } from '#types/mime-types.types.js';

/**
 * Reference to a geometry asset by virtual path and display filename.
 *
 * @public
 */
export type GeometryFile = {
  path: string;
  filename: string;
};

/**
 * Base file tree entry for API transfer and serialization.
 * Represents files and directories in a file tree snapshot.
 *
 * @public
 */
export type FileTreeEntry = {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
};

/**
 * File or directory entry in the filesystem with client-side loading state.
 * Extends {@link FileTreeEntry} for tree UIs and filesystem operations.
 *
 * @public
 */
export type FileEntry = FileTreeEntry & {
  isLoaded: boolean;
  mtimeMs: number;
  /**
   * When `type === 'dir'`, `true` means immediate children have been
   * read from the worker and merged into the tree snapshot. Omitted for
   * files and unresolved directory stubs.
   */
  isDirectoryResolved?: boolean;
};

/**
 * Stat result from virtual filesystem `stat` / `lstat` operations.
 * Aligns with the subset of Node.js `fs.Stats` used by the VFS layer.
 *
 * @public
 */
export type FileStat = {
  readonly type: 'file' | 'dir';
  readonly size: number;
  readonly mtimeMs: number;
};

/**
 * Stat result with path and name for directory listings.
 * Returned by `readdirStat` and similar enumeration APIs.
 *
 * @public
 */
export type FileStatEntry = FileStat & {
  readonly path: string;
  readonly name: string;
};

/**
 * Named binary payload for conversion and import pipelines.
 *
 * @public
 */
export type FileInput = {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
};

/**
 * Named binary export artifact with a resolved MIME type.
 * Used by runtime export results and the converter package.
 *
 * @public
 */
export type ExportFile = {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: MimeType;
};
