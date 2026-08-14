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
  CaptureImagesRpcResult,
  CaptureImagesRpcInput,
  ExportGeometryRpcInput,
  FetchGeometryRpcInput,
  FetchGeometryRpcResult,
  GetKernelResultRpcResult,
  RpcClientErrorCode,
  RunGeoSpecTestsRpcInput,
  RunGeoSpecTestsRpcResult,
  ResolveSkillRpcResult,
} from '#schemas/rpc.schema.js';
import type { ExportFile, FileContentMetadata } from '@taucad/types';
/**
 * One direct child returned by {@link RpcFileSystem.readdir}.
 * `name` is a basename, never a path.
 *
 * @public
 */
export type RpcDirectoryEntry =
  | {
      name: string;
      type: 'dir';
      size: number;
      modifiedAt?: string;
    }
  | ({
      name: string;
      type: 'file';
      size: number;
      modifiedAt?: string;
    } & FileContentMetadata);

/**
 * Abstract filesystem for RPC handlers.
 * Implementations can wrap browser fileManager, `fromMemoryFS()` / `fromNodeFS()` (which yield a `RuntimeFileSystemHandle`), etc.
 *
 * Paths use one canonical project-relative namespace: root is `''`, and
 * descendants are normalized POSIX keys such as `src/main.ts` with no leading
 * slash. Raw agent aliases never reach this interface. Implementations must
 * translate these keys to their backing filesystem namespace.
 *
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
  readdir(path: string): Promise<RpcDirectoryEntry[]>;
  exists(path: string): Promise<boolean>;
  appendFile(path: string, content: string): Promise<void>;
  editFile(path: string, oldString: string, newString: string, replaceAll?: boolean): Promise<{ occurrences: number }>;
  stat(path: string): Promise<RpcFileStat>;
};

/**
 * Structured file metadata returned on read refusals.
 * @public
 */
export type RpcFileMetadata = {
  type: 'file';
  size: number;
} & FileContentMetadata;

/**
 * File metadata returned by stat().
 * @public
 */
export type RpcFileStat =
  | {
      size: number;
      isDirectory: true;
      createdAt: string;
      modifiedAt: string;
    }
  | ({
      size: number;
      isDirectory: false;
      createdAt: string;
      modifiedAt: string;
    } & FileContentMetadata);

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
  | { success: true; files: ExportFile[] }
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
  fetchGeometry(args: Pick<FetchGeometryRpcInput, 'targetFile' | 'parameters'>): Promise<FetchGeometryRpcResult>;
  exportGeometry(args: Pick<ExportGeometryRpcInput, 'targetFile' | 'format'>): Promise<RpcGraphicsExportGeometryResult>;
};

/** Browser/headless image capture client independent of a mounted viewport. @public */
export type RpcImageClient = {
  captureImages(args: CaptureImagesRpcInput): Promise<CaptureImagesRpcResult>;
};

/**
 * Abstract GeoSpec client for executing tests where geometry bytes already
 * live. Browser implementations run the VM and mesh analysis locally so large
 * GLB/STEP payloads do not cross the chat RPC boundary.
 *
 * @public
 */
export type RpcGeoSpecClient = {
  runTests(args: RunGeoSpecTestsRpcInput): Promise<RunGeoSpecTestsRpcResult>;
};

/**
 * Abstract skill resolver for live skill activation.
 *
 * Browser implementations merge workspace `.agents/skills`, installed Tau
 * Store skills, and virtual system skills. API-side
 * tool execution calls this through RPC so prompt-visible catalog metadata is
 * only a discovery hint, not activation authority.
 *
 * @public
 */
export type RpcSkillResolver = {
  resolveSkill(skillName: string): Promise<ResolveSkillRpcResult>;
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
  images?: RpcImageClient;
  geospec?: RpcGeoSpecClient;
  skillResolver?: RpcSkillResolver;
};

/**
 * Structured error returned by RPC handlers on failure.
 * @public
 */
export type RpcHandlerError = {
  success: false;
  errorCode: RpcClientErrorCode;
  message: string;
  fileMetadata?: RpcFileMetadata;
};
