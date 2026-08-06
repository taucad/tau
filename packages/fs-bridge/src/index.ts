export {
  bindMutationContextForPort,
  createFileSystemBridgeProxy,
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
  FileSystemBridgeOptions,
  MutationMethodNameInternal,
  MutationOverrideMapInternal,
  RootedFileSystemHandlerFactory,
} from '#filesystem-bridge.js';
