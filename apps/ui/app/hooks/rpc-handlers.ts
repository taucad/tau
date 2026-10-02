/**
 * RPC Handlers Browser Adapter
 *
 * Thin adapter that bridges browser-specific dependencies (fileManager, XState actors,
 * WebGL) to the transport-agnostic RPC handler interfaces in @taucad/chat/rpc.
 *
 * The core handler logic lives in libs/chat/src/rpc/handlers/. This module only
 * adapts browser-specific deps into the abstract RpcDependencies interface.
 */
import { createActor } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { awaitFreshRender, AwaitFreshRenderTimeoutError } from '#machines/await-fresh-render.js';
import type {
  RpcCall,
  RpcClientErrorCode,
  RpcResult,
  GetKernelResultRpcResult,
  CaptureObservationsRpcResult,
  CaptureScreenshotRpcResult,
  FetchGeometryRpcResult,
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
  RpcGraphicsExportGeometryResult,
} from '@taucad/chat/rpc';
import type { FileExtension } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { DirectoryListingFailedError, DirectoryListingErrorCode } from '@taucad/fs-client/directory-listing';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';

import { recordRpcOutcome } from '#services/rpc-ledger.js';
import { screenshotRequestMachine, orthographicViews } from '#machines/screenshot-request.machine.js';
import { buildScreenshotOverlayForPath } from '#machines/resolve-screenshot-overlay.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';

/** Source of file write operations */
type FileWriteSource = 'editor' | 'user' | 'machine';

/**
 * Resolves the per-viewer-panel graphics actor displaying a given source file.
 * Returns undefined if no panel currently displays that file.
 *
 * Multi-file aware: every agent-facing screenshot/observation flow looks up
 * the targeted geometry unit explicitly — there is no project-level
 * `mainEntryFile` fallback.
 */
export type ResolveGraphicsForFile = (targetFile: string) => ActorRefFrom<typeof graphicsMachine> | undefined;

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
    stat: (path: string) => Promise<{ type: 'file' | 'dir'; size: number; mtimeMs: number }>;
    whenServicesReady: () => Promise<{ treeService: RpcHandlerTreeService }>;
  };
  /**
   * Function that maps a source file path to its viewer panel's graphics actor.
   * Pass `undefined` in headless modes where no view is mounted.
   */
  resolveGraphicsForFile: ResolveGraphicsForFile | undefined;
  projectRef: ActorRefFrom<typeof projectMachine>;
  screenshotQuality: number;
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
    async readdir(path: string): Promise<
      Array<{
        name: string;
        type: 'file' | 'dir';
        size: number;
        modifiedAt?: string;
      }>
    > {
      const { treeService } = await fileManager.whenServicesReady();
      try {
        const entries = await treeService.listDirectory(path);
        return entries.map((entry) => ({
          name: entry.name,
          type: entry.isFolder ? 'dir' : 'file',
          size: entry.size,
          ...(entry.mtimeMs > 0 ? { modifiedAt: new Date(entry.mtimeMs).toISOString() } : {}),
        }));
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
      return {
        size: s.size,
        isDirectory: s.type === 'dir',
        createdAt: isoDate,
        modifiedAt: isoDate,
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
): Promise<EnsureGeometryUnitResult> {
  try {
    const projectSnapshot = projectRef.getSnapshot();
    const { geometryUnits } = projectSnapshot.context;
    let cadUnit = geometryUnits.get(targetFile);

    if (!cadUnit) {
      projectRef.send({
        type: 'createGeometryUnit',
        entryFile: targetFile,
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
        message: `Render for ${targetFile} did not settle in time. Try a simpler model or wait and retry.`,
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

function createBrowserGraphicsClient(
  resolveGraphicsForFile: ResolveGraphicsForFile,
  projectRef: ActorRefFrom<typeof projectMachine>,
  screenshotQuality: number,
): RpcGraphicsClient {
  return {
    async fetchGeometry({ targetFile }): Promise<FetchGeometryRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, targetFile);
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }

      const { cadSnapshot } = resolved;
      const geometry = cadSnapshot.context.geometries.find((g) => g.format === 'gltf');

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
        const exportResult = await kernelClient.export(format as FileExtension);
        if (!exportResult.success) {
          const message = exportResult.issues.map((issue) => issue.message).join('; ') || 'Geometry export failed';
          return { success: false, errorCode: rpcClientErrorCode.unknown, message };
        }

        const { bytes, mimeType } = exportResult.data;
        return { success: true, bytes, mimeType };
      } catch (error) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknown,
          message: error instanceof Error ? error.message : 'Geometry export failed',
        };
      }
    },

    async captureScreenshot({ targetFile }): Promise<CaptureScreenshotRpcResult> {
      const graphicsRef = resolveGraphicsForFile(targetFile);
      if (!graphicsRef) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknownGeometryUnit,
          message: `No viewer panel currently displays ${targetFile}`,
        };
      }

      try {
        const source = await new Promise<string>((resolve, reject) => {
          const screenshotActor = createActor(screenshotRequestMachine, {
            input: { graphicsRef },
          }).start();

          screenshotActor.send({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/webp',
                quality: screenshotQuality,
                isPreview: true,
              },
              cameraAngles: [orthographicViews[0]!],
              aspectRatio: 1,
              maxResolution: 800,
              zoomLevel: 1.2,
              overlay: buildScreenshotOverlayForPath(targetFile),
            },
            onSuccess(dataUrls) {
              screenshotActor.stop();
              const capturedScreenshot = dataUrls[0];
              if (!capturedScreenshot) {
                reject(new Error('No screenshot data received'));
                return;
              }

              resolve(capturedScreenshot);
            },
            onError(errorMessage) {
              screenshotActor.stop();
              reject(new Error(errorMessage));
            },
          });
        });

        return {
          success: true,
          images: [{ view: 'current', dataUrl: source }],
        };
      } catch (error) {
        return {
          success: false,
          errorCode: error instanceof Error ? rpcClientErrorCode.ioError : rpcClientErrorCode.unknown,
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },

    async captureObservations({ targetFile }): Promise<CaptureObservationsRpcResult> {
      const graphicsRef = resolveGraphicsForFile(targetFile);
      if (!graphicsRef) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.unknownGeometryUnit,
          message: `No viewer panel currently displays ${targetFile}`,
        };
      }

      try {
        const viewAngles = orthographicViews.slice(0, 6);

        const compositeDataUrl = await new Promise<string>((resolve, reject) => {
          const screenshotActor = createActor(screenshotRequestMachine, {
            input: { graphicsRef },
          }).start();

          screenshotActor.send({
            type: 'requestCompositeScreenshot',
            options: {
              output: {
                format: 'image/webp',
                quality: screenshotQuality,
                isPreview: true,
              },
              cameraAngles: viewAngles,
              overlay: buildScreenshotOverlayForPath(targetFile),
              aspectRatio: 1,
              maxResolution: 800,
              zoomLevel: 1.2,
            },
            onSuccess(dataUrls) {
              screenshotActor.stop();
              const compositeUrl = dataUrls[0];
              if (!compositeUrl) {
                reject(new Error('No composite screenshot data received'));
                return;
              }

              resolve(compositeUrl);
            },
            onError(errorMessage) {
              screenshotActor.stop();
              reject(new Error(errorMessage));
            },
          });
        });

        return {
          success: true,
          observations: [
            {
              id: generatePrefixedId(idPrefix.observation),
              side: 'composite',
              src: compositeDataUrl,
            },
          ],
        };
      } catch (error) {
        return {
          success: false,
          errorCode: error instanceof Error ? rpcClientErrorCode.ioError : rpcClientErrorCode.unknown,
          message: error instanceof Error ? error.message : 'Unknown error',
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
  const { chatId, fileManager, resolveGraphicsForFile, projectRef, screenshotQuality } = deps;

  const rpcDeps: RpcDependencies = {
    fileSystem: createBrowserRpcFileSystem(fileManager),
    kernelClient: createBrowserRuntimeClient(projectRef),
    graphics: resolveGraphicsForFile
      ? createBrowserGraphicsClient(resolveGraphicsForFile, projectRef, screenshotQuality)
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
