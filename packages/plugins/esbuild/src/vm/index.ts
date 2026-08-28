/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */

/** Create an esbuild-backed ESM module VM. @public */
export { createEsbuildModuleVm } from '#vm/module-vm.js';

/** Pre-bundled module served from memory via the builtin namespace. @public */
export type { BuiltinModule } from '@taucad/runtime/bundler';
/** Outcome of bundling an entry point: executable code plus diagnostics. @public */
export type { BundleResult } from '#vm/esbuild-core.js';
/** Minimal filesystem contract required by the VM bundler. @public */
export type { VmFileSystem } from '#vm/types.js';
/** A diagnostic emitted while bundling or executing a VM module. @public */
export type { VmIssue } from '#vm/types.js';
