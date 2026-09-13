export type {
  DirectoryEntry,
  ProviderCapabilities,
  FileStat,
  FileStatEntry,
  FileSystemProvider,
  FileReadStreamOptions,
  ChangeEvent,
  FileTreeNode,
  TreeEntry,
  WatchRequest,
  WatchEvent,
} from '#types.js';

export { pendingProjectCommitInputSchema, WorkspaceFileService } from '#workspace-file-service.js';
export type {
  BundledTypePackageReplacement,
  MkdirOptions,
  RootedFileSystem,
  WorkspaceMutationContext,
} from '#workspace-file-service.js';

export { ProviderRegistry } from '#provider-registry.js';
export type { ProviderRegistryOptions } from '#provider-registry.js';

export { resolveStorageRootKey } from '#storage-root-key.js';
export type { StorageRootIdentity } from '#storage-root-key.js';

export {
  admitCapacityWrite,
  defaultRevisionReserveBytes,
  measureCapacityDomain,
  revisionReserveFloorBytes,
} from '#capacity-domain.js';
export type { CapacityDecision, CapacityDomain, CapacityMeasurement, CapacityRequest } from '#capacity-domain.js';

export { BoundedFileCache } from '#bounded-file-cache.js';
export { ResourceQueue } from '#resource-queue.js';
export { ChangeEventBus } from '#change-event-bus.js';
export { InMemoryFileTree } from '#in-memory-file-tree.js';
export type { TreeNode } from '#in-memory-file-tree.js';
export { EventCoalescer, coalesceChangeEvents } from '#event-coalescer.js';
export type { CoalescerOptions } from '#event-coalescer.js';
export { tagEventOrigin, getEventOrigin, isEventGloballyVisible } from '#event-origin-registry.js';
export { WatchRegistry } from '#watch-registry.js';
export type { WatchRegistryOptions } from '#watch-registry.js';
export { streamChunkSize, bufferToStream } from '#backend/stream-utils.js';
export { CrossTabCoordinator } from '#cross-tab-coordinator.js';
export {
  countLineBytes,
  countTextLines,
  fileMetadataFields,
  fileStatFromBytes,
  fileStatFromFile,
  getFileContentMetadata,
  headSniffByteLength,
  seemsBinary,
} from '#content-metadata.js';

export { MountTable } from '#mount-table.js';
export type {
  MountConfig,
  MountConfigCommon,
  MountEntry,
  MountMetadata,
  MountResolution,
  CheckoutRootConfig,
  ProjectRootConfig,
  ProjectRootConfiguration,
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
  ProjectRootDiscoveryStatus,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';

export {
  MissingWorkspaceHandleError,
  isMissingWorkspaceHandleError,
  RootedFileSystemError,
  WorkspaceMutationError,
  isWorkspaceMutationError,
} from '#workspace-errors.js';
export { UnboundProjectRouteError } from '#workspace-file-service.js';
export type { WorkspaceMutationErrorCode } from '#workspace-errors.js';

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
/* The revision authority, its persistence port and `revisionBranchName` are
 * `@taucad/revisions`. The frozen S6 boundary is that nothing reachable from
 * this library's export map can initialize a revision authority (RC8 work 10);
 * what an authority is built out of — trees, ids, merges, the resource queue —
 * stays here and is imported by it. */
export { captureRevisionTree } from '#revision-capture.js';
export type { CaptureRevisionTreeOptions } from '#revision-capture.js';
