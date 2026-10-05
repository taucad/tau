/** Shared v4 runtime wire validators for setup, diagnostics and capability updates. @internal */
import { z } from 'zod';
import type { MessagePortLike } from '@taucad/rpc';
import { isMessagePortLike } from '#transport/_internal/wire-transferables.js';
import { compiledWasmModuleSchema } from '#transport/_internal/compiled-wasm-module.schema.js';
import { capabilitiesManifestSchema } from '#types/runtime-capabilities.schemas.js';
import { kernelIssueCodeValues } from '#types/kernel-issue-codes.js';
import { assertRootedPath } from '@taucad/utils/path';
import type { ContentDigest } from '@taucad/cache-core';

/** Shared issue envelope admitted by every runtime wire result. @internal */
export const runtimeIssueSchema = z
  .object({
    code: z.enum(kernelIssueCodeValues),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    details: z.unknown().optional(),
  })
  .catchall(z.unknown());

/** Lowercase digest, including its algorithm prefix. @internal */
export const runtimeContentDigestSchema = z.custom<ContentDigest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
  'Expected a lowercase SHA-256 digest',
);

const rootedFile = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    try {
      assertRootedPath(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected a rooted file path.' });
    }
  });

/** Exact source closure revision, including missing optional dependencies. @internal */
export const runtimeSourceRevisionSchema = z
  .object({
    entry: rootedFile,
    files: z.record(rootedFile, z.union([runtimeContentDigestSchema, z.literal('missing')])),
  })
  .loose();

const logEntrySchema = z
  .object({
    id: z.string(),
    timestamp: z.number(),
    level: z.enum(['error', 'warn', 'info', 'debug', 'trace']),
    message: z.string(),
    origin: z
      .object({ component: z.string().optional(), operation: z.string().optional(), file: z.string().optional() })
      .optional(),
    data: z.unknown().optional(),
  })
  .loose();
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
    publicationFileSystemPort: messagePortSchema.optional(),
    computeStorePort: messagePortSchema.optional(),
    computeBindingMode: z.enum(['off', 'memory', 'durable']).optional(),
    devtoolsTelemetry: z.boolean().optional(),
    compiledWasmModules: z
      .array(z.object({ url: z.string(), module: compiledWasmModuleSchema }).loose())
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

const telemetryOriginSchema = z
  .object({
    label: z.string(),
    instance: z.string(),
  })
  .catchall(z.unknown());

export const runtimeTelemetryArgsSchema = z
  .object({
    entries: z.array(telemetryEntrySchema),
    origin: telemetryOriginSchema,
    epoch: z.number(),
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
