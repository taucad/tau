import { URI } from 'vscode-uri';
import { assertRootedPath } from '@taucad/utils/path';

/**
 * Convert a Tau/Monaco `file://` model URI to the workspace-relative key used
 * by {@link FileContentService} and the file-pool (`joinPath(root, relative)`).
 *
 * @public
 */
export function monacoFileUriToWorkspaceRelative(uri: string): string {
  const parsed = URI.parse(uri);
  if (parsed.scheme !== 'file') {
    throw new TypeError(`lsp-fs: expected file URI, got ${uri}`);
  }

  return assertRootedPath(parsed.path.startsWith('/') ? parsed.path.slice(1) : parsed.path);
}
