import { rpcClientErrorCode } from '@taucad/chat';
import type {
  RpcGraphicsClient,
  RpcGraphicsExportModelResult,
  RpcHandlerError,
  RpcImageClient,
  RpcParameterClient,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import type { GetParametersOutput } from '@taucad/chat/schemas';
import {
  applyParameterOperationOutputSchema,
  getParametersOutputSchema,
  parameterManifestWireSchema,
} from '@taucad/chat/schemas';
import { asKnownArtifact } from '@taucad/runtime';
import type { RuntimeClient, ViewOffer, WideViewRequest } from '@taucad/runtime';
import type { ExportFile, KernelIssue } from '@taucad/runtime/types';
import { waitFor } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { parameterSetMachine } from '@taucad/parameters/set-machine';
import { assertRootedPath } from '@taucad/utils/path';

import { buildCaptureExportOptions, canonicalCaptureViews } from '#capture/capture-views.js';
import { captureFilesToDataUrls } from '#capture/capture-data-urls.js';

const captureSize = 1600;
const glbMagic = 0x46_54_6c_67;
const glbVersion = 2;

/** Runtime surface required by request-scoped agent geometry operations. @public */
export type RuntimeAgentClient = Pick<RuntimeClient, 'describe' | 'capabilities'> & {
  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'signal'>) => Pick<
    ReturnType<RuntimeClient['open']>,
    'evaluation' | 'export' | 'close'
  > & {
    view: (
      id?: string,
      request?: Pick<WideViewRequest, 'instance' | 'options'>,
    ) => Pick<ReturnType<ReturnType<RuntimeClient['open']>['view']>, 'rendering' | 'close'>;
  };
};

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
        lengthSymbol?: string;
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
  runtime: RuntimeAgentClient | (() => Promise<RuntimeAgentClient>);
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
export function createRuntimeParameterAgentClient(input: CreateRuntimeParameterAgentClientInput): RpcParameterClient {
  return {
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
        const result: SnapshotFrom<typeof parameterSetMachine> = await waitFor(
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
            result.context.diagnostic ?? {
              code: 'SEMANTICS_UNRESOLVED',
              message: 'Parameter authority is unavailable.',
            },
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
            /* R4/I5: the manifest's own identity already names every source file it was compiled
             * from, so provenance is that identity lifted to the top level, not a second digest. */
            sourceRevision: { entry: targetFile, files: { ...manifest.identity.sourceFiles } },
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
  };
}

const issueMessage = (issues: ReadonlyArray<{ readonly message: string }>, fallback: string): string =>
  issues.map((issue) => issue.message).join('; ') || fallback;

const issueErrorCode = (issues: readonly KernelIssue[]) =>
  issues.some((issue) => issue.code === 'AUTHENTICATION_ERROR')
    ? rpcClientErrorCode.authenticationError
    : rpcClientErrorCode.unknown;

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
  const runtimeFor = async (): Promise<RuntimeAgentClient> =>
    typeof input.runtime === 'function' ? input.runtime() : input.runtime;

  const kernelClient: RpcRuntimeClient = {
    async evaluateModel({ targetFile, includeCapabilities }, context) {
      const rooted = assertRootedPath(targetFile);
      let document: ReturnType<RuntimeAgentClient['open']> | undefined;
      try {
        const runtime = await runtimeFor();
        context?.signal?.throwIfAborted();
        document = runtime.open({ source: { path: rooted }, signal: context?.signal });
        const outcome = await document.evaluation({ signal: context?.signal });
        if (outcome.superseded) {
          throw new Error('Model evaluation was superseded');
        }
        const { evaluation } = outcome;
        let issues = [...evaluation.issues];
        let { sourceRevision } = evaluation;
        let ready = evaluation.success;
        if (evaluation.success && evaluation.views.length > 0) {
          const view = document.view();
          try {
            const projected = await view.rendering({ signal: context?.signal });
            if (projected.superseded) {
              throw new Error('Default view rendering was superseded');
            }
            issues = [...issues, ...projected.rendering.issues];
            sourceRevision = projected.rendering.sourceRevision ?? sourceRevision;
            ready = projected.rendering.success;
          } finally {
            view.close();
          }
        }
        const offered = evaluation.success
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
        let capabilities = {};
        if (includeCapabilities && evaluation.success) {
          const description = await runtime.describe({ source: { path: rooted }, signal: context?.signal });
          const routes = runtime.capabilities?.routes.filter((route) => route.kernelId === description.kernelId) ?? [];
          const metadata = (options: ViewOffer['options']) => ({
            schema: Object.fromEntries(Object.entries(options?.schema ?? { type: 'object', properties: {} })),
            defaults: { ...options?.defaults },
          });
          capabilities = {
            capabilities: {
              views: Object.fromEntries(evaluation.views.map(({ id, options }) => [id, metadata(options)])),
              exports: Object.fromEntries(evaluation.exports.map(({ id, options }) => [id, metadata(options)])),
              targets: [
                ...new Set([
                  ...evaluation.exports.map(({ id }) => id),
                  ...evaluation.exports.map(({ extension }) => extension),
                  ...routes.map(({ targetFormat }) => targetFormat),
                ]),
              ],
            },
          };
        }
        context?.signal?.throwIfAborted();
        return {
          success: true,
          status: ready ? 'ready' : 'error',
          kernelIssues: issues,
          ...(sourceRevision === undefined ? {} : { sourceRevision }),
          ...offered,
          ...capabilities,
        };
      } catch (error) {
        return input.mapRuntimeError(error, rooted);
      } finally {
        document?.close();
      }
    },
  };

  const graphics: RpcGraphicsClient = {
    async exportModel({ targetFile, to, options }, context): Promise<RpcGraphicsExportModelResult> {
      const rooted = assertRootedPath(targetFile);
      let document: ReturnType<RuntimeAgentClient['open']> | undefined;
      try {
        const runtime = await runtimeFor();
        context?.signal?.throwIfAborted();
        document = runtime.open({ source: { path: rooted }, signal: context?.signal });
        const result = await document.export(to, {
          ...(options === undefined ? {} : { options }),
          signal: context?.signal,
        });
        context?.signal?.throwIfAborted();
        return result.success
          ? {
              success: true,
              exportId: result.exportId,
              files: [...result.files],
              issues: [...result.issues],
              ...(result.sourceRevision === undefined ? {} : { sourceRevision: result.sourceRevision }),
            }
          : {
              success: false,
              errorCode: issueErrorCode(result.issues),
              message: issueMessage(result.issues, 'Model export failed'),
            };
      } catch (error) {
        return input.mapRuntimeError(error, rooted);
      } finally {
        document?.close();
      }
    },
  };

  const images: RpcImageClient = {
    async captureImages(captureInput, context) {
      const targetFile = assertRootedPath(captureInput.targetFile);
      let document: ReturnType<RuntimeAgentClient['open']> | undefined;
      try {
        const runtime = await runtimeFor();
        context?.signal?.throwIfAborted();
        document = runtime.open({ source: { path: targetFile }, signal: context?.signal });
        const evaluated = await document.evaluation({ signal: context?.signal });
        if (evaluated.superseded) {
          throw new Error('Model evaluation was superseded');
        }
        const { evaluation } = evaluated;
        if (!evaluation.success) {
          return {
            success: false,
            errorCode: issueErrorCode(evaluation.issues),
            message: issueMessage(evaluation.issues, 'Evaluation failed'),
          };
        }
        const selectedView = captureInput.view ?? evaluation.views[0]?.id;
        if (selectedView === undefined) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: 'This model offers no view to capture',
          };
        }
        const view = document.view(selectedView, {
          ...(captureInput.instance === undefined ? {} : { instance: captureInput.instance }),
          ...(captureInput.options === undefined ? {} : { options: captureInput.options }),
        });
        try {
          const projected = await view.rendering({ signal: context?.signal });
          if (projected.superseded) {
            throw new Error('View rendering was superseded');
          }
          const { rendering } = projected;
          if (!rendering.success) {
            return {
              success: false,
              errorCode: issueErrorCode(rendering.issues),
              message: issueMessage(rendering.issues, 'Render failed'),
            };
          }
          context?.signal?.throwIfAborted();
          const artifact = asKnownArtifact(rendering.artifact);
          if (artifact === undefined) {
            return {
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: `Cannot capture ${rendering.artifact.mimeType}`,
            };
          }
          const provenance = rendering.sourceRevision === undefined ? {} : { sourceRevision: rendering.sourceRevision };
          const echo = {
            view: rendering.view,
            ...(rendering.instance === undefined ? {} : { instance: rendering.instance }),
          };
          if (artifact.mimeType === 'image/svg+xml') {
            const files = requireImageFiles(
              await input.exportImage({
                kind: 'capture',
                identity: `agent-host:${targetFile}:${rendering.hash}:${rendering.view}:${rendering.instance ?? ''}`,
                sourceFormat: 'svg',
                sourcePath: targetFile,
                content: artifact.content,
                format: 'png',
                signal: context?.signal,
                exportOptions: {
                  width: captureSize,
                  height: captureSize,
                  margin: 0.1,
                  background: '#242424',
                  axes: false,
                  scaleBar: artifact.units !== undefined,
                  ...(artifact.units === undefined ? {} : { lengthSymbol: artifact.units.length }),
                },
              }),
              { count: 1, mimeType: 'image/png' },
            );
            context?.signal?.throwIfAborted();
            return { success: true, images: [{ ...echo, dataUrl: captureFilesToDataUrls(files)[0]! }], ...provenance };
          }
          assertGlb(artifact.content);
          const exportOptions = buildCaptureExportOptions({
            mode: captureInput.mode,
            size: captureSize,
            ...(captureInput.includeEdges === undefined ? {} : { includeEdges: captureInput.includeEdges }),
          });
          const count = captureInput.mode === 'multi_angle' ? canonicalCaptureViews.length : 1;
          const names =
            captureInput.mode === 'multi_angle'
              ? canonicalCaptureViews.map(({ id }) => `render-${id}.webp`)
              : ['render.webp'];
          const files = requireImageFiles(
            await input.exportImage({
              kind: 'capture',
              identity: `agent-host:${targetFile}:${rendering.hash}:${captureInput.mode}:${rendering.view}:${rendering.instance ?? ''}`,
              sourceFormat: 'glb',
              sourcePath: targetFile,
              geometryHash: rendering.hash,
              content: artifact.content,
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
                ? canonicalCaptureViews.map(({ id }, index) => ({ ...echo, angle: id, dataUrl: dataUrls[index]! }))
                : [{ ...echo, angle: 'isometric', dataUrl: dataUrls[0]! }],
            ...provenance,
          };
        } finally {
          view.close();
        }
      } catch (error) {
        return input.mapRuntimeError(error, targetFile);
      } finally {
        document?.close();
      }
    },
  };

  return { kernelClient, graphics, images };
};
