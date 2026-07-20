/**
 * RPC Handlers Browser Adapter
 *
 * Thin adapter that bridges browser-specific dependencies (fileManager, XState actors,
 * WebGL) to the transport-agnostic RPC handler interfaces in @taucad/chat/rpc.
 *
 * The core handler logic lives in libs/chat/src/rpc/handlers/. This module only
 * adapts browser-specific deps into the abstract RpcDependencies interface.
 */
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { awaitFreshRender, AwaitFreshRenderTimeoutError } from '#machines/await-fresh-render.js';
import type {
  RpcCall,
  RpcClientErrorCode,
  RpcResult,
  GetKernelResultRpcResult,
  CaptureImagesRpcResult,
  CaptureImagesRpcInput,
  FetchGeometryRpcResult,
  RunGeoSpecTestsRpcResult,
} from '@taucad/chat';
import { rpcClientErrorCode, rpcClientErrorCodeSchema } from '@taucad/chat';
import { mutatingRpcNames } from '@taucad/chat/constants';
import { createRpcDispatcher } from '@taucad/chat/rpc';
import type {
  RpcDependencies,
  RpcFileSystem,
  RpcFileStat,
  RpcRuntimeClient,
  RpcGraphicsClient,
  RpcImageClient,
  RpcGeoSpecClient,
  RpcGraphicsExportGeometryResult,
  RpcDirectoryEntry,
} from '@taucad/chat/rpc';
import type { ExportFile, FileExtension, FileStat } from '@taucad/types';
import { DirectoryListingFailedError, DirectoryListingErrorCode } from '@taucad/fs-client/directory-listing';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { recordRpcOutcome } from '#services/rpc-ledger.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';

/** Source of file write operations */
type FileWriteSource = 'editor' | 'user' | 'machine';

/**
 * Tree facade surface used by {@link createBrowserRpcFileSystem} after {@link RpcHandlerDependencies.fileManager.whenServicesReady}.
 */
type RpcHandlerTreeService = {
  exists(path: string): Promise<boolean>;
  listDirectory(path: string): ReturnType<FileTreeService['listDirectory']>;
};

/**
 * Coerces an arbitrary thrown value into a {@link RpcClientErrorCode}.
 *
 * Reads `error.code` if present and validates against the canonical
 * `rpcClientErrorCodeSchema` enum. Anything that doesn't parse (missing,
 * non-string, or unknown enum member) collapses to `rpcClientErrorCode.unknown`
 * so the ledger never stores a free-form string that downstream consumers
 * (chat-utils, error-text JSON) would have to defensively re-validate.
 */
function extractRpcClientErrorCode(execError: unknown): RpcClientErrorCode {
  if (execError && typeof execError === 'object' && 'code' in execError) {
    const candidate: unknown = (execError as { code: unknown }).code;
    const parsed = rpcClientErrorCodeSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return rpcClientErrorCode.unknown;
}

/**
 * Dependencies required for RPC execution.
 */
export type RpcHandlerDependencies = {
  /** Active chat thread identifier (ledger + Socket.IO room correlation). */
  chatId: string;
  fileManager: {
    readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
    writeFile: (path: string, data: Uint8Array<ArrayBuffer>, options: { source: FileWriteSource }) => Promise<void>;
    deleteFile: (path: string, options: { source: FileWriteSource }) => Promise<void>;
    stat: (path: string) => Promise<FileStat>;
    whenServicesReady: () => Promise<{ treeService: RpcHandlerTreeService }>;
    runtimeFileSystem: RuntimeFileSystem;
  };
  projectRef: ActorRefFrom<typeof projectMachine>;
  headlessImageService?: Pick<HeadlessImageService, 'export'>;
  /**
   * Creates a runtime client owned by the GeoSpec test runner.
   *
   * The client must be backed by the project filesystem and shared geometry
   * cache, but must not be the active preview runtime client.
   */
  createGeoSpecClient?: () => RpcGeoSpecClient;
};
export type RpcCallInput = RpcCall & {
  toolCallId: string;
};

/**
 * Return type for createRpcHandlers
 */
export type RpcHandlers = {
  executeRpcCall<C extends RpcCallInput>(rpcCall: C): Promise<RpcResult<C['rpcName']>>;
};

function createBrowserRpcFileSystem(fileManager: RpcHandlerDependencies['fileManager']): RpcFileSystem {
  return {
    async readFile(path: string): Promise<string> {
      const data = await fileManager.readFile(path);
      return decodeTextFile(data);
    },
    async writeFile(path: string, content: string): Promise<void> {
      await fileManager.writeFile(path, encodeTextFile(content), {
        source: 'machine',
      });
    },
    async writeBinaryFile(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
      await fileManager.writeFile(path, new Uint8Array(data), { source: 'machine' });
    },
    async deleteFile(path: string): Promise<void> {
      await fileManager.deleteFile(path, { source: 'machine' });
    },
    async readdir(path: string): Promise<RpcDirectoryEntry[]> {
      const { treeService } = await fileManager.whenServicesReady();
      try {
        const entries = await treeService.listDirectory(path);
        return entries.map((entry) => {
          const modifiedAt = entry.mtimeMs > 0 ? new Date(entry.mtimeMs).toISOString() : undefined;
          if (entry.isFolder) {
            return {
              name: entry.name,
              type: 'dir',
              size: entry.size,
              ...(modifiedAt ? { modifiedAt } : {}),
            };
          }
          return {
            name: entry.name,
            type: 'file',
            size: entry.size,
            ...(entry.contentKind === 'text'
              ? { contentKind: 'text', lineCount: entry.lineCount }
              : { contentKind: 'binary' }),
            ...(modifiedAt ? { modifiedAt } : {}),
          };
        });
      } catch (error) {
        if (error instanceof DirectoryListingFailedError) {
          const mappedError = new Error(error.message) as Error & { code?: string };
          if (error.listing.code === DirectoryListingErrorCode.NotFound) {
            mappedError.code = 'ENOENT';
          }
          throw mappedError;
        }
        throw error;
      }
    },
    async exists(path: string): Promise<boolean> {
      const { treeService } = await fileManager.whenServicesReady();
      return treeService.exists(path);
    },
    async appendFile(path: string, content: string): Promise<void> {
      let existing = '';
      try {
        const data = await fileManager.readFile(path);
        existing = decodeTextFile(data);
      } catch {
        // File doesn't exist yet — will be created
      }

      await fileManager.writeFile(path, encodeTextFile(existing + content), {
        source: 'machine',
      });
    },
    // oxlint-disable-next-line max-params -- list of args is consistent with other file operations
    async editFile(
      path: string,
      oldString: string,
      newString: string,
      replaceAll?: boolean,
    ): Promise<{ occurrences: number }> {
      const data = await fileManager.readFile(path);
      const content = decodeTextFile(data);

      let updated: string;
      let occurrences: number;

      if (replaceAll) {
        occurrences = content.split(oldString).length - 1;
        updated = occurrences > 0 ? content.replaceAll(oldString, newString) : content;
      } else {
        occurrences = content.includes(oldString) ? 1 : 0;
        updated = occurrences > 0 ? content.replace(oldString, newString) : content;
      }

      if (occurrences === 0) {
        throw new Error(`String not found in ${path}`);
      }

      await fileManager.writeFile(path, encodeTextFile(updated), { source: 'machine' });
      return { occurrences };
    },
    async stat(path: string): Promise<RpcFileStat> {
      const s = await fileManager.stat(path);
      const isoDate = new Date(s.mtimeMs).toISOString();
      if (s.type === 'dir') {
        return {
          size: s.size,
          isDirectory: true,
          createdAt: isoDate,
          modifiedAt: isoDate,
        };
      }
      return s.contentKind === 'text'
        ? {
            size: s.size,
            isDirectory: false,
            createdAt: isoDate,
            modifiedAt: isoDate,
            contentKind: 'text',
            lineCount: s.lineCount,
          }
        : {
            size: s.size,
            isDirectory: false,
            createdAt: isoDate,
            modifiedAt: isoDate,
            contentKind: 'binary',
          };
    },
  };
}

/**
 * Resolves the compilation-unit actor for `targetFile`, bootstrapping it via
 * `createGeometryUnit` if it does not already exist, then awaits a *fresh*
 * render to settle (per `awaitFreshRender` in `apps/ui/app/lib/`).
 *
 * Both `getKernelResult` and `fetchGeometry` route through this helper so they
 * share a single bootstrap contract — the agent never sees a missing-geometry
 * unit error for a path it just asked the harness to evaluate, and never sees
 * a stale geometry from a prior render generation.
 */
/** Subset of {@link RpcClientErrorCode} emitted by `ensureGeometryUnit` only. */
export type EnsureGeometryUnitErrorCode = Extract<RpcClientErrorCode, 'UNKNOWN' | 'RENDER_TIMEOUT'>;

export type EnsureGeometryUnitResult =
  | {
      ok: true;
      cadUnit: ActorRefFrom<typeof cadMachine>;
      cadSnapshot: SnapshotFrom<typeof cadMachine>;
    }
  | {
      ok: false;
      errorCode: EnsureGeometryUnitErrorCode;
      message: string;
    };

async function ensureGeometryUnit(
  projectRef: ActorRefFrom<typeof projectMachine>,
  targetFile: string,
  parameters?: Record<string, unknown>,
): Promise<EnsureGeometryUnitResult> {
  try {
    const projectSnapshot = projectRef.getSnapshot();
    const { geometryUnits } = projectSnapshot.context;
    let cadUnit = geometryUnits.get(targetFile);

    if (!cadUnit) {
      projectRef.send({
        type: 'createGeometryUnit',
        entryPath: targetFile,
      });
      const refreshed = projectRef.getSnapshot();
      cadUnit = refreshed.context.geometryUnits.get(targetFile);
    }

    if (!cadUnit) {
      return {
        ok: false,
        errorCode: rpcClientErrorCode.unknown,
        message: `Failed to create geometry unit for ${targetFile}`,
      };
    }

    if (parameters !== undefined) {
      cadUnit.send({
        type: 'initializeModel',
        entryPath: targetFile,
        parameters,
      });
    }

    const cadSnapshot = await awaitFreshRender(cadUnit);

    return { ok: true, cadUnit, cadSnapshot };
  } catch (error) {
    if (error instanceof AwaitFreshRenderTimeoutError) {
      return {
        ok: false,
        errorCode: rpcClientErrorCode.renderTimeout,
        message: `Render for ${targetFile} did not settle in time. Inspect recent model changes, kernel diagnostics, and parameter values; fix the render blocker or increase render timeout for legitimately long operations.`,
      };
    }
    return {
      ok: false,
      errorCode: rpcClientErrorCode.unknown,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Heuristic check: does a kernelIssue message look like a "file not found"
 * diagnostic for the file the agent asked about? Kept permissive on purpose —
 * different kernels word the failure differently (Node `ENOENT`, OpenSCAD
 * `does not exist`, generic `not found`). Falls back to UNKNOWN if no signal.
 */
function isFileNotFoundMessage(message: string, targetFile: string): boolean {
  if (!/enoent|not found|does not exist/i.test(message)) {
    return false;
  }
  return message.toLowerCase().includes(targetFile.toLowerCase());
}

function createBrowserRuntimeClient(projectRef: ActorRefFrom<typeof projectMachine>): RpcRuntimeClient {
  return {
    async getKernelResult(targetFile: string): Promise<GetKernelResultRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, targetFile);
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }

      const { cadSnapshot } = resolved;
      const kernelIssues = cadSnapshot.context.kernelIssues.get(targetFile);
      const hasErrors = kernelIssues?.some((issue) => issue.severity === 'error') ?? false;
      const status = cadSnapshot.value === 'error' || hasErrors ? 'error' : 'ready';

      return {
        success: true,
        status,
        kernelIssues: kernelIssues ?? [],
      };
    },
  };
}

function createBrowserGeoSpecClient(createGeoSpecClient: (() => RpcGeoSpecClient) | undefined): RpcGeoSpecClient {
  return {
    async runTests(args): Promise<RunGeoSpecTestsRpcResult> {
      try {
        if (!createGeoSpecClient) {
          throw new Error('GeoSpec browser worker runner is not configured.');
        }
        return await createGeoSpecClient().runTests(args);
      } catch (error) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: error instanceof Error ? error.message : 'GeoSpec tests failed to run.',
        };
      }
    },
  };
}

function createBrowserGraphicsClient(projectRef: ActorRefFrom<typeof projectMachine>): RpcGraphicsClient {
  return {
    async fetchGeometry({ targetFile, parameters }): Promise<FetchGeometryRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, targetFile, parameters);
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }

      const { cadSnapshot } = resolved;
      const { geometry } = cadSnapshot.context;

      if (geometry?.format !== 'gltf') {
        const issues = cadSnapshot.context.kernelIssues.get(targetFile) ?? [];
        const fileNotFoundIssue = issues.find(
          (issue) => issue.severity === 'error' && isFileNotFoundMessage(issue.message, targetFile),
        );

        if (fileNotFoundIssue) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.fileNotFound,
            message: `${targetFile} does not exist on disk. Create it with create_file before testing or fix the path.`,
          };
        }

        if (cadSnapshot.value === 'idle') {
          return {
            success: false,
            errorCode: rpcClientErrorCode.noTopLevelGeometry,
            message: `${targetFile} compiled but produced no top-level geometry to render.`,
          };
        }

        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: `No GLTF geometry available for ${targetFile}`,
        };
      }

      return { success: true, glb: geometry.content };
    },

    async exportGeometry({
      targetFile,
      format,
    }: {
      targetFile: string;
      format: string;
    }): Promise<RpcGraphicsExportGeometryResult> {
      const resolved = await ensureGeometryUnit(projectRef, targetFile);
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }

      const { cadSnapshot } = resolved;
      const { kernelClient } = cadSnapshot.context;
      if (!kernelClient) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: `Runtime client not connected for ${targetFile}`,
        };
      }

      try {
        const route = bestRouteForActiveKernel(
          kernelClient,
          format as FileExtension,
          cadSnapshot.context.activeKernelId,
        );
        if (!route) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: `Export format ${format} is not available for ${targetFile}`,
          };
        }

        const exportResult = await exportWithRuntimeValidatedInput(kernelClient, route);
        if (!exportResult.success) {
          const message = exportResult.issues.map((issue) => issue.message).join('; ') || 'Geometry export failed';
          return { success: false, errorCode: rpcClientErrorCode.unknown, message };
        }

        return { success: true, files: exportResult.data };
      } catch (error) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: error instanceof Error ? error.message : 'Geometry export failed',
        };
      }
    },
  };
}

const captureViews = {
  single: [{ id: 'isometric', label: 'Isometric', phi: 60, theta: -45 }],
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RPC wire value is part of the public capture-mode contract.
  multi_angle: [
    { id: 'front', label: 'Front — View From −Y', phi: 90, theta: 270 },
    { id: 'back', label: 'Back — View From +Y', phi: 90, theta: 90 },
    { id: 'right', label: 'Right — View From +X', phi: 90, theta: 0 },
    { id: 'left', label: 'Left — View From −X', phi: 90, theta: 180 },
    { id: 'top', label: 'Top — View From +Z', phi: 0, theta: 0 },
    { id: 'bottom', label: 'Bottom — View From −Z', phi: 180, theta: 0 },
  ],
} as const;

const bytesToWebpDataUrl = (bytes: Uint8Array<ArrayBuffer>): string => {
  return `data:image/webp;base64,${uint8ArrayToBase64(bytes)}`;
};

const requireCapturedWebps = (files: ExportFile[], expectedNames: readonly string[]): ExportFile[] => {
  const actualNames = files.map((file) => file.name);
  if (
    files.length !== expectedNames.length ||
    files.some((file, index) => file.name !== expectedNames[index] || file.mimeType !== 'image/webp')
  ) {
    throw new Error(
      `Image capture expected ${expectedNames.length} WebP artifact(s) [${expectedNames.join(', ')}], received ${files.length} [${actualNames.join(', ')}]`,
    );
  }
  return files;
};

function createBrowserImageClient(
  projectRef: ActorRefFrom<typeof projectMachine>,
  imageService: Pick<HeadlessImageService, 'export'>,
  fileSystem: RuntimeFileSystem,
): RpcImageClient {
  return {
    async captureImages(input: CaptureImagesRpcInput): Promise<CaptureImagesRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, input.targetFile);
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }

      const { entryPath, parameters } = resolved.cadSnapshot.context;
      if (!entryPath) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: `Settled geometry unit for ${input.targetFile} has no entry path`,
        };
      }

      const includeEdges = input.includeEdges ?? true;
      try {
        const views = captureViews[input.mode];
        const files = await imageService.export({
          kind: 'capture',
          identity: `capture:${input.targetFile}:${input.mode}:${includeEdges}`,
          fileSystem,
          format: 'webp',
          source: { path: entryPath },
          parameters,
          includeEdges,
          exportOptions:
            input.mode === 'single'
              ? {
                  mode: 'single',
                  width: 800,
                  height: 800,
                  margin: 0.1,
                  phi: views[0].phi,
                  theta: views[0].theta,
                  projection: 'perspective',
                  label: views[0].label,
                  includeAxes: true,
                  includeLabel: true,
                  includeScale: true,
                }
              : {
                  mode: 'batch',
                  width: 800,
                  height: 800,
                  margin: 0.1,
                  projection: 'orthographic',
                  includeAxes: true,
                  includeLabel: true,
                  includeScale: true,
                  views,
                },
        });
        if (!files) {
          throw new Error('Image capture returned no artifacts');
        }

        const expectedNames =
          input.mode === 'single' ? ['thumbnail.webp'] : views.map((view) => `thumbnail-${view.id}.webp`);
        const webps = requireCapturedWebps(files, expectedNames);
        const images = views.map((view, index) => ({
          view: view.id,
          dataUrl: bytesToWebpDataUrl(webps[index]!.bytes),
        }));
        return { success: true, images };
      } catch (error) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.ioError,
          message: error instanceof Error ? error.message : 'Image capture failed',
        };
      }
    },
  };
}

/**
 * Creates RPC handlers with the given browser dependencies.
 * Adapts browser-specific deps to abstract RpcDependencies, then delegates
 * to createRpcDispatcher from @taucad/chat/rpc.
 */
export function createRpcHandlers(deps: RpcHandlerDependencies): RpcHandlers {
  const { chatId, fileManager, projectRef, headlessImageService, createGeoSpecClient } = deps;
  const fileSystem = createBrowserRpcFileSystem(fileManager);
  const skillResolver = createSkillResolver({
    async readFile(path) {
      return fileManager.readFile(path);
    },
    async listDirectory(path) {
      const { treeService } = await fileManager.whenServicesReady();
      return treeService.listDirectory(path);
    },
  });

  const rpcDeps: RpcDependencies = {
    fileSystem,
    kernelClient: createBrowserRuntimeClient(projectRef),
    geospec: createBrowserGeoSpecClient(createGeoSpecClient),
    skillResolver,
    graphics: createBrowserGraphicsClient(projectRef),
    images: headlessImageService
      ? createBrowserImageClient(projectRef, headlessImageService, fileManager.runtimeFileSystem)
      : undefined,
  };

  const dispatcher = createRpcDispatcher(rpcDeps);

  return {
    async executeRpcCall<C extends RpcCallInput>(rpcCall: C): Promise<RpcResult<C['rpcName']>> {
      const call = { rpcName: rpcCall.rpcName, args: rpcCall.args };
      const shouldLedger = mutatingRpcNames.has(rpcCall.rpcName);

      try {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- wire/union `RpcRequest` does not keep `rpcName`↔`args` paired in a fresh object for tsgo; handlers still correlate at runtime
        const result = await dispatcher.dispatch<C['rpcName']>(call as RpcCall<C['rpcName']>);
        if (shouldLedger) {
          recordRpcOutcome(chatId, rpcCall.toolCallId, { kind: 'success', output: result });
        }

        return result;
      } catch (execError) {
        if (shouldLedger) {
          const message = execError instanceof Error ? execError.message : String(execError);
          recordRpcOutcome(chatId, rpcCall.toolCallId, {
            kind: 'error',
            errorCode: extractRpcClientErrorCode(execError),
            message,
          });
        }

        throw execError;
      }
    },
  };
}
