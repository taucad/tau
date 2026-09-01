/**
 * Tau workspace-relative path from a root-level `file://` Monaco URI.
 * `monaco.Uri.file('/lib/cube.js')` → `lib/cube.js`
 */
export function workspaceRelativePathFromFileUri(uriPath: string): string {
  const trimmed = uriPath.startsWith('/') ? uriPath.slice(1) : uriPath;
  return trimmed;
}
