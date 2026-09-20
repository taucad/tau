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

import type {
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileContentMetadata,
  FileProvenance,
  FileStat,
} from '@taucad/types';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- re-export for internal consumers that import from #types.js
export type { ChangeEvent, FileStat, FileStatEntry } from '@taucad/types';

/** Rule 16's four storage classes. @public */
export type PathClass = 'authored' | 'records' | 'cache' | 'control-plane';

/** What a composed view lets an agent do with a path. @public */
export type PathAgentAccess = 'read-write' | 'read-only' | 'hidden';

/** Which watch plane observes a path. @public */
export type PathWatchPlane = 'ui' | 'kernel' | 'none';

/** Everything a path policy answers about one path. @public */
export type PathClassification = Readonly<{
  class: PathClass;
  /** Whether the bytes enter a revision. */
  versioned: boolean;
  agentAccess: PathAgentAccess;
  watch: PathWatchPlane;
}>;

/**
 * The classifier a composed view is given, never the one it imports (D6).
 *
 * The mask is the mechanism and the project's reserved layout is data, so the
 * classification types live here while the table that answers them is the
 * registry subpath's. Tau's own instance is `tauPathPolicy`; a test or a future
 * layout passes its own.
 *
 * @public
 */
export type PathPolicy = {
  readonly classify: (path: string) => PathClassification;
};

/**
 * Git mode supported for a regular file a provider reports and sets.
 *
 * Owned here, not by the revision algorithms that also speak it (D9/W8): the
 * executable bit is a property of a file on a backend, and `getFileMode` is the
 * only way one is read.
 *
 * @public
 */
export type FileMode = '100644' | '100755';

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
  /**
   * Whether concurrent writes are coalesced into the backend's own batched
   * commit. A provider that declares it costs no extra handle per write in
   * flight, so a bulk batch may hand it every file at once (Rule 34); one that
   * does not receives them one at a time.
   */
  readonly coalescesWrites?: boolean;
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
 * One normalised external-change fact: what a backend that observes its own root
 * reports to the authority, in the authority's vocabulary rather than its own
 * (charter D13). Paths are provider-relative, as every other port path is.
 *
 * `reset` carries no path: the observer lost track of this root, so every
 * derivative of it is now untrustworthy. `unknown` names a path whose change the
 * observer could not describe, and the authority reconciles that subtree.
 *
 * @public
 */
export type ExternalChangeFact =
  | {
      readonly kind: 'created' | 'modified' | 'deleted' | 'moved' | 'unknown';
      readonly path: string;
      /** Entry kind, when the observer reported one. */
      readonly entry?: 'file' | 'dir';
      /** Previous path of a `moved` entry, when the observer reported one. */
      readonly from?: string;
    }
  | { readonly kind: 'reset' };

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
  /** Atomically check current bytes and replace one file when this provider owns a real authority fence. */
  writeFileChecked?(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult>;
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
  /** Read a regular file's Git-compatible executable mode when the backend exposes it. */
  getFileMode?(path: string): Promise<FileMode>;
  /** Apply a Git-compatible regular-file mode without exposing an unrestricted chmod seam. */
  setFileMode?(path: string, mode: FileMode): Promise<void>;
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
  /**
   * Report this root's own external changes. Declared only by a backend that can
   * observe itself; the authority falls back to bounded snapshot polling for one
   * that cannot, so capability presence — never backend identity — decides how a
   * root is watched (charter D13).
   *
   * Resolves with a disposer, or with `undefined` when observation exists in
   * principle but could not be armed here and polling must cover the root. A
   * rejection means the root has no fallback and its derivatives are stale.
   */
  observe?(listener: (facts: readonly ExternalChangeFact[]) => void): Promise<(() => void) | undefined>;
};

/**
 * Options for a directory creation.
 * @public
 */
export type MkdirOptions = {
  recursive?: boolean;
};

/**
 * Optional metadata for workspace mutations initiated from a specific client
 * (e.g. a filesystem bridge port). Observer and direct UI paths omit this.
 *
 * @public
 */
export type WorkspaceMutationContext = {
  originClientId?: string;
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
      /** What a composed view says about this entry; absent on a raw authority listing. */
      provenance?: FileProvenance;
    }
  | ({
      id: string;
      name: string;
      /** File byte length. */
      size: number;
      /** Milliseconds since Unix epoch (provider stat). */
      mtimeMs: number;
      children?: never;
      /** What a composed view says about this entry; absent on a raw authority listing. */
      provenance?: FileProvenance;
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
