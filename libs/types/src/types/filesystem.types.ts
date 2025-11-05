/**
 * File System Types
 *
 * Types for filesystem operations and state management.
 */

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
