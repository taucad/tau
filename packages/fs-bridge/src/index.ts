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
  BridgeWatchHandler,
  ChangeEventCoalescer,
  CoalescerFactory,
  ExposeFileSystemHandle,
  FileSystemBridge,
  FileSystemBridgeConnection,
  FileSystemBridgeFilePool,
  FileSystemBridgeOptions,
  MutationMethodNameInternal,
  MutationOverrideMapInternal,
  ThrottledEventWorker,
  ThrottledWorkerFactory,
} from '#filesystem-bridge.js';
