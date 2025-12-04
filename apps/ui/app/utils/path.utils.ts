/**
 * Normalizes a path by removing redundant slashes and ensuring a single leading slash.
 *
 * @param path - The path to normalize.
 * @returns A normalized path with single leading slash and no redundant slashes.
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
 * @example
 * joinPath('/root', 'dir', 'file.txt') // '/root/dir/file.txt'
 * joinPath('/root', '/absolute', 'file.txt') // '/absolute/file.txt'
 * joinPath('/', '/builds/id/main.scad') // '/builds/id/main.scad'
 * joinPath('/root', '', 'file.txt') // '/root/file.txt'
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
