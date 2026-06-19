import type { FileContentMetadata } from '@taucad/types';

/**
 * Typed directory listing surface for {@link FileTreeService.listDirectory}.
 *
 * @public
 */
export type ListedDirectoryEntry =
  | {
      name: string;
      path: string;
      isFolder: true;
      /** Directories use `0` when unknown. */
      size: number;
      /** Last-modified timestamp in milliseconds since the Unix epoch. */
      mtimeMs: number;
    }
  | ({
      name: string;
      path: string;
      isFolder: false;
      /** File size in bytes. */
      size: number;
      /** Last-modified timestamp in milliseconds since the Unix epoch. */
      mtimeMs: number;
    } & FileContentMetadata);

/**
 * Discriminated snapshot for reactive directory listing consumers (see {@link useDirectoryListing}).
 *
 * @public
 */
export type DirectoryListing =
  | { kind: 'unready' }
  | { kind: 'loading'; path: string }
  | { kind: 'ready'; path: string; entries: readonly ListedDirectoryEntry[] }
  | { kind: 'error'; path: string; cause: DirectoryListingError };

/**
 * Operation-level error for directory listing (mirrors a coarse VSCode-style ladder).
 *
 * @public
 */
export type DirectoryListingError = {
  code: DirectoryListingErrorCode;
  message: string;
  path: string;
  original?: unknown;
};

/* eslint-disable @typescript-eslint/naming-convention -- Directory listing uses PascalCase string codes aligned with worker errors */
/**
 * Canonical string codes for {@link DirectoryListingError} discrimination.
 *
 * @public
 */
export const DirectoryListingErrorCode = {
  NotFound: 'NotFound',
  NotADirectory: 'NotADirectory',
  PermissionDenied: 'PermissionDenied',
  Aborted: 'Aborted',
  Unavailable: 'Unavailable',
  Unknown: 'Unknown',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- resume default naming for the rest of the module */

/**
 * Union of known listing error codes.
 *
 * @public
 */
export type DirectoryListingErrorCode = (typeof DirectoryListingErrorCode)[keyof typeof DirectoryListingErrorCode];

/**
 * Carrier error when listing fails at the transport or policy layer.
 *
 * @public
 */
export class DirectoryListingFailedError extends Error {
  public readonly listing: DirectoryListingError;

  public constructor(listing: DirectoryListingError) {
    super(listing.message);
    this.name = 'DirectoryListingFailedError';
    this.listing = listing;
  }
}

/**
 * Classify a thrown value from `readDirectory` / transport into a
 * {@link DirectoryListingError}.
 *
 * @param cause - Thrown value or rejection reason from the worker / path layer.
 * @param path - Workspace-relative directory path being listed.
 * @returns Normalized {@link DirectoryListingError} for UI and error boundaries.
 * @public
 */
export function classifyDirectoryListingError(cause: unknown, path: string): DirectoryListingError {
  if (typeof cause === 'object' && cause !== null && 'listing' in cause) {
    const failed = cause as DirectoryListingFailedError;
    if (failed instanceof DirectoryListingFailedError) {
      return failed.listing;
    }
  }
  if (cause instanceof Error && cause.name === 'WorkspacePathEscapeError') {
    return {
      code: DirectoryListingErrorCode.Unknown,
      message: cause.message,
      path,
      original: cause,
    };
  }
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return { code: DirectoryListingErrorCode.Aborted, message: cause.message, path, original: cause };
  }
  if (cause instanceof Error && cause.name === 'AbortError') {
    return { code: DirectoryListingErrorCode.Aborted, message: cause.message, path, original: cause };
  }
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    const { code } = cause as { code?: string };
    if (code === 'ENOENT') {
      return { code: DirectoryListingErrorCode.NotFound, message: 'Path not found', path, original: cause };
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        code: DirectoryListingErrorCode.PermissionDenied,
        message: 'Permission denied',
        path,
        original: cause,
      };
    }
    if (code === 'ENOTDIR') {
      return {
        code: DirectoryListingErrorCode.NotADirectory,
        message: 'Not a directory',
        path,
        original: cause,
      };
    }
  }
  if (cause instanceof Error) {
    return { code: DirectoryListingErrorCode.Unknown, message: cause.message, path, original: cause };
  }
  return { code: DirectoryListingErrorCode.Unknown, message: String(cause), path, original: cause };
}
