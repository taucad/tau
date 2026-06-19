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

import type { FileContentMetadata, FileStat, FileStatEntry } from '@taucad/types';

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
  /** Whether the backend treats paths as case-sensitive. Defaults to `true`. */
  readonly caseSensitive?: boolean;
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
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
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
 * Filter mask for watch event types. When a field is `true`, events of that
 * type are delivered. When omitted or `undefined`, the type is included.
 * @public
 */
export type WatchEventFilter = {
  added?: boolean;
  updated?: boolean;
  deleted?: boolean;
  renamed?: boolean;
};

/**
 * Describes a filesystem watch subscription.
 *
 * - `paths`: absolute normalized watch roots
 * - `recursive`: watch subdirectories (default `false`)
 * - `includes`/`excludes`: glob patterns for path filtering
 * - `filter`: event type mask
 * - `correlationId`: echoed in outgoing events for client-side routing
 * @public
 */
export type WatchRequest = {
  paths: string[];
  recursive?: boolean;
  includes?: string[];
  excludes?: string[];
  filter?: WatchEventFilter;
  correlationId?: string;
};

/**
 * Events delivered to watch subscribers. `reset` and `overflow` signal that
 * the event stream is no longer reliable and consumers must resync.
 * @public
 */
export type WatchEvent =
  | { type: 'change'; path: string; correlationId?: string }
  | { type: 'delete'; path: string; correlationId?: string }
  | { type: 'rename'; oldPath: string; newPath: string; correlationId?: string }
  | { type: 'reset'; correlationId?: string }
  | { type: 'overflow'; correlationId?: string };

// =============================================================================
// Runtime kernel facade types
// =============================================================================

/**
 * In-memory cache for file content bytes consulted by {@link FileSystemService}
 * before delegating reads to the underlying provider. Implementations include
 * an LRU heap-backed cache and a `SharedArrayBuffer` pool for cross-thread
 * sharing.
 * @public
 */
export type FileContentCache = {
  /** Return cached bytes for `path`, or `undefined` for cache miss. */
  get(path: string): Uint8Array<ArrayBuffer> | undefined;
  /** Store bytes for `path`, evicting older entries per implementation policy. */
  put(path: string, bytes: Uint8Array<ArrayBuffer>): void;
  /** Drop the entry for `path` so the next read re-fetches from the provider. */
  invalidate(path: string): void;
  /** Drop every entry. */
  invalidateAll(): void;
  /**
   * Subscribe to invalidation notifications. The returned disposable detaches
   * the handler. Implementations that share state across threads (e.g. shared
   * pool cache) emit synthetic invalidations on remote writes.
   */
  on(event: 'invalidate', handler: (path: string) => void): { dispose: () => void };
};

/**
 * Kernel-side filesystem facade. Aliases {@link FileSystemProvider} with a
 * `watch` subscription and four convenience helpers that the kernel runtime
 * uses for batched I/O. Authored backends never implement these helpers
 * directly — they are decorated onto the provider primitives by
 * `createRuntimeFileSystem`.
 * @public
 */
export type RuntimeFileSystem = FileSystemProvider & {
  /** Subscribe to filesystem change events scoped by the request. */
  watch(request: WatchRequest, handler: (event: WatchEvent) => void): { dispose: () => void };
  /** Read multiple files in a single call; result keyed by path. */
  readFiles(paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /** Read every file in a directory (skips subdirectories); result keyed by short name. */
  readdirContents(directoryPath: string): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /** List a directory and return path-stamped stats. */
  readdirStat(directoryPath: string): Promise<FileStatEntry[]>;
  /** Create `path` (recursive) and silently succeed if it already exists. */
  ensureDir(path: string): Promise<void>;
};
