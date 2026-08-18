/**
 * Thrown by `FileContentService.resolveBytes` when the resolved content
 * sniffs as binary. Carries the path and observed file size so callers can
 * surface a meaningful error without re-resolving.
 *
 * @public
 */
export class BinaryFileError extends Error {
  public readonly path: string;
  public readonly size: number;

  /**
   * Creates an error for binary content sniff failures.
   * @param message - Human-readable error message.
   * @param init - Path and byte size observed at sniff time.
   */
  public constructor(message: string, init: { path: string; size: number }) {
    super(message);
    this.name = 'BinaryFileError';
    this.path = init.path;
    this.size = init.size;
  }
}

/**
 * Thrown by `FileContentService.resolveBytes` when the file size exceeds the
 * configured open-time limit. Distinct from `BoundedFileCache` rejection,
 * which is a cache-budget concern only.
 *
 * @public
 */
export class FileTooLargeError extends Error {
  public readonly path: string;
  public readonly size: number;
  public readonly limit: number;

  /**
   * Creates an error when a file exceeds the open-time byte limit.
   * @param message - Human-readable error message.
   * @param init - Path, size, and configured limit.
   */
  public constructor(message: string, init: { path: string; size: number; limit: number }) {
    super(message);
    this.name = 'FileTooLargeError';
    this.path = init.path;
    this.size = init.size;
    this.limit = init.limit;
  }
}

/**
 * Thrown by `FileContentService.resolveBytes` when the worker reports the
 * underlying file does not exist (ENOENT).
 *
 * @public
 */
export class FileNotFoundError extends Error {
  public readonly path: string;

  /**
   * Creates an error for missing files (typically ENOENT from the worker).
   * @param message - Human-readable error message.
   * @param init - Filesystem path that was not found.
   */
  public constructor(message: string, init: { path: string }) {
    super(message);
    this.name = 'FileNotFoundError';
    this.path = init.path;
  }
}
