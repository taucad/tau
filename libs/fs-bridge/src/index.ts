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
  fileSystemBridgeSchemas,
  FileSystemBridgeProtocolVersionError,
} from '#filesystem-bridge-protocol.js';

export type {
  FileSystemBridgeHello,
  FileSystemBridgeRootedCalls,
  FileSystemBridgeScopedReads,
  FileSystemBridgeRuntimeService,
  FileSystemBridgeService,
  FileSystemBridgeUnrootedCalls,
  FileSystemBridgeWorkspaceService,
} from '#filesystem-bridge-protocol.js';
