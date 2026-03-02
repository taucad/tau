/**
 * Abstract dependency interfaces for RPC handler execution.
 *
 * These interfaces decouple the RPC handler logic from its execution
 * environment, enabling the same handlers to run in:
 * - Browser (via fileManager, XState actors, WebGL)
 * - Node.js headless (via KernelFileSystem, kernel worker)
 * - Workers or other JS runtimes
 */
import type {
  CaptureObservationsRpcResult,
  CaptureScreenshotRpcResult,
  FetchGeometryRpcResult,
  GetKernelResultRpcResult,
  RpcClientErrorCode,
} from '#schemas/rpc.schema.js';

/**
 * Abstract filesystem for RPC handlers.
 * Implementations can wrap browser fileManager, KernelFileSystem (fromMemoryFS/fromNodeFS), etc.
 */
export type RpcFileSystem = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  readdir(path: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>>;
  exists(path: string): Promise<boolean>;
};

/**
 * Abstract kernel client for getting compilation results.
 * Browser impl wraps buildRef (XState actor); headless impl wraps kernel worker directly.
 */
export type RpcKernelClient = {
  getKernelResult(targetFile: string): Promise<GetKernelResultRpcResult>;
};

/**
 * Abstract graphics client for capturing observations (screenshots).
 * Only available in browser environments with a mounted 3D view.
 */
export type RpcGraphicsClient = {
  captureObservations(): Promise<CaptureObservationsRpcResult>;
  fetchGeometry(): Promise<FetchGeometryRpcResult>;
  captureScreenshot(): Promise<CaptureScreenshotRpcResult>;
};

/**
 * Dependencies required by RPC handlers.
 * `graphics` is optional -- headless mode omits it, and handlers
 * return an error if a graphics operation is requested without it.
 */
export type RpcDependencies = {
  fileSystem: RpcFileSystem;
  kernelClient: RpcKernelClient;
  graphics?: RpcGraphicsClient;
};

/**
 * Structured error returned by RPC handlers on failure.
 */
export type RpcHandlerError = {
  success: false;
  errorCode: RpcClientErrorCode;
  message: string;
};
