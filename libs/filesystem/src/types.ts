/**
 * Filesystem Architecture Types
 *
 * Core types for the layered filesystem architecture:
 * - FileSystemProvider: abstraction over filesystem backends
 * - ProviderCapabilities: what a provider supports
 * - FileStat: stat result from provider operations (canonical: @taucad/types)
 * - ChangeEvent: push-based change notifications (canonical definition in @taucad/types)
 * - FileTreeNode: tree representation for /files route
 */

import type { FileContentMetadata, FileStat } from '@taucad/types';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- re-export for internal consumers that import from #types.js
export type { ChangeEvent, FileStat, FileStatEntry } from '@taucad/types';

/**
 * Capability flags describing what a storage provider supports.
 * @public
 */
export type ProviderCapabilities = {
  readonly persistent: boolean;
  readonly writable: boolean;
  readonly quotaBased: boolean;
  /**
   * Append durability reported by current providers. Optional only so older
   * bridge peers and third-party providers remain wire-compatible.
   */
  readonly durability?: 'exclusive-append' | 'stream-append' | 'transactional-rewrite' | 'ephemeral';
};

/**
 * Directory child with its kind, so callers can branch on file-vs-directory
 * without a `stat` round-trip per entry.
 * @public
 */
export type DirectoryEntry = {
  readonly name: string;
  readonly kind: 'file' | 'dir';
};

/**
 * Backend-agnostic filesystem provider exposing POSIX-like operations.
 * @public
 */
export type FileSystemProvider = {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  /** Persist a file, creating any missing parent directories. */
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  /** Append bytes in enqueue order, creating the file and missing parent directories when absent. */
  appendFile?(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  lstat(path: string): Promise<FileStat>;
  dispose(): void;
  /** Optional streaming read. When present, service routes through this instead of buffered readFile. */
  readFileStream?(path: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>>;
  /** Optional batched readdir+stat. When present, eliminates N+1 stat calls per directory listing. */
  readdirWithStats?(path: string): Promise<Array<{ name: string } & FileStat>>;
  /** Optional readdir carrying entry kinds. When present, tree walks skip the stat-per-child. */
  readdirEntries?(path: string): Promise<DirectoryEntry[]>;
  /**
   * Refresh provider projections after an out-of-band mutation. Pass the absolute
   * paths whose subtrees changed to scope the invalidation; omit them to drop everything.
   */
  refresh?(prefixes?: readonly string[]): Promise<void>;
};

/**
 * Options for streaming file reads.
 * @public
 */
export type FileReadStreamOptions = {
  /** Byte offset to start reading from. */
  position?: number;
  /** Maximum number of bytes to read. */
  length?: number;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
};

/**
 * Shallow directory row returned from the worker for {@link WorkspaceFileService.readDirectory}
 * and standalone {@link WorkspaceFileService.readShallowDirectory}.
 * Carries stat metadata from `readdirWithStats` / `stat` so main-thread consumers avoid synthesised zeros.
 * Also used by the `/files` route to display all backends side-by-side.
 * @public
 */
export type FileTreeNode =
  | {
      id: string;
      name: string;
      /** Directories use `0` when unknown. */
      size: number;
      /** Milliseconds since Unix epoch (provider stat). */
      mtimeMs: number;
      children: FileTreeNode[];
    }
  | ({
      id: string;
      name: string;
      /** File byte length. */
      size: number;
      /** Milliseconds since Unix epoch (provider stat). */
      mtimeMs: number;
      children?: never;
    } & FileContentMetadata);

/**
 * Directory listing row with stat metadata (worker readDirectory aggregation).
 * @public
 */
export type TreeEntry =
  | {
      name: string;
      type: 'dir';
      size: number;
      mtimeMs: number;
    }
  | ({
      name: string;
      type: 'file';
      size: number;
      mtimeMs: number;
    } & FileContentMetadata);

// =============================================================================
// Watch API types
// =============================================================================

/**
 * Describes a filesystem watch subscription.
 *
 * - `paths`: absolute normalized watch roots
 * - `recursive`: watch subdirectories (default `false`)
 * - `includes`/`excludes`: glob patterns for path filtering
 * @public
 */
export type WatchRequest = {
  paths: string[];
  recursive?: boolean;
  includes?: string[];
  excludes?: string[];
};

/**
 * Events delivered to watch subscribers. `reset` signals that the event
 * stream is no longer reliable and consumers must resync.
 * @public
 */
export type WatchEvent =
  | { type: 'change'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'rename'; oldPath: string; newPath: string }
  | { type: 'reset' };
