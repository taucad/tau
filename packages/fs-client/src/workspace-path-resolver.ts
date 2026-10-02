import { joinPath, normalizePath } from '@taucad/utils/path';

/**
 * Thrown when an agent-supplied path would resolve outside the workspace root
 * after canonicalization (e.g. `/projects/other/...` when root is `/projects/abc`,
 * or relative segments with `..` that climb above the root).
 *
 * @public
 */
export class WorkspacePathEscapeError extends Error {
  public readonly input: string;
  public readonly root: string;

  /**
   * Captures escape metadata for debugging agent-supplied paths.
   * @param message - Human-readable explanation referencing the offending input.
   * @param init - Canonical input string and normalized workspace root for diagnostics.
   */
  public constructor(message: string, init: { input: string; root: string }) {
    super(message);
    this.name = 'WorkspacePathEscapeError';
    this.input = init.input;
    this.root = init.root;
  }
}

/**
 * Thrown by workspace-scoped facades (e.g. `FileContentService.write*` /
 * `delete` / `rename`) when a caller passes a key that resolves outside the
 * workspace root. The escape hatch for legitimate cross-workspace writes is
 * the worker-namespace `FileSystemClient.writeFiles` (no resolver), which is
 * what the project bootstrap mount-write-unmount transaction uses.
 *
 * Distinct from {@link WorkspacePathEscapeError} so subscribers can
 * differentiate "agent supplied a bad path" from "scoped service contract
 * violation".
 *
 * @public
 */
export class WorkspaceScopeViolationError extends Error {
  public readonly method: string;
  public readonly input: string;
  public readonly root: string;

  /**
   * Captures the scoped-facade method and offending key for diagnostics.
   * @param message - Human-readable explanation referencing the offending input.
   * @param init - Facade method name, canonical input string, and normalized workspace root.
   */
  public constructor(message: string, init: { method: string; input: string; root: string }) {
    super(message);
    this.name = 'WorkspaceScopeViolationError';
    this.method = init.method;
    this.input = init.input;
    this.root = init.root;
  }
}

/**
 * FM worker global OPFS mount for bundled kernel typings (`/node_modules/<pkg>/`).
 * Workspace-relative keys use the same `node_modules/...` prefix as the UI file tree.
 */
const bundledTypesWorkspaceRootSegment = 'node_modules';

function isWorkspaceRelativeGlobalNodeModules(relativePath: string): boolean {
  return (
    relativePath === bundledTypesWorkspaceRootSegment || relativePath.startsWith(`${bundledTypesWorkspaceRootSegment}/`)
  );
}

function isAbsoluteGlobalNodeModules(absoluteNorm: string): boolean {
  return (
    absoluteNorm === `/${bundledTypesWorkspaceRootSegment}` ||
    absoluteNorm.startsWith(`/${bundledTypesWorkspaceRootSegment}/`)
  );
}

function resolvePathSegmentsUnderRoot(rootNorm: string, relativeSegments: string[], originalInput: string): string {
  const rootSegments = rootNorm.split('/').filter((segment) => segment.length > 0);
  const stack = [...rootSegments];

  for (const segment of relativeSegments) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (stack.length <= rootSegments.length) {
        throw new WorkspacePathEscapeError(
          `Path escapes workspace: segment ".." in "${originalInput}" resolves above root "${rootNorm}"`,
          { input: originalInput, root: rootNorm },
        );
      }

      stack.pop();
    } else {
      stack.push(segment);
    }
  }

  return `/${stack.join('/')}`;
}

/**
 * Projects absolute filesystem paths from the worker into workspace-relative
 * paths for UI facades.
 *
 * @public
 * @example <caption>Resolve an absolute path to a project-relative path</caption>
 * ```typescript
 * import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
 * export function exampleRelativePath(): string | undefined {
 *   const paths = new WorkspacePathResolver('/project');
 *   return paths.toRelativePath('/project/src/a.ts');
 * }
 * ```
 */
export class WorkspacePathResolver {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids constructor parameter properties
  private rootDirectory: string;

  public constructor(rootDirectory: string) {
    this.rootDirectory = rootDirectory;
  }

  /**
   * Absolute filesystem root configured for this resolver.
   * @returns Normalized workspace mount path.
   */
  public get root(): string {
    return this.rootDirectory;
  }

  /**
   * Normalized prefix for `startsWith` checks (`root` plus exactly one `/`).
   * @returns Absolute root prefix ending with exactly one `/`, or the root when it already ends with `/`.
   */
  public get rootPrefix(): string {
    return this.rootDirectory.endsWith('/') ? this.rootDirectory : `${this.rootDirectory}/`;
  }

  /**
   * Convert an absolute on-disk path to a project-relative path, or `undefined`
   * when the path is outside this workspace.
   * @param absolutePath - Host absolute path emitted by the worker.
   * @returns Project-relative path segments, `''` at workspace root, or `undefined` if outside the root.
   */
  public toRelativePath(absolutePath: string): string | undefined {
    const rootNorm = normalizePath(this.rootDirectory);
    const absNorm = normalizePath(absolutePath);
    if (isAbsoluteGlobalNodeModules(absNorm)) {
      return absNorm === `/${bundledTypesWorkspaceRootSegment}` ? bundledTypesWorkspaceRootSegment : absNorm.slice(1);
    }
    if (absNorm === rootNorm) {
      return '';
    }
    const prefix = `${rootNorm}/`;
    if (!absNorm.startsWith(prefix)) {
      return undefined;
    }
    return absNorm.slice(prefix.length);
  }

  /**
   * Join a workspace-relative segment onto the configured root without additional escaping checks.
   * @param relativePath - Path relative to {@link WorkspacePathResolver.root}.
   * @returns Joined absolute path under the configured workspace root.
   */
  public toAbsolutePath(relativePath: string): string {
    if (isWorkspaceRelativeGlobalNodeModules(relativePath)) {
      return normalizePath(`/${relativePath}`);
    }
    return joinPath(this.rootDirectory, relativePath);
  }

  /**
   * Canonical absolute path under this workspace for tool/agent inputs.
   * Treats `''`, `'.'`, `'./'`, `'/'` and the workspace root path as the root.
   * A single leading-slash segment (e.g. `'/src'`) is workspace-root-relative
   * (not host `joinPath` absolute reset). Multi-segment absolute paths outside
   * the workspace throw {@link WorkspacePathEscapeError}.
   *
   * @param input - Raw path from an agent or UI (often not normalized).
   * @returns Normalized absolute path under the workspace.
   * @throws {WorkspacePathEscapeError} When the path escapes the workspace.
   * @public
   */
  public toAbsoluteWorkspacePath(input: string): string {
    const rootNorm = normalizePath(this.rootDirectory);
    const trimmed = input.trim();

    if (trimmed === '' || trimmed === '.' || trimmed === '/' || trimmed === './') {
      return rootNorm;
    }

    // Paths without a leading `/` are workspace-relative. Do not run them through
    // `normalizePath` first: it prepends `/`, which would send `.tau/cache` and
    // `src/a.ts` through the "absolute path" branch and incorrectly throw.
    if (!trimmed.startsWith('/')) {
      let trimmedRelative = trimmed;
      while (trimmedRelative.startsWith('./')) {
        trimmedRelative = trimmedRelative.slice(2);
      }

      if (trimmedRelative === '' || trimmedRelative === '.') {
        return rootNorm;
      }

      if (isWorkspaceRelativeGlobalNodeModules(trimmedRelative)) {
        return normalizePath(`/${trimmedRelative}`);
      }

      const segments = trimmedRelative.split('/').filter((s) => s.length > 0 && s !== '.');
      return resolvePathSegmentsUnderRoot(rootNorm, segments, input);
    }

    const absNormalized = normalizePath(trimmed);
    if (isAbsoluteGlobalNodeModules(absNormalized)) {
      return absNormalized;
    }
    if (absNormalized === rootNorm || absNormalized.startsWith(`${rootNorm}/`)) {
      return absNormalized;
    }

    if (absNormalized.startsWith('/')) {
      const withoutLeadingSlash = absNormalized.slice(1);
      const topLevelSegments = withoutLeadingSlash.split('/').filter((s) => s.length > 0 && s !== '.');

      if (topLevelSegments.length > 1) {
        throw new WorkspacePathEscapeError(
          `Path escapes workspace: "${input}" is not under workspace root "${rootNorm}"`,
          { input, root: rootNorm },
        );
      }

      if (topLevelSegments.length === 0) {
        return rootNorm;
      }

      return resolvePathSegmentsUnderRoot(rootNorm, topLevelSegments, input);
    }

    let trimmedRelative = trimmed;
    while (trimmedRelative.startsWith('./')) {
      trimmedRelative = trimmedRelative.slice(2);
    }

    if (trimmedRelative === '' || trimmedRelative === '.') {
      return rootNorm;
    }

    const segments = trimmedRelative.split('/').filter((s) => s.length > 0 && s !== '.');
    return resolvePathSegmentsUnderRoot(rootNorm, segments, input);
  }

  /**
   * Parent directory of a workspace-relative path (`''` for root-level files).
   * @param relativePath - Path using `/` separators relative to the workspace root.
   * @returns Parent directory key without a trailing slash, or `''` when already at the root segment.
   */
  public parentOf(relativePath: string): string {
    const slashIndex = relativePath.lastIndexOf('/');
    if (slashIndex === -1) {
      return '';
    }
    return relativePath.slice(0, slashIndex);
  }

  /**
   * Replace the logical workspace root (e.g. after switching projects).
   * @param rootDirectory - New absolute root path for subsequent resolution.
   */
  public reset(rootDirectory: string): void {
    this.rootDirectory = rootDirectory;
  }

  /**
   * Validate and normalize a caller-supplied key to its canonical
   * workspace-relative form for use as an internal cache / subscriber key.
   *
   * Accepts:
   * - Workspace-relative keys (`main.scad`, `src/a.ts`, `''`/`.`/`/` → root).
   * - Absolute paths that lie under the workspace root (e.g.
   *   `/projects/abc/main.scad` for root `/projects/abc`).
   *
   * Rejects (throws {@link WorkspaceScopeViolationError}):
   * - Absolute paths foreign to the workspace root.
   * - Relative paths whose `..` segments climb above the root.
   *
   * This is the boundary helper for scoped facades such as
   * `FileContentService.write*` / `delete` / `rename` / `duplicate`. Cross-
   * workspace writes belong on `FileSystemClient.writeFiles` (worker
   * namespace, no resolver).
   *
   * @param method - Calling facade method name for diagnostics.
   * @param input - Caller-supplied workspace path key.
   * @returns Normalized workspace-relative key (`''` at root, no leading `/`).
   * @throws {WorkspaceScopeViolationError} When the input escapes the workspace root.
   * @public
   */
  public toWorkspaceRelativeKey(method: string, input: string): string {
    try {
      const absolute = this.toAbsoluteWorkspacePath(input);
      const rootNorm = normalizePath(this.rootDirectory);
      if (absolute === rootNorm) {
        return '';
      }
      const prefix = this.rootPrefix;
      if (!absolute.startsWith(prefix)) {
        throw new WorkspaceScopeViolationError(
          `${method}: key "${input}" resolved to "${absolute}" which is not under workspace root "${rootNorm}"`,
          { method, input, root: rootNorm },
        );
      }
      return absolute.slice(prefix.length);
    } catch (error) {
      if (error instanceof WorkspacePathEscapeError) {
        throw new WorkspaceScopeViolationError(`${method}: key "${input}" escapes workspace root "${error.root}"`, {
          method,
          input,
          root: error.root,
        });
      }
      throw error;
    }
  }
}
