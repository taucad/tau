/**
 * Dependency-light revision substrate for native hosts and publishable adapters.
 * This subpath intentionally excludes the provider and UI-facing filesystem surface.
 */

export { ResourceQueue } from '#resource-queue.js';
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
export { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
export type {
  BranchHeadUpdateResult,
  CreateRevisionInput,
  Revision,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
  StaleBranchHeadConflict,
  UpdateBranchHeadInput,
} from '#revision-authority.js';
export { materializedWorkspaceId } from '#workspace-identity.js';
export type { MaterializedWorkspaceId } from '#workspace-identity.js';
