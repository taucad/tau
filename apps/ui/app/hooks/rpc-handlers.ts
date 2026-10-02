import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
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
import { awaitFreshRender, AwaitFreshOperationTimeoutError } from '#machines/await-fresh-render.js';
import type {
  RpcCall,
  RpcClientErrorCode,
  RpcResult,
  EvaluateModelRpcResult,
  CaptureImagesRpcResult,
  CaptureImagesRpcInput,
  RunGeoSpecTestsRpcResult,
} from '@taucad/chat';
import { rpcClientErrorCode, rpcClientErrorCodeSchema } from '@taucad/chat';
import { mutatingRpcNames } from '@taucad/chat/constants';
import { applyClientTextMutation, createExactReplacementPlan, createRpcDispatcher } from '@taucad/chat/rpc';
import type {
  RpcDependencies,
  RpcFileSystem,
  RpcFileStat,
  RpcRuntimeClient,
  RpcGraphicsClient,
  RpcImageClient,
  RpcGeoSpecClient,
  RpcGraphicsExportModelResult,
  RpcDirectoryEntry,
} from '@taucad/chat/rpc';
import type { CheckedFileWrite, CheckedFileWriteResult, FileStat, FileWritePrecondition } from '@taucad/types';
import { assertRootedPath, resolveAuthorityPath } from '@taucad/utils/path';
import { asKnownArtifact } from '@taucad/runtime';
import type { KernelIssue, ViewOffer } from '@taucad/runtime';
import { DirectoryListingFailedError, DirectoryListingErrorCode } from '@taucad/fs-client/directory-listing';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { getErrno } from '@taucad/utils/error';
import { randomUuid } from '@taucad/utils/id';
import { recordRpcOutcome } from '#services/rpc-ledger.js';
import type { projectMachine } from '#machines/project.machine.js';
import { selectCadFailureIssues } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { createSourceModelInteractionUnitId } from '#machines/model-interaction.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { createSkillResolver } from '#lib/skill-resolver.js';
import type { HeadlessImageService } from '#services/headless-image.service.js';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { ResourceQueue } from '@taucad/filesystem';
import { z } from 'zod';
import {
  canonicalCaptureViews,
  captureCadImages,
  captureFilesToDataUrls,
  omittedSectionCutsNotice,
} from '#services/headless-capture.js';

/** Source of file write operations */
type FileWriteSource = 'editor' | 'user' | 'machine';

/**
 * Tree facade surface used by {@link createBrowserRpcFileSystem} after {@link RpcHandlerDependencies.fileManager.whenServicesReady}.
 */
type RpcHandlerTreeService = {
  exists(path: string): Promise<boolean>;
  listDirectory(path: string): ReturnType<FileTreeService['listDirectory']>;
  listDirectoryExact(path: string): ReturnType<FileTreeService['listDirectoryExact']>;
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
  const parsed = z.object({ code: rpcClientErrorCodeSchema }).safeParse(execError);
  return parsed.success ? parsed.data.code : rpcClientErrorCode.unknown;
}

/**
 * Dependencies required for RPC execution.
 */
export type RpcHandlerDependencies = {
  /** Active chat thread identifier (ledger + Socket.IO room correlation). */
  chatId: string;
  fileManager: {
    fileManagerRef: { getSnapshot(): { context: { rootDirectory: string } } };
    workbenchFiles: {
      writeFileChecked(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult>;
      deleteFileChecked(input: {
        path: string;
        preconditions: readonly FileWritePrecondition[];
      }): Promise<CheckedFileWriteResult>;
    };
    readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
    writeFile: (path: string, data: Uint8Array<ArrayBuffer>, options: { source: FileWriteSource }) => Promise<void>;
    deleteFile: (path: string, options: { source: FileWriteSource }) => Promise<void>;
    stat: (path: string) => Promise<FileStat>;
    whenServicesReady: () => Promise<{ treeService: RpcHandlerTreeService }>;
    runtimeFileSystem: RuntimeFileSystem;
  };
  projectRef?: ActorRefFrom<typeof projectMachine>;
  /** Headless overrides retained independently of the visible project route. */
  kernelClient?: RpcRuntimeClient;
  graphicsClient?: RpcGraphicsClient;
  imageClient?: RpcImageClient;
  geoSpecClient?: RpcGeoSpecClient;
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

const mutationQueuesByAuthority = new WeakMap<RuntimeFileSystem, ResourceQueue>();

const mutationQueueFor = (authority: RuntimeFileSystem): ResourceQueue => {
  const existing = mutationQueuesByAuthority.get(authority);
  if (existing) {
    return existing;
  }
  const queue = new ResourceQueue();
  mutationQueuesByAuthority.set(authority, queue);
  return queue;
};

function createBrowserRpcFileSystem(fileManager: RpcHandlerDependencies['fileManager']): RpcFileSystem {
  const mutationQueue = mutationQueueFor(fileManager.runtimeFileSystem);
  const absolute = (path: string): string =>
    resolveAuthorityPath(`${fileManager.fileManagerRef.getSnapshot().context.rootDirectory}/${assertRootedPath(path)}`);
  const absolutePreconditions = (preconditions: readonly FileWritePrecondition[]): FileWritePrecondition[] =>
    preconditions.map((precondition) => ({ ...precondition, path: absolute(precondition.path) }));
  const readFileBytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(await fileManager.readFile(path));
  const writeFileIfUnchanged = async (
    path: string,
    expected: Uint8Array<ArrayBuffer>,
    replacement: Uint8Array<ArrayBuffer>,
  ): Promise<
    | Readonly<{ status: 'committed'; committedBytes: Uint8Array<ArrayBuffer> }>
    | Readonly<{ status: 'conflict'; currentBytes: Uint8Array<ArrayBuffer> }>
  > =>
    mutationQueue.queueFor(path, async () => {
      const currentBytes = await readFileBytes(path);
      const unchanged =
        currentBytes.byteLength === expected.byteLength &&
        currentBytes.every((byte, index) => byte === expected[index]);
      if (!unchanged) {
        return { status: 'conflict', currentBytes } as const;
      }
      await fileManager.writeFile(path, new Uint8Array(replacement), { source: 'machine' });
      return { status: 'committed', committedBytes: await readFileBytes(path) } as const;
    });
  const stat = async (path: string): Promise<RpcFileStat> => {
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
  };

  return {
    async readBinaryFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
      const rootedPath = assertRootedPath(path);
      const maximumReadBytes = 256 * 1024 * 1024;
      const metadata = await fileManager.stat(rootedPath);
      if (metadata.type === 'dir' || metadata.size > maximumReadBytes) {
        throw Object.assign(new Error(`File '${path}' exceeds the binary read limit or is a directory.`), {
          code: rpcClientErrorCode.resultTooLarge,
        });
      }
      const data = await readFileBytes(rootedPath);
      if (data.byteLength > maximumReadBytes) {
        throw Object.assign(new Error(`File '${path}' exceeds the binary read limit.`), {
          code: rpcClientErrorCode.resultTooLarge,
        });
      }
      return data;
    },
    async readFile(path: string): Promise<string> {
      const data = await fileManager.readFile(path);
      try {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- `ignoreBOM` is the native TextDecoder option name.
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
      } catch {
        throw Object.assign(new Error(`File '${path}' is not valid UTF-8 text.`), {
          code: rpcClientErrorCode.invalidTextEncoding,
        });
      }
    },
    async writeFile(path: string, content: string): Promise<void> {
      const data = encodeTextFile(content);
      await mutationQueue.queueFor(path, async () =>
        fileManager.writeFile(path, data, {
          source: 'machine',
        }),
      );
    },
    async writeFileChecked(input) {
      return fileManager.workbenchFiles.writeFileChecked({
        path: absolute(input.path),
        data: input.data,
        preconditions: absolutePreconditions(input.preconditions),
      });
    },
    async deleteFileChecked(input) {
      return fileManager.workbenchFiles.deleteFileChecked({
        path: absolute(input.path),
        preconditions: absolutePreconditions(input.preconditions),
      });
    },
    async writeBinaryFile(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
      const ownedData = new Uint8Array(data);
      await mutationQueue.queueFor(path, async () => fileManager.writeFile(path, ownedData, { source: 'machine' }));
    },
    async deleteFile(path: string): Promise<void> {
      await mutationQueue.queueFor(path, async () => fileManager.deleteFile(path, { source: 'machine' }));
    },
    async readdir(path: string): Promise<RpcDirectoryEntry[]> {
      const { treeService } = await fileManager.whenServicesReady();
      try {
        const entries = await treeService.listDirectoryExact(path);
        return entries.map((entry): RpcDirectoryEntry => {
          const modifiedAt = entry.mtimeMs > 0 ? new Date(entry.mtimeMs).toISOString() : undefined;
          const common = {
            name: entry.name,
            size: entry.size,
            ...(modifiedAt ? { modifiedAt } : {}),
            ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
          };
          if (entry.type === 'dir') {
            return {
              ...common,
              type: 'dir',
              ...(entry.provenance !== undefined && entry.provenance.source !== 'project'
                ? { traverseOnImplicitSearch: false }
                : {}),
            };
          }
          return entry.contentKind === 'text'
            ? { ...common, type: 'file', contentKind: 'text', lineCount: entry.lineCount }
            : { ...common, type: 'file', contentKind: 'binary' };
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
      await mutationQueue.queueFor(path, async () => {
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
      });
    },
    async editFile({ targetFile: path, oldString, newString, replaceAll, expectedDigest }) {
      const result = await applyClientTextMutation({
        targetFile: path,
        expectedDigest,
        fileSystem: {
          stat,
          readFileBytes,
          writeFileIfUnchanged:
            expectedDigest === undefined
              ? writeFileIfUnchanged
              : async (target, expected, replacement) => {
                  const committed = await fileManager.workbenchFiles.writeFileChecked({
                    path: absolute(target),
                    data: replacement,
                    preconditions: [{ path: absolute(target), expected }],
                  });
                  if (committed.status === 'conflict') {
                    throw Object.assign(
                      new Error('Reviewed bytes changed before commit. Read and review the file again.'),
                      { code: rpcClientErrorCode.editConflict },
                    );
                  }
                  return { status: 'committed', committedBytes: new Uint8Array(committed.content) };
                },
        },
        plan: createExactReplacementPlan({ oldString, newString, replaceAll, expectedDigest }),
      });
      if (!result.ok) {
        throw Object.assign(new Error(result.message), { code: result.errorCode });
      }
      return {
        occurrences: result.occurrences,
        ...(result.staleRecovered ? { staleRecovered: true } : {}),
        diffStats: result.diffStats,
        digest: result.digest,
      };
    },
    stat,
  };
}

/**
 * Claims the compilation-unit actor for `targetFile`, creating or resuming it
 * as needed, then awaits a *fresh*
 * render to settle (per `awaitFreshRender` in `apps/ui/app/lib/`).
 *
 * Runtime, export, and image operations route through this helper so they
 * share one bootstrap contract and never observe stale geometry from a prior
 * render generation.
 */
/** Subset of {@link RpcClientErrorCode} emitted by `ensureGeometryUnit` only. */
export type EnsureGeometryUnitErrorCode = Extract<RpcClientErrorCode, 'UNKNOWN' | 'OPERATION_TIMEOUT'>;

export type EnsureGeometryUnitResult =
  | {
      ok: true;
      cadUnit: ActorRefFrom<typeof cadMachine>;
      cadSnapshot: SnapshotFrom<typeof cadMachine>;
      release: () => void;
    }
  | {
      ok: false;
      errorCode: EnsureGeometryUnitErrorCode;
      message: string;
    };

async function ensureGeometryUnit(
  projectRef: ActorRefFrom<typeof projectMachine>,
  targetFile: string,
  options: {
    operationTimeoutForFile: (path: string) => Promise<number | undefined>;
    signal?: AbortSignal;
  },
): Promise<EnsureGeometryUnitResult> {
  const claimId = randomUuid();
  let retained = false;
  try {
    const operationTimeout = await options.operationTimeoutForFile(targetFile);
    options.signal?.throwIfAborted();
    projectRef.send({
      type: 'claimGeometryUnit',
      claimId,
      entryPath: targetFile,
      operationTimeout,
    });
    const cadUnit = projectRef.getSnapshot().context.geometryUnits.get(targetFile);

    if (!cadUnit) {
      return {
        ok: false,
        errorCode: rpcClientErrorCode.unknown,
        message: `Failed to create geometry unit for ${targetFile}`,
      };
    }

    const cadSnapshot = await awaitFreshRender(cadUnit, { signal: options.signal });

    retained = true;
    return {
      ok: true,
      cadUnit,
      cadSnapshot,
      release: () => {
        projectRef.send({ type: 'releaseGeometryUnit', claimId });
      },
    };
  } catch (error) {
    if (error instanceof AwaitFreshOperationTimeoutError) {
      return {
        ok: false,
        errorCode: rpcClientErrorCode.operationTimeout,
        message: `Render for ${targetFile} did not settle in time. Inspect recent model changes, kernel diagnostics, and parameter values; fix the render blocker or increase render timeout for legitimately long operations.`,
      };
    }
    return {
      ok: false,
      errorCode: rpcClientErrorCode.unknown,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    if (!retained) {
      projectRef.send({ type: 'releaseGeometryUnit', claimId });
    }
  }
}

function geometryFailureMessage(issues: readonly KernelIssue[]): string {
  return issues.map((issue) => issue.message).join('; ');
}

function createBrowserRuntimeClient(
  projectRef: ActorRefFrom<typeof projectMachine>,
  operationTimeoutForFile: (path: string) => Promise<number | undefined>,
): RpcRuntimeClient {
  return {
    async evaluateModel({ targetFile, includeCapabilities }, context): Promise<EvaluateModelRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, targetFile, {
        operationTimeoutForFile,
        signal: context?.signal,
      });
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }
      try {
        const { cadSnapshot } = resolved;
        context?.signal?.throwIfAborted();
        const { evaluation, kernelClient, activeKernelId } = cadSnapshot.context;
        const lastProjection =
          cadSnapshot.context.lastProjection?.evaluationId === evaluation?.id
            ? cadSnapshot.context.lastProjection
            : undefined;
        const kernelIssues = cadSnapshot.context.kernelIssues.get(targetFile) ?? [];
        const ready =
          evaluation?.success === true &&
          (evaluation.views.length === 0 || cadSnapshot.context.latestRenderingOutcome === 'success');
        const offered = evaluation?.success
          ? {
              views: evaluation.views.map(({ id }) => id),
              instances: Object.fromEntries(
                evaluation.views
                  .filter(({ instances }) => instances !== undefined)
                  .map(({ id, instances }) => [id, [...(instances ?? [])]]),
              ),
              exports: Object.fromEntries(evaluation.exports.map(({ id, extension }) => [id, extension])),
            }
          : {};
        const metadata = (options: ViewOffer['options']) => ({
          schema: Object.fromEntries(Object.entries(options?.schema ?? { type: 'object', properties: {} })),
          defaults: z.record(z.string(), z.json()).parse(options?.defaults ?? {}),
        });
        const capabilities =
          includeCapabilities && evaluation?.success
            ? {
                capabilities: {
                  views: Object.fromEntries(evaluation.views.map(({ id, options }) => [id, metadata(options)])),
                  exports: Object.fromEntries(evaluation.exports.map(({ id, options }) => [id, metadata(options)])),
                  targets: [
                    ...new Set([
                      ...evaluation.exports.map(({ id }) => id),
                      ...evaluation.exports.map(({ extension }) => extension),
                      ...(kernelClient?.capabilities?.routes
                        .filter((route) => route.kernelId === activeKernelId)
                        .map(({ targetFormat }) => targetFormat) ?? []),
                    ]),
                  ],
                },
              }
            : {};
        return {
          success: true,
          status: ready ? 'ready' : 'error',
          kernelIssues,
          ...((lastProjection?.sourceRevision ?? evaluation?.sourceRevision)
            ? { sourceRevision: lastProjection?.sourceRevision ?? evaluation?.sourceRevision }
            : {}),
          ...offered,
          ...capabilities,
        };
      } finally {
        resolved.release();
      }
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

function createBrowserGraphicsClient(
  projectRef: ActorRefFrom<typeof projectMachine>,
  operationTimeoutForFile: (path: string) => Promise<number | undefined>,
): RpcGraphicsClient {
  return {
    async exportModel({ targetFile, to, options }, context): Promise<RpcGraphicsExportModelResult> {
      const resolved = await ensureGeometryUnit(projectRef, targetFile, {
        operationTimeoutForFile,
        signal: context?.signal,
      });
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }

      try {
        const { cadSnapshot } = resolved;
        const { document, evaluation } = cadSnapshot.context;
        if (!document) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: `Runtime client not connected for ${targetFile}`,
          };
        }

        if (!evaluation?.success) {
          const failedIssues = evaluation?.issues ?? selectCadFailureIssues(cadSnapshot) ?? [];
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: geometryFailureMessage(failedIssues) || `Model evaluation failed for ${targetFile}`,
          };
        }
        try {
          context?.signal?.throwIfAborted();
          const exportResult = await document.export(to, { options, signal: context?.signal });
          if (!exportResult.success) {
            const message = exportResult.issues.map((issue) => issue.message).join('; ') || 'Geometry export failed';
            return { success: false, errorCode: rpcClientErrorCode.unknown, message };
          }

          return {
            success: true,
            exportId: exportResult.exportId,
            files: [...exportResult.files],
            issues: [...exportResult.issues],
            ...(exportResult.sourceRevision === undefined ? {} : { sourceRevision: exportResult.sourceRevision }),
          };
        } catch (error) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: error instanceof Error ? error.message : 'Geometry export failed',
          };
        }
      } finally {
        resolved.release();
      }
    },
  };
}

function createBrowserImageClient(
  projectRef: ActorRefFrom<typeof projectMachine>,
  imageService: Pick<HeadlessImageService, 'export'>,
  operationTimeoutForFile: (path: string) => Promise<number | undefined>,
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
    async captureImages(input: CaptureImagesRpcInput, context): Promise<CaptureImagesRpcResult> {
      const resolved = await ensureGeometryUnit(projectRef, input.targetFile, {
        operationTimeoutForFile,
        signal: context?.signal,
      });
      if (!resolved.ok) {
        return { success: false, errorCode: resolved.errorCode, message: resolved.message };
      }
      try {
        if (!resolved.cadSnapshot.context.entryPath) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: `Settled geometry unit for ${input.targetFile} has no entry path`,
          };
        }

        const includeEdges = input.includeEdges ?? true;
        try {
          const { files, omittedSectionCutIds } = await captureCadImages({
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
            resolved.cadSnapshot.context.rendering?.success &&
            asKnownArtifact(resolved.cadSnapshot.context.rendering.artifact)?.mimeType === 'image/svg+xml'
              ? (['drawing'] as const)
              : input.mode === 'single'
                ? (['isometric'] as const)
                : canonicalCaptureViews.map((view) => view.id);
          const dataUrls = captureFilesToDataUrls(files);
          const images = views.map((view, index) => ({
            view,
            dataUrl: dataUrls[index]!,
          }));
          // One line, so the agent never describes a cut the images do not show.
          return {
            success: true,
            images,
            ...(omittedSectionCutIds.length > 0 ? { message: omittedSectionCutsNotice } : {}),
          };
        } catch (error) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.ioError,
            message: error instanceof Error ? error.message : 'Image capture failed',
          };
        }
      } finally {
        resolved.release();
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
  const operationTimeoutForFile = async (path: string): Promise<number | undefined> => {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await fileManager.readFile(workbenchPaths.entries);
    } catch (error) {
      if (error instanceof FileNotFoundError || getErrno(error) === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
    const read = workbenchRecords.entries.read(bytes);
    if (read.status !== 'current') {
      throw new Error('Workbench entry settings need repair before rendering.');
    }
    return read.record.entries[path]?.renderTimeout;
  };
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
    kernelClient:
      deps.kernelClient ??
      (projectRef
        ? createBrowserRuntimeClient(projectRef, operationTimeoutForFile)
        : {
            evaluateModel: async () => ({
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: 'No project runtime is available',
            }),
          }),
    geospec: deps.geoSpecClient ?? createBrowserGeoSpecClient(createGeoSpecClient),
    skillResolver,
    graphics:
      deps.graphicsClient ??
      (projectRef ? createBrowserGraphicsClient(projectRef, operationTimeoutForFile) : undefined),
    images:
      deps.imageClient ??
      (projectRef && headlessImageService
        ? createBrowserImageClient(projectRef, headlessImageService, operationTimeoutForFile)
        : undefined),
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
