/**
 * File System Types
 *
 * Types for filesystem operations and state management.
 */

import type { filesystemBackends } from '#constants/filesystem.constants.js';

/**
 * Available filesystem backend types.
 */
export type FileSystemBackend = (typeof filesystemBackends)[number];

/**
 * Filesystem backend configuration.
 * Used to define backend implementations with canHandle/create pattern.
 */
export type FileSystemBackendConfig = {
  readonly name: FileSystemBackend;
  readonly label: string;
  readonly description: string;
  readonly canHandle: () => boolean;
  readonly create: () => Promise<void>;
};

/**
 * Stat metadata for a filesystem entry. Re-exported from `@taucad/filesystem`
 * via the worker event channel; declared here so the canonical
 * {@link ChangeEvent} union can carry optional `target` payloads.
 *
 * @public
 */
export type ChangeEventStat = {
  readonly type: 'file' | 'dir';
  readonly size: number;
  readonly mtimeMs: number;
};

/**
 * Discriminated union of filesystem change events emitted by the event bus.
 *
 * Per `docs/research/editor-filesystem-surface-audit.md` R2, file and
 * directory operations are emitted under distinct discriminators so
 * participants can distinguish subtree migrations from single-file
 * renames, and copy from write.
 *
 * @public
 */
export type ChangeEvent =
  | { type: 'fileWritten'; path: string; backend: FileSystemBackend; target?: ChangeEventStat }
  | { type: 'fileDeleted'; path: string; backend: FileSystemBackend }
  | { type: 'fileRenamed'; oldPath: string; newPath: string; backend: FileSystemBackend; target?: ChangeEventStat }
  | { type: 'fileCopied'; sourcePath: string; targetPath: string; backend: FileSystemBackend; target?: ChangeEventStat }
  | { type: 'directoryCreated'; path: string; backend: FileSystemBackend; target?: ChangeEventStat }
  | { type: 'directoryDeleted'; path: string; backend: FileSystemBackend }
  | { type: 'directoryRenamed'; oldPath: string; newPath: string; backend: FileSystemBackend; target?: ChangeEventStat }
  | {
      type: 'directoryCopied';
      sourcePath: string;
      targetPath: string;
      backend: FileSystemBackend;
      target?: ChangeEventStat;
    }
  | { type: 'directoryChanged'; path: string; backend: FileSystemBackend }
  | { type: 'backendChanged'; backend: FileSystemBackend };

/**
 * File Status in the filesystem
 */
export type FileStatus = 'clean' | 'modified' | 'added' | 'deleted' | 'untracked';

/**
 * File System Item
 *
 * Represents a file or directory in the virtual filesystem.
 */
export type FileSystemItem = {
  path: string;
  content: string;
  isDirectory: boolean;
  status?: FileStatus;
  lastModified?: number;
  size?: number;
};
