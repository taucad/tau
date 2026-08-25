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
import { exportFidelityValues, fileExtensions } from '@taucad/types/constants';
import type { FileExtension, MimeType } from '@taucad/types';
import type { MessagePortLike, WireProtocolSchemas } from '@taucad/rpc';
import { isMessagePortLike } from '#transport/_internal/wire-transferables.js';
import { compiledWasmModuleSchema } from '#transport/_internal/compiled-wasm-module.schema.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { kernelIssueCodeValues } from '#types/kernel-issue-codes.js';

// ---------- Primitives ----------

const fileExtensionSchema = z.enum(
  // SAFETY: `fileExtensions` is exported as `readonly FileExtension[]`;
  // `z.enum` requires the non-empty tuple form. The cast preserves the
  // literal union (no runtime change).
  fileExtensions as unknown as readonly [FileExtension, ...FileExtension[]],
);

const geometryFileSchema = z
  .object({
    path: z.string(),
    filename: z.string(),
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

const kernelResultSchema = z.union([
  z
    .object({
      success: z.literal(true),
      data: z.unknown(),
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
      data: z.object({
        defaultParameters: z.record(z.string(), z.unknown()),
        jsonSchema: z.unknown(),
      }),
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

const hashedGeometryResultTransportSchema = kernelResultSchema;

const renderPhaseSchema = z.string();
const workerStateSchema = z.enum(['idle', 'buffering', 'rendering', 'error']);
const renderIdSchema = z.uuid();
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

export const runtimeExportModelArgsSchema = z
  .object({
    stage: z.record(z.string(), z.instanceof(Uint8Array)).optional(),
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
    format: fileExtensionSchema,
    exportOptions: z.record(z.string(), z.unknown()).optional(),
    content: runtimeContentSchema.optional(),
  })
  .catchall(z.unknown());

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

export const runtimeStageAndRenderArgsSchema = z
  .object({
    ...previewCommandIdentityShape,
    stage: z.record(z.string(), z.instanceof(Uint8Array)),
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
