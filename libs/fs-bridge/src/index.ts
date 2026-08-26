export {
  bindMutationContextForPort,
  createFileSystemBridgeProxy,
  createFileSystemBridgePort,
  createTransferredFileSystemBridgeProxy,
  createFileSystemBridge,
  exposeFileSystem,
  filesystemBridgeConnectMessageType,
  filesystemBridgeReadyMessageType,
  openFileSystemBridge,
  waitForWorkerReady,
  workerReadyMessageType,
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
  FileSystemBridgeOptions,
  MutationMethodNameInternal,
  MutationOverrideMapInternal,
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
  FileSystemBridgeRuntimeService,
  FileSystemBridgeService,
  FileSystemBridgeWorkspaceService,
} from '#filesystem-bridge-protocol.js';
