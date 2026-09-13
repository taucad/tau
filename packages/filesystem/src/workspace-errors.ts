/**
 * Structured workspace-identity errors raised by {@link ProviderRegistry}
 * and {@link WorkspaceFileService}.
 *
 * These errors replace string-matched `Error` shapes (e.g. legacy
 * `'No directory handle set...'`) so UI-side recovery surfaces can switch
 * on `error.code` instead of parsing messages. Mirrors the UI-side
 * `WorkspaceDirectoryRequiredError` shape (`apps/ui/app/filesystem/workspace-errors.ts`)
 * so worker-thrown errors can be mapped one-to-one at the bridge boundary.
 *
 * @public
 */

/**
 * Thrown when a `webaccess` operation is attempted without a usable
 * `{ directoryHandle, workspaceId }` pair. The discriminated
 * {@link MountConfig} / {@link WorkspaceScope} unions make this a
 * compile-time error in well-typed call sites; the runtime exception
 * defends against unsafe callers (raw RPC clients, tests).
 *
 * @public
 */
export class MissingWorkspaceHandleError extends Error {
  /**
   * Discriminator that lets callers branch without `instanceof`.
   *
   * @returns The literal `'missing-workspace-handle'`.
   */
  public get code(): 'missing-workspace-handle' {
    return 'missing-workspace-handle';
  }
  public readonly workspaceId: string | undefined;

  public constructor(options?: { workspaceId?: string; cause?: unknown }) {
    super('Webaccess operation requires an explicit { directoryHandle, workspaceId } scope.');
    this.name = 'MissingWorkspaceHandleError';
    this.workspaceId = options?.workspaceId;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Type guard for {@link MissingWorkspaceHandleError}.
 *
 * @param error - Value to test.
 * @returns `true` if `error` is an instance of {@link MissingWorkspaceHandleError}.
 * @public
 */
export function isMissingWorkspaceHandleError(error: unknown): error is MissingWorkspaceHandleError {
  return error instanceof MissingWorkspaceHandleError;
}

/**
 * Discriminated typed-error code returned by the preflight
 * `canMove` / `canRename` / `canCreate` / `canDelete` family on
 * {@link WorkspaceFileService}. The UI surfaces these via a copy
 * registry rather than parsing message strings — see
 * `apps/ui/app/filesystem/workspace-errors.ts:workspaceErrorCopy`.
 *
 * - `NAME_EXISTS` — destination path already occupied; the caller
 *   should ask the user to confirm overwrite (R8 dialog flow) or
 *   choose a different name.
 * - `INVALID_NAME` — path is syntactically invalid (empty segment,
 *   reserved characters, contains `..`, etc.).
 * - `READ_ONLY_MOUNT` — the resolved mount is read-only (e.g. a
 *   future remote-source mount). All mutation primitives MUST
 *   reject before touching the provider.
 * - `BUNDLED_TYPES_WORKSPACE` — attempt to mutate inside the
 *   bundled `@types/` workspace, which is read-only by contract.
 * - `MISSING_WORKSPACE_HANDLE` — webaccess scope required but no
 *   `{ directoryHandle, workspaceId }` is available; mirrors
 *   {@link MissingWorkspaceHandleError}.
 * - `NOT_FOUND` — source path does not exist (a `canMove` /
 *   `canDelete` against a path the user just lost in a race).
 *
 * @public
 */
export type WorkspaceMutationErrorCode =
  | 'NAME_EXISTS'
  | 'INVALID_NAME'
  | 'READ_ONLY_MOUNT'
  | 'BUNDLED_TYPES_WORKSPACE'
  | 'MISSING_WORKSPACE_HANDLE'
  | 'NOT_FOUND';

/**
 * Structured error returned by the `can*` preflight family. Pairs the
 * machine-readable `code` discriminator with a `path` (and `target`
 * for two-path operations like `move`) so UI surfaces can stitch
 * copy + recovery affordances without re-parsing message strings.
 *
 * Designed to be **structured-cloneable** so the error can cross the
 * worker boundary (Comlink) without losing its `code` / `path`
 * discriminators. Internal flag `__workspaceMutationError__` lets the
 * cross-thread type-guard recognise re-hydrated instances.
 *
 * @public
 */
export class WorkspaceMutationError extends Error {
  public readonly code: WorkspaceMutationErrorCode;
  public readonly path: string;
  public readonly target?: string;
  /* oxlint-disable typescript-eslint/class-literal-property-style -- must be an own property so structured-clone preserves it across the worker boundary; a getter would be stripped. */
  /* eslint-disable @typescript-eslint/naming-convention -- VS Code-style double-underscore sentinel; strict camelCase would alias to a user-data property name. */
  public readonly __workspaceMutationError__: true = true;
  /* eslint-enable @typescript-eslint/naming-convention -- restore default naming rule for the rest of the file. */
  /* oxlint-enable typescript-eslint/class-literal-property-style -- restore default literal-property-style rule for the rest of the file. */

  public constructor(code: WorkspaceMutationErrorCode, path: string, options?: { target?: string; cause?: unknown }) {
    super(messageForCode(code, path, options?.target));
    this.name = 'WorkspaceMutationError';
    this.code = code;
    this.path = path;
    if (options?.target !== undefined) {
      this.target = options.target;
    }
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function messageForCode(code: WorkspaceMutationErrorCode, path: string, target: string | undefined): string {
  switch (code) {
    case 'NAME_EXISTS': {
      return target === undefined
        ? `A file or folder already exists at '${path}'.`
        : `A file or folder already exists at '${target}'.`;
    }
    case 'INVALID_NAME': {
      return `'${path}' is not a valid workspace path.`;
    }
    case 'READ_ONLY_MOUNT': {
      return `'${path}' is on a read-only mount.`;
    }
    case 'BUNDLED_TYPES_WORKSPACE': {
      return `'${path}' is inside the bundled @types workspace, which is read-only.`;
    }
    case 'MISSING_WORKSPACE_HANDLE': {
      return `'${path}' requires a webaccess workspace which is not connected.`;
    }
    case 'NOT_FOUND': {
      return `'${path}' does not exist.`;
    }
  }
}

/**
 * Type guard for {@link WorkspaceMutationError}. Works both for live
 * instances on the same realm and for structured-clone copies that
 * have crossed the worker boundary (matched on the
 * `__workspaceMutationError__` marker + `code` shape).
 *
 * @public
 */
export function isWorkspaceMutationError(error: unknown): error is WorkspaceMutationError {
  if (error instanceof WorkspaceMutationError) {
    return true;
  }
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { __workspaceMutationError__?: unknown; code?: unknown };
  return record.__workspaceMutationError__ === true && typeof record.code === 'string';
}
