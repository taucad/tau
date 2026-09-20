import { rpcClientErrorCode } from '@taucad/chat';
import type {
  RpcGraphicsClient,
  RpcGraphicsExportGeometryResult,
  RpcHandlerError,
  RpcImageClient,
  RpcInvocationContext,
  RpcParameterClient,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import type { GetParametersOutput } from '@taucad/chat/schemas';
import {
  applyParameterOperationOutputSchema,
  getParametersOutputSchema,
  parameterManifestWireSchema,
} from '@taucad/chat/schemas';
import type { ExportFile, HashedGeometryResult, KernelIssue } from '@taucad/runtime/types';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { parameterSetMachine } from '@taucad/parameters/set-machine';
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
    options: {
      readonly source: { readonly path: string };
      readonly signal?: AbortSignal;
    },
  ): Promise<
    | {
        readonly success: true;
        readonly data: readonly ExportFile[];
        readonly issues: readonly KernelIssue[];
      }
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

/** Inputs for adapting one host-owned parameter actor per source target. @public */
export type CreateRuntimeParameterAgentClientInput = Readonly<{
  mapRuntimeError: RuntimeAgentErrorMapper;
  parameterActorFor(
    targetFile: string,
  ): ActorRefFrom<typeof parameterSetMachine> | Promise<ActorRefFrom<typeof parameterSetMachine>>;
}>;

const unresolvedParameters = (
  diagnostic: Readonly<{ code: string; message: string }>,
  resource: string,
): Readonly<{ success: true } & GetParametersOutput> => ({
  success: true,
  ...getParametersOutputSchema.parse({
    status: 'unresolved',
    diagnostics: [{ ...diagnostic, severity: 'error', resource, schemaPointer: '' }],
  }),
});

/**
 * Adapt native parameter actors to the chat RPC contract without creating another workflow owner.
 * @param input - Target resolver and host error projection.
 * @returns The semantic parameter RPC client.
 * @public
 */
export const createRuntimeParameterAgentClient = (
  input: CreateRuntimeParameterAgentClientInput,
): RpcParameterClient => ({
  async getParameters(request, context) {
    try {
      context?.signal?.throwIfAborted();
      const targetFile = assertRootedPath(request.targetFile);
      const actor = await input.parameterActorFor(targetFile);
      // The actor refreshes bytes for a read in its current mode, so a plan awaiting confirmation survives it.
      actor.send({
        type: 'resolve',
        resolution: request.resolutionMode === undefined ? undefined : { mode: request.resolutionMode },
      });
      const result = await waitFor(
        actor,
        (snapshot) =>
          snapshot.matches({ open: 'ready' }) ||
          snapshot.matches({ open: 'confirmation' }) ||
          snapshot.matches({ open: 'disconnected' }) ||
          snapshot.matches({ open: 'uncertain' }) ||
          snapshot.status === 'done',
        { signal: context?.signal },
      );
      const { current } = result.context;
      const available = result.matches({ open: 'ready' }) || result.matches({ open: 'confirmation' });
      if (!available || current === undefined) {
        return unresolvedParameters(
          result.context.diagnostic ?? { code: 'SEMANTICS_UNRESOLVED', message: 'Parameter authority is unavailable.' },
          targetFile,
        );
      }
      if ((current.manifest.identity.resolution.mode ?? 'default') !== (request.resolutionMode ?? 'default')) {
        return unresolvedParameters(
          {
            code: 'RESOLUTION_SUPERSEDED',
            message: 'A concurrent read changed the admission mode; read again in the mode you need.',
          },
          targetFile,
        );
      }
      // The snapshot's manifest was admitted where it entered this process; reading the sidecar
      // again carries no new semantic evidence, so it is not re-validated per read.
      const { manifest } = current;
      context?.signal?.throwIfAborted();
      return {
        success: true,
        ...getParametersOutputSchema.parse({
          status: 'resolved',
          manifest: parameterManifestWireSchema.parse(structuredClone(manifest)),
          current: structuredClone({ entry: current.entry, identity: current.identity }),
        }),
      };
    } catch (error) {
      return input.mapRuntimeError(error, request.targetFile);
    }
  },
  async applyParameterOperation(request, context) {
    try {
      context?.signal?.throwIfAborted();
      const targetFile = assertRootedPath(request.targetFile);
      const actor = await input.parameterActorFor(targetFile);
      if (actor.getSnapshot().status !== 'active') {
        throw new Error('Parameter actor is closed.');
      }
      const command =
        request.action === 'propose'
          ? {
              requestId: request.requestId,
              fingerprint: JSON.stringify({
                targetFile,
                expected: request.expected,
                pressure: request.pressure,
                operation: request.operation,
              }),
              expected: request.expected,
              pressure: request.pressure,
              operation: request.operation,
            }
          : undefined;
      const outcome = await new Promise<unknown>((resolve, reject) => {
        const cleanup = () => {
          settled.unsubscribe();
          rejectedCommand.unsubscribe();
          confirmation.unsubscribe();
          lifecycle.unsubscribe();
          context?.signal?.removeEventListener('abort', onAbort);
        };
        const finish = (value: unknown) => {
          cleanup();
          resolve(value);
        };
        const settled = actor.on('settled', (event) => {
          if (
            event.outcome.requestId === request.requestId &&
            (command === undefined || event.request.fingerprint === command.fingerprint)
          ) {
            finish(event.outcome);
          }
        });
        // A confirm or cancel naming no held command is refused without a settlement.
        const rejectedCommand = actor.on('command-rejected', (event) => {
          if (command === undefined && event.outcome.requestId === request.requestId) {
            finish(event.outcome);
          }
        });
        const confirmation = actor.on('confirmation-required', (event) => {
          if (event.requestId === request.requestId) {
            finish({ ...event.confirmation, requestId: event.requestId });
          }
        });
        const lifecycle = actor.subscribe({
          complete: () => {
            cleanup();
            reject(new Error('Parameter actor closed before settlement.'));
          },
          error: (error) => {
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        });
        const onAbort = () => {
          actor.send({ type: 'cancel', requestId: request.requestId });
        };
        context?.signal?.addEventListener('abort', onAbort, { once: true });
        if (command !== undefined) {
          actor.send({ type: 'submit', request: command });
        } else if (request.action === 'confirm') {
          actor.send({ type: 'confirm', requestId: request.requestId, fingerprint: request.planFingerprint });
        } else {
          actor.send({ type: 'cancel', requestId: request.requestId });
        }
        if (context?.signal?.aborted) {
          onAbort();
        }
      });
      return {
        success: true,
        outcome: applyParameterOperationOutputSchema.shape.outcome.parse(structuredClone(outcome)),
      };
    } catch (error) {
      return input.mapRuntimeError(error, request.targetFile);
    }
  },
});

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
): Readonly<{
  kernelClient: RpcRuntimeClient;
  graphics: RpcGraphicsClient;
  images: RpcImageClient;
}> => {
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
        const result = await input.runtime.export(format, {
          source: { path: rooted },
          signal: context?.signal,
        });
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
          return {
            success: true,
            images: [{ view: 'drawing', dataUrl: captureFilesToDataUrls(files)[0]! }],
          };
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
              ? canonicalCaptureViews.map((view, index) => ({
                  view: view.id,
                  dataUrl: dataUrls[index]!,
                }))
              : [{ view: 'isometric', dataUrl: dataUrls[0]! }],
        };
      } catch (error) {
        return input.mapRuntimeError(error, captureInput.targetFile);
      }
    },
  };

  return { kernelClient, graphics, images };
};
