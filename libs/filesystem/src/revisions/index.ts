/**
 * Dependency-light revision substrate for native hosts and publishable adapters.
 * This subpath intentionally excludes the provider and UI-facing filesystem surface.
 */

export { ResourceQueue } from '#resource-queue.js';
export { revisionMetadataSchema } from '#revision-metadata.js';
export { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
export type { RevisionId, RevisionTreeEntry } from '#revision-tree.js';
export { mergeRevisionTrees } from '#revision-merge.js';
export type {
  AddAddConflict,
  BinaryConflict,
  ModifyDeleteConflict,
  RevisionTreeConflict,
  RevisionTreeMergeResult,
  TextConflict,
} from '#revision-merge.js';
/* No authority symbol: see the note in `../index.ts`. */
export { materializedWorkspaceId } from '#workspace-identity.js';
export type { MaterializedWorkspaceId } from '#workspace-identity.js';
