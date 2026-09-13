import { URI } from 'vscode-uri';

import { monacoFileUriToWorkspaceRelative } from '@taucad/lsp-fs/uri';

export function posixDirname(relativePath: string): string {
  const n = relativePath.replaceAll('\\', '/');
  const i = n.lastIndexOf('/');
  return i <= 0 ? '' : n.slice(0, i);
}

export function posixJoin(base: string, segment: string): string {
  const left = base.replace(/\/+$/, '');
  const right = segment.replace(/^\/+/, '');
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return `${left}/${right}`;
}

/**
 * Resolve `use <path>` / `include <path>` angle-bracket paths relative to the
 * model's directory in workspace-relative space, returning a `file://` URI.
 */
export function openscadAnglePathToFileUri(currentModelUri: string, anglePath: string): string {
  const currentWorkspacePath = monacoFileUriToWorkspaceRelative(currentModelUri);
  const resolvedWorkspacePath = posixJoin(posixDirname(currentWorkspacePath), anglePath);
  return URI.file(`/${resolvedWorkspacePath}`).toString();
}
