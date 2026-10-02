/**
 * Runtime protocol Zod schemas — single source of truth for the wire
 * shape of every {@link RuntimeProtocol} call and notify.
 *
 * Type aliases in `runtime-protocol.types.ts` derive from these schemas
 * via `z.input` / `z.output`; the `Channel` server validates inbound
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
import { fileExtensions } from '@taucad/types/constants';
import type { FileExtension } from '@taucad/types';
import type { WireProtocolSchemas } from '#types/wire-protocol-schemas.types.js';

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

const middlewareRegistrationSchema = z
  .object({
    url: z.string(),
    enabled: z.boolean().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const bundlerRegistrationSchema = z
  .object({
    bundlerModuleUrl: z.string(),
    extensions: z.array(z.string()),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const transcoderModuleEntrySchema = z
  .object({
    id: z.string(),
    moduleUrl: z.string(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const kernelIssueCodeSchema = z.enum([
  'RENDER_TIMEOUT',
  'RENDER_ABORTED',
  'KERNEL_BINDING_FAILED',
  'KERNEL_CAPABILITY_MISSING',
  'BUNDLER_FAILED',
  'MIDDLEWARE_FAILED',
  'RUNTIME',
  'UNKNOWN',
]);

const kernelIssueSchema = z
  .object({
    message: z.string(),
    code: kernelIssueCodeSchema,
    severity: z.enum(['error', 'warning', 'info']),
  })
  .catchall(z.unknown());

const kernelResultSchema = z.union([
  z
    .object({
      success: z.literal(true),
      data: z.unknown(),
      issues: z.array(kernelIssueSchema),
      serializedHandle: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
    })
    .strict(),
]);

const exportFileSchema = z
  .object({
    name: z.string(),
    bytes: z.instanceof(Uint8Array),
  })
  .catchall(z.unknown());

const exportGeometryResultSchema = z.union([
  z
    .object({
      success: z.literal(true),
      data: z.array(exportFileSchema),
      issues: z.array(kernelIssueSchema),
      serializedHandle: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
    })
    .strict(),
]);

const getParametersResultSchema = z.union([
  z
    .object({
      success: z.literal(true),
      data: z.object({
        defaultParameters: z.record(z.string(), z.unknown()),
        jsonSchema: z.unknown(),
      }),
      issues: z.array(kernelIssueSchema),
      serializedHandle: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      issues: z.array(kernelIssueSchema),
    })
    .strict(),
]);

const hashedGeometryResultTransportSchema = kernelResultSchema;

const renderPhaseSchema = z.string();
const workerStateSchema = z.enum(['idle', 'buffering', 'rendering', 'error']);
const abortReasonCodeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const capabilitiesManifestSchema = z.unknown();

const logEntrySchema = z.unknown();
const telemetryEntrySchema = z
  .object({
    name: z.string(),
    startTime: z.number(),
    duration: z.number(),
    detail: z.record(z.string(), z.unknown()).optional(),
    workerTimeOrigin: z.number(),
  })
  .strict();

// ---------- Memory handle (transport-supplied attachments) ----------

const sharedArrayBufferSchema = z.custom<SharedArrayBuffer>(
  (value) => typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer,
);

const messagePortSchema = z.custom<MessagePort>(
  (value) => typeof MessagePort !== 'undefined' && value instanceof MessagePort,
);

export const runtimeInitializeMemoryHandleSchema = z
  .object({
    signalBuffer: sharedArrayBufferSchema.optional(),
    geometryPoolBuffer: sharedArrayBufferSchema.optional(),
    filePoolBuffer: sharedArrayBufferSchema.optional(),
    /* `MessagePort` is the global DOM type in browser/Worker contexts
     * and resolves to the structurally-equivalent worker_threads
     * `MessagePort` in Node. Either backs the runtime FS bridge so the
     * schema accepts the global form. */
    fileSystemPort: messagePortSchema.optional(),
  })
  .strict();

// ---------- Initialize call ----------

export const runtimeInitializeArgsSchema = z
  .object({
    options: z.record(z.string(), z.unknown()),
    middlewareEntries: z.array(middlewareRegistrationSchema),
    bundlerEntries: z.array(bundlerRegistrationSchema).optional(),
    transcoderModules: z.array(transcoderModuleEntrySchema).optional(),
    memoryHandle: runtimeInitializeMemoryHandleSchema.optional(),
  })
  .strict();

export const runtimeInitializeResultSchema = z
  .object({
    capabilities: capabilitiesManifestSchema,
  })
  .strict();

// ---------- Export call ----------

export const runtimeExportArgsSchema = z
  .object({
    format: fileExtensionSchema,
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const runtimeExportResultSchema = exportGeometryResultSchema;

// ---------- Notifies (consumer → host) ----------

export const runtimeOpenFileArgsSchema = z
  .object({
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const runtimeStageAndRenderArgsSchema = z
  .object({
    stage: z.record(z.string(), z.instanceof(Uint8Array)),
    file: geometryFileSchema,
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const runtimeUpdateParametersArgsSchema = z
  .object({
    parameters: z.record(z.string(), z.unknown()),
  })
  .strict();

export const runtimeSetOptionsArgsSchema = z
  .object({
    options: z.record(z.string(), z.unknown()),
  })
  .strict();

export const runtimeFileChangedArgsSchema = z
  .object({
    paths: z.array(z.string()),
  })
  .strict();

export const runtimeConfigureMiddlewareArgsSchema = z
  .object({
    entries: z.array(middlewareRegistrationSchema),
  })
  .strict();

/**
 * `cleanup` is a parameter-less notify. The application-level call
 * (`channel.notify('cleanup')`) carries no args, but the wire layer
 * normalises the missing payload to `null` (`{ a: value ?? null }` in
 * `createChannel`/`createChannelServer`) so the wire schema validates
 * `null`, not `undefined`. C18 covers both ends of that contract.
 */
export const runtimeCleanupArgsSchema = z.null();

export const runtimeAbortArgsSchema = z
  .object({
    reason: abortReasonCodeSchema,
  })
  .strict();

// ---------- Notifies (host → consumer) ----------

export const runtimeProgressArgsSchema = z
  .object({
    phase: renderPhaseSchema,
    rgen: z.number().int().nonnegative(),
    detail: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const runtimeGeometryComputedArgsSchema = z
  .object({
    result: hashedGeometryResultTransportSchema,
    rgen: z.number().int().nonnegative(),
  })
  .strict();

export const runtimeParametersResolvedArgsSchema = z
  .object({
    result: getParametersResultSchema,
    rgen: z.number().int().nonnegative(),
  })
  .strict();

export const runtimeErrorEventArgsSchema = z
  .object({
    issues: z.array(kernelIssueSchema),
    rgen: z.number().int().nonnegative().optional(),
  })
  .strict();

export const runtimeStateChangedArgsSchema = z
  .object({
    state: workerStateSchema,
    detail: z.string().optional(),
  })
  .strict();

export const runtimeActiveKernelChangedArgsSchema = z
  .object({
    kernelId: z.string().optional(),
  })
  .strict();

export const runtimeLogArgsSchema = z
  .object({
    entry: logEntrySchema,
  })
  .strict();

export const runtimeLogBatchArgsSchema = z
  .object({
    entries: z.array(logEntrySchema),
  })
  .strict();

export const runtimeTelemetryArgsSchema = z
  .object({
    entries: z.array(telemetryEntrySchema),
  })
  .strict();

export const runtimeCapabilitiesUpdatedArgsSchema = z
  .object({
    capabilities: capabilitiesManifestSchema,
  })
  .strict();

// ---------- Hello payload ----------

export const transportHelloPayloadSchema = z
  .object({
    server: z.literal('kernel-runtime-worker'),
    runtimeVersion: z.string(),
    transportId: z.string(),
  })
  .strict();

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
  calls: {
    initialize: { args: runtimeInitializeArgsSchema, result: runtimeInitializeResultSchema },
    export: { args: runtimeExportArgsSchema, result: runtimeExportResultSchema },
  },
  notifies: {
    // Consumer → host
    openFile: runtimeOpenFileArgsSchema,
    'stage-and-render': runtimeStageAndRenderArgsSchema,
    updateParameters: runtimeUpdateParametersArgsSchema,
    setOptions: runtimeSetOptionsArgsSchema,
    fileChanged: runtimeFileChangedArgsSchema,
    configureMiddleware: runtimeConfigureMiddlewareArgsSchema,
    cleanup: runtimeCleanupArgsSchema,
    abort: runtimeAbortArgsSchema,

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
  },
} as const satisfies WireProtocolSchemas;
