import { isBundledTypesWorkspacePath } from '#lib/bundled-types-tree.constants.js';

export type FileTreeDownloadPolicy =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: 'dependency-read-only';
      readonly message: string;
    };

export type FileTreeDownloadErrorCode =
  | 'path-not-found'
  | 'permission-read-only'
  | 'zip-generation-failed'
  | 'browser-download-failed'
  | 'user-cancelled';

export class FileTreeDownloadError extends Error {
  public readonly code: FileTreeDownloadErrorCode;
  public readonly path: string;

  public constructor(options: {
    readonly code: FileTreeDownloadErrorCode;
    readonly path: string;
    readonly message: string;
    readonly cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'FileTreeDownloadError';
    this.code = options.code;
    this.path = options.path;
  }
}

export function getFileTreeDownloadPolicy(path: string): FileTreeDownloadPolicy {
  if (isBundledTypesWorkspacePath(path)) {
    return {
      allowed: false,
      code: 'dependency-read-only',
      message: 'Read-only dependency paths cannot be downloaded.',
    };
  }

  return { allowed: true };
}

export function createFileTreeDownloadError(options: {
  readonly code: FileTreeDownloadErrorCode;
  readonly path: string;
  readonly cause?: unknown;
}): FileTreeDownloadError {
  return new FileTreeDownloadError({
    code: options.code,
    path: options.path,
    cause: options.cause,
    message: getDownloadErrorMessage(options.code, options.path, options.cause),
  });
}

export function getFileTreeDownloadErrorMessage(error: unknown): string {
  if (error instanceof FileTreeDownloadError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

function getDownloadErrorMessage(code: FileTreeDownloadErrorCode, path: string, cause: unknown): string {
  switch (code) {
    case 'path-not-found': {
      return `'${path}' was not found.`;
    }
    case 'permission-read-only': {
      return 'Read-only dependency paths cannot be downloaded.';
    }
    case 'zip-generation-failed': {
      return `Failed to create ZIP for '${path}': ${formatCause(cause)}`;
    }
    case 'browser-download-failed': {
      return `Browser download failed for '${path}': ${formatCause(cause)}`;
    }
    case 'user-cancelled': {
      return `Download cancelled for '${path}'.`;
    }
  }
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
