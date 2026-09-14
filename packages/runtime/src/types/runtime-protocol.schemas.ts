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
import { runtimeCapabilityKinds } from '#plugins/plugin-types.js';
import { runtimeContentSchema } from '#types/runtime-content.types.js';
import { cadLengthUnits, exportFidelityValues, fileExtensions } from '@taucad/types/constants';
import type { FileExtension, MimeType } from '@taucad/types';
import type { MessagePortLike, WireProtocolSchemas } from '@taucad/rpc';
import { isMessagePortLike } from '#transport/_internal/wire-transferables.js';
import { compiledWasmModuleSchema } from '#transport/_internal/compiled-wasm-module.schema.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { kernelIssueCodeValues } from '#types/kernel-issue-codes.js';
import { assertRootedPath } from '@taucad/utils/path';
import { validateArtifactPaths } from '#types/export-artifact-validation.js';
import type { ContentDigest, SceneDigest } from '@taucad/cache-core';
import type { SceneNodeId } from '#types/runtime-scene.types.js';
import { isParameterManifestShape } from '#parameter/manifest.js';
import type { ParameterManifest } from '#parameter/manifest.js';

// ---------- Primitives ----------

const fileExtensionSchema = z.enum(
  // SAFETY: `fileExtensions` is exported as `readonly FileExtension[]`;
  // `z.enum` requires the non-empty tuple form. The cast preserves the
  // literal union (no runtime change).
  fileExtensions as unknown as readonly [FileExtension, ...FileExtension[]],
);
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

const kernelIssueCodeSchema = z.enum(kernelIssueCodeValues);

const kernelIssueSchema = z
  .object({
    message: z.string(),
    code: kernelIssueCodeSchema,
    severity: z.enum(['error', 'warning', 'info']),
    details: z.unknown().optional(),
  })
  .catchall(z.unknown());

const binaryContentDeliverySchema = z.discriminatedUnion('delivery', [
  z.object({ delivery: z.literal('inline'), bytes: z.instanceof(Uint8Array) }).strict(),
  z.object({ delivery: z.literal('pooled'), key: z.string() }).strict(),
]);

const mimeTypeSchema = z.custom<MimeType>(
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

const exportGeometryResultSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: z.array(exportFileSchema).min(1),
      issues: z.array(kernelIssueSchema),
      serializedNativeHandle: z.unknown().optional(),
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
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
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
    })
    .catchall(z.unknown()),
]);

const renderIdSchema = z.uuid();
const isSha256Digest = (value: unknown): value is `sha256:${string}` =>
  typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
const contentDigestSchema = z.custom<ContentDigest>(isSha256Digest, 'Expected a lowercase SHA-256 digest');
const sceneDigestSchema = z.custom<SceneDigest>(isSha256Digest, 'Expected a lowercase SHA-256 digest');
const sceneNodeIdSchema = z.custom<SceneNodeId>(
  (value) => typeof value === 'string' && value.length > 0,
  'Expected a non-empty scene node id',
);
const sceneTransformSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const scenePresentationSchema = z
  .object({
    background: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    fieldOfViewDegrees: z.number().positive().optional(),
  })
  .strict();
const sceneAssetReferenceSchema = z
  .object({
    contentDigest: contentDigestSchema,
    semanticDigest: contentDigestSchema.optional(),
    mediaType: z.enum(['model/gltf-binary', 'image/svg+xml']),
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
const sceneNodeSchema = z
  .object({
    id: sceneNodeIdSchema,
    name: z.string().optional(),
    parentId: sceneNodeIdSchema.optional(),
    childIds: z.array(sceneNodeIdSchema).readonly(),
    geometry: sceneAssetReferenceSchema.optional(),
    transform: sceneTransformSchema,
    visible: z.boolean(),
  })
  .strict();
const sceneManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    rootNodeIds: z.array(sceneNodeIdSchema).readonly(),
    nodes: z.record(z.string().min(1), sceneNodeSchema),
    presentation: scenePresentationSchema,
  })
  .strict();
const sceneGeometryTransportSchema = z.discriminatedUnion('format', [
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
]);
const geometryTransportSchema = z.discriminatedUnion('format', [
  ...sceneGeometryTransportSchema.options,
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
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
    })
    .catchall(z.unknown()),
]);
const resolvedSceneAssetTransportSchema = z.discriminatedUnion('delivery', [
  sceneAssetReferenceSchema.extend({
    delivery: z.literal('inline'),
    geometry: sceneGeometryTransportSchema,
  }),
  sceneAssetReferenceSchema.extend({
    delivery: z.literal('reference'),
  }),
]);
const resolvedSceneSnapshotTransportSchema = z
  .object({
    manifest: sceneManifestSchema,
    assets: z.array(resolvedSceneAssetTransportSchema).readonly(),
  })
  .strict();
const sceneOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('upsert-node'), node: sceneNodeSchema }).strict(),
  z.object({ type: z.literal('remove-node'), nodeId: sceneNodeIdSchema }).strict(),
  z.object({ type: z.literal('clear-scene') }).strict(),
  z.object({ type: z.literal('set-presentation'), presentation: scenePresentationSchema }).strict(),
]);
const sceneBookmarkSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    source: z.enum(['explicit', 'viewer-update', 'viewer-operation']),
    sceneDigest: sceneDigestSchema,
    retained: z.literal(true),
  })
  .strict();
const progressiveSceneUpdateTransportSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('reset'),
      renderId: renderIdSchema,
      sequence: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative(),
      sceneDigest: sceneDigestSchema,
      snapshot: resolvedSceneSnapshotTransportSchema,
      skippedBefore: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('delta'),
      renderId: renderIdSchema,
      sequence: z.number().int().nonnegative(),
      baseRevision: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative(),
      baseSceneDigest: sceneDigestSchema,
      sceneDigest: sceneDigestSchema,
      operations: z.array(sceneOperationSchema).readonly(),
      assets: z.array(resolvedSceneAssetTransportSchema).readonly(),
    })
    .strict(),
  z
    .object({
      type: z.literal('refinement'),
      renderId: renderIdSchema,
      sequence: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative(),
      sceneDigest: sceneDigestSchema,
      replacements: z
        .array(
          z
            .object({
              nodeId: sceneNodeIdSchema,
              previous: contentDigestSchema,
              replacement: resolvedSceneAssetTransportSchema,
            })
            .strict(),
        )
        .readonly(),
    })
    .strict(),
  z
    .object({
      type: z.literal('bookmark'),
      renderId: renderIdSchema,
      sequence: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative(),
      bookmark: sceneBookmarkSchema,
    })
    .strict(),
]);

const renderPhaseSchema = z.string();
const workerStateSchema = z.enum(['idle', 'buffering', 'rendering', 'error']);
const abortGenerationSchema = z.number().int().min(0).max(4_294_967_295);
const previewCommandIdentityShape = {
  renderId: renderIdSchema,
  abortGeneration: abortGenerationSchema.optional(),
} as const;
const wireAbortReasonCodeSchema = z.literal(2);

const runtimePluginPermissionsSchema = z
  .object({
    network: z.array(z.string()).optional(),
    filesystemWrite: z.boolean().optional(),
  })
  .catchall(z.unknown());

const runtimeRegistrationCommonShape = {
  id: z.string(),
  permissions: runtimePluginPermissionsSchema.optional(),
} as const;

const knownRuntimeCapabilityRegistrationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('kernel'),
      extensions: z.array(z.string()),
    })
    .catchall(z.unknown()),
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('middleware'),
    })
    .catchall(z.unknown()),
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('bundler'),
    })
    .catchall(z.unknown()),
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('transcoder'),
    })
    .catchall(z.unknown()),
]);

const unknownRuntimeCapabilityRegistrationSchema = z
  .object({
    kind: z.string(),
    id: z.string(),
  })
  .catchall(z.unknown())
  .refine(({ kind }) => !runtimeCapabilityKinds.includes(kind as (typeof runtimeCapabilityKinds)[number]));

const runtimeCapabilityRegistrationSchema = z.union([
  knownRuntimeCapabilityRegistrationSchema,
  unknownRuntimeCapabilityRegistrationSchema,
]);

const contentCapabilitySchema = z
  .object({
    schema: z.unknown(),
    defaults: runtimeContentSchema,
  })
  .catchall(z.unknown());

const exportRouteSchema = z
  .object({
    targetFormat: fileExtensionSchema,
    kernelId: z.string(),
    sourceFormat: fileExtensionSchema,
    transcoderId: z.string().optional(),
    fidelity: z.enum(exportFidelityValues),
    exportOptions: z
      .object({
        schema: z.unknown(),
        defaults: z.unknown(),
      })
      .catchall(z.unknown()),
    content: contentCapabilitySchema.optional(),
  })
  .catchall(z.unknown());

const renderCapabilitySchema = z
  .object({
    renderOptions: z
      .object({
        schema: z.unknown(),
        defaults: z.unknown(),
      })
      .catchall(z.unknown()),
    content: contentCapabilitySchema.optional(),
    progressiveScene: z.discriminatedUnion('type', [
      z.object({ type: z.literal('unsupported'), reason: z.string() }).strict(),
      z
        .object({
          type: z.literal('supported'),
          deliveries: z.array(z.enum(['reset', 'delta', 'refinement'])).readonly(),
          bookmarks: z.array(z.enum(['explicit', 'viewer-update', 'viewer-operation'])).readonly(),
          replay: z.array(z.enum(['live', 'retained'])).readonly(),
        })
        .strict(),
    ]),
  })
  .catchall(z.unknown());

export const capabilitiesManifestSchema = z
  .object({
    registrations: z.array(runtimeCapabilityRegistrationSchema),
    routes: z.array(exportRouteSchema),
    renderCapabilities: z.record(z.string(), renderCapabilitySchema),
  })
  .catchall(z.unknown());

const logEntrySchema = z.unknown();
const telemetryEntrySchema = z
  .object({
    name: z.string(),
    startTime: z.number(),
    duration: z.number(),
    detail: z.record(z.string(), z.unknown()).optional(),
    workerTimeOrigin: z.number(),
  })
  .catchall(z.unknown());

// ---------- Memory handle (transport-supplied attachments) ----------

const sharedArrayBufferSchema = z.custom<SharedArrayBuffer>(
  (value) => typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer,
);

/* Structural, not `instanceof`: the handle legitimately carries a DOM
 * `MessagePort`, a `node:worker_threads` port, or an in-process structural
 * port (X7). Reuses the transport's single port sniff. */
const messagePortSchema = z.custom<MessagePortLike>(isMessagePortLike);
export const runtimeInitializeMemoryHandleSchema = z
  .object({
    signalBuffer: sharedArrayBufferSchema.optional(),
    geometryPoolBuffer: sharedArrayBufferSchema.optional(),
    fileSystemPort: messagePortSchema.optional(),
    computeStorePort: messagePortSchema.optional(),
    computeBindingMode: z.enum(['off', 'memory', 'durable']).optional(),
    devtoolsTelemetry: z.boolean().optional(),
    compiledWasmModules: z
      .array(z.object({ url: z.string(), module: compiledWasmModuleSchema }).strict())
      .readonly()
      .optional(),
  })
  .catchall(z.unknown());

// ---------- Initialize call ----------

export const runtimeInitializeArgsSchema = z
  .object({
    config: z.unknown().optional(),
    memoryHandle: runtimeInitializeMemoryHandleSchema.optional(),
    sessionId: z.string().optional(),
    resumeToken: z.string().optional(),
  })
  .catchall(z.unknown());

export const runtimeInitializeResultSchema = z
  .object({
    capabilities: capabilitiesManifestSchema,
  })
  .catchall(z.unknown());

// ---------- Export call ----------

export const runtimeExportArgsSchema = z
  .object({
    format: fileExtensionSchema,
    options: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
  })
  .catchall(z.unknown());

export const runtimeExportResultSchema = exportGeometryResultSchema;

export const runtimeReadSceneSnapshotArgsSchema = z.object({ bookmarkId: z.string().min(1) }).strict();
export const runtimeReadSceneSnapshotResultSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('found'), snapshot: resolvedSceneSnapshotTransportSchema }).strict(),
  z.object({ type: z.literal('missing') }).strict(),
]);
export const runtimeListSceneBookmarksArgsSchema = z.object({ renderId: renderIdSchema }).strict();
export const runtimeListSceneBookmarksResultSchema = z.array(sceneBookmarkSchema).readonly();
export const runtimeSceneUpdatesArgsSchema = z
  .object({ afterSequence: z.number().int().nonnegative().optional() })
  .strict();
export const runtimeSceneUpdatesEventSchema = progressiveSceneUpdateTransportSchema;

export const runtimeExportModelArgsSchema = z
  .object({
    stage: stageSchema.optional(),
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
    format: fileExtensionSchema,
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
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
    })
    .catchall(z.unknown()),
]);

export const runtimeTranscodeArgsSchema = z
  .object({
    from: fileExtensionSchema,
    to: fileExtensionSchema,
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

export const runtimeLogArgsSchema = z
  .object({
    entry: logEntrySchema,
  })
  .catchall(z.unknown());

export const runtimeLogBatchArgsSchema = z
  .object({
    entries: z.array(logEntrySchema),
  })
  .catchall(z.unknown());

export const runtimeTelemetryArgsSchema = z
  .object({
    entries: z.array(telemetryEntrySchema),
  })
  .catchall(z.unknown());

export const runtimeCapabilitiesUpdatedArgsSchema = z
  .object({
    capabilities: capabilitiesManifestSchema,
  })
  .catchall(z.unknown());

// ---------- Hello payload ----------

export const transportHelloPayloadSchema = z
  .object({
    server: z.literal('kernel-runtime-worker'),
    runtimeVersion: z.string(),
    protocolVersion: z.number().int().min(0),
    sessionId: z.string().optional(),
    resumeToken: z.string().optional(),
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
    readSceneSnapshot: { args: runtimeReadSceneSnapshotArgsSchema, result: runtimeReadSceneSnapshotResultSchema },
    listSceneBookmarks: {
      args: runtimeListSceneBookmarksArgsSchema,
      result: runtimeListSceneBookmarksResultSchema,
    },
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
  listens: {
    sceneUpdates: { args: runtimeSceneUpdatesArgsSchema, event: runtimeSceneUpdatesEventSchema },
  },
} as const satisfies WireProtocolSchemas<RuntimeProtocol>;
