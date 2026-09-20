/**
 * Workspace-relative paths for kernel bundled `.d.ts` rows surfaced under the
 * file tree (FM global `/node_modules` mount, editor Cmd+Click parity).
 */
export const bundledTypesWorkspaceRootSegment = 'node_modules';

/**
 * The dependency mount as an authority root.
 *
 * It is a mount outside every checkout, so since W11 it is opened as a rooted
 * `'user'` connection of its own: `/node_modules` is where the file tree's rows
 * and the editor's bundled typings both come from, and neither reaches the
 * authority's global surface any more.
 */
export const dependencyMountRoot = `/${bundledTypesWorkspaceRootSegment}`;
