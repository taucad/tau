import { rpcClientErrorCode } from '@taucad/chat/schemas/rpc';
import type {
  RpcGraphicsClient,
  RpcGraphicsExportModelResult,
  RpcHandlerError,
  RpcImageClient,
  RpcParameterClient,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import type { GetParametersOutput } from '@taucad/chat/schemas/tools/parameter';
import type { ModelMechanism, ModelSummary } from '@taucad/chat/schemas/tools/evaluate-model';
import {
  applyParameterOperationOutputSchema,
  getParametersOutputSchema,
  parameterManifestWireSchema,
} from '@taucad/chat/schemas/tools/parameter';
import { asKnownArtifact } from '@taucad/runtime';
import type { RuntimeClient, ViewOffer, WideViewRequest } from '@taucad/runtime';
import type { ExportFile, KernelIssue, KernelIssueCode, TessellationReport } from '@taucad/runtime/types';
import { waitFor } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { parameterSetMachine } from '@taucad/parameters/set-machine';
import { assertRootedPath } from '@taucad/utils/path';
import type { ScreenshotSection } from '@taucad/chat/schemas/tools/screenshot';

import { projectParameterValues } from '#runtime/parameter-values.js';
import { reportModelMechanism } from '#runtime/model-mechanism.js';
import type { RenderedArtifact } from '#runtime/glb-chunks.js';
import { summarizeRenderedModel } from '#runtime/model-summary.js';
import type { ModelAdmissionLimits } from '#runtime/model-summary.js';

import {
  buildCaptureExportOptions,
  canonicalCaptureViews,
  describeCaptureSection,
  resolveCaptureSectionKeep,
} from '#capture/capture-views.js';
import { captureFilesToDataUrls } from '#capture/capture-data-urls.js';

const captureSize = 1600;

/**
 * Run a capture, and when a section was requested, name what a cut needs in any failure: the
 * renderer caps the cut, which it refuses on an open or degenerate mesh (some kernels' output).
 */
const withSectionGuidance = async <Result>(
  section: ScreenshotSection | undefined,
  capture: () => Promise<Result>,
): Promise<Result> => {
  if (section === undefined) {
    return capture();
  }
  try {
    return await capture();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The ${section.plane} section at ${section.offset} m could not be rendered: ${reason}. A section caps the cut, which needs a closed mesh without degenerate triangles; capture without section to inspect the outside, or measure the interior with test_model.`,
      { cause: error },
    );
  }
};

/** Per-call parameter values as the runtime's caller overrides; absent means the stored group alone. */
const overrides = (
  parameters: Readonly<Record<string, unknown>> | undefined,
): Readonly<{ parameters?: Readonly<Record<string, unknown>> }> =>
  parameters === undefined || Object.keys(parameters).length === 0 ? {} : { parameters };
const glbMagic = 0x46_54_6c_67;
const glbVersion = 2;

/** Runtime surface required by request-scoped agent geometry operations. @public */
export type RuntimeAgentClient = Pick<RuntimeClient, 'describe' | 'capabilities'> & {
  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'watch' | 'signal'>) => Pick<
    ReturnType<RuntimeClient['open']>,
    'evaluation' | 'export' | 'close'
  > & {
    view: (
      id?: string,
      request?: Pick<WideViewRequest, 'instance' | 'options' | 'content'>,
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
  /**
   * The admission limits of the GeoSpec engine `test_model` uses on this host, resolving `undefined`
   * when unknown. `evaluate_model` estimates a whole-model load against them; omitted, its summary
   * has no `admission`.
   */
  admissionLimits?: () => Promise<ModelAdmissionLimits | undefined>;
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
        const detail = request.detail ?? 'values';
        return {
          success: true,
          ...getParametersOutputSchema.parse({
            status: 'resolved',
            detail,
            ...(detail === 'full'
              ? { manifest: parameterManifestWireSchema.parse(structuredClone(manifest)) }
              : { parameters: structuredClone(projectParameterValues(manifest, current.entry)) }),
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

/**
 * Kernel issue codes for caller-supplied options or content the selected route refused: the caller's input, not
 * the model, is wrong.
 */
const optionIssueCodes: ReadonlySet<KernelIssueCode> = new Set([
  'VIEW_OPTIONS_INVALID',
  'EXPORT_OPTIONS_INVALID',
  'RUNTIME_CONTENT_UNSUPPORTED',
]);

/**
 * The runtime content one render asks for. Only `includeEdges: true` is a request: the runtime renders without edges
 * by default, so `false` and omission both leave the edge pass, native or fallback, off for this call.
 */
const edgeContent = (includeEdges: boolean | undefined): Readonly<{ content?: Readonly<{ includeEdges: true }> }> =>
  includeEdges === true ? { content: { includeEdges: true } } : {};

const isOptionIssue = (issue: KernelIssue): boolean => optionIssueCodes.has(issue.code);

/** The framework content keys `export_model` can ask an export for. */
const exportContentKeys = ['includeEdges', 'includeTopology'] as const;
type ExportContentKey = (typeof exportContentKeys)[number];

/**
 * The content keys one export asks for. Only `true` is a request: an export carries neither edge lines nor topology
 * by default, so `false` and omission both leave a key out, and a route without a key refuses only a request for it.
 */
const requestedExportContent = (
  content: Readonly<Partial<Record<ExportContentKey, boolean>>> | undefined,
): readonly ExportContentKey[] => exportContentKeys.filter((key) => content?.[key] === true);

/** Names joined as prose: `glb`, `glb or gltf`, `3mf, glb or gltf`. */
const orList = (items: readonly string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/**
 * What the agent can do about content an export route refused: for each requested key the route lacks, the other
 * exports of the same source whose route carries it, from the runtime's capability manifest. The runtime's issue
 * states the refusal only; the remedy belongs to the tool that reports it to the agent. `undefined` when the route
 * carries every requested key: the refusal then has another cause, such as Draco compression, which the runtime's
 * issue states.
 */
const contentRemedy = async (
  runtime: RuntimeAgentClient,
  request: Readonly<{ path: string; to: string; keys: readonly ExportContentKey[]; signal: AbortSignal | undefined }>,
): Promise<string | undefined> => {
  const { path, to, keys, signal } = request;
  const omit = `Omit ${keys.join(' and ')} for this export.`;
  try {
    const { kernelId } = await runtime.describe({ source: { path }, signal });
    const routes = (runtime.capabilities?.routes ?? []).filter((route) => route.kernelId === kernelId);
    if (routes.length === 0) {
      return omit;
    }
    const carries = (route: (typeof routes)[number], key: ExportContentKey): boolean =>
      Object.hasOwn(route.content?.schema.properties ?? {}, key);
    const lacking = keys.filter((key) => !routes.some((route) => route.targetFormat === to && carries(route, key)));
    if (lacking.length === 0) {
      return undefined;
    }
    return lacking
      .map((key) => {
        const formats = [...new Set(routes.filter((route) => carries(route, key)).map((route) => route.targetFormat))]
          .filter((format) => format !== to)
          .sort();
        return formats.length === 0
          ? `No other export of this source carries ${key}; omit it.`
          : `Export to ${orList(formats)} to keep ${key}, or omit it.`;
      })
      .join(' ');
  } catch {
    /* The refusal stands on its own; only the alternatives are unknown. */
    return omit;
  }
};

const issueErrorCode = (issues: readonly KernelIssue[]) =>
  issues.some((issue) => issue.code === 'AUTHENTICATION_ERROR')
    ? rpcClientErrorCode.authenticationError
    : issues.some((issue) => isOptionIssue(issue))
      ? rpcClientErrorCode.validationError
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
    async evaluateModel({ targetFile, includeCapabilities, options, parameters }, context) {
      const rooted = assertRootedPath(targetFile);
      let document: ReturnType<RuntimeAgentClient['open']> | undefined;
      try {
        const runtime = await runtimeFor();
        context?.signal?.throwIfAborted();
        /* Every agent document is one request's snapshot, opened unwatched: a watched one is
         * superseded when the watch echo of an edit made just before the call lands mid-evaluation. */
        document = runtime.open({
          source: { path: rooted },
          ...overrides(parameters),
          watch: false,
          signal: context?.signal,
        });
        const outcome = await document.evaluation({ signal: context?.signal });
        if (outcome.superseded) {
          throw new Error('Model evaluation was superseded');
        }
        const { evaluation } = outcome;
        let issues = [...evaluation.issues];
        let { sourceRevision } = evaluation;
        let ready = evaluation.success;
        let tessellation: TessellationReport | undefined;
        let summary: ModelSummary | undefined;
        let rendered: RenderedArtifact | undefined;
        const [defaultView] = evaluation.success ? evaluation.views : [];
        if (evaluation.success && defaultView === undefined && options !== undefined) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.validationError,
            message: 'options apply to the default view, and this model offers no view. Omit options for this file.',
          };
        }
        if (defaultView !== undefined) {
          const view = options === undefined ? document.view() : document.view(defaultView.id, { options });
          try {
            const projected = await view.rendering({ signal: context?.signal });
            if (projected.superseded) {
              throw new Error('Default view rendering was superseded');
            }
            // Options the default view refused are the caller's input error, refused as screenshot refuses them.
            const refused = projected.rendering.success
              ? []
              : projected.rendering.issues.filter((issue) => isOptionIssue(issue));
            if (options !== undefined && refused.length > 0) {
              return {
                success: false,
                errorCode: rpcClientErrorCode.validationError,
                message: issueMessage(refused, 'View options were refused'),
              };
            }
            issues = [...issues, ...projected.rendering.issues];
            sourceRevision = projected.rendering.sourceRevision ?? sourceRevision;
            ready = projected.rendering.success;
            tessellation = projected.rendering.success ? projected.rendering.artifact.tessellation : undefined;
            rendered = projected.rendering.success ? projected.rendering.artifact : undefined;
            summary = projected.rendering.success
              ? await summarizeRenderedModel({
                  artifact: projected.rendering.artifact,
                  issues: projected.rendering.issues,
                  admissionLimits: input.admissionLimits,
                })
              : undefined;
          } finally {
            view.close();
          }
        }
        const mechanism: ModelMechanism | undefined = reportModelMechanism({ artifact: rendered, issues });
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
          ...(tessellation === undefined ? {} : { tessellation }),
          ...(summary === undefined ? {} : { summary }),
          ...(mechanism === undefined ? {} : { mechanism }),
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
    async exportModel(
      { targetFile, to, options, content, parameters },
      context,
    ): Promise<RpcGraphicsExportModelResult> {
      const rooted = assertRootedPath(targetFile);
      let document: ReturnType<RuntimeAgentClient['open']> | undefined;
      try {
        const runtime = await runtimeFor();
        context?.signal?.throwIfAborted();
        document = runtime.open({
          source: { path: rooted },
          ...overrides(parameters),
          watch: false,
          signal: context?.signal,
        });
        const requested = requestedExportContent(content);
        const result = await document.export(to, {
          ...(options === undefined ? {} : { options }),
          ...(requested.length === 0 ? {} : { content: Object.fromEntries(requested.map((key) => [key, true])) }),
          signal: context?.signal,
        });
        context?.signal?.throwIfAborted();
        if (result.success) {
          return {
            success: true,
            exportId: result.exportId,
            files: [...result.files],
            issues: [...result.issues],
            ...(result.sourceRevision === undefined ? {} : { sourceRevision: result.sourceRevision }),
          };
        }
        const message = issueMessage(result.issues, 'Model export failed');
        const refusedContent = result.issues.some((issue) => issue.code === 'RUNTIME_CONTENT_UNSUPPORTED');
        const remedy =
          refusedContent && requested.length > 0
            ? await contentRemedy(runtime, { path: rooted, to, keys: requested, signal: context?.signal })
            : undefined;
        context?.signal?.throwIfAborted();
        return {
          success: false,
          errorCode: issueErrorCode(result.issues),
          message: remedy === undefined ? message : `${message} ${remedy}`,
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
        document = runtime.open({
          source: { path: targetFile },
          ...overrides(captureInput.parameters),
          watch: false,
          signal: context?.signal,
        });
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
          ...edgeContent(captureInput.includeEdges),
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
          if (artifact.mimeType === 'image/svg+xml' && captureInput.section !== undefined) {
            return {
              success: false,
              errorCode: rpcClientErrorCode.validationError,
              message: `section applies to 3D views only; view ${rendering.view} is a 2D drawing. Omit section for this view.`,
            };
          }
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
            ...(captureInput.section === undefined ? {} : { section: captureInput.section }),
          });
          // The image service keys captures by identity, so a cut is part of it.
          const sectionIdentity =
            captureInput.section === undefined
              ? ''
              : `:section:${captureInput.section.plane}:${captureInput.section.offset}:${resolveCaptureSectionKeep(captureInput.section)}`;
          const count = captureInput.mode === 'multi_angle' ? canonicalCaptureViews.length : 1;
          const names =
            captureInput.mode === 'multi_angle'
              ? canonicalCaptureViews.map(({ id }) => `render-${id}.webp`)
              : ['render.webp'];
          const files = requireImageFiles(
            await withSectionGuidance(captureInput.section, async () =>
              input.exportImage({
                kind: 'capture',
                identity: `agent-host:${targetFile}:${rendering.hash}:${captureInput.mode}:${rendering.view}:${rendering.instance ?? ''}${sectionIdentity}`,
                sourceFormat: 'glb',
                sourcePath: targetFile,
                geometryHash: rendering.hash,
                content: artifact.content,
                format: 'webp',
                signal: context?.signal,
                exportOptions,
              }),
            ),
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
            ...(captureInput.section === undefined ? {} : { message: describeCaptureSection(captureInput.section) }),
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
