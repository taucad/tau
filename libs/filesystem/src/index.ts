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
export {
  captureRevisionTree,
  MaterializedWorkspaceAuthority,
  MaterializedWorkspaceError,
} from '#materialized-workspace.js';
export type {
  MaterializedWorkspace,
  MaterializedWorkspaceErrorCode,
  MaterializedWorkspaceIdentity,
  MaterializedWorkspaceMetrics,
} from '#materialized-workspace.js';
export { materializedWorkspaceId } from '#workspace-identity.js';
export type { MaterializedWorkspaceId } from '#workspace-identity.js';
