export {
  bindMutationContextForPort,
  consumableBytes,
  createFileSystemBridgeProxy,
  createFileSystemBridgePort,
  createTransferredFileSystemBridgeProxy,
  createFileSystemBridge,
  exposeFileSystem,
  filesystemBridgeConnectMessageType,
  filesystemBridgeReadyMessageType,
  openFileSystemBridge,
  serveFileSystemBridgePort,
  waitForWorkerReady,
  workerReadyMessageType,
  workspaceBridgeService,
} from '#filesystem-bridge.js';

export type {
  BridgeChangeEventBus,
  ChangeEventCoalescer,
  CoalescerFactory,
  ExposeFileSystemHandle,
  FileSystemBridge,
  FileSystemBridgeConnection,
  FileSystemBridgePort,
  FileSystemBridgeProxy,
  FileSystemBridgeProxyTransport,
  FileSystemBridgeRootedProxy,
  FileSystemBridgeWorkspaceProxy,
  FileSystemBridgeOptions,
  MutationMethodNameInternal,
  MutationOverrideMapInternal,
  RootedBridgeConsumer,
  RootedFileSystemHandlerFactory,
} from '#filesystem-bridge.js';

export {
  createFileSystemBridgeHello,
  fileSystemBridgeProtocolVersion,
  defaultGrepFileBytes,
  defaultGrepResults,
  maxGrepContext,
  maxGrepLineCharacters,
  maxGrepResults,
  maxReadManyPaths,
  maxReadRangeBytes,
  fileSystemBridgeSchemas,
  FileSystemBridgeProtocolVersionError,
} from '#filesystem-bridge-protocol.js';

export type {
  ApplyOptions,
  FileSystemBridgeChangeset,
  FileSystemBridgeChangesetEntry,
  FileSystemBridgeHashFiles,
  FileSystemBridgeHello,
  FileSystemBridgeRootedCalls,
  FileSystemBridgeScopedReads,
  FileSystemBridgeRuntimeService,
  FileSystemBridgeService,
  FileSystemBridgeUnrootedCalls,
  FileSystemBridgeWorkspaceService,
  GlobOptions,
  GrepMatch,
  GrepOptions,
  GrepResult,
  IndexStats,
  LongCall,
  LongCallProgress,
  ReadManyResult,
} from '#filesystem-bridge-protocol.js';

export { defaultReadStreamChunkBytes } from '#filesystem-bridge-client-calls.js';

export type { ReadStreamOptions } from '#filesystem-bridge-client-calls.js';

export { observeFileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';

export type { FileSystemBridgeCrossings, FileSystemBridgeCrossingsObserver } from '#filesystem-bridge-crossings.js';

export { slowFileSystemBridgeCalls, slowFileSystemBridgeCallThreshold } from '#filesystem-bridge-slow-calls.js';

export type { SlowFileSystemBridgeCall } from '#filesystem-bridge-slow-calls.js';
