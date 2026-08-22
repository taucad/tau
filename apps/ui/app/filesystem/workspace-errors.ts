/**
 * Structured filesystem-workspace errors.
 *
 * These are thrown by call sites that require an actionable user
 * response (e.g. project creation aborted because the workspace isn't
 * connected). Callers surface them as toast / banner copy keyed on
 * `error.code` rather than parsing message strings, so future copy
 * changes don't ripple through the call graph.
 *
 * @see `docs/research/filesystem-access-api-cohesion-audit.md` R2 / R3
 *      for the rationale (no more silent fallbacks to `indexeddb`).
 */

/**
 * Why a webaccess workspace-directory binding is required but cannot be
 * resolved. Drives the recovery copy in `WorkspaceDirectoryPanel` and
 * the toast handlers in `/projects/new` + project creation flows.
 *
 * - `missing` — no workspace has been connected at all. The user must
 *   pick a directory (showDirectoryPicker) before retrying.
 * - `disconnected` — workspaces exist but none of them still holds a
 *   directory handle (evicted or forgotten handle rows). Re-picking the
 *   folder restores the binding; telling the user they have no workspace
 *   would be false (DF4).
 * - `permission` — the workspace exists but its handle has been
 *   revoked. The user can recover with a single-gesture re-grant.
 * - `unsupported` — this browser boot cannot connect folders; Home remains
 *   available for ordinary creation.
 */
export type WorkspaceDirectoryRequiredCode = 'missing' | 'disconnected' | 'permission' | 'unsupported';

/**
 * Thrown when an operation requires a webaccess workspace but no usable
 * binding is available. Replaces the legacy silent-fallback-to-indexeddb
 * pattern (Finding 1 of the audit) so callers can present an actionable
 * recovery prompt rather than ending up with a project on a backend the
 * user didn't choose.
 */
export class WorkspaceDirectoryRequiredError extends Error {
  /**
   * Stable discriminator. UI surfaces switch on this rather than parsing
   * `.message`.
   */
  public readonly code: WorkspaceDirectoryRequiredCode;
  /**
   * Exact workspace id when the failed request named one, including missing,
   * disconnected, permission, and unsupported failures.
   */
  public readonly workspaceId: string | undefined;

  public constructor(code: WorkspaceDirectoryRequiredCode, options?: { workspaceId?: string; cause?: unknown }) {
    super(messageFor(code));
    this.name = 'WorkspaceDirectoryRequiredError';
    this.code = code;
    this.workspaceId = options?.workspaceId;
    if (options?.cause !== undefined) {
      // Preserve cause chain for diagnostics. Node + browsers honour the
      // `cause` option on Error since ES2022.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function messageFor(code: WorkspaceDirectoryRequiredCode): string {
  switch (code) {
    case 'missing': {
      return 'This project location is no longer connected.';
    }
    case 'disconnected': {
      return 'This project location is no longer connected.';
    }
    case 'permission': {
      return 'Access to this folder is required before continuing.';
    }
    case 'unsupported': {
      return 'Home is the only project location available in this browser.';
    }
  }
}

/** Type guard used by toast handlers + recovery overlays. */
export function isWorkspaceDirectoryRequiredError(error: unknown): error is WorkspaceDirectoryRequiredError {
  return error instanceof WorkspaceDirectoryRequiredError;
}

/**
 * Thrown when a durable write fails because the origin is out of quota.
 * Distinguishes "the browser refused to store this" from generic IndexedDB
 * failures so the UI can point at storage pressure instead of a stack trace.
 *
 * @see `docs/research/offline-first-storage-durability-blueprint.md` R6
 */
export class StorageQuotaExceededError extends Error {
  public constructor(options?: { cause?: unknown }) {
    super('Browser storage is full. Free up space or remove unused projects to continue.');
    this.name = 'StorageQuotaExceededError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Map a rejected durable write to {@link StorageQuotaExceededError} when the
 * browser reported a quota failure; every other error passes through unchanged.
 */
export function toStorageWriteError(error: unknown): unknown {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
    ? new StorageQuotaExceededError({ cause: error })
    : error;
}

/**
 * Why the file manager couldn't be brought online before a timeout
 * elapsed. Drives the recovery surface used by `getReadiedProxy` and
 * `whenServicesReady` (Audit R10, Finding 8) — replaces the silent
 * forever-hang that occurred when the FM machine got stuck in
 * `connectingWorker` / `initializingServices`.
 */
export type FileManagerNotReadyReason = 'proxy-timeout' | 'services-timeout' | 'machine-error';

/**
 * Thrown when the FM hook's wait helpers exceed their timeout. The
 * `code` discriminator distinguishes "worker bridge never connected"
 * from "services never finished mounting" so the UI can surface
 * targeted copy.
 */
export class FileManagerNotReadyError extends Error {
  public readonly code: FileManagerNotReadyReason;

  public constructor(code: FileManagerNotReadyReason, options?: { cause?: unknown }) {
    super(messageForReason(code));
    this.name = 'FileManagerNotReadyError';
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function messageForReason(reason: FileManagerNotReadyReason): string {
  switch (reason) {
    case 'proxy-timeout': {
      return 'File manager worker did not become ready in time.';
    }
    case 'services-timeout': {
      return 'File manager services did not finish initialising in time.';
    }
    case 'machine-error': {
      return 'File manager entered an error state before becoming ready.';
    }
  }
}

/** Type guard for {@link FileManagerNotReadyError}. */
export function isFileManagerNotReadyError(error: unknown): error is FileManagerNotReadyError {
  return error instanceof FileManagerNotReadyError;
}

/**
 * Mirror of the worker-side `WorkspaceMutationErrorCode` discriminated
 * union. Keep in lockstep with `libs/filesystem/src/workspace-errors.ts`.
 * Surfaced via {@link workspaceMutationErrorCopy} so toast/banner UIs
 * never re-parse `error.message`.
 */
export type WorkspaceMutationErrorCode =
  | 'NAME_EXISTS'
  | 'INVALID_NAME'
  | 'READ_ONLY_MOUNT'
  | 'BUNDLED_TYPES_WORKSPACE'
  | 'MISSING_WORKSPACE_HANDLE'
  | 'NOT_FOUND'
  | 'OPERATION_FAILED';

/**
 * Copy registry for the worker-side mutation-error codes. Used by
 * `chat-editor-file-tree.tsx` to surface a toast on every failed
 * preflight (`canMove` / `canRename` / `canCreate` / `canDelete`).
 *
 * The format function takes the offending path so messages stay
 * actionable when more than one item is on screen (e.g. a multi-drag
 * collision can name the specific item that already exists).
 */
/* eslint-disable @typescript-eslint/naming-convention -- keys mirror the worker-side `WorkspaceMutationErrorCode` discriminator; renaming to strict camelCase would force a translation layer on every consumer for no UX benefit. */
export const workspaceMutationErrorCopy: Record<
  WorkspaceMutationErrorCode,
  (params: { path: string; target?: string }) => string
> = {
  NAME_EXISTS: ({ path, target }) => {
    const display = target ?? path;
    return `A file or folder already exists at '${display}'.`;
  },
  INVALID_NAME: ({ path }) => `'${path}' is not a valid name. Avoid '/', '\\', and reserved segments like '.' or '..'.`,
  READ_ONLY_MOUNT: ({ path }) => `'${path}' is on a read-only mount and cannot be modified.`,
  BUNDLED_TYPES_WORKSPACE: ({ path }) => `'${path}' is inside the bundled @types workspace, which is read-only.`,
  MISSING_WORKSPACE_HANDLE: () => 'Connect a workspace folder before changing files.',
  NOT_FOUND: ({ path }) => `'${path}' no longer exists.`,
  OPERATION_FAILED: ({ path }) => `The filesystem operation for '${path}' failed.`,
};
/* eslint-enable @typescript-eslint/naming-convention -- restore default naming rule for the rest of the file. */

/**
 * Shape the cross-thread structured-clone copy of `WorkspaceMutationError`
 * resolves to on the main thread. Recognised by
 * {@link isWorkspaceMutationErrorLike}.
 */
export type WorkspaceMutationErrorLike = Readonly<{
  __workspaceMutationError__: true;
  code: WorkspaceMutationErrorCode;
  path: string;
  target?: string;
  message?: string;
}>;

/**
 * Type guard for cross-thread `WorkspaceMutationError` clones. The
 * structured clone strips the prototype but preserves own properties,
 * so we match on the `__workspaceMutationError__` marker + `code`.
 *
 * @param error - Value to test.
 * @returns `true` when `error` carries a workspace-mutation discriminator.
 */
export function isWorkspaceMutationErrorLike(error: unknown): error is WorkspaceMutationErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { __workspaceMutationError__?: unknown; code?: unknown };
  return record.__workspaceMutationError__ === true && typeof record.code === 'string';
}
