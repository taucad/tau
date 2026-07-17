/**
 * Error raised when an untrusted virtual filesystem path is invalid.
 * @public
 */
export class VirtualPathError extends Error {
  public readonly code: 'INVALID_PATH' | 'PATH_OUTSIDE_ROOT';
  public readonly metadata: { readonly input: string };

  public constructor(code: 'INVALID_PATH' | 'PATH_OUTSIDE_ROOT', input: string) {
    super(code === 'PATH_OUTSIDE_ROOT' ? 'Virtual path escapes the filesystem root.' : 'Invalid virtual path.');
    this.name = 'VirtualPathError';
    this.code = code;
    this.metadata = { input };
  }
}

/**
 * Resolve an untrusted absolute POSIX path inside a virtual filesystem root.
 *
 * Unlike the permissive display/path-formatting helpers below, this is a
 * filesystem authority boundary. It rejects host-platform path forms and any
 * traversal that would escape virtual `/`.
 *
 * @param input - Candidate absolute virtual path.
 * @returns One canonical absolute POSIX path.
 * @throws {@link VirtualPathError} When the path is invalid or escapes `/`.
 * @public
 */
export function resolveVirtualPath(input: string): string {
  const invalid = (): never => {
    throw new VirtualPathError('INVALID_PATH', input);
  };

  if (input.length === 0 || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) {
    return invalid();
  }
  if (input.slice(0, 5).toLowerCase() === 'file:' || /(?:^|\/)[A-Za-z]:(?:\/|$)/u.test(input)) {
    return invalid();
  }
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))) {
      return invalid();
    }
  }

  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.pop() === undefined) {
        throw new VirtualPathError('PATH_OUTSIDE_ROOT', input);
      }
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

/**
 * Normalizes a path by removing redundant slashes and ensuring a single leading slash.
 *
 * @param path - The path to normalize.
 * @returns A normalized path with single leading slash and no redundant slashes.
 * @public
 */
export function normalizePath(path: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return '/' + segments.join('/');
}

/**
 * Joins multiple path segments into a single normalized absolute path.
 *
 * Behavior:
 * - If any segment is absolute (starts with '/'), it resets the path from that point
 * - Empty segments are ignored
 * - The result is always normalized (no redundant slashes, single leading slash)
 *
 * @param paths - Path segments to join.
 * @returns A normalized absolute path.
 *
 * @public
 *
 * @example <caption>Joining path segments</caption>
 * ```typescript
 * import { joinPath } from '@taucad/utils/path';
 *
 * joinPath('/root', 'dir', 'file.txt'); // '/root/dir/file.txt'
 * joinPath('/root', '/absolute', 'file.txt'); // '/absolute/file.txt'
 * joinPath('/', '/projects/id/main.scad'); // '/projects/id/main.scad'
 * joinPath('/root', '', 'file.txt'); // '/root/file.txt'
 * ```
 */
export function joinPath(...paths: string[]): string {
  let result = '';

  for (const path of paths) {
    if (path === '') {
      continue;
    }

    // If path is absolute, reset result to this path
    if (path.startsWith('/')) {
      result = path;
    } else if (result === '' || result === '/') {
      // If result is empty or just root, set to path with leading slash
      result = '/' + path;
    } else {
      // Append path to result
      result = result + '/' + path;
    }
  }

  // Handle empty result
  if (result === '') {
    return '/';
  }

  return normalizePath(result);
}

/**
 * Get the parent directory of a path.
 *
 * @param path - absolute path
 * @returns parent directory path, or '/' for root-level paths
 * @public
 */
export function parentDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '/';
  }
  return path.slice(0, lastSlash);
}

/**
 * Joins relative path segments without introducing a leading slash.
 * Use this when building paths relative to a root (e.g. file tree entry keys).
 * For building absolute paths to pass to ZenFS/workers, use {@link joinPath} instead.
 *
 * @param paths - Relative path segments to join.
 * @returns Joined relative path, or empty string if no non-empty segments.
 *
 * @public
 *
 * @example <caption>Joining relative path segments</caption>
 * ```typescript
 * import { joinRelativePath } from '@taucad/utils/path';
 *
 * joinRelativePath('lib', 'utils.ts'); // 'lib/utils.ts'
 * joinRelativePath('', 'main.ts'); // 'main.ts'
 * joinRelativePath('src', 'components', 'App.tsx'); // 'src/components/App.tsx'
 * ```
 */
export function joinRelativePath(...paths: string[]): string {
  const segments: string[] = [];
  for (const path of paths) {
    if (path === '') {
      continue;
    }
    for (const segment of path.split('/')) {
      if (segment.length > 0) {
        segments.push(segment);
      }
    }
  }
  return segments.join('/');
}

/**
 * Returns whether a path is already a safe relative POSIX path.
 *
 * This validator deliberately does not normalize. Callers use it at artifact
 * boundaries where changing a producer-authored name could break sidecar
 * references.
 *
 * @param path - Candidate producer-authored relative path.
 * @returns `true` for a non-empty relative POSIX path without traversal.
 * @public
 */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return false;
  }

  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/**
 * Canonical path normalization for watch matching.
 * Normalizes separators, removes duplicate slashes, ensures leading slash,
 * and strips trailing slash (except for root '/').
 *
 * @param path - path to canonicalize
 * @returns canonical absolute path
 * @public
 */
export function canonicalizePath(path: string): string {
  let normalized = path.replaceAll(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  return normalized;
}
