import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';
import type { URI } from 'vscode-uri';

/** Canonical root-level workspace path from a file URI. */
export function workspacePathFromFileUri(uri: URI): string {
  if (
    uri.scheme !== 'file' ||
    uri.authority !== '' ||
    uri.query !== '' ||
    uri.fragment !== '' ||
    !uri.path.startsWith('/') ||
    uri.path.startsWith('//')
  ) {
    throw new VirtualPathError('INVALID_PATH', uri.toString());
  }
  return assertRootedPath(uri.path.slice(1));
}
