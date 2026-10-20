/* oxlint-disable no-barrel-files/no-barrel-files -- Compatibility re-export until this package is removed. */
/**
 * Compatibility re-export: the Node `VmFileSystem` lives in `geospec/runner/node`.
 *
 * @module
 */

export { createNodeVmFileSystem, resolveUnderRoot } from 'geospec/runner/node';
export type { VmFileSystem } from '@taucad/esbuild/vm';
