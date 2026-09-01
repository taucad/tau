/**
 * Abstract dependency interfaces for RPC handler execution.
 *
 * These interfaces decouple the RPC handler logic from its execution
 * environment, enabling the same handlers to run in:
 * - Browser (via fileManager, XState actors, WebGL)
 * - Node.js headless (via enhanced RuntimeFileSystem in the worker, runtime kernel)
 * - Workers or other JS runtimes
 */
import type {
  CaptureObservationsRpcResult,
  CaptureScreenshotRpcResult,
  ExportGeometryRpcInput,
  FetchGeometryRpcResult,
  GetKernelResultRpcResult,
  RpcClientErrorCode,
} from '#schemas/rpc.schema.js';

/**
 * Abstract filesystem for RPC handlers.
 * Implementations can wrap browser fileManager, `fromMemoryFS()` / `fromNodeFS()` (which yield a `RuntimeFileSystemHandle`), etc.
 * @public
 */
export type RpcFileSystem = {
  /**
   * Returns the full file contents as a UTF-8 string.
   *
   * Bounded-reads contract: callers MUST `stat` first and impose a per-call
   * size cap when the input path could be user/agent-controlled. The two
   * agent-facing handlers (`handle-read-file`, `handle-grep`) enforce a
   * 256 KB unbounded-read precheck plus a 2 000-line / 100-match output cap
   * so a single `read_file index.d.ts` cannot poison the prompt cache.
   * New handlers that surface this API to the agent MUST adopt the same
   * pattern — never call `readFile` on agent-supplied paths without bounds.
   */
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  writeBinaryFile(path: string, data: Uint8Array<ArrayBuffer>): Promise<void>;
  deleteFile(path: string): Promise<void>;
  readdir(path: string): Promise<
    Array<{
      name: string;
      type: 'file' | 'dir';
      size: number;
      modifiedAt?: string;
    }>
  >;
  exists(path: string): Promise<boolean>;
  appendFile(path: string, content: string): Promise<void>;
  editFile(path: string, oldString: string, newString: string, replaceAll?: boolean): Promise<{ occurrences: number }>;
  stat(path: string): Promise<RpcFileStat>;
};

/**
 * File metadata returned by stat().
 * @public
 */
export type RpcFileStat = {
  size: number;
  isDirectory: boolean;
  createdAt: string;
  modifiedAt: string;
};

/**
 * Abstract runtime client for getting compilation results.
 * Browser impl wraps projectRef (XState actor); headless impl wraps runtime worker directly.
 * @public
 */
export type RpcRuntimeClient = {
  getKernelResult(targetFile: string): Promise<GetKernelResultRpcResult>;
};

/**
 * Success/failure surface for {@link RpcGraphicsClient.exportGeometry} before
 * the RPC handler persists bytes to `.tau/artifacts/`.
 *
 * @public
 */
export type RpcGraphicsExportGeometryResult =
  | { success: true; bytes: Uint8Array<ArrayBuffer>; mimeType: string }
  | {
      success: false;
      errorCode: RpcClientErrorCode;
      message: string;
    };

/**
 * Abstract graphics client for capturing observations (screenshots).
 * Only available in browser environments with a mounted 3D view.
 *
 * Every method takes an explicit `targetFile` so the agent must name the
 * geometry unit it is acting on; there is no project-level fallback.
 * @public
 */
export type RpcGraphicsClient = {
  captureObservations(args: { targetFile: string }): Promise<CaptureObservationsRpcResult>;
  fetchGeometry(args: { targetFile: string }): Promise<FetchGeometryRpcResult>;
  exportGeometry(args: Pick<ExportGeometryRpcInput, 'targetFile' | 'format'>): Promise<RpcGraphicsExportGeometryResult>;
  captureScreenshot(args: { targetFile: string }): Promise<CaptureScreenshotRpcResult>;
};

/**
 * Dependencies required by RPC handlers.
 * `graphics` is optional -- headless mode omits it, and handlers
 * return an error if a graphics operation is requested without it.
 * @public
 */
export type RpcDependencies = {
  fileSystem: RpcFileSystem;
  kernelClient: RpcRuntimeClient;
  graphics?: RpcGraphicsClient;
};

/**
 * Structured error returned by RPC handlers on failure.
 * @public
 */
export type RpcHandlerError = {
  success: false;
  errorCode: RpcClientErrorCode;
  message: string;
};
