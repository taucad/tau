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
 * - `permission` — the workspace exists but its handle has been
 *   revoked. The user can recover with a single-gesture re-grant.
 * - `unsupported` — the browser doesn't expose the File System Access
 *   API (Safari, Firefox without the flag). The user must switch to a
 *   different backend (indexeddb / opfs).
 */
export type WorkspaceDirectoryRequiredCode = 'missing' | 'permission' | 'unsupported';

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
   * Optional workspace id whose handle is the offender. Set on
   * `'permission'` (we know which workspace lost access) and `undefined`
   * on `'missing'` / `'unsupported'`.
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
      return 'A workspace directory is required to use the File System backend.';
    }
    case 'permission': {
      return 'Workspace permission was revoked. Re-grant access to continue.';
    }
    case 'unsupported': {
      return 'This browser does not support the File System Access API.';
    }
  }
}

/** Type guard used by toast handlers + recovery overlays. */
export function isWorkspaceDirectoryRequiredError(error: unknown): error is WorkspaceDirectoryRequiredError {
  return error instanceof WorkspaceDirectoryRequiredError;
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
 * union. Keep in lockstep with `packages/filesystem/src/workspace-errors.ts`.
 * Surfaced via {@link workspaceMutationErrorCopy} so toast/banner UIs
 * never re-parse `error.message`.
 */
export type WorkspaceMutationErrorCode =
  | 'NAME_EXISTS'
  | 'INVALID_NAME'
  | 'READ_ONLY_MOUNT'
  | 'BUNDLED_TYPES_WORKSPACE'
  | 'MISSING_WORKSPACE_HANDLE'
  | 'NOT_FOUND';

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
