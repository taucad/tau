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
  FileSystemBridgeEventSubscription,
  FileSystemBridgeHostOptions,
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
  FileSystemBridgeEvent,
  FileSystemBridgeHashFiles,
  FileSystemBridgeHello,
  FileSystemBridgeRootedCalls,
  FileSystemBridgeScopedReads,
  FileSystemBridgeRuntimeService,
  FileSystemBridgeService,
  FileSystemBridgeUnrootedCalls,
  FileSystemBridgeWireEvent,
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

export { grepMatchDeadline } from '#filesystem-bridge-grep-matcher.js';

export type {
  GrepMatcherChannel,
  GrepMatcherChannelEvents,
  GrepMatcherWorkerFactory,
} from '#filesystem-bridge-grep-matcher.js';

export type { HostContentCallOptions } from '#filesystem-bridge-host-calls.js';

export type { ReadStreamOptions } from '#filesystem-bridge-client-calls.js';

export { observeFileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';

export type { FileSystemBridgeCrossings, FileSystemBridgeCrossingsObserver } from '#filesystem-bridge-crossings.js';

export { slowFileSystemBridgeCalls, slowFileSystemBridgeCallThreshold } from '#filesystem-bridge-slow-calls.js';

export type { SlowFileSystemBridgeCall } from '#filesystem-bridge-slow-calls.js';

export { computeEventRelay } from '#filesystem-bridge-compute-events.js';

export type {
  ComputeCrashNotice,
  ComputeEventRelay,
  ComputeEventSource,
  ComputeRestartedEvent,
} from '#filesystem-bridge-compute-events.js';
