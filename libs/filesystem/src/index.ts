export type {
  DirectoryEntry,
  ExternalChangeFact,
  ProviderCapabilities,
  FileMode,
  FileStat,
  FileStatEntry,
  FileSystemProvider,
  FileReadStreamOptions,
  PathAgentAccess,
  PathClass,
  PathClassification,
  PathPolicy,
  PathWatchPlane,
  ChangeEvent,
  MkdirOptions,
  WorkspaceMutationContext,
  FileTreeNode,
  TreeEntry,
  WatchRequest,
  WatchEvent,
} from '#types.js';
export type { CheckedFileWrite, CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';

export { WorkspaceFileService } from '#workspace-file-service.js';
export { pendingProjectCommitInputSchema, ProjectDirectories } from '#project-directories.js';
export type {
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  ProjectRootDiscoveryStatus,
  ResolvedDiscoveryRoot,
} from '#project-directories.js';
/* `MutationPipeline`, `RootedViews` and `TreeIndex` are the composition root's
 * own collaborators (D14): a consumer reaches them through
 * `WorkspaceFileService`, never by constructing one, so only the shapes they
 * hand back are exported. */
export type { BulkMoveEdit, BulkMoveResult } from '#mutation-pipeline.js';
export type { RootedFileSystem, RootedPorcelain } from '#rooted-views.js';

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
export type { ResourceQueueClaim } from '#resource-queue.js';
export { ChangeEventBus } from '#change-event-bus.js';
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
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';
/* `MountEntry.kind` is a `RouteKind`, so the type ships with it. `parseRoute`
 * ships because a client outside L1 needs it: the rooted content client picks
 * the root that owns an absolute path, and this stays the only grammar that
 * answers which one that is (D10). The route *builders* remain module-private —
 * nothing outside L1 spells a route it did not read. */
export type { RouteKind, ParsedRoute } from '#project-routes.js';
export { parseRoute } from '#project-routes.js';

export {
  MissingWorkspaceHandleError,
  isMissingWorkspaceHandleError,
  RootedFileSystemError,
  WorkspaceMutationError,
  isWorkspaceMutationError,
} from '#workspace-errors.js';
export { UnboundProjectRouteError } from '#workspace-file-service.js';
export type { WorkspaceMutationErrorCode } from '#workspace-errors.js';

/* No revision symbol is exported here, and none is imported either (D9/W8):
 * revision trees, identity, metadata, the three-way merge and the capture walk
 * are `@taucad/revisions/algorithms`. The frozen S6 boundary — nothing
 * reachable from this library's export map can initialize a revision authority
 * (RC8 work 10) — therefore holds by construction. What stays here is the
 * filesystem's own: `FileMode` (a provider reports and sets it) and
 * `ResourceQueue` (serializing writes per resource is not a revision concern). */
