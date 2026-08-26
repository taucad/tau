import { z } from 'zod';

/**
 * Canonical entry name constants used in `performance.measure()` and ingest payloads.
 * @public
 */
/* eslint-disable @typescript-eslint/naming-convention -- OTEL constant enum uses UPPER_SNAKE_CASE */
export const IngestEntryName = {
  KERNEL_CREATE_GEOMETRY: 'observability.createGeometry',
  KERNEL_EXPORT_GEOMETRY: 'observability.exportGeometry',
  WEBSOCKET_RECONNECTION: 'observability.websocketReconnection',
  EDITOR_LOAD: 'observability.editorLoad',
  WASM_MODULE_LOAD: 'observability.wasmModuleLoad',
  INDEXEDDB_OPERATION: 'observability.indexeddbOperation',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- end OTEL constants block */

const kernelCreateGeometryEntrySchema = z.object({
  name: z.literal(IngestEntryName.KERNEL_CREATE_GEOMETRY),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      status: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

const kernelExportGeometryEntrySchema = z.object({
  name: z.literal(IngestEntryName.KERNEL_EXPORT_GEOMETRY),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      status: z.string().optional(),
      exportFormat: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

const websocketReconnectionEntrySchema = z.object({
  name: z.literal(IngestEntryName.WEBSOCKET_RECONNECTION),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      attempt: z.number().int().nonnegative().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

const editorLoadEntrySchema = z.object({
  name: z.literal(IngestEntryName.EDITOR_LOAD),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      kernel: z.string().optional(),
      fileCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const wasmModuleLoadEntrySchema = z.object({
  name: z.literal(IngestEntryName.WASM_MODULE_LOAD),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      module: z.string().optional(),
      sizeBytes: z.number().nonnegative().optional(),
    })
    .optional(),
});

const indexeddbOperationEntrySchema = z.object({
  name: z.literal(IngestEntryName.INDEXEDDB_OPERATION),
  duration: z.number().nonnegative(),
  detail: z
    .object({
      operation: z.string().optional(),
      store: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});

/**
 * Discriminated union of all client metric entry shapes.
 * Used for validating individual entries in the ingest payload.
 * @public
 */
export const clientMetricEntrySchema = z.discriminatedUnion('name', [
  kernelCreateGeometryEntrySchema,
  kernelExportGeometryEntrySchema,
  websocketReconnectionEntrySchema,
  editorLoadEntrySchema,
  wasmModuleLoadEntrySchema,
  indexeddbOperationEntrySchema,
]);

/**
 * Schema for the full ingest payload sent from client workers to the API.
 * @public
 */
export const ingestPayloadSchema = z.object({
  entries: z.array(clientMetricEntrySchema).min(1),
});

/** Inferred type of a single client metric entry. @public */
export type ClientMetricEntry = z.infer<typeof clientMetricEntrySchema>;

/** Inferred type of the full ingest payload. @public */
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
