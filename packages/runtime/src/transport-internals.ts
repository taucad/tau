/* oxlint-disable no-barrel-files/no-barrel-files -- intentional `transport-internals` facade */
/**
 * Transport-author runtime internals.
 *
 * Re-exports {@link extractInlineFileSystem}, `wrapMessagePort`, and the
 * `Port` type from `@taucad/rpc`, for transport authors who bridge filesystem
 * RPC over non-`MessagePort` adapters or inject inline FS into worker
 * dispatchers (`inlineFileSystem` seam). Generic bridge primitives live in
 * `@taucad/rpc/bridge`; filesystem bridge adapters live in `@taucad/fs-bridge`.
 *
 * @public
 */

export { extractInlineFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

export { wrapMessagePort } from '@taucad/rpc';
export type { Port } from '@taucad/rpc';
