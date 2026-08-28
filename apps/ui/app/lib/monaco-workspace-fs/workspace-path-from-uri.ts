import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';

/**
 * Tau workspace-relative path from a root-level `file://` Monaco URI.
 * `monaco.Uri.file('/lib/cube.js')` → `lib/cube.js`
 */
export function workspaceRelativePathFromFileUri(uriPath: string): string {
  if (!uriPath.startsWith('/') || uriPath.startsWith('//')) {
    throw new VirtualPathError('INVALID_PATH', uriPath);
  }
  return assertRootedPath(uriPath.slice(1));
}
