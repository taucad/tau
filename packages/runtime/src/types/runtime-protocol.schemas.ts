/**
 * Runtime protocol Zod schemas — single source of truth for the wire
 * shape of every {@link RuntimeProtocol} call and notify.
 *
 * Hand-written aliases in `runtime-protocol.types.ts` are kept structurally
 * compatible with these schemas; the `Channel` server validates inbound
 * frames at the wire boundary when supplied via `protocolSchemas`.
 *
 * Validation depth is intentionally shallow: outer envelopes are
 * validated structurally, while deeply nested kernel-domain payloads
 * (parameters, options, geometry result content) are passed through as
 * `unknown` records since their shape is owned by kernel plugins, not
 * the protocol.
 *
 * @internal
 */

import { z } from 'zod';
import {
  runtimeIssueSchema,
  runtimeContentDigestSchema,
  runtimeSourceRevisionSchema,
  runtimeInitializeArgsSchema,
  runtimeInitializeResultSchema,
  runtimeLogArgsSchema,
  runtimeLogBatchArgsSchema,
  runtimeTelemetryArgsSchema,
  runtimeCapabilitiesUpdatedArgsSchema,
  transportHelloPayloadSchema,
} from '#types/runtime-wire-common.schemas.js';
import { runtimeContentSchema } from '#types/runtime-content.types.js';
import { cadLengthUnits } from '@taucad/types/constants';
import type { MediaType } from '@taucad/types';
import type { WireProtocolSchemas } from '@taucad/rpc';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { assertRootedPath } from '@taucad/utils/path';
import { validateArtifactPaths } from '#types/export-artifact-validation.js';
import { isParameterManifestShape } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';

// ---------- Primitives ----------

const lengthSymbolSchema = z.enum(cadLengthUnits);

const rootedPathSchema = z.string().superRefine((value, context) => {
  try {
    assertRootedPath(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Expected a canonical root-relative path.' });
  }
});

const rootedFilePathSchema = rootedPathSchema.refine((value) => value.length > 0, {
  message: 'Expected a root-relative file path.',
});

const rootedFilenameSchema = rootedFilePathSchema.refine((value) => !value.includes('/'), {
  message: 'Expected a basename filename.',
});

const stageSchema = z.record(rootedFilePathSchema, z.instanceof(Uint8Array));

const geometryFileSchema = z
  .object({
    path: rootedPathSchema,
    filename: rootedFilenameSchema,
  })
  .catchall(z.unknown());

const kernelIssueSchema = runtimeIssueSchema;

const binaryContentDeliverySchema = z.discriminatedUnion('delivery', [
  z.object({ delivery: z.literal('inline'), bytes: z.instanceof(Uint8Array) }).strict(),
  z.object({ delivery: z.literal('pooled'), key: z.string() }).strict(),
]);

const mimeTypeSchema = z.custom<MediaType>(
  (value) => typeof value === 'string' && value.trim().length > 0,
  'Expected a non-empty MIME type',
);

const exportFileSchema = z
  .object({
    name: z.string(),
    bytes: binaryContentDeliverySchema,
    mimeType: mimeTypeSchema,
  })
  .catchall(z.unknown());

const directExportFileSchema = z
  .object({
    name: z.string(),
    bytes: z.instanceof(Uint8Array),
    mimeType: mimeTypeSchema,
  })
  .catchall(z.unknown());

const directExportFilesSchema = z
  .array(directExportFileSchema)
  .min(1)
  .superRefine((files, context) => {
    for (const issue of validateArtifactPaths(files)) {
      context.addIssue({
        code: 'custom',
        path: [issue.index, 'name'],
        message:
          issue.reason === 'duplicate-path'
            ? 'Artifact path duplicates an earlier input.'
            : 'Expected a safe relative artifact path.',
      });
    }
  });

const contentDigestSchema = runtimeContentDigestSchema;
const sourceRevisionShape = { sourceRevision: runtimeSourceRevisionSchema.optional() };

const exportGeometryResultSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: z.array(exportFileSchema).min(1),
      issues: z.array(kernelIssueSchema),
      serializedNativeHandle: z.unknown().optional(),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
]);

/** @public */
export const getParametersResultSchema = z.union([
  z
    .object({
      success: z.literal(true),
      data: z.custom<ParameterManifest>(isParameterManifestShape, 'Expected a parameter manifest wire shape'),
      issues: z.array(kernelIssueSchema),
      serializedNativeHandle: z.unknown().optional(),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
]);

const renderIdSchema = z.uuid();
const geometryTransportSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('gltf'), content: binaryContentDeliverySchema, hash: z.string() }).strict(),
  z
    .object({
      format: z.literal('svg'),
      content: z.string(),
      name: z.string().optional(),
      units: z.object({ length: lengthSymbolSchema }).strict().optional(),
      hash: z.string(),
    })
    .strict(),
  z
    .object({
      format: z.literal('webrtc'),
      stream: z.union([z.instanceof(ReadableStream), z.instanceof(EventTarget)]),
      hash: z.string(),
    })
    .strict(),
]);
const hashedGeometryResultTransportSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: geometryTransportSchema,
      issues: z.array(kernelIssueSchema),
      serializedNativeHandle: z.unknown().optional(),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
]);
const renderPhaseSchema = z.string();
const workerStateSchema = z.enum(['idle', 'buffering', 'rendering', 'error']);
const abortGenerationSchema = z.number().int().min(0).max(4_294_967_295);
const previewCommandIdentityShape = {
  renderId: renderIdSchema,
  abortGeneration: abortGenerationSchema.optional(),
} as const;
const wireAbortReasonCodeSchema = z.literal(2);

// ---------- Export call ----------

export const runtimeExportArgsSchema = z
  .object({
    format: z.string().min(1),
    options: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
  })
  .catchall(z.unknown());

export const runtimeExportResultSchema = exportGeometryResultSchema;

export const runtimeExportModelArgsSchema = z
  .object({
    stage: stageSchema.optional(),
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
    format: z.string().min(1),
    exportOptions: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
  })
  .catchall(z.unknown());

export const runtimeEvaluateModelArgsSchema = z
  .object({
    stage: stageSchema.optional(),
    file: geometryFileSchema.strict(),
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
  })
  .strict();

export const runtimeSourceSnapshotArgsSchema = z
  .object({
    stage: stageSchema.optional(),
    file: geometryFileSchema,
    additionalPaths: z
      .array(z.object({ path: rootedFilePathSchema, required: z.boolean() }).strict())
      .readonly()
      .optional(),
  })
  .strict();

export const runtimeSourceSnapshotResultSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: z
        .object({
          entryPath: rootedFilePathSchema,
          files: z.array(
            z
              .object({
                path: rootedFilePathSchema,
                content: z.instanceof(Uint8Array),
                sha256: z.string(),
                role: z.enum(['entry', 'kernel-dependency', 'middleware-dependency', 'additional']),
              })
              .strict(),
          ),
          unresolvedPaths: z.array(rootedFilePathSchema),
          kernelId: z.string(),
        })
        .strict(),
      issues: z.array(kernelIssueSchema),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
      ...sourceRevisionShape,
    })
    .catchall(z.unknown()),
]);

export const runtimeTranscodeArgsSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    files: directExportFilesSchema,
    options: z.record(z.string(), z.unknown()),
  })
  .strict();

// ---------- Notifies (consumer → host) ----------

export const runtimeOpenFileArgsSchema = z
  .object({
    ...previewCommandIdentityShape,
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
    transient: z.boolean().optional(),
  })
  .catchall(z.unknown());

export const runtimeResolveParametersArgsSchema = z
  .object({
    stage: stageSchema.optional(),
    file: geometryFileSchema.strict(),
    resolution: z
      .object({
        mode: z.enum(['default', 'declared-only']).optional(),
        profile: z.literal('tau-json-structure-units-03-v1').optional(),
        inferenceLanguage: z.string().optional(),
        projectBindingDigest: contentDigestSchema.optional(),
        sourceUnitDigest: contentDigestSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const runtimeStageAndRenderArgsSchema = z
  .object({
    ...previewCommandIdentityShape,
    stage: stageSchema,
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
  })
  .catchall(z.unknown());

export const runtimeUpdateParametersArgsSchema = z
  .object({
    ...previewCommandIdentityShape,
    parameters: z.record(z.string(), z.unknown()),
  })
  .catchall(z.unknown());

export const runtimeSetOptionsArgsSchema = z
  .object({
    ...previewCommandIdentityShape,
    options: z.record(z.string(), z.unknown()),
  })
  .catchall(z.unknown());

/**
 * `cleanup` is a parameter-less acknowledged call. The application-level call
 * (`channel.call('cleanup', undefined)`) carries no args, but the wire layer
 * normalises the missing payload to `null` (`{ a: value ?? null }` in
 * `createChannel`/`createChannelServer`) so the wire schema validates
 * `null`, not `undefined`.
 */
export const runtimeCleanupArgsSchema = z.null();
export const runtimeCleanupResultSchema = z.null();

export const runtimeAbortArgsSchema = z
  .object({
    renderId: renderIdSchema,
    reason: wireAbortReasonCodeSchema,
  })
  .catchall(z.unknown())
  .superRefine((value, context) => {
    if (Object.hasOwn(value, 'abortGeneration')) {
      context.addIssue({
        code: 'custom',
        path: ['abortGeneration'],
        message: 'abortGeneration is transport-local and must not cross the timeout wire.',
      });
    }
  });

export const runtimeBinaryMaterialisedArgsSchema = z.object({ key: z.string() }).strict();

const runtimeKernelMessageArgsSchema = z
  .object({
    kernelId: z.string(),
    type: z.string(),
    renderId: renderIdSchema.optional(),
    payload: z.unknown(),
  })
  .catchall(z.unknown());

export const runtimeKernelCommandArgsSchema = runtimeKernelMessageArgsSchema;
export const runtimeKernelEventArgsSchema = runtimeKernelMessageArgsSchema;

// ---------- Notifies (host → consumer) ----------

export const runtimeProgressArgsSchema = z
  .object({
    phase: renderPhaseSchema,
    renderId: renderIdSchema,
    detail: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export const runtimeGeometryComputedArgsSchema = z
  .object({
    result: hashedGeometryResultTransportSchema,
    renderId: renderIdSchema,
  })
  .catchall(z.unknown());

export const runtimeParametersResolvedArgsSchema = z
  .object({
    result: getParametersResultSchema,
    renderId: renderIdSchema,
  })
  .catchall(z.unknown());

export const runtimeErrorEventArgsSchema = z
  .object({
    issues: z.array(kernelIssueSchema),
    renderId: renderIdSchema.optional(),
  })
  .catchall(z.unknown());

export const runtimeStateChangedArgsSchema = z
  .object({
    renderId: renderIdSchema,
    abortGeneration: abortGenerationSchema,
    state: workerStateSchema,
    detail: z.string().optional(),
  })
  .catchall(z.unknown());

export const runtimeActiveKernelChangedArgsSchema = z
  .object({
    kernelId: z.string().optional(),
    renderId: renderIdSchema.optional(),
  })
  .catchall(z.unknown());

// ---------- The protocol map ----------

/**
 * Wire-protocol Zod validators for every {@link RuntimeProtocol} call and
 * notify. Pass to `createChannelServer` / `createChannelClient` via the
 * `protocolSchemas` option to enforce shape at the wire boundary.
 *
 * Re-exported from `@taucad/runtime/transport` for external transport
 * authors. Bundled transports (`inProcessTransport`, `webWorkerTransport`,
 * `nodeWorkerTransport`) wire it in by default.
 *
 * @public
 */
export const runtimeProtocolSchemas = {
  hello: transportHelloPayloadSchema,
  calls: {
    initialize: { args: runtimeInitializeArgsSchema, result: runtimeInitializeResultSchema },
    export: { args: runtimeExportArgsSchema, result: runtimeExportResultSchema },
    exportModel: { args: runtimeExportModelArgsSchema, result: runtimeExportResultSchema },
    evaluateModel: { args: runtimeEvaluateModelArgsSchema, result: hashedGeometryResultTransportSchema },
    resolveParameters: { args: runtimeResolveParametersArgsSchema, result: getParametersResultSchema },
    snapshotSource: { args: runtimeSourceSnapshotArgsSchema, result: runtimeSourceSnapshotResultSchema },
    transcode: { args: runtimeTranscodeArgsSchema, result: runtimeExportResultSchema },
    cleanup: { args: runtimeCleanupArgsSchema, result: runtimeCleanupResultSchema },
  },
  notifies: {
    // Consumer → host
    openFile: runtimeOpenFileArgsSchema,
    'stage-and-render': runtimeStageAndRenderArgsSchema,
    updateParameters: runtimeUpdateParametersArgsSchema,
    setOptions: runtimeSetOptionsArgsSchema,
    abort: runtimeAbortArgsSchema,
    binaryMaterialised: runtimeBinaryMaterialisedArgsSchema,
    kernelCommand: runtimeKernelCommandArgsSchema,

    // Host → consumer
    progress: runtimeProgressArgsSchema,
    geometryComputed: runtimeGeometryComputedArgsSchema,
    parametersResolved: runtimeParametersResolvedArgsSchema,
    errorEvent: runtimeErrorEventArgsSchema,
    stateChanged: runtimeStateChangedArgsSchema,
    activeKernelChanged: runtimeActiveKernelChangedArgsSchema,
    log: runtimeLogArgsSchema,
    logBatch: runtimeLogBatchArgsSchema,
    telemetry: runtimeTelemetryArgsSchema,
    capabilitiesUpdated: runtimeCapabilitiesUpdatedArgsSchema,
    kernelEvent: runtimeKernelEventArgsSchema,
  },
  listens: {},
} as const satisfies WireProtocolSchemas<RuntimeProtocol>;
