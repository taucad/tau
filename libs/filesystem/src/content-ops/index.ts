/**
 * Read content operations over the provider port (charter D1, D2).
 *
 * `walk`, `contents` and `archive` need no index and no authority: each takes
 * the narrowest slice of `FileSystemProvider` it uses, so a storage provider, a
 * rooted filesystem and a composed view are all equally valid arguments.
 *
 * That is the point of serving them here rather than on the authority. The mask
 * is inherited from the surface passed in — over a composed view a hidden entry
 * is simply not enumerated — so this module never asks the path registry
 * anything itself, and a caller-owned filter such as a versioned-only export is
 * an ordinary `admits` predicate.
 *
 * @module
 */

export { archive } from '#content-ops/archive.js';
export { contents } from '#content-ops/contents.js';
export type { ContentFileSystem } from '#content-ops/contents.js';
export { walk } from '#content-ops/walk.js';
export type { WalkEntry, WalkFileSystem, WalkOptions } from '#content-ops/walk.js';
