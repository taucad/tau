/**
 * Dependency-light revision algorithms: trees, identity, metadata, merge and
 * the one capture walk (charter D9).
 *
 * They moved here from the filesystem library unchanged (W8, invariant
 * I4): identical inputs yield identical tree and revision ids, which the suites
 * beside these modules pin. Nothing here reaches a revision *authority*, a port
 * or `xstate`, so a host that only needs to hash or merge a tree — the job
 * contract, the file-manager worker, a daemon — imports this subpath instead of
 * the package barrel and keeps `isomorphic-git` out of its graph.
 *
 * `ResourceQueue` stayed in `@taucad/filesystem`: serializing writes per
 * resource is a filesystem concern, not a revision one.
 */

export { revisionMetadataSchema } from '#algorithms/revision-metadata.js';
export { ImmutableRevisionTree, revisionId } from '#algorithms/revision-tree.js';
export type { RevisionId, RevisionTreeEntry, RevisionTreeInput } from '#algorithms/revision-tree.js';
export { mergeRevisionTrees, renderConflictMarkers } from '#algorithms/revision-merge.js';
export type {
  AddAddConflict,
  BinaryConflict,
  ConflictMarkerInput,
  ConflictMarkerLabels,
  FileDirectoryConflict,
  ModeConflict,
  ModifyDeleteConflict,
  RevisionTreeConflict,
  RevisionTreeMergeResult,
  TextConflict,
} from '#algorithms/revision-merge.js';
export { captureRevisionTree } from '#algorithms/revision-capture.js';
export type { CaptureRevisionTreeOptions, RevisionCaptureFileSystem } from '#algorithms/revision-capture.js';
