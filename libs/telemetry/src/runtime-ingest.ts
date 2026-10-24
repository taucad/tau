/* eslint-disable @typescript-eslint/naming-convention -- OTel attribute names and closed vocabulary values */
/**
 * The remote contract of runtime observation: closed vocabularies, the cause table, the four runtime ingest entries
 * (`runtime.operation`, `runtime.late`, `runtime.viewer`, `telemetry.delivery`), the body bounds and the API's own
 * `TAU_RUNTIME_TELEMETRY` mode. Validated by the reporter's mapping and again at ingest. No field carries an id, a
 * path, a name, a value or a message; the population is never a field (the API derives it from the request).
 */
import { z } from 'zod';
import {
  admissionCodes,
  bundlerIds,
  conversionEdges,
  exportFormats,
  fileFormats,
  jobCodes,
  jobProviderIds,
  kernelIssueCodes,
  machineActions,
  machineFailureCodes,
  machineKinds,
  machineProviderIds,
  middlewareIds,
  preparationCodes,
  runtimeKernelIds,
  transcoderIds,
} from '#runtime-vocabulary.js';

/** The value recorded for anything outside a closed vocabulary. @public */
export const otherValue = '_OTHER';

/**
 * A closed vocabulary: a value outside it is recorded as `_OTHER`, never as the client's string.
 *
 * @param values - The admitted values.
 * @returns A schema that maps any other string to `_OTHER`.
 */
const closed = <const T extends readonly [string, ...string[]]>(values: T) =>
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's `.catch()` is a schema fallback, not Promise.catch().
  z.enum([...values, otherValue]).catch(otherValue);

/** Runtime operations, including pre-dispatch, durable submission, jobs, GeoSpec runs and machine operations. @public */
export const runtimeOperations = [
  'initialize',
  'describe',
  'evaluate',
  'render',
  'export',
  'transcode',
  'prepare',
  'admit',
  'submit',
  'reconcile',
  'job',
  'verify',
  'machine',
] as const;
/** How an attempt ended. `attention` is a job outcome and never moves the operations denominator. @public */
export const runtimeOutcomes = [
  'succeeded',
  'issue',
  'refused',
  'cancelled',
  'superseded',
  'timed-out',
  'terminated',
  'abandoned',
  'discarded',
  'failed',
  'unknown',
  'attention',
] as const;
/** The host that ran an attempt; supplied by the host composition, so an unknown route rejects the entry. @public */
export const runtimeRoutes = ['browser', 'desktop', 'cli', 'mcp', 'daemon', 'cloud'] as const;
/** Who issued an attempt. @public */
export const runtimeCallers = [
  'editor',
  'agent',
  'geospec',
  'quicklook',
  'host',
  'converter',
  'capture',
  'viewer',
] as const;
/** The transport a client was composed with. @public */
export const runtimeTransports = ['in-process', 'web-worker', 'node-worker', 'utility', 'websocket'] as const;
/** The realm the kernel runtime worker runs in, set by the worker host. @public */
export const runtimeRealms = ['web-worker', 'node-worker', 'utility', 'process', 'in-process'] as const;
/** Where a memory-at-settle reading came from. @public */
export const heapSources = ['kernel', 'child', 'resident', 'none'] as const;
/** Device memory class (browsers and the desktop renderer only). @public */
export const deviceClasses = ['constrained', 'standard'] as const;
/** Engine family, never a user-agent string or a version. @public */
export const runtimePlatforms = ['chromium', 'firefox', 'webkit', 'electron', 'node'] as const;
/** OS class only. @public */
export const runtimeOsClasses = ['windows', 'macos', 'linux', 'ios', 'android', 'other'] as const;
/** Compute reuse result; the capability's `on` is not one of them. @public */
export const reuseResults = ['cache', 'computed', 'off', 'none', 'unreported'] as const;
/** Closed phase names (`phaseOfSpan` in the runtime framework). @public */
export const runtimePhases = ['prepare', 'resolve', 'compute', 'mesh', 'export', 'reuse', 'other'] as const;
/** Why worker facts are absent although a reply settled the attempt. @public */
export const factsMissingReasons = ['missing-timeout', 'missing-worker-gone'] as const;
/** Manifest features a model uses. @public */
export const parameterFeatures = ['units', 'array', 'decimal', 'structured'] as const;
/** Viewer events. @public */
export const viewerEvents = [
  'context-lost',
  'context-restored',
  'first-frame',
  'long-frame-burst',
  'download',
] as const;
/** Viewer graphics backends. @public */
export const viewerBackends = ['webgl', 'webgpu'] as const;
/** Limit ids that keep their numbers on the wire; any other id is sent as `_OTHER` alone. @public */
export const runtimeLimitIds = [
  'occt.export.triangles',
  'mesh.export.triangles',
  'host.utility.resident',
  'picovoxel.tape.instructions',
  'geospec.work.units',
] as const;
/** Units a limit may carry with numbers. @public */
export const runtimeLimitUnits = [
  'By',
  '{triangle}',
  '{vertex}',
  '{instance}',
  '{instruction}',
  '{unit}',
  'ms',
] as const;
/** Why a reporter dropped entries before delivery. @public */
export const dropReasons = [
  'queue-full',
  'identity-changed',
  'consent-withdrawn',
  'consent-unresolved',
  'identity-unresolved',
  'retry-exhausted',
  'rejected',
  'expired',
  'policy-off',
  'policy-unknown',
  'renderer-gone',
  'late-expired',
  'payload-too-large',
  'held-at-unload',
] as const;
/** What the ingest did with an entry. @public */
export const ingestDispositions = [
  'recorded',
  'rejected-invalid',
  'rejected-rate-limit',
  'rejected-unknown-entry',
  'duplicate',
  'disabled',
  'overflow',
] as const;
/** The two populations; assigned by the API from the request's principal. @public */
export const runtimePopulations = ['signed-in', 'signed-out'] as const;
/** Delivered-triangle size classes: <10k, <100k, <1M, <5M, ≥5M. @public */
export const sizeClasses = ['xs', 's', 'm', 'l', 'xl'] as const;
/** How much of the declared parameter set differs from its defaults. @public */
export const parameterClasses = ['none', 'default', 'some', 'most', 'all'] as const;
/** Capability kinds of the non-kernel plugin ids; derived by the ingest from the id, never sent. @public */
export const pluginCapabilities = ['transcoder', 'job', 'middleware', 'bundler', 'machine'] as const;

/** The `plugin` facet of an entry: transcoders, job providers and machine providers. @public */
export const runtimePluginIds = [...transcoderIds, ...jobProviderIds, ...machineProviderIds] as const;
/** The `tau.runtime.plugin` label of the usage counter: every non-kernel capability id of the registry. @public */
export const pluginUsageIds = [
  ...transcoderIds,
  ...jobProviderIds,
  ...middlewareIds,
  ...bundlerIds,
  ...machineProviderIds,
] as const;

/** A non-kernel capability id of the registry. @public */
export type PluginUsageId = (typeof pluginUsageIds)[number];
/** A capability kind. @public */
export type PluginCapability = (typeof pluginCapabilities)[number];

/**
 * The capability kind of each registry plugin id, built from the generated lists, so a forged (capability, plugin)
 * pair cannot exist. Kernels are absent: their usage count is `tau.runtime.operations{kernel.id}`.
 * @public
 */
export const capabilityOf: Readonly<Record<PluginUsageId, PluginCapability>> = Object.fromEntries([
  ...transcoderIds.map((id) => [id, 'transcoder'] as const),
  ...jobProviderIds.map((id) => [id, 'job'] as const),
  ...middlewareIds.map((id) => [id, 'middleware'] as const),
  ...bundlerIds.map((id) => [id, 'bundler'] as const),
  ...machineProviderIds.map((id) => [id, 'machine'] as const),
]) as Record<PluginUsageId, PluginCapability>;

/** Cause classes a failure code can belong to; `none` and `cancelled` come from the outcome alone. @public */
export const codeClasses = ['input', 'policy', 'capacity', 'implementation', 'environment'] as const;
/** A cause class of a failure code. @public */
export type CodeClass = (typeof codeClasses)[number];
/** `tau.runtime.cause`. @public */
export const runtimeCauses = ['none', ...codeClasses, 'cancelled'] as const;
/** A cause. @public */
export type RuntimeCause = (typeof runtimeCauses)[number] | typeof otherValue;

/** Termination codes the client derives from the transport's close cause (package §1.2). @public */
export const terminationCodes = [
  'HOST_LIMIT_EXCEEDED',
  'HOST_BOOT_FAILED',
  'HOST_EXITED',
  'TRANSPORT_FAILED',
  'TIMEOUT_RECOVERY',
] as const;

/** Every code `error.type` records as itself. @public */
export const errorTypes = [
  ...kernelIssueCodes,
  'RUNTIME_OPERATION_TIMEOUT',
  ...terminationCodes,
  ...preparationCodes,
  ...admissionCodes,
  ...jobCodes,
  ...machineFailureCodes,
] as const;
/** One recorded failure code. @public */
export type ErrorType = (typeof errorTypes)[number];

const kernelIssueClass: Readonly<Record<(typeof kernelIssueCodes)[number], CodeClass>> = {
  AUTHENTICATION_ERROR: 'environment',
  BUNDLER_FAILED: 'input',
  DISPLAY_SIMPLIFIED: 'policy',
  EVALUATE_OPTIONS_INVALID: 'input',
  EXPORT_AMBIGUOUS: 'input',
  EXPORT_ARTIFACT_SET_INVALID: 'implementation',
  EXPORT_OPTIONS_INVALID: 'input',
  EXPORT_UNKNOWN: 'input',
  GEOMETRY_INVALID: 'input',
  GLTF_BYTES_INVALID: 'input',
  HANDLE_MISSING: 'implementation',
  INVALID_ANNOTATION: 'input',
  INVALID_RECORD: 'input',
  INVALID_REFERENCE: 'input',
  INVALID_SCHEMA: 'input',
  KERNEL_BINDING_FAILED: 'implementation',
  KERNEL_CAPABILITY_MISSING: 'policy',
  KERNEL_NOT_PREPARED: 'environment',
  KERNEL_REALM_CONFLICT: 'policy',
  LEGACY_PROJECTION_LOSS: 'policy',
  LIBRARY_VERSION_MISMATCH: 'implementation',
  METADATA_CONFLICT: 'input',
  MIDDLEWARE_FAILED: 'implementation',
  OPERATION_TIMEOUT: 'environment',
  RENDER_ARTIFACT_MISSING: 'implementation',
  REPRESENTATION_UNSUPPORTED: 'policy',
  RESOURCE_LIMIT: 'capacity',
  RUNTIME: 'implementation',
  RUNTIME_CONTENT_UNSUPPORTED: 'policy',
  SEMANTICS_UNRESOLVED: 'input',
  SOURCE_SNAPSHOT_CHANGED: 'environment',
  SOURCE_SNAPSHOT_INVALID: 'input',
  SVG_DOCUMENT_INVALID: 'input',
  TESSELLATION_DOWNGRADED: 'policy',
  TRANSCODER_CAPABILITY_MISSING: 'policy',
  TRANSCODER_EXECUTION_FAILED: 'implementation',
  TRANSCODER_INITIALIZATION_FAILED: 'implementation',
  TRANSCODER_OPTIONS_INVALID: 'input',
  TRANSCODER_TIMEOUT: 'environment',
  UNKNOWN: 'implementation',
  VIEW_OPTIONS_INVALID: 'input',
  VIEW_UNAVAILABLE: 'policy',
  VIEW_UNKNOWN: 'input',
};

const machineFailureClass: Readonly<Record<(typeof machineFailureCodes)[number], CodeClass>> = {
  HOST_RESTARTED: 'environment',
  MACHINE_ACTION_ABORTED: 'environment',
  MACHINE_ACTION_APPROVAL_REQUIRED: 'policy',
  MACHINE_ACTION_ATTENDANCE_REQUIRED: 'policy',
  MACHINE_ACTION_BUSY: 'capacity',
  MACHINE_ACTION_CAPABILITIES_CHANGED: 'environment',
  MACHINE_ACTION_INTERLOCK: 'policy',
  MACHINE_ACTION_MATERIAL_READ_ONLY: 'policy',
  MACHINE_ACTION_PARAMETERS_INVALID: 'input',
  MACHINE_ACTION_PERSON_REQUIRED: 'policy',
  MACHINE_ACTION_PRECONDITION_FAILED: 'policy',
  MACHINE_ACTION_PROMPT_CONSUMED: 'environment',
  MACHINE_ACTION_PROMPT_STALE: 'environment',
  MACHINE_ACTION_PROVIDER_REJECTED: 'environment',
  MACHINE_ACTION_RUN_ACTIVE: 'policy',
  MACHINE_ACTION_STALE_OBSERVATION: 'environment',
  MACHINE_ACTION_STALE_RUN: 'environment',
  MACHINE_ACTION_UNDECLARED: 'policy',
  MACHINE_ACTION_UNQUALIFIED: 'policy',
  MACHINE_ACTION_UNSUPPORTED: 'policy',
  MACHINE_ACTION_VERSION_UNSUPPORTED: 'policy',
  MACHINE_HOLD_ENDED: 'environment',
  MACHINE_HOST_CLOSING: 'environment',
  MACHINE_JOB_ATTESTATION_REQUIRED: 'policy',
  MACHINE_JOB_CHECK_BLOCKED: 'policy',
  MACHINE_JOB_PREPARATION_EXPIRED: 'environment',
  MACHINE_JOB_SETUP_CHANGED: 'environment',
  MACHINE_JOB_UNSUPPORTED: 'policy',
  MACHINE_OPERATION_ID_CONFLICT: 'implementation',
  MACHINE_PREPARATION_FAILED: 'implementation',
  MACHINE_TRANSFER_UNCONFIRMED: 'environment',
  MACHINE_UNAVAILABLE: 'environment',
};

/**
 * The one code table (package §1.3, resolved Q3): every recorded failure code and the cause class it belongs to.
 * Typed over the generated vocabularies, so a new registry code does not compile until it is classified here.
 * @public
 */
export const codeClassOf: Readonly<Record<ErrorType, CodeClass>> = {
  ...kernelIssueClass,
  RUNTIME_OPERATION_TIMEOUT: 'environment',
  HOST_LIMIT_EXCEEDED: 'capacity',
  HOST_BOOT_FAILED: 'environment',
  HOST_EXITED: 'environment',
  TRANSPORT_FAILED: 'environment',
  TIMEOUT_RECOVERY: 'environment',
  DOWNLOAD_FAILED: 'environment',
  EXTRACTION_REFUSED: 'policy',
  INTEGRITY_MISMATCH: 'implementation',
  MANIFEST_INVALID: 'implementation',
  STORE_EXHAUSTED: 'capacity',
  'missing-system-library': 'environment',
  'offline-miss': 'environment',
  'unsupported-target': 'policy',
  AUTHORITY_MISMATCH: 'policy',
  INVALID_SESSION: 'policy',
  ROUTE_DENIED: 'policy',
  SESSION_REVOKED: 'policy',
  WORKSPACE_MISMATCH: 'policy',
  ATTEMPT_LOST: 'environment',
  INVALID_PROVIDER: 'implementation',
  PROVIDER_EXECUTION_FAILED: 'implementation',
  PROVIDER_NOT_FOUND: 'policy',
  ...machineFailureClass,
};

/** A closed outcome as recorded. @public */
export type RuntimeOutcome = (typeof runtimeOutcomes)[number] | typeof otherValue;

/**
 * Decide `tau.runtime.cause` from the outcome and the code (package §1.3). The observation stays factual; the policy
 * lives here, next to the registry.
 *
 * @param outcome - The recorded outcome.
 * @param code - The recorded `error.type`, or `undefined`.
 * @returns The cause.
 * @public
 */
export const causeOf = (outcome: RuntimeOutcome, code: ErrorType | typeof otherValue | undefined): RuntimeCause => {
  const codeClass = code === undefined || code === otherValue ? undefined : codeClassOf[code];
  switch (outcome) {
    case 'succeeded':
    case 'unknown':
    case 'attention': {
      return 'none';
    }
    case 'cancelled':
    case 'superseded':
    case 'abandoned': {
      return 'cancelled';
    }
    case 'issue': {
      return codeClass ?? 'implementation';
    }
    case 'refused': {
      return codeClass === 'environment' ? 'environment' : 'policy';
    }
    case 'timed-out': {
      return 'environment';
    }
    case 'terminated': {
      return code === 'HOST_LIMIT_EXCEEDED' ? 'capacity' : 'environment';
    }
    case 'discarded':
    case 'failed': {
      return 'implementation';
    }
    case otherValue: {
      return otherValue;
    }
  }
};

/* ------------------------------------------------------------------------------------------------ *
 * Schemas: closed vocabularies with `_OTHER`, finite clamped numbers, nothing free-form.            *
 * ------------------------------------------------------------------------------------------------ */

/** Schemas of the closed attributes; the API records labels from these, never the client's strings. @public */
export const runtimeVocabulary = {
  operation: closed(runtimeOperations),
  outcome: closed(runtimeOutcomes),
  route: z.enum(runtimeRoutes),
  caller: closed(runtimeCallers),
  transport: closed(runtimeTransports),
  device: closed(deviceClasses),
  platform: closed(runtimePlatforms),
  os: closed(runtimeOsClasses),
  heapSource: closed(heapSources),
  realm: closed(runtimeRealms),
  factsMissing: closed(factsMissingReasons),
  kernel: closed(runtimeKernelIds),
  plugin: closed(runtimePluginIds),
  pluginUsage: closed(pluginUsageIds),
  capability: closed(pluginCapabilities),
  bundler: closed(bundlerIds),
  middleware: closed(middlewareIds),
  machineAction: closed(machineActions),
  machineKind: closed(machineKinds),
  format: closed(exportFormats),
  fileFormat: closed(fileFormats),
  conversionEdge: closed(conversionEdges),
  parameterFeature: closed(parameterFeatures),
  reuse: closed(reuseResults),
  phase: z.enum(runtimePhases),
  viewerEvent: z.enum(viewerEvents),
  viewerBackend: closed(viewerBackends),
  limitId: closed(runtimeLimitIds),
  limitUnit: z.enum(runtimeLimitUnits),
  errorType: closed(errorTypes),
  dropReason: closed(dropReasons),
  sizeClass: closed(sizeClasses),
  parameterClass: closed(parameterClasses),
  population: z.enum(runtimePopulations),
  settledAs: closed(['timed-out', 'cancelled', 'abandoned']),
  demandKind: closed(['measured', 'estimated', 'unknown']),
} as const;

const v = runtimeVocabulary;

/** Client releases: a short SHA (UI) or a semver (desktop, CLI, daemon image). @public */
export const releasePattern = /^[\da-f]{7,12}$|^\d+\.\d+\.\d+$/u;
/** At most this many admitted releases keep their own label; older or unknown releases record as `_OTHER`. @public */
export const admittedReleaseLimit = 32;

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

/** The names of the four runtime entries. @public */
export const RuntimeEntryName = {
  OPERATION: 'runtime.operation',
  LATE: 'runtime.late',
  VIEWER: 'runtime.viewer',
  DELIVERY: 'telemetry.delivery',
} as const;
/** The runtime entry names, as a list. @public */
export const runtimeEntryNames = Object.values(RuntimeEntryName);

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
  z.object({ id: z.string() }).transform(() => ({ id: otherValue })),
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
  const schema = (entrySchemas as Readonly<Record<string, z.ZodType<RuntimeEntryRecord>>>)[entry.name];
  const parsed = schema?.safeParse(entry);
  return parsed?.success === true ? parsed.data : undefined;
};

/** The envelope the ingest body admits for a runtime entry before per-entry validation. @public */
export const runtimeEntryEnvelopeSchema = z.object({
  name: z.enum(runtimeEntryNames),
  duration: z.unknown(),
  detail: z.unknown(),
});

/** The ingest body bound (FR-25): 256 entries, 64 KiB, and the batch id format. @public */
export const ingestBodyBounds = { maxEntries: 256, maxBytes: 64 * 1024, batchId: /^[\da-f]{32}$/u } as const;

/** Why the reporter flushed; `pagehide` lets the API count keepalive batches. @public */
export const flushReasons = ['interval', 'pagehide', 'shutdown'] as const;

/* ------------------------------------------------------------------------------------------------ *
 * Bucketing and registry checks applied at ingest.                                                  *
 * ------------------------------------------------------------------------------------------------ */

/**
 * The size class of a delivered triangle count.
 *
 * @param triangles - Delivered triangles.
 * @returns xs (<10k), s (<100k), m (<1M), l (<5M) or xl.
 * @public
 */
export const sizeClassOf = (triangles: number): (typeof sizeClasses)[number] =>
  triangles < 10_000
    ? 'xs'
    : triangles < 100_000
      ? 's'
      : triangles < 1_000_000
        ? 'm'
        : triangles < 5_000_000
          ? 'l'
          : 'xl';

/**
 * The parameter class of an evaluate.
 *
 * @param parameters - Declared and modified leaf counts.
 * @returns none (nothing declared), default (nothing modified), some (<50 %), most (<100 %) or all.
 * @public
 */
export const parameterClassOf = (
  parameters: Readonly<{ declared: number; modified: number }>,
): (typeof parameterClasses)[number] => {
  if (parameters.declared === 0) {
    return 'none';
  }
  const ratio = parameters.modified / parameters.declared;
  return ratio === 0 ? 'default' : ratio < 0.5 ? 'some' : ratio < 1 ? 'most' : 'all';
};

const conversionEdgeSet: ReadonlySet<string> = new Set(conversionEdges);

/**
 * The (source, target) pair a conversion records: itself when it is a registry edge, else both `_OTHER`
 * (AR-W22-11, AR-W23-02), so a forged pair cannot grow `tau.runtime.transcode_formats`.
 *
 * @param source - The closed source format.
 * @param target - The closed target format.
 * @returns The recorded pair.
 * @public
 */
export const conversionPairOf = (source: string, target: string): Readonly<{ source: string; target: string }> =>
  conversionEdgeSet.has(`${source}→${target}`) ? { source, target } : { source: otherValue, target: otherValue };

const fileFormatsBySuffixLength = [...fileFormats].toSorted((a, b) => b.length - a.length);

/**
 * The file format of a file name: its LONGEST registry suffix (`mesh.xml`, `gcode.3mf`), never the name itself.
 *
 * @param fileName - A file name or path; only its suffix is read.
 * @returns The registry format, or `_OTHER`.
 * @public
 */
export const fileFormatOf = (fileName: string): (typeof fileFormats)[number] | typeof otherValue => {
  const lower = fileName.toLowerCase();
  return fileFormatsBySuffixLength.find((format) => lower.endsWith(`.${format}`)) ?? otherValue;
};

/* ------------------------------------------------------------------------------------------------ *
 * The deployment's own switch, `TAU_RUNTIME_TELEMETRY`.                                             *
 * ------------------------------------------------------------------------------------------------ */

/**
 * The API's runtime-telemetry mode: `on`, `off` or `paused-until:<ISO>`. Unset is `off`; it never follows the billing
 * gate `TAU_CLOUD_ENABLED`.
 * @public
 */
export type RuntimeTelemetryMode =
  | Readonly<{ mode: 'on' }>
  | Readonly<{ mode: 'off' }>
  | Readonly<{ mode: 'paused'; until: Date }>;

/**
 * Parse `TAU_RUNTIME_TELEMETRY`. Unset is `off`, so a self-hosted API records nothing without configuring anything.
 *
 * @param value - The variable's value.
 * @returns The mode.
 * @throws TypeError when the value is none of the three forms; the API refuses to boot.
 * @public
 */
export const parseRuntimeTelemetryMode = (value: string | undefined): RuntimeTelemetryMode => {
  if (value === undefined || value === 'off') {
    return { mode: 'off' };
  }
  if (value === 'on') {
    return { mode: 'on' };
  }
  if (value.startsWith('paused-until:')) {
    const until = new Date(value.slice('paused-until:'.length));
    if (!Number.isNaN(until.getTime())) {
      return { mode: 'paused', until };
    }
  }
  throw new TypeError('TAU_RUNTIME_TELEMETRY must be "on", "off" or "paused-until:<ISO 8601>"');
};

/**
 * Whether the deployment records runtime entries now; a pause resolves to `on` after `until`.
 *
 * @param mode - The parsed mode.
 * @param now - The current time.
 * @returns `true` when recording.
 * @public
 */
export const resolveRuntimeTelemetry = (mode: RuntimeTelemetryMode, now: Date): boolean =>
  mode.mode === 'on' || (mode.mode === 'paused' && now >= mode.until);

/** Bounds on the policy answer's `maxAge`, seconds: 15 minutes to a day. @public */
export const policyMaxAgeBounds = { minimum: 900, maximum: 86_400 } as const;

/** The entry-free policy probe's answer, `GET /v1/telemetry/policy`. @public */
export const telemetryPolicyAnswerSchema = z.strictObject({
  policy: z.enum(['on', 'off']),
  maxAge: z.number().int().min(0),
});
/** The policy probe answer. @public */
export type TelemetryPolicyAnswer = z.output<typeof telemetryPolicyAnswerSchema>;

/** The ingest receipt, answered with 200 for a batch that carries runtime entries. @public */
export const ingestReceiptSchema = z.strictObject({
  recorded: z.number().int().min(0),
  rejected: z.number().int().min(0),
  duplicate: z.number().int().min(0),
  disabled: z.number().int().min(0),
  policy: z.enum(['on', 'off']),
});
/** The ingest receipt. @public */
export type IngestReceipt = z.output<typeof ingestReceiptSchema>;

/* ------------------------------------------------------------------------------------------------ *
 * Usage coverage: dimension → series → panel (package §7.5 is generated from this; T36).            *
 * ------------------------------------------------------------------------------------------------ */

/**
 * Every usage dimension, the Prometheus series that counts it and the product panel (§11) that shows it. A dimension
 * that is deliberately not counted is listed in the design's §7.5 with its reason, never here.
 * @public
 */
export const usageCoverage = [
  { dimension: 'kernels', series: 'tau_runtime_operations_total', by: 'kernel_id', panel: 1 },
  { dimension: 'kernels by host and caller', series: 'tau_runtime_kernel_usage_total', by: 'kernel_id', panel: 39 },
  {
    dimension: 'transcoders',
    series: 'tau_runtime_plugin_operations_total{tau_runtime_capability="transcoder"}',
    by: 'tau_runtime_plugin',
    panel: 30,
  },
  {
    dimension: 'job providers',
    series: 'tau_runtime_plugin_operations_total{tau_runtime_capability="job"}',
    by: 'tau_runtime_plugin',
    panel: 31,
  },
  {
    dimension: 'middleware',
    series: 'tau_runtime_plugin_operations_total{tau_runtime_capability="middleware"}',
    by: 'tau_runtime_plugin',
    panel: 32,
  },
  {
    dimension: 'bundlers',
    series: 'tau_runtime_plugin_operations_total{tau_runtime_capability="bundler"}',
    by: 'tau_runtime_plugin',
    panel: 33,
  },
  {
    dimension: 'machine providers',
    series: 'tau_runtime_plugin_operations_total{tau_runtime_capability="machine"}',
    by: 'tau_runtime_plugin',
    panel: 34,
  },
  {
    dimension: 'machine operations (action, stop, hold, transfer, start) and action families',
    series: 'tau_runtime_machine_operations_total',
    by: 'tau_runtime_machine_kind',
    panel: 34,
  },
  {
    dimension: 'plugin reach (distinct signed-in users)',
    series: 'tau_runtime_active_plugin_principals',
    by: 'tau_runtime_plugin',
    panel: 40,
  },
  {
    dimension: 'kernel reach (distinct signed-in users)',
    series: 'tau_runtime_active_principals',
    by: 'kernel_id',
    panel: 3,
  },
  {
    dimension: 'conversions (import side)',
    series: 'tau_runtime_transcode_formats_total',
    by: 'tau_runtime_source_format',
    panel: 35,
  },
  {
    dimension: 'entry and import formats',
    series: 'tau_runtime_entry_formats_total',
    by: 'tau_runtime_entry_format',
    panel: 35,
  },
  { dimension: 'export formats', series: 'tau_runtime_exports_total', by: 'tau_runtime_format', panel: 12 },
  {
    dimension: 'callers (editor, agent, geospec, quicklook, host, converter, capture, viewer)',
    series: 'tau_runtime_operations_by_caller_total',
    by: 'tau_runtime_caller',
    panel: 19,
  },
  {
    dimension: 'hosts, platform, OS',
    series: 'tau_runtime_operations_by_host_total',
    by: 'tau_runtime_route',
    panel: 36,
  },
  {
    dimension: 'transport',
    series: 'tau_runtime_operations_by_transport_total',
    by: 'tau_runtime_transport',
    panel: 28,
  },
  { dimension: 'operations', series: 'tau_runtime_operations_total', by: 'tau_runtime_operation', panel: 18 },
  {
    dimension: 'GeoSpec runs',
    series: 'tau_runtime_operations_total{tau_runtime_operation="verify"}',
    by: 'tau_runtime_outcome',
    panel: 29,
  },
  {
    dimension: 'jobs (lifecycle)',
    series: 'tau_runtime_operations_total{tau_runtime_operation="job"}',
    by: 'tau_runtime_outcome',
    panel: 29,
  },
  { dimension: 'viewer events', series: 'tau_runtime_viewer_events_total', by: 'tau_runtime_viewer_event', panel: 29 },
  {
    dimension: 'viewer downloads by format',
    series: 'tau_runtime_viewer_events_total{tau_runtime_viewer_event="download"}',
    by: 'tau_runtime_format',
    panel: 38,
  },
  {
    dimension: 'parameters declared and modified',
    series: 'tau_runtime_parameter_evaluations_total',
    by: 'tau_runtime_parameter_class',
    panel: 10,
  },
  {
    dimension: 'parameter features',
    series: 'tau_runtime_parameter_features_total',
    by: 'tau_runtime_parameter_feature',
    panel: 37,
  },
  { dimension: 'cache reuse', series: 'tau_runtime_reuse_total', by: 'tau_runtime_reuse', panel: 17 },
  { dimension: 'releases', series: 'tau_runtime_operations_by_release_total', by: 'tau_release', panel: 24 },
  {
    dimension: 'heap source coverage',
    series: 'tau_runtime_kernel_heap_count',
    by: 'tau_runtime_heap_source',
    panel: '5a',
  },
  {
    dimension: 'agent tools (existing instruments)',
    series: 'tau_agent_tool_calls_total',
    by: 'tool_name',
    panel: 'agent',
  },
] as const satisfies ReadonlyArray<Readonly<{ dimension: string; series: string; by: string; panel: number | string }>>;
