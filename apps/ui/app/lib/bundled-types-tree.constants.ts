/**
 * Workspace-relative paths for kernel bundled `.d.ts` rows surfaced under the
 * file tree (FM global `/node_modules` mount, editor Cmd+Click parity).
 */
export const bundledTypesWorkspaceRootSegment = 'node_modules';

/**
 * Whether a workspace-relative tree path belongs to the synthetic bundled-types
 * subtree (read-only in UI).
 */
export function isBundledTypesWorkspacePath(path: string): boolean {
  return path === bundledTypesWorkspaceRootSegment || path.startsWith(`${bundledTypesWorkspaceRootSegment}/`);
}
