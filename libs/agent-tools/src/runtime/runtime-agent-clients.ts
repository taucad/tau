import { rpcClientErrorCode } from '@taucad/chat';
import type {
  RpcGraphicsClient,
  RpcGraphicsExportGeometryResult,
  RpcHandlerError,
  RpcImageClient,
  RpcInvocationContext,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import type { ExportFile, HashedGeometryResult, KernelIssue } from '@taucad/runtime/types';
import { assertRootedPath } from '@taucad/utils/path';

import { buildCaptureExportOptions, canonicalCaptureViews } from '#capture/capture-views.js';
import { captureFilesToDataUrls } from '#capture/capture-data-urls.js';

const captureSize = 1600;
const glbMagic = 0x46_54_6c_67;
const glbVersion = 2;

/** Runtime surface required by request-scoped agent geometry operations. @public */
export type RuntimeAgentClient = Readonly<{
  evaluate(input: {
    readonly source: { readonly path: string };
    readonly parameters: Record<string, never>;
    readonly content: { readonly includeEdges: boolean };
    readonly signal?: AbortSignal;
  }): Promise<HashedGeometryResult>;
  export(
    format: string,
    options: { readonly source: { readonly path: string }; readonly signal?: AbortSignal },
  ): Promise<
    | { readonly success: true; readonly data: readonly ExportFile[]; readonly issues: readonly KernelIssue[] }
    | { readonly success: false; readonly issues: readonly KernelIssue[] }
  >;
}>;

/** Existing image-service request injected by each runtime placement. @public */
export type RuntimeAgentImageJob = (
  | Readonly<{
      kind: 'capture';
      identity: string;
      sourceFormat: 'svg';
      sourcePath: string;
      content: string;
      format: 'png';
      exportOptions: Readonly<{
        width: number;
        height: number;
        margin: number;
        background: string;
        axes: boolean;
        scaleBar: boolean;
        lengthSymbol: string;
      }>;
    }>
  | Readonly<{
      kind: 'capture';
      identity: string;
      sourceFormat: 'glb';
      sourcePath: string;
      geometryHash: string;
      content: Uint8Array<ArrayBuffer>;
      format: 'webp';
      exportOptions: ReturnType<typeof buildCaptureExportOptions>;
    }>
) & { readonly signal?: AbortSignal };

/** Host-specific image execution callback; rendering infrastructure remains placement-owned. @public */
export type RuntimeAgentImageExporter = (job: RuntimeAgentImageJob) => Promise<readonly ExportFile[] | undefined>;

/** Runtime error projection supplied by the embedding RPC host. @public */
export type RuntimeAgentErrorMapper = (error: unknown, targetFile: string) => RpcHandlerError;

/** Inputs for building request-scoped runtime-backed agent RPC clients. @public */
export type CreateRuntimeAgentClientsInput = Readonly<{
  runtime: RuntimeAgentClient;
  exportImage: RuntimeAgentImageExporter;
  mapRuntimeError: RuntimeAgentErrorMapper;
}>;

const issueMessage = (issues: ReadonlyArray<{ readonly message: string }>, fallback: string): string =>
  issues.map((issue) => issue.message).join('; ') || fallback;

const requireImageFiles = (
  files: readonly ExportFile[] | undefined,
  options: Readonly<{
    count: number;
    mimeType: 'image/png' | 'image/webp';
    names?: readonly string[];
  }>,
): readonly ExportFile[] => {
  if (
    files?.length !== options.count ||
    files.some(
      (file, index) =>
        file.mimeType !== options.mimeType ||
        file.bytes.byteLength === 0 ||
        (options.names !== undefined && file.name !== options.names[index]),
    )
  ) {
    throw new Error(`Image capture expected ${String(options.count)} non-empty ${options.mimeType} artifact(s)`);
  }
  return files;
};

const assertGlb = (bytes: Uint8Array<ArrayBuffer>): void => {
  if (bytes.byteLength < 12) {
    throw new TypeError('Evaluated GLTF display artifact is not a GLB 2 container');
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, 12);
  if (
    header.getUint32(0, true) !== glbMagic ||
    header.getUint32(4, true) !== glbVersion ||
    header.getUint32(8, true) !== bytes.byteLength
  ) {
    throw new TypeError('Evaluated GLTF display artifact is not a GLB 2 container');
  }
};

/**
 * Build the three geometry RPC clients over one request-scoped runtime adapter.
 * @param input - Runtime, image executor, and host error projection.
 * @returns RPC clients that never read or replace active preview state.
 * @public
 */
export const createRuntimeAgentClients = (
  input: CreateRuntimeAgentClientsInput,
): Readonly<{ kernelClient: RpcRuntimeClient; graphics: RpcGraphicsClient; images: RpcImageClient }> => {
  const evaluate = async (targetFile: string, context?: RpcInvocationContext): Promise<HashedGeometryResult> => {
    context?.signal?.throwIfAborted();
    return input.runtime.evaluate({
      source: { path: assertRootedPath(targetFile) },
      parameters: {},
      content: { includeEdges: true },
      signal: context?.signal,
    });
  };

  const kernelClient: RpcRuntimeClient = {
    async getKernelResult(targetFile, context) {
      try {
        const result = await evaluate(targetFile, context);
        context?.signal?.throwIfAborted();
        return {
          success: true,
          status: result.success ? 'ready' : 'error',
          kernelIssues: [...result.issues],
        };
      } catch (error) {
        return input.mapRuntimeError(error, targetFile);
      }
    },
  };

  const graphics: RpcGraphicsClient = {
    async exportGeometry({ targetFile, format }, context): Promise<RpcGraphicsExportGeometryResult> {
      try {
        context?.signal?.throwIfAborted();
        const rooted = assertRootedPath(targetFile);
        const result = await input.runtime.export(format, { source: { path: rooted }, signal: context?.signal });
        context?.signal?.throwIfAborted();
        return result.success
          ? { success: true, files: [...result.data] }
          : {
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: issueMessage(result.issues, 'Geometry export failed'),
            };
      } catch (error) {
        return input.mapRuntimeError(error, targetFile);
      }
    },
  };

  const images: RpcImageClient = {
    async captureImages(captureInput, context) {
      try {
        const targetFile = assertRootedPath(captureInput.targetFile);
        const result = await evaluate(targetFile, context);
        context?.signal?.throwIfAborted();
        if (!result.success) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: issueMessage(result.issues, 'Render failed'),
          };
        }
        const geometry = result.data;
        if (geometry.format === 'webrtc') {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: 'Live WebRTC geometry cannot be captured headlessly',
          };
        }
        if (geometry.format === 'svg') {
          if (captureInput.mode === 'multi_angle') {
            return {
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: 'Planar SVG drawings have one canonical view',
            };
          }
          if (geometry.units === undefined) {
            return {
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: 'Annotated SVG capture requires the artifact coordinate length unit',
            };
          }
          const files = requireImageFiles(
            await input.exportImage({
              kind: 'capture',
              identity: `agent-host:${targetFile}:${geometry.hash}:drawing`,
              sourceFormat: 'svg',
              sourcePath: targetFile,
              content: geometry.content,
              format: 'png',
              signal: context?.signal,
              exportOptions: {
                width: captureSize,
                height: captureSize,
                margin: 0.1,
                background: '#242424',
                axes: true,
                scaleBar: true,
                lengthSymbol: geometry.units.length,
              },
            }),
            { count: 1, mimeType: 'image/png' },
          );
          context?.signal?.throwIfAborted();
          return { success: true, images: [{ view: 'drawing', dataUrl: captureFilesToDataUrls(files)[0]! }] };
        }

        assertGlb(geometry.content);
        const exportOptions = buildCaptureExportOptions({
          mode: captureInput.mode,
          size: captureSize,
          ...(captureInput.includeEdges === undefined ? {} : { includeEdges: captureInput.includeEdges }),
        });
        const count = captureInput.mode === 'multi_angle' ? canonicalCaptureViews.length : 1;
        const names =
          captureInput.mode === 'multi_angle'
            ? canonicalCaptureViews.map((view) => `render-${view.id}.webp`)
            : ['render.webp'];
        const files = requireImageFiles(
          await input.exportImage({
            kind: 'capture',
            identity: `agent-host:${targetFile}:${geometry.hash}:${captureInput.mode}`,
            sourceFormat: 'glb',
            sourcePath: targetFile,
            geometryHash: geometry.hash,
            content: geometry.content,
            format: 'webp',
            signal: context?.signal,
            exportOptions,
          }),
          { count, mimeType: 'image/webp', names },
        );
        context?.signal?.throwIfAborted();
        const dataUrls = captureFilesToDataUrls(files);
        return {
          success: true,
          images:
            captureInput.mode === 'multi_angle'
              ? canonicalCaptureViews.map((view, index) => ({ view: view.id, dataUrl: dataUrls[index]! }))
              : [{ view: 'isometric', dataUrl: dataUrls[0]! }],
        };
      } catch (error) {
        return input.mapRuntimeError(error, captureInput.targetFile);
      }
    },
  };

  return { kernelClient, graphics, images };
};
