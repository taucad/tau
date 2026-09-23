import { archiveByteCeiling, archiveTooLargeCode } from '@taucad/filesystem/content-ops';
import type { FileProvenance, FileProvenanceSource } from '@taucad/types';
import { formatBytes } from '#lib/format-bytes.js';

export type FileTreeDownloadPolicy =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: 'not-project-content';
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

/** How the refusal names the source it refused; the row's own badge copy is the label catalog's. */
const sourceName: Record<Exclude<FileProvenanceSource, 'project'>, string> = {
  dependencies: 'Dependency',
  'system-skills': 'System skill',
};

/**
 * Whether a row may be downloaded.
 *
 * Anything a view composes above the checkout — a dependency mount's build
 * output, a bundled skill — is Tau's own bytes rather than the user's, so the
 * user's access is `source === 'project'` (ruling P10) and never the spelling.
 * Records rows the project owns stay downloadable.
 *
 * @param provenance - What the composed view (or the dependency mount) says about the row.
 * @returns Allowed, or the refusal with its user-facing message.
 */
export function getFileTreeDownloadPolicy(provenance: FileProvenance | undefined): FileTreeDownloadPolicy {
  if (provenance !== undefined && provenance.source !== 'project') {
    return {
      allowed: false,
      code: 'not-project-content',
      message: `${sourceName[provenance.source]} files are read-only and cannot be downloaded.`,
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

/**
 * The archive's own refusal, at whichever depth it arrives.
 *
 * It crosses the bridge wire as a bare `Error` carrying `code`, and a file-tree
 * download wraps that as the `cause` of a `zip-generation-failed`; both spell
 * the ceiling as a raw byte count, which is not a message for a person.
 */
const isArchiveTooLarge = (error: unknown): boolean =>
  error instanceof Error &&
  ((error as { code?: unknown }).code === archiveTooLargeCode || isArchiveTooLarge(error.cause));

const archiveTooLargeMessage = `This folder is larger than the ${formatBytes(archiveByteCeiling)} a ZIP download can hold. Download a smaller folder instead.`;

export function getFileTreeDownloadErrorMessage(error: unknown): string {
  if (isArchiveTooLarge(error)) {
    return archiveTooLargeMessage;
  }
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
