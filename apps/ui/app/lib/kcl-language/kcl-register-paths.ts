/**
 * URI/path helpers for KCL document and import resolution in the Monaco stack.
 */

import { URI, Utils } from 'vscode-uri';

/**
 * Convert URI to workspace-relative path key (no leading slash), matching
 * virtual Monaco `file:///public/...` paths and the file manager layout.
 */
export function kclUriToWorkspacePath(uri: string): string {
  const { path } = URI.parse(uri);
  return path.startsWith('/') ? path.slice(1) : path;
}

/**
 * Resolve an import path relative to the current file's directory.
 *
 * @param currentFileUri URI of the current file (e.g., "file:///public/kcl-samples/bench/main.kcl")
 * @param importPath Relative import path (e.g., "bench-parts.kcl")
 * @returns Absolute file:// URI of the imported file
 */
export function resolveKclImportToUri(currentFileUri: string, importPath: string): string {
  const current = URI.parse(currentFileUri);
  const directory = Utils.joinPath(current, '..');
  return Utils.joinPath(directory, importPath).toString();
}

/**
 * Parent directory of a workspace-relative file path (no `file://` prefix).
 *
 * @example `public/kcl-samples/axial-fan/main.kcl` → `public/kcl-samples/axial-fan`
 * @example `main.kcl` → `''` (file at virtual workspace root)
 */
export function parentDirectoryOfWorkspacePath(workspacePath: string): string {
  const normalized = workspacePath.replace(/\/$/, '');
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return '';
  }
  return normalized.slice(0, lastSlashIndex);
}
