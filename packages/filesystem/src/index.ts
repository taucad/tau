export type {
  ProviderCapabilities,
  FileStat,
  FileStatEntry,
  FileSystemProvider,
  FileReadStreamOptions,
  ChangeEvent,
  FileTreeNode,
  TreeEntry,
  WatchEventFilter,
  WatchRequest,
  WatchEvent,
  FileContentCache,
  RuntimeFileSystem,
} from '#types.js';

export { createFileSystemService, createFileSystemServiceOptions } from '#file-system-service.js';
export type { FileSystemService, FileSystemServiceOptions } from '#file-system-service.js';

export { WorkspaceFileService } from '#workspace-file-service.js';
export type { MkdirOptions, WorkspaceMutationContext } from '#workspace-file-service.js';

export { ProviderRegistry } from '#provider-registry.js';
export type { ProviderRegistryOptions } from '#provider-registry.js';

export { BoundedFileCache } from '#bounded-file-cache.js';
export { ResourceQueue } from '#resource-queue.js';
export { WriteCoordinator } from '#write-coordinator.js';
export { ResourceWriteQueue } from '#resource-write-queue.js';
export { ChangeEventBus } from '#change-event-bus.js';
export { InMemoryFileTree } from '#in-memory-file-tree.js';
export type { TreeNode } from '#in-memory-file-tree.js';
export { EventCoalescer, coalesceEvents, coalesceChangeEvents } from '#event-coalescer.js';
export type { CoalescerOptions } from '#event-coalescer.js';
export { tagEventOrigin, getEventOrigin, clearEventOrigin } from '#event-origin-registry.js';
export { ThrottledWorker } from '#throttled-worker.js';
export type { ThrottledWorkerOptions } from '#throttled-worker.js';
export { WatchRegistry } from '#watch-registry.js';
export type { WatchRegistryOptions } from '#watch-registry.js';
export {
  FileSystemObserverBridge,
  isFileSystemObserverSupported,
  mapObserverRecord,
} from '#backend/filesystem-observer-bridge.js';
export { streamChunkSize, bufferToStream } from '#backend/stream-utils.js';
export type { FileReadStreamOptions as StreamFileReadOptions } from '#backend/stream-utils.js';
export { CrossTabCoordinator, isNavigatorLocksSupported } from '#cross-tab-coordinator.js';

export { MountTable } from '#mount-table.js';
export type { MountConfig, MountConfigCommon, MountEntry, MountResolution, WorkspaceScope } from '#mount-table.js';

export {
  MissingWorkspaceHandleError,
  isMissingWorkspaceHandleError,
  WorkspaceMutationError,
  isWorkspaceMutationError,
} from '#workspace-errors.js';
export type { WorkspaceMutationErrorCode } from '#workspace-errors.js';
