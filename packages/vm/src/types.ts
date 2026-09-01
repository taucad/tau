/**
 * Shared types for the Tau module VM substrate.
 */

/**
 * A diagnostic emitted while bundling or executing a VM module.
 *
 * @public
 */
export type VmIssue = {
  /** Human-readable diagnostic message. */
  message: string;
  /** Stable machine-readable code. */
  code: string;
  /** Diagnostic category. */
  type: string;
  /** Diagnostic severity. */
  severity: 'error' | 'warning' | 'info';
  /** Optional source location. */
  location?: {
    fileName?: string;
    startLineNumber?: number;
    startColumn?: number;
    endLineNumber?: number;
    endColumn?: number;
  };
  /** Optional original error object or metadata. */
  details?: unknown;
};

/**
 * Minimal filesystem contract required by the VM bundler.
 *
 * @public
 */
export type VmFileSystem = {
  /** Return true when a path exists. */
  exists(path: string): Promise<boolean>;
  /** Read a file as binary bytes. */
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Read a file as UTF-8 text. */
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  /** Write a UTF-8 text file. */
  writeFile(path: string, content: string): Promise<void>;
  /** Ensure a directory exists, creating parents as needed. */
  ensureDir(path: string): Promise<void>;
};

/**
 * Result of executing bundled ESM code.
 *
 * @public
 */
export type VmExecuteResult<T = unknown> =
  | { success: true; value: T; entryUrl?: string }
  | { success: false; issues: VmIssue[] };
