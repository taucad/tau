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
import { awaitFreshRender, AwaitFreshRenderTimeoutError } from '#machines/await-fresh-render.js';
import type {
  RpcCall,
  RpcClientErrorCode,
  RpcResult,
  GetKernelResultRpcResult,
  CaptureImagesRpcResult,
  CaptureImagesRpcInput,
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
import type { FileExtension, FileStat } from '@taucad/types';
import type { KernelIssue } from '@taucad/runtime';
import { DirectoryListingFailedError, DirectoryListingErrorCode } from '@taucad/fs-client/directory-listing';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { getErrno } from '@taucad/utils/error';
import { recordRpcOutcome } from '#services/rpc-ledger.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { createSourceModelInteractionUnitId } from '#machines/model-interaction.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { canonicalCaptureViews, captureCadImages, captureFilesToDataUrls } from '#services/headless-capture.js';

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
      } catch (error) {
        if (!(error instanceof FileNotFoundError) && getErrno(error) !== 'ENOENT') {
          throw error;
        }
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
 * Runtime, export, and image operations route through this helper so they
 * share one bootstrap contract and never observe stale geometry from a prior
 * render generation.
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

function getLatestGeometryFailure(
  cadSnapshot: SnapshotFrom<typeof cadMachine>,
  targetFile: string,
): KernelIssue[] | undefined {
  if (cadSnapshot.context.latestGeometryOutcome !== 'failure') {
    return undefined;
  }
  return cadSnapshot.context.kernelIssues.get(targetFile) ?? [];
}

function geometryFailureMessage(issues: KernelIssue[], targetFile: string): string {
  return issues.map((issue) => issue.message).join('; ') || `Render for ${targetFile} failed`;
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

      const failedIssues = getLatestGeometryFailure(cadSnapshot, targetFile);
      if (failedIssues) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: geometryFailureMessage(failedIssues, targetFile),
        };
      }
      if (cadSnapshot.context.latestGeometryOutcome !== 'success') {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: `No current successful geometry is available for ${targetFile}`,
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

function createBrowserImageClient(
  projectRef: ActorRefFrom<typeof projectMachine>,
  imageService: Pick<HeadlessImageService, 'export'>,
): RpcImageClient {
  const findGraphicsRef = (targetFile: string): ActorRefFrom<typeof graphicsMachine> | undefined => {
    const unitId = createSourceModelInteractionUnitId(targetFile);
    for (const graphicsRef of projectRef.getSnapshot().context.viewGraphics.values()) {
      if (graphicsRef.getSnapshot().context.modelInteractionUnitId === unitId) {
        return graphicsRef;
      }
    }
    return undefined;
  };

  return {
    async captureImages(input: CaptureImagesRpcInput): Promise<CaptureImagesRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, input.targetFile);
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }
      if (!resolved.cadSnapshot.context.entryPath) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: `Settled geometry unit for ${input.targetFile} has no entry path`,
        };
      }

      const includeEdges = input.includeEdges ?? true;
      try {
        const files = await captureCadImages({
          cadRef: resolved.cadUnit,
          graphicsRef: findGraphicsRef(input.targetFile),
          imageService,
          recipe: {
            purpose: 'agent',
            mode: input.mode === 'single' ? 'isometric' : 'orthographic',
            includeEdges,
          },
        });
        const views =
          resolved.cadSnapshot.context.geometry?.format === 'svg'
            ? (['drawing'] as const)
            : input.mode === 'single'
              ? (['isometric'] as const)
              : canonicalCaptureViews.map((view) => view.id);
        const dataUrls = captureFilesToDataUrls(files);
        const images = views.map((view, index) => ({
          view,
          dataUrl: dataUrls[index]!,
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
    images: headlessImageService ? createBrowserImageClient(projectRef, headlessImageService) : undefined,
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
