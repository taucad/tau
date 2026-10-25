/* eslint-disable @typescript-eslint/naming-convention -- OTel attribute names and closed vocabulary values */
/**
 * The four runtime ingest entry schemas (`runtime.operation`, `runtime.late`, `runtime.viewer`,
 * `telemetry.delivery`) and their validation at ingest. Kept apart from the vocabularies so a client that only maps
 * entries does not ship the API's validators.
 */
import { z } from 'zod';
import {
  RuntimeEntryName,
  ingestBodyBounds,
  otherValue,
  releasePattern,
  runtimeEntryNames,
  runtimeLimitIds,
  runtimeVocabulary,
} from '#runtime-ingest.js';

const v = runtimeVocabulary;

/** Milliseconds, clamped to an hour. */
const milliseconds = z
  .number()
  .min(0)
  .transform((value) => Math.min(value, 3_600_000));
/**
 * A non-negative integer; above `max` the entry is rejected (a facet above its clamp is a forgery or a bug).
 *
 * @param max - The ceiling.
 * @returns The schema.
 */
const bounded = (max: number) => z.number().int().min(0).max(max);
const release = z.string().regex(releasePattern);
const mergedOutcomes: ReadonlySet<string> = new Set(['superseded', 'cancelled', 'abandoned']);
const pluginOperations: ReadonlySet<string> = new Set(['transcode', 'export', 'job', 'machine']);
const machineRoutes: ReadonlySet<string> = new Set(['desktop', 'cli', 'daemon', 'cloud']);

const workerFactsSchema = z.strictObject({
  queue: milliseconds,
  execution: milliseconds,
  cold: z.boolean(),
  reuse: v.reuse,
  heapBytes: bounded(64 * 2 ** 30).optional(),
  heapSource: v.heapSource.optional(),
  realm: v.realm.optional(),
  plugin: v.plugin.optional(),
  triangles: bounded(1e9).optional(),
  parameters: z
    .strictObject({
      declared: bounded(1000),
      modified: bounded(1000),
      unknown: bounded(1000).optional(),
      truncated: z.literal(true).optional(),
      features: z.array(v.parameterFeature).max(4).optional(),
    })
    .optional(),
  phases: z.partialRecord(v.phase, milliseconds).optional(),
  middleware: z
    .strictObject({
      total: milliseconds,
      slowestId: v.middleware,
      slowest: milliseconds,
      ran: z.array(v.middleware).max(8).optional(),
    })
    .optional(),
  bundler: v.bundler.optional(),
});

const limitSchema = z.union([
  z.strictObject({
    id: z.enum(runtimeLimitIds),
    unit: v.limitUnit,
    maximum: z.number().min(0),
    demand: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.enum(['measured', 'estimated']), value: z.number().min(0) }),
      z.strictObject({ kind: z.literal('unknown') }),
    ]),
    origin: z.enum(['default', 'host-option', 'profile']),
  }),
  /* Any other id carries no numbers; an unknown id with numbers is dropped to `_OTHER` alone. */
  z.object({ id: z.string() }).transform(() => ({ id: otherValue }) as const),
]);

/**
 * `runtime.operation`: one settled attempt (or a pre-dispatch refusal, durable submission, job terminal, GeoSpec run
 * or machine operation). `count` is honoured only on merged outcomes and clamped to 500.
 * @public
 */
export const runtimeOperationEntrySchema = z
  .object({
    name: z.literal(RuntimeEntryName.OPERATION),
    duration: milliseconds,
    detail: z.strictObject({
      operation: v.operation,
      outcome: v.outcome,
      code: v.errorType.optional(),
      kernel: v.kernel.optional(),
      route: v.route,
      caller: v.caller,
      transport: v.transport.optional(),
      release,
      device: v.device.optional(),
      platform: v.platform.optional(),
      os: v.os.optional(),
      worker: workerFactsSchema.optional(),
      adaptations: z.array(v.errorType).max(8).optional(),
      factsMissing: v.factsMissing.optional(),
      format: v.format.optional(),
      plugin: v.plugin.optional(),
      sourceFormat: v.fileFormat.optional(),
      entryFormat: v.fileFormat.optional(),
      machineAction: v.machineAction.optional(),
      machineKind: v.machineKind.optional(),
      deduplicated: z.literal(true).optional(),
      verify: z
        .strictObject({ selected: bounded(10_000), passed: bounded(10_000), failed: bounded(10_000) })
        .optional(),
      limit: limitSchema.optional(),
      count: z
        .number()
        .int()
        .min(2)
        .transform((value) => Math.min(value, 500))
        .optional(),
    }),
  })
  .refine(
    ({ detail }) => detail.count === undefined || mergedOutcomes.has(detail.outcome),
    'count is only valid on superseded, cancelled or abandoned',
  )
  .refine(({ detail }) => detail.outcome !== 'succeeded' || detail.code === undefined, 'a success carries no code')
  .refine(
    ({ detail }) => detail.worker?.parameters === undefined || detail.operation === 'evaluate',
    'parameter facts ride evaluate only',
  )
  .refine(
    ({ detail }) => detail.factsMissing === undefined || detail.worker === undefined,
    'facts are either joined or missing, never both',
  )
  .refine(({ detail }) => detail.verify === undefined || detail.operation === 'verify', 'verify facts ride verify only')
  .refine(({ detail }) => detail.outcome !== 'attention' || detail.operation === 'job', 'attention is a job outcome')
  .refine(
    ({ detail }) => detail.plugin === undefined || pluginOperations.has(detail.operation),
    'plugin rides transcode, transcoder-routed export, job and machine only',
  )
  .refine(
    ({ detail }) =>
      detail.sourceFormat === undefined || detail.operation === 'transcode' || detail.operation === 'export',
    'sourceFormat rides transcode and export only',
  )
  .refine(
    ({ detail }) => detail.entryFormat === undefined || detail.operation === 'evaluate',
    'entryFormat rides evaluate only',
  )
  .refine(
    ({ detail }) => (detail.machineKind !== undefined) === (detail.operation === 'machine'),
    'machineKind rides machine entries, and every machine entry carries one',
  )
  .refine(
    ({ detail }) => detail.machineAction === undefined || detail.machineKind === 'action',
    'machineAction rides action-kind machine entries only',
  )
  /* AR-W22-11: machines are driven by the Node machine host only; a browser or forged machine entry is refused. */
  .refine(
    ({ detail }) => detail.operation !== 'machine' || machineRoutes.has(detail.route),
    'machine entries come from a Node machine host',
  );

/** `runtime.late`: a worker reply after its attempt settled. Counted, never an attempt. @public */
export const runtimeLateEntrySchema = z.object({
  name: z.literal(RuntimeEntryName.LATE),
  duration: milliseconds,
  detail: z.strictObject({ operation: v.operation, settledAs: v.settledAs, route: v.route, caller: v.caller }),
});

/** `runtime.viewer`: a closed viewer event and backend; counts only. @public */
export const runtimeViewerEntrySchema = z
  .object({
    name: z.literal(RuntimeEntryName.VIEWER),
    duration: milliseconds,
    detail: z.strictObject({
      event: v.viewerEvent,
      backend: v.viewerBackend,
      route: v.route,
      release,
      device: v.device.optional(),
      platform: v.platform.optional(),
      format: v.format.optional(),
      triangles: bounded(1e9).optional(),
    }),
  })
  .refine(({ detail }) => detail.format === undefined || detail.event === 'download', 'format rides download only');

/** `telemetry.delivery`: what the reporter dropped before this batch, by reason, and how old the batch is. @public */
export const deliveryHealthEntrySchema = z.object({
  name: z.literal(RuntimeEntryName.DELIVERY),
  duration: z.literal(0),
  detail: z.strictObject({
    route: v.route,
    oldest: milliseconds,
    dropped: z.record(z.string(), bounded(1_000_000)),
    spansDropped: bounded(100_000_000).optional(),
  }),
});

/** A validated `runtime.operation` entry. @public */
export type RuntimeOperationRecord = z.output<typeof runtimeOperationEntrySchema>;
/** A validated `runtime.late` entry. @public */
export type RuntimeLateRecord = z.output<typeof runtimeLateEntrySchema>;
/** A validated `runtime.viewer` entry. @public */
export type RuntimeViewerRecord = z.output<typeof runtimeViewerEntrySchema>;
/** A validated `telemetry.delivery` entry. @public */
export type DeliveryHealthRecord = z.output<typeof deliveryHealthEntrySchema>;
/** Any validated runtime entry. @public */
export type RuntimeEntryRecord =
  | RuntimeOperationRecord
  | RuntimeLateRecord
  | RuntimeViewerRecord
  | DeliveryHealthRecord;

const entrySchemas = {
  [RuntimeEntryName.OPERATION]: runtimeOperationEntrySchema,
  [RuntimeEntryName.LATE]: runtimeLateEntrySchema,
  [RuntimeEntryName.VIEWER]: runtimeViewerEntrySchema,
  [RuntimeEntryName.DELIVERY]: deliveryHealthEntrySchema,
} as const;

/**
 * Validate one runtime entry against the schema its name selects.
 *
 * @param entry - The entry as posted.
 * @returns The validated entry, or `undefined` when it is invalid (counted `rejected-invalid`).
 * @public
 */
export const parseRuntimeEntry = (
  entry: Readonly<{ [key: string]: unknown; name: string }>,
): RuntimeEntryRecord | undefined => {
  const schemas = entrySchemas as Readonly<Record<string, z.ZodType<RuntimeEntryRecord>>>;
  /* An inherited name such as `constructor` selects no schema. */
  const parsed = Object.hasOwn(schemas, entry.name) ? schemas[entry.name]?.safeParse(entry) : undefined;
  return parsed?.success === true ? parsed.data : undefined;
};

/** The envelope the ingest body admits for a runtime entry before per-entry validation. @public */
export const runtimeEntryEnvelopeSchema = z.object({
  name: z.enum(runtimeEntryNames),
  duration: z.unknown(),
  detail: z.unknown(),
});

/** The ingest body schema the reporter writes, for tests and hosts that validate locally. @public */
export const ingestBatchSchema = z.object({
  batch: z.string().regex(ingestBodyBounds.batchId),
  reason: z.enum(['interval', 'pagehide', 'shutdown']).optional(),
  entries: z.array(z.object({ name: z.string() }).loose()).max(ingestBodyBounds.maxEntries),
});
