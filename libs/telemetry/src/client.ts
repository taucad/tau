/**
 * `@taucad/telemetry/client`: what a host composes to report runtime observations (package design §3, surface.ts §5).
 * The consent rule, the cloud-host predicate, the pure mapping from an observation to its ingest entry and the
 * bounded, identity-pinned, policy-first delivery queue. Structural input only: no import of `@taucad/runtime`.
 */
import { Topic } from '@taucad/events';
import { z } from 'zod';
import {
  RuntimeEntryName,
  ingestBodyBounds,
  ingestReceiptSchema,
  otherValue,
  policyMaxAgeBounds,
  runtimeLimitIds,
  runtimeLimitUnits,
  runtimeVocabulary as v,
  telemetryPolicyAnswerSchema,
} from '#runtime-ingest.js';
import type {
  dropReasons,
  IngestReceipt,
  TelemetryPolicyAnswer,
  deliveryHealthEntrySchema,
  runtimeLateEntrySchema,
  runtimeOperationEntrySchema,
  runtimeViewerEntrySchema,
} from '#runtime-ingest.js';

/* ------------------------------------------------------------------------------------------------ *
 * Consent and host membership.                                                                     *
 * ------------------------------------------------------------------------------------------------ */

/** Three-state consent (AR-W4-03). @public */
export type ReportingConsent = 'granted' | 'denied' | 'unknown';

/** The device preference: an explicit `off` is sticky; `unset` behaves as `on`. @public */
export type DevicePreference = 'on' | 'off' | 'unset';

/** The inputs of {@link resolveTelemetryConsent}. @public */
export type TelemetryConsentInputs = Readonly<{
  globalPrivacyControl: boolean;
  /** The product-analytics cookie decision; Node hosts pass `'unknown'`. */
  analytics: 'accepted' | 'declined' | 'unknown';
  device: DevicePreference;
  /** Signed out: `'none'`. Signed in: `allowsUsageMetrics`, `undefined` while it loads or after it failed. */
  server: boolean | undefined | 'none';
  /** Desktop main only: the renderer's resolved consent as last received; `undefined` before any report. */
  renderer?: ReportingConsent | undefined;
}>;

/**
 * The one consent rule every host applies at every enqueue and send: the most restrictive input wins. GPC, a declined
 * analytics decision, a device `off`, a server `false` or a denied renderer deny; a signed-in server preference that
 * has not loaded (or a renderer that has not reported) is `unknown`; only then does the default `on` grant.
 *
 * @param input - The consent inputs.
 * @returns The resolved consent.
 * @public
 */
export const resolveTelemetryConsent = (input: TelemetryConsentInputs): ReportingConsent => {
  if (
    input.globalPrivacyControl ||
    input.analytics === 'declined' ||
    input.device === 'off' ||
    input.server === false ||
    input.renderer === 'denied'
  ) {
    return 'denied';
  }
  if (input.server === undefined || ('renderer' in input && input.renderer !== 'granted')) {
    return 'unknown';
  }
  return 'granted';
};

/** What decides whether a host composes a reporter at all (AR-W4-02). @public */
export type HostDeployment = Readonly<{
  /** A Tau Cloud distribution, from the compile-time `tauTelemetryHostCloud` define. */
  cloudBuild: boolean;
  /** This process is a self-hosted serving deployment (`tau serve`, its children, a self-hosted API's workers). */
  selfHostServing: boolean;
  /** A stored Tau session credential exists for the configured API origin. */
  signedIn: boolean;
  /** `CI=true` or a known CI variable. */
  ci: boolean;
  /** `tau telemetry on` for this origin, or the cloud host container's `TAU_CLOUD_HOST=1` marker. */
  explicitOptIn: boolean;
}>;

/**
 * "On in cloud, off on self-host": a cloud build or a signed-in host outside CI, or an explicit opt-in, and never a
 * self-hosted serving process. It has no origin input; a reporter sends only to its host's own configured API.
 *
 * @param host - The host's deployment facts.
 * @returns Whether the host composes a reporter.
 * @public
 */
export const isCloudHost = (host: HostDeployment): boolean =>
  !host.selfHostServing && (host.explicitOptIn || (!host.ci && (host.cloudBuild || host.signedIn)));

/* ------------------------------------------------------------------------------------------------ *
 * The mapping: observation → ingest entry. Bounded, closed, pure.                                  *
 * ------------------------------------------------------------------------------------------------ */

/** A `runtime.operation` entry as sent. @public */
export type RuntimeOperationEntry = z.input<typeof runtimeOperationEntrySchema>;
/** A `runtime.late` entry as sent. @public */
export type RuntimeLateEntry = z.input<typeof runtimeLateEntrySchema>;
/** A `runtime.viewer` entry as sent. @public */
export type RuntimeViewerEntry = z.input<typeof runtimeViewerEntrySchema>;
/** A `telemetry.delivery` entry as sent. @public */
export type DeliveryHealthEntry = z.input<typeof deliveryHealthEntrySchema>;
/** Any entry the runtime reporter sends. @public */
export type RuntimeIngestEntry = RuntimeOperationEntry | RuntimeLateEntry | RuntimeViewerEntry | DeliveryHealthEntry;
/** Why a reporter dropped entries. @public */
export type DropReason = (typeof dropReasons)[number];

/** The shared shape of a RESOURCE_LIMIT issue's details or a supervisor kill's `exceeded`. @public */
export type ResourceLimitInput = Readonly<{
  limit: string;
  unit: string;
  maximum: number;
  demand: Readonly<{ kind: 'measured' | 'estimated'; value: number }> | Readonly<{ kind: 'unknown' }>;
  origin: 'default' | 'host-option' | 'profile';
}>;

/** How an attempt ended, structurally (`RuntimeOperationOutcome` in `@taucad/runtime` is assignable). @public */
export type RuntimeOutcomeInput =
  | Readonly<{ type: 'succeeded' | 'cancelled' | 'superseded' }>
  | Readonly<{ type: 'issue'; code: string }>
  | Readonly<{ type: 'timed-out'; phase?: string }>
  | Readonly<{
      type: 'terminated';
      close: 'host-exit' | 'wire-failure' | 'operation-timeout';
      detail: Readonly<{ phase?: 'boot' | 'session'; exceeded?: ResourceLimitInput }> | undefined;
    }>
  | Readonly<{ type: 'abandoned'; reason?: 'closed' | 'terminated' }>
  | Readonly<{ type: 'discarded' | 'failed'; code: string }>;

/** The worker facts, structurally. @public */
export type WorkerFactsInput = Readonly<{
  queue: number;
  execution: number;
  cold: boolean;
  reuse: string;
  heapBytes?: number;
  heapSource?: string;
  realm?: string;
  plugin?: string;
  triangles?: number;
  parameters?: Readonly<{
    declared: number;
    modified: number;
    unknown?: number;
    truncated?: true;
    features?: readonly string[];
  }>;
  phases?: Readonly<Partial<Record<string, number>>>;
  middleware?: Readonly<{ total: number; slowestId: string; slowest: number; ran?: readonly string[] }>;
  bundler?: string;
}>;

/** The observation fields the mapping reads (`RuntimeOperationObservation` is assignable). @public */
export type RuntimeObservationInput = Readonly<{
  operation: string;
  kernel: string | undefined;
  outcome: RuntimeOutcomeInput;
  transport: string;
  adaptations: readonly string[];
  limit: ResourceLimitInput | undefined;
  format: string | undefined;
  plugin: string | undefined;
  sourceFormat?: string;
  entryFormat?: string;
  duration: number;
  worker: WorkerFactsInput | undefined;
  facts: 'joined' | 'none' | 'not-observed' | 'missing-timeout' | 'missing-worker-gone';
}>;

/** Host-supplied context stamped on every entry. @public */
export type RuntimeEntryContext = Readonly<{
  route: z.output<typeof v.route>;
  caller: string;
  release: string;
  device?: string;
  platform?: string;
  os?: string;
}>;

/** A worker reply after its attempt settled (`RuntimeLateTerminal`). @public */
export type RuntimeLateInput = Readonly<{
  operation: string;
  settledAs: 'timed-out' | 'cancelled' | 'abandoned';
  after: number;
}>;

const hour = 3_600_000;
const closedValue = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> => schema.parse(value);
/**
 * A duration in milliseconds, finite and clamped to [0, 1 h].
 *
 * @param value - Milliseconds.
 * @returns The clamped value.
 */
const clampMilliseconds = (value: number): number => (Number.isFinite(value) ? Math.min(Math.max(value, 0), hour) : 0);
const pluginOperations: ReadonlySet<string> = new Set(['transcode', 'export', 'job', 'machine']);
const limitIdSet: ReadonlySet<string> = new Set(runtimeLimitIds);
const limitUnitSet: ReadonlySet<string> = new Set(runtimeLimitUnits);

/**
 * The termination code from the transport's own close cause (package §1.2): a supervisor kill for a limit is
 * `HOST_LIMIT_EXCEEDED`, a boot death `HOST_BOOT_FAILED`, any other host exit `HOST_EXITED`, a channel fault (and a
 * browser worker's death) `TRANSPORT_FAILED`, and a recovery from a stuck operation `TIMEOUT_RECOVERY`.
 *
 * @param outcome - A terminated outcome.
 * @returns The code.
 */
const terminationCode = (outcome: Extract<RuntimeOutcomeInput, { type: 'terminated' }>): string => {
  if (outcome.close === 'wire-failure') {
    return 'TRANSPORT_FAILED';
  }
  if (outcome.close === 'operation-timeout') {
    return 'TIMEOUT_RECOVERY';
  }
  if (outcome.detail?.exceeded !== undefined) {
    return 'HOST_LIMIT_EXCEEDED';
  }
  return outcome.detail?.phase === 'boot' ? 'HOST_BOOT_FAILED' : 'HOST_EXITED';
};

/**
 * The failure code an outcome records, or `undefined` for one that carries none.
 *
 * @param outcome - The outcome.
 * @returns The code as observed (closed afterwards).
 */
const outcomeCode = (outcome: RuntimeOutcomeInput): string | undefined => {
  switch (outcome.type) {
    case 'issue':
    case 'discarded':
    case 'failed': {
      return outcome.code;
    }
    case 'timed-out': {
      return 'RUNTIME_OPERATION_TIMEOUT';
    }
    case 'terminated': {
      return terminationCode(outcome);
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The wire limit: allowlisted id and unit with its numbers, else the id `_OTHER` alone (numbers never leave).
 *
 * @param limit - The limit details.
 * @returns The wire limit.
 */
const limitEntry = (limit: ResourceLimitInput): NonNullable<RuntimeOperationEntry['detail']['limit']> =>
  limitIdSet.has(limit.limit) &&
  limitUnitSet.has(limit.unit) &&
  Number.isFinite(limit.maximum) &&
  limit.maximum >= 0 &&
  (limit.demand.kind === 'unknown' || (Number.isFinite(limit.demand.value) && limit.demand.value >= 0))
    ? {
        id: limit.limit as (typeof runtimeLimitIds)[number],
        unit: limit.unit as (typeof runtimeLimitUnits)[number],
        maximum: limit.maximum,
        demand: limit.demand,
        origin: limit.origin,
      }
    : { id: otherValue };

/**
 * A non-negative integer clamped to `max`, or `undefined` when it is not a finite number.
 *
 * @param value - The count.
 * @param max - The ceiling.
 * @returns The clamped count.
 */
const clampCount = (value: number | undefined, max: number): number | undefined =>
  value === undefined || !Number.isFinite(value) ? undefined : Math.min(Math.max(Math.trunc(value), 0), max);

/**
 * Copy `value` under `key` only when it is defined, so an absent fact stays absent on the wire.
 *
 * @param key - The field.
 * @param value - The value.
 * @returns A spreadable object.
 */
const optional = <K extends string, T>(key: K, value: T | undefined): Partial<Record<K, T>> =>
  value === undefined ? {} : (Object.fromEntries([[key, value]]) as Partial<Record<K, T>>);

/**
 * The bounded worker facts: closed vocabularies, clamped numbers; parameter facts ride `evaluate` only.
 *
 * @param worker - The joined worker facts.
 * @param operation - The closed operation.
 * @returns The wire facts.
 */
const workerEntry = (
  worker: WorkerFactsInput,
  operation: string,
): NonNullable<RuntimeOperationEntry['detail']['worker']> => {
  const middlewareRan = worker.middleware?.ran?.map((id) => closedValue(v.middleware, id));
  const features = worker.parameters?.features?.map((feature) => closedValue(v.parameterFeature, feature));
  return {
    queue: clampMilliseconds(worker.queue),
    execution: clampMilliseconds(worker.execution),
    cold: worker.cold,
    reuse: closedValue(v.reuse, worker.reuse),
    ...optional('heapBytes', clampCount(worker.heapBytes, 64 * 2 ** 30)),
    ...optional(
      'heapSource',
      worker.heapSource === undefined ? undefined : closedValue(v.heapSource, worker.heapSource),
    ),
    ...optional('realm', worker.realm === undefined ? undefined : closedValue(v.realm, worker.realm)),
    ...optional('plugin', worker.plugin === undefined ? undefined : closedValue(v.plugin, worker.plugin)),
    ...optional('triangles', clampCount(worker.triangles, 1e9)),
    ...optional(
      'parameters',
      worker.parameters === undefined || operation !== 'evaluate'
        ? undefined
        : {
            declared: clampCount(worker.parameters.declared, 1000) ?? 0,
            modified: clampCount(worker.parameters.modified, 1000) ?? 0,
            ...optional('unknown', clampCount(worker.parameters.unknown, 1000)),
            ...optional('truncated', worker.parameters.truncated),
            ...optional('features', features === undefined ? undefined : [...new Set(features)].slice(0, 4)),
          },
    ),
    ...optional(
      'phases',
      worker.phases === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(worker.phases).flatMap(([phase, value]) =>
              v.phase.safeParse(phase).success && value !== undefined ? [[phase, clampMilliseconds(value)]] : [],
            ),
          ),
    ),
    ...optional(
      'middleware',
      worker.middleware === undefined
        ? undefined
        : {
            total: clampMilliseconds(worker.middleware.total),
            slowestId: closedValue(v.middleware, worker.middleware.slowestId),
            slowest: clampMilliseconds(worker.middleware.slowest),
            ...optional('ran', middlewareRan === undefined ? undefined : [...new Set(middlewareRan)].slice(0, 8)),
          },
    ),
    ...optional('bundler', worker.bundler === undefined ? undefined : closedValue(v.bundler, worker.bundler)),
  };
};

/**
 * The context fields every entry carries, closed.
 *
 * @param context - The host context.
 * @returns The closed context.
 */
const contextFields = (context: RuntimeEntryContext) => ({
  route: context.route,
  release: context.release,
  ...optional('device', context.device === undefined ? undefined : closedValue(v.device, context.device)),
  ...optional('platform', context.platform === undefined ? undefined : closedValue(v.platform, context.platform)),
});

/**
 * Map one settled observation to its `runtime.operation` entry: closed vocabularies, clamped numbers, no id, path,
 * name, value or message. Facets ride only the operations the ingest admits them on.
 *
 * @param observation - The observation.
 * @param context - The host context.
 * @returns The entry.
 * @public
 */
export const toRuntimeEntry = (
  observation: RuntimeObservationInput,
  context: RuntimeEntryContext,
): RuntimeOperationEntry => {
  const operation = closedValue(v.operation, observation.operation);
  const code = outcomeCode(observation.outcome);
  const limit =
    observation.limit ?? (observation.outcome.type === 'terminated' ? observation.outcome.detail?.exceeded : undefined);
  const factsMissing =
    observation.facts === 'missing-timeout' || observation.facts === 'missing-worker-gone'
      ? observation.facts
      : undefined;
  const carriesFormat = operation === 'export' || operation === 'transcode';
  const adaptations = [...new Set(observation.adaptations.slice(0, 8).map((value) => closedValue(v.errorType, value)))];
  return {
    name: RuntimeEntryName.OPERATION,
    duration: clampMilliseconds(observation.duration),
    detail: {
      operation,
      outcome: observation.outcome.type,
      ...optional('code', code === undefined ? undefined : closedValue(v.errorType, code)),
      ...optional('kernel', observation.kernel === undefined ? undefined : closedValue(v.kernel, observation.kernel)),
      caller: closedValue(v.caller, context.caller),
      transport: closedValue(v.transport, observation.transport),
      ...contextFields(context),
      ...optional('os', context.os === undefined ? undefined : closedValue(v.os, context.os)),
      ...optional(
        'worker',
        observation.facts === 'joined' && observation.worker !== undefined
          ? workerEntry(observation.worker, operation)
          : undefined,
      ),
      ...optional('adaptations', adaptations.length === 0 ? undefined : adaptations),
      ...optional('factsMissing', factsMissing),
      ...optional(
        'format',
        carriesFormat && observation.format !== undefined ? closedValue(v.format, observation.format) : undefined,
      ),
      ...optional(
        'plugin',
        pluginOperations.has(operation) && observation.plugin !== undefined
          ? closedValue(v.plugin, observation.plugin)
          : undefined,
      ),
      ...optional(
        'sourceFormat',
        carriesFormat && observation.sourceFormat !== undefined
          ? closedValue(v.fileFormat, observation.sourceFormat)
          : undefined,
      ),
      ...optional(
        'entryFormat',
        operation === 'evaluate' && observation.entryFormat !== undefined
          ? closedValue(v.fileFormat, observation.entryFormat)
          : undefined,
      ),
      ...optional('limit', limit === undefined ? undefined : limitEntry(limit)),
    },
  };
};

/**
 * Map a late worker reply to its `runtime.late` entry.
 *
 * @param late - The late terminal.
 * @param context - The host context.
 * @returns The entry.
 * @public
 */
export const toLateEntry = (late: RuntimeLateInput, context: RuntimeEntryContext): RuntimeLateEntry => ({
  name: RuntimeEntryName.LATE,
  duration: clampMilliseconds(late.after),
  detail: {
    operation: closedValue(v.operation, late.operation),
    settledAs: late.settledAs,
    route: context.route,
    caller: closedValue(v.caller, context.caller),
  },
});

/** One closed viewer event as the viewer emits it (FR-17). @public */
export type ViewerEventInput = Readonly<{
  event: RuntimeViewerEntry['detail']['event'];
  backend: string;
  duration?: number;
  triangles?: number;
  format?: string;
}>;

/**
 * Map one viewer event to its `runtime.viewer` entry: closed backend and format, clamped duration and triangle count,
 * and the format only on `download`. Nothing about the scene leaves.
 *
 * @param input - The event.
 * @param context - The host context; its caller is not sent.
 * @returns The entry.
 * @public
 */
export const toViewerEntry = (input: ViewerEventInput, context: RuntimeEntryContext): RuntimeViewerEntry => ({
  name: RuntimeEntryName.VIEWER,
  duration: clampMilliseconds(input.duration ?? 0),
  detail: {
    event: input.event,
    backend: closedValue(v.viewerBackend, input.backend),
    ...contextFields(context),
    ...optional('triangles', input.triangles === undefined ? undefined : clampCount(input.triangles, 1e9)),
    ...optional(
      'format',
      input.event === 'download' && input.format !== undefined ? closedValue(v.format, input.format) : undefined,
    ),
  },
});

/** One GeoSpec run, as the runner settled it (FR-16). Counts only: test names, specs and values have no field. @public */
export type GeoSpecRunInput =
  | Readonly<{
      status: 'completed';
      kernel?: string;
      selected: number;
      passed: number;
      failed: number;
      duration: number;
    }>
  | Readonly<{ status: 'no-files'; duration: number }>
  | Readonly<{
      status: 'limit';
      kernel?: string;
      selected: number;
      passed: number;
      failed: number;
      duration: number;
      maximum: number;
      demand: number;
      origin: ResourceLimitInput['origin'];
    }>
  | Readonly<{ status: 'refused'; code: 'GEOSPEC_CONFIG_NOT_APPLIED'; duration: number }>;

/**
 * The run-level `verify` entry of one GeoSpec run (FR-16): `succeeded` when every selected test passed, `issue` with
 * `GEOSPEC_TESTS_FAILED` when some failed, `refused` with `GEOSPEC_NO_TEST_FILES` when discovery found nothing (not a
 * failed test), `refused` with the config code when nothing ran, or `issue` with `RESOURCE_LIMIT` and the limit
 * `geospec.work.units` when the work-unit budget stopped it. The caller is always `geospec`.
 *
 * @param run - The settled run.
 * @param context - The host context; its caller is replaced.
 * @returns The entry.
 * @public
 */
export const verifyEntry = (run: GeoSpecRunInput, context: RuntimeEntryContext): RuntimeOperationEntry => {
  const base = {
    caller: closedValue(v.caller, 'geospec'),
    ...contextFields(context),
    ...optional('os', context.os === undefined ? undefined : closedValue(v.os, context.os)),
  };
  const duration = clampMilliseconds(run.duration);
  if (run.status === 'refused') {
    return {
      name: RuntimeEntryName.OPERATION,
      duration,
      detail: { operation: 'verify', outcome: 'refused', code: run.code, ...base },
    };
  }
  if (run.status === 'no-files') {
    return {
      name: RuntimeEntryName.OPERATION,
      duration,
      detail: {
        operation: 'verify',
        outcome: 'refused',
        code: 'GEOSPEC_NO_TEST_FILES',
        verify: { selected: 0, passed: 0, failed: 0 },
        ...base,
      },
    };
  }
  const verify = {
    selected: clampCount(run.selected, 10_000) ?? 0,
    passed: clampCount(run.passed, 10_000) ?? 0,
    failed: clampCount(run.failed, 10_000) ?? 0,
  };
  const kernel = optional('kernel', run.kernel === undefined ? undefined : closedValue(v.kernel, run.kernel));
  if (run.status === 'limit') {
    return {
      name: RuntimeEntryName.OPERATION,
      duration,
      detail: {
        operation: 'verify',
        outcome: 'issue',
        code: 'RESOURCE_LIMIT',
        ...kernel,
        verify,
        ...base,
        limit: limitEntry({
          limit: 'geospec.work.units',
          unit: '{unit}',
          maximum: run.maximum,
          demand: { kind: 'measured', value: run.demand },
          origin: run.origin,
        }),
      },
    };
  }
  return verify.failed === 0
    ? {
        name: RuntimeEntryName.OPERATION,
        duration,
        detail: { operation: 'verify', outcome: 'succeeded', ...kernel, verify, ...base },
      }
    : {
        name: RuntimeEntryName.OPERATION,
        duration,
        detail: { operation: 'verify', outcome: 'issue', code: 'GEOSPEC_TESTS_FAILED', ...kernel, verify, ...base },
      };
};

/* ------------------------------------------------------------------------------------------------ *
 * Pre-dispatch, job and machine entries: work that settles outside a kernel attempt (pre-dispatch.ts). *
 * Structural inputs, so no host imports a runtime type here; no path, message, id or value leaves.  *
 * ------------------------------------------------------------------------------------------------ */

/** A host context's fields with a closed caller and OS. */
const hostFields = (context: RuntimeEntryContext) => ({
  caller: closedValue(v.caller, context.caller),
  ...contextFields(context),
  ...optional('os', context.os === undefined ? undefined : closedValue(v.os, context.os)),
});
const closedCode = (code: string | undefined): Partial<Record<'code', z.output<typeof v.errorType>>> =>
  optional('code', code === undefined ? undefined : closedValue(v.errorType, code));

/** A native preparation's settled state (`PreparationState` in `@taucad/runtime` is assignable). @public */
export type PreparationStateInput =
  | Readonly<{ status: 'blocked'; reason: string }>
  | Readonly<{ status: 'failed'; code: string }>
  | Readonly<{ status: 'cancelled' | 'ready' | 'idle' | 'preparing' }>;

/**
 * T19: one `prepare` entry per settled preparation: offline miss, missing library, store exhaustion or extraction
 * failure as `refused` with its code. `undefined` for a state that is not terminal.
 *
 * @param state - The preparation's state.
 * @param duration - Milliseconds the attempt took.
 * @param context - The host context.
 * @returns The entry, or `undefined`.
 * @public
 */
export const preparationEntry = (
  state: PreparationStateInput,
  duration: number,
  context: RuntimeEntryContext,
): RuntimeOperationEntry | undefined => {
  const base = { operation: 'prepare', ...hostFields(context) } as const;
  const timed = { name: RuntimeEntryName.OPERATION, duration: clampMilliseconds(duration) } as const;
  switch (state.status) {
    case 'blocked': {
      return { ...timed, detail: { ...base, outcome: 'refused', ...closedCode(state.reason) } };
    }
    case 'failed': {
      return { ...timed, detail: { ...base, outcome: 'refused', ...closedCode(state.code) } };
    }
    case 'cancelled': {
      return { ...timed, detail: { ...base, outcome: 'cancelled' } };
    }
    case 'ready': {
      return { ...timed, detail: { ...base, outcome: 'succeeded' } };
    }
    default: {
      return undefined;
    }
  }
};

/**
 * T19: a host refused an attempt before dispatch (revoked session, authority or workspace mismatch, denied route).
 *
 * @param refusal - The refusal's code.
 * @param context - The host context.
 * @returns The entry.
 * @public
 */
export const admissionEntry = (
  refusal: Readonly<{ code: string }>,
  context: RuntimeEntryContext,
): RuntimeOperationEntry => ({
  name: RuntimeEntryName.OPERATION,
  duration: 0,
  detail: { operation: 'admit', outcome: 'refused', ...closedCode(refusal.code), ...hostFields(context) },
});

/** A durable job submit's outcome (`JobSubmitOutcome` in `@taucad/runtime` is assignable). @public */
export type JobSubmitOutcomeInput =
  | Readonly<{ type: 'accepted'; deduplicated: boolean }>
  | Readonly<{ type: 'refused'; code: string }>
  | Readonly<{ type: 'unknown' }>;

/**
 * T20: one durable submit. A deduplicated submit is a success with `deduplicated: true`, never an error; `unknown`
 * (the reply was lost) is neither a failure nor a fresh job.
 *
 * @param outcome - The submit's outcome.
 * @param duration - Milliseconds.
 * @param context - The host context.
 * @returns The entry.
 * @public
 */
export const submitEntry = (
  outcome: JobSubmitOutcomeInput,
  duration: number,
  context: RuntimeEntryContext,
): RuntimeOperationEntry => {
  const timed = { name: RuntimeEntryName.OPERATION, duration: clampMilliseconds(duration) } as const;
  const base = { operation: 'submit', ...hostFields(context) } as const;
  switch (outcome.type) {
    case 'accepted': {
      return {
        ...timed,
        detail: { ...base, outcome: 'succeeded', ...(outcome.deduplicated ? { deduplicated: true } : {}) },
      };
    }
    case 'refused': {
      return { ...timed, detail: { ...base, outcome: 'refused', ...closedCode(outcome.code) } };
    }
    default: {
      return { ...timed, detail: { ...base, outcome: 'unknown' } };
    }
  }
};

/**
 * The reconciliation of an `unknown` submit: the same mapping under `reconcile`.
 *
 * @param outcome - The re-submit's outcome.
 * @param duration - Milliseconds.
 * @param context - The host context.
 * @returns The entry.
 * @public
 */
export const reconcileEntry = (
  outcome: JobSubmitOutcomeInput,
  duration: number,
  context: RuntimeEntryContext,
): RuntimeOperationEntry => {
  const entry = submitEntry(outcome, duration, context);
  return { ...entry, detail: { ...entry.detail, operation: 'reconcile' } };
};

/** A job's lifecycle transition into a terminal or attention state. @public */
export type JobTransitionInput = Readonly<{
  to: 'completed' | 'failed' | 'cancelled' | 'attention_required';
  /** The job provider id (`JobProviderIdentity.id`). */
  plugin: string;
  /** The job's stable failure code. */
  code?: string;
  kernel?: string;
}>;

/**
 * FR-15: one `job` entry per terminal state (`completed` → succeeded, `failed`, `cancelled`) and one `attention`
 * per job id. `duration` is queued-to-state on the host's clock.
 *
 * @param transition - The transition.
 * @param duration - Milliseconds since the job was queued.
 * @param context - The host context.
 * @returns The entry.
 * @public
 */
export const jobEntry = (
  transition: JobTransitionInput,
  duration: number,
  context: RuntimeEntryContext,
): RuntimeOperationEntry => {
  const outcome =
    transition.to === 'completed' ? 'succeeded' : transition.to === 'attention_required' ? 'attention' : transition.to;
  return {
    name: RuntimeEntryName.OPERATION,
    duration: clampMilliseconds(duration),
    detail: {
      operation: 'job',
      outcome,
      plugin: closedValue(v.plugin, transition.plugin),
      ...(outcome === 'succeeded' ? {} : closedCode(transition.code)),
      ...optional('kernel', transition.kernel === undefined ? undefined : closedValue(v.kernel, transition.kernel)),
      ...hostFields(context),
    },
  };
};

/** One job projection as its owner applies it (`reduceJobSnapshot`). @public */
export type JobSnapshotInput = Readonly<{
  jobId: string;
  state: string;
  providerId: string;
  /** Milliseconds since the epoch the job was queued at. */
  queuedAt: number;
  code?: string;
  kernel?: string;
}>;

/** The attention seen-set's bounds (AR-W15-10). @public */
export const jobAttentionBounds = { ids: 1024, maxAge: 24 * 3_600_000 } as const;

/**
 * FR-15 / AR-W15-10: a job owner's snapshot observer. Feed it every projection `reduceJobSnapshot` applies; it records
 * one entry per terminal state reached and `attention` once per job id, through a bounded seen-set (1,024 ids, oldest
 * first, 24 h), so a job that re-enters `attention_required` is counted once and the set cannot grow with the store.
 *
 * @param input - Where entries go and the host context.
 * @returns The observer.
 * @public
 */
export const createJobSnapshotObserver = (
  input: Readonly<{ record: (entry: RuntimeOperationEntry) => void; context: RuntimeEntryContext; now?: () => number }>,
): ((previous: Readonly<{ state: string }> | undefined, next: JobSnapshotInput) => void) => {
  const now = input.now ?? Date.now;
  const attentionSeen = new Map<string, number>();
  const evict = (at: number): void => {
    for (const [jobId, seenAt] of attentionSeen) {
      if (attentionSeen.size <= jobAttentionBounds.ids && at - seenAt <= jobAttentionBounds.maxAge) {
        return;
      }
      attentionSeen.delete(jobId);
    }
  };
  return (previous, next) => {
    if (previous?.state === next.state) {
      return;
    }
    const at = now();
    if (next.state === 'attention_required') {
      evict(at);
      if (attentionSeen.has(next.jobId)) {
        return;
      }
      attentionSeen.set(next.jobId, at);
      evict(at);
    }
    if (
      next.state !== 'completed' &&
      next.state !== 'failed' &&
      next.state !== 'cancelled' &&
      next.state !== 'attention_required'
    ) {
      return;
    }
    try {
      input.record(
        jobEntry(
          {
            to: next.state,
            plugin: next.providerId,
            ...optional('code', next.code),
            ...optional('kernel', next.kernel),
          },
          at - next.queuedAt,
          input.context,
        ),
      );
    } catch {
      /* Telemetry never throws into the job owner. */
    }
  };
};

/** One new machine operation's receipt (AR-W22-04). @public */
export type MachineOperationInput = Readonly<{
  /** The binding's provider id (`MachineProvider.id`). */
  provider: string;
  kind: 'action' | 'stop' | 'hold' | 'transfer' | 'start';
  /** The standard action family, for an `action`. */
  action?: string;
  status: 'accepted' | 'rejected' | 'refused' | 'unknown';
  code?: string;
  requester: 'person' | 'agent';
}>;

/**
 * One `machine` entry per new machine operation of every kind: `accepted` → succeeded, `rejected` → issue with its
 * code, a pre-plan refusal → refused, `unknown` → unknown. The caller is `agent` for an agent's request, else
 * `editor`. The machine's id, name, serial, address, parameters and job file never leave.
 *
 * @param ran - The operation's receipt.
 * @param duration - Milliseconds.
 * @param context - The host context; its caller is replaced.
 * @returns The entry.
 * @public
 */
export const machineEntry = (
  ran: MachineOperationInput,
  duration: number,
  context: Omit<RuntimeEntryContext, 'caller'>,
): RuntimeOperationEntry => {
  const outcome = ran.status === 'accepted' ? 'succeeded' : ran.status === 'rejected' ? 'issue' : ran.status;
  return {
    name: RuntimeEntryName.OPERATION,
    duration: clampMilliseconds(duration),
    detail: {
      operation: 'machine',
      outcome,
      plugin: closedValue(v.plugin, ran.provider),
      machineKind: closedValue(v.machineKind, ran.kind),
      ...(ran.kind === 'action' && ran.action !== undefined
        ? { machineAction: closedValue(v.machineAction, ran.action) }
        : {}),
      ...(outcome === 'issue' || outcome === 'refused' ? closedCode(ran.code) : {}),
      ...hostFields({ ...context, caller: ran.requester === 'person' ? 'editor' : 'agent' }),
    },
  };
};

/**
 * The OS class of a Node host from `process.platform`; nothing finer.
 *
 * @param platform - `process.platform`.
 * @returns The class.
 * @public
 */
export const nodeOsClass = (platform: string): 'windows' | 'macos' | 'linux' | 'other' =>
  platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : 'other';

/* ------------------------------------------------------------------------------------------------ *
 * The reporter.                                                                                    *
 * ------------------------------------------------------------------------------------------------ */

/** A Node host's send-time identity: never a rejection, `unresolved` while not known. @public */
export type TauIdentity =
  | Readonly<{ kind: 'signed-in'; authorization: string; principalId: string }>
  | Readonly<{ kind: 'signed-out' }>
  | Readonly<{ kind: 'unresolved'; reason: 'keyring-error' | 'offline' | 'session-failed' | 'provider-threw' }>;

/** A cached policy answer, per API origin. @public */
export type CachedTelemetryPolicy = Readonly<{ policy: TelemetryPolicyAnswer['policy']; expiresAt: number }>;

/** Where a host keeps the policy answer (the browser: `localStorage` by API origin; Node: memory). @public */
export type TelemetryPolicyStore = Readonly<{
  read(): CachedTelemetryPolicy | undefined;
  write(value: CachedTelemetryPolicy): void;
}>;

/** Input to {@link createIngestReporter}. @public */
export type IngestReporterInput = Readonly<{
  endpoint: string;
  /** `GET <api>/v1/telemetry/policy`, probed before anything is sent. */
  policyEndpoint: string;
  route: RuntimeEntryContext['route'];
  /** The principal at enqueue, synchronously; `undefined` is signed out. Never a session key. */
  identity: () => string | undefined;
  /** Coalesce identical merged-outcome entries above half the bound (FR-09). */
  merge?: 'default';
  /** Node hosts: the authoritative send-time identity. */
  identityAtSend?: () => Promise<TauIdentity>;
  /** Entries the host dropped from its pre-resolution hold, read once at the first flush. */
  heldDropped?: () => number;
  /** Read at enqueue and at send. */
  consent: () => ReportingConsent;
  fetch?: typeof globalThis.fetch;
  /** The policy cache; defaults to memory. */
  policyStore?: TelemetryPolicyStore;
  /** The clock, milliseconds since the epoch; defaults to `Date.now`. */
  now?: () => number;
  /** Uniform [0, 1) for retry jitter; defaults to `Math.random` (jitter only, never ids). */
  jitter?: () => number;
}>;

/** A bounded, identity-pinned, non-throwing delivery queue. @public */
export type IngestReporter = Readonly<{
  /** A host's bounded pre-resolution hold dropped `count` entries; counted as `queue-full`. */
  noteHeldDropped: (count: number) => void;
  /**
   * A host counted `count` entries it lost before they reached this reporter for `reason` (`held-at-unload` carried
   * from the previous page, `renderer-gone`); reported in the next delivery-health entry.
   */
  noteDropped: (reason: DropReason, count: number) => void;
  /** Spans the worker collectors reported dropping since the last delivery (D-T5). */
  noteSpansDropped: (count: number) => void;
  /** Called once per policy change; immediately when the policy is already known. Returns the unsubscribe. */
  onPolicy: (handler: (policy: TelemetryPolicyAnswer['policy']) => void) => () => void;
  /** Enqueue one entry. Never throws, never awaits. */
  record(entry: RuntimeIngestEntry): void;
  /** Send what is queued now; `pagehide` sends one keepalive request, at most once. */
  flush(input: Readonly<{ reason: 'interval' | 'pagehide' | 'shutdown' }>): Promise<IngestReceipt | undefined>;
  dispose(): Promise<void>;
}>;

/** Reporter bounds (package §3). @public */
export const reporterBounds = {
  queue: 256,
  batchEntries: 50,
  /** Milliseconds between batches. */
  interval: 10_000,
  /** Milliseconds an entry may wait before it expires. */
  expiry: 15 * 60_000,
  keepaliveBytes: 60 * 1024,
  retries: 3,
  /** Milliseconds of retrying per batch. */
  retryBudget: 60_000,
  /** Milliseconds of the first backoff. */
  retryBase: 1000,
  /** Milliseconds of the longest backoff. */
  retryCap: 30_000,
  /** Milliseconds before an `off` policy is probed again. */
  reprobe: 15 * 60_000,
  /** Milliseconds of the longest re-probe wait. */
  reprobeCap: 4 * 60 * 60_000,
  /** Milliseconds before a failed probe is retried. */
  probeRetry: 30_000,
} as const;

type FlushReason = 'interval' | 'pagehide' | 'shutdown';
type Queued = { entry: RuntimeIngestEntry; principal: string | undefined; at: number };
type PolicyState = TelemetryPolicyAnswer['policy'] | 'unknown';
type SendResult =
  | Readonly<{ kind: 'receipt'; receipt: IngestReceipt | undefined }>
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{ kind: 'too-large' }>
  | Readonly<{ kind: 'exhausted' }>;

const mergedOutcomes: ReadonlySet<string> = new Set(['superseded', 'cancelled', 'abandoned']);
const retryableStatuses: ReadonlySet<number> = new Set([425, 429]);
const encoder = new TextEncoder();
/** Headroom for the envelope and the delivery-health entry. */
const envelopeBytes = 1024;

/**
 * The FR-09 coalescing key of a merged-outcome operation entry, or `undefined` for an entry that never merges.
 *
 * @param entry - The entry.
 * @returns The key.
 */
const mergeKey = (entry: RuntimeIngestEntry): string | undefined => {
  if (entry.name !== RuntimeEntryName.OPERATION || !mergedOutcomes.has(String(entry.detail.outcome))) {
    return undefined;
  }
  const d = entry.detail;
  return JSON.stringify([
    d.operation,
    d.outcome,
    d.kernel,
    d.caller,
    d.route,
    d.transport,
    (d.limit as { id?: unknown } | undefined)?.id,
    d.format,
    d.plugin,
    d.sourceFormat,
    d.entryFormat,
    d.machineKind,
    d.machineAction,
  ]);
};

/**
 * A random 128-bit batch id as 32 lowercase hex characters, from `crypto.getRandomValues`.
 *
 * @returns The id.
 */
const newBatchId = (): string =>
  [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * A timer that never keeps a Node event loop alive.
 *
 * @param callback - What to run.
 * @param timerDelay - Milliseconds.
 * @returns The handle.
 */
const unrefTimer = (callback: () => void, timerDelay: number): ReturnType<typeof setTimeout> => {
  const handle = setTimeout(callback, timerDelay);
  (handle as { unref?: () => void }).unref?.();
  return handle;
};

/**
 * Wait `sleepDelay` milliseconds on an unref'd timer.
 *
 * @param sleepDelay - Milliseconds.
 * @returns A promise that resolves after the delay.
 */
const sleep = async (sleepDelay: number): Promise<void> =>
  new Promise((resolve) => {
    unrefTimer(resolve, sleepDelay);
  });

/**
 * Seconds of a `Retry-After` header, or `undefined`.
 *
 * @param response - The response.
 * @returns Milliseconds to wait.
 */
const retryAfterOf = (response: Response): number | undefined => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

/**
 * A response's JSON body, or `undefined` when it is not JSON.
 *
 * @param response - The response.
 * @returns The body.
 */
const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
};

const policyProbeSchema = telemetryPolicyAnswerSchema;
const receiptSchema = ingestReceiptSchema;

/**
 * Create the runtime ingest reporter: nothing is sent to a deployment that has not answered the policy probe `on`;
 * entries are pinned to the principal and consent at enqueue; a batch is recorded at most once (retries reuse its id);
 * every loss is counted into the next delivery-health entry. No method throws into the host.
 *
 * @param input - The host's endpoint, identity, consent and options.
 * @returns The reporter.
 * @public
 */
export const createIngestReporter = (input: IngestReporterInput): IngestReporter => {
  const now = input.now ?? Date.now;
  const jitter = input.jitter ?? Math.random;
  const send = input.fetch ?? globalThis.fetch.bind(globalThis);
  let memoryPolicy: CachedTelemetryPolicy | undefined;
  const store: TelemetryPolicyStore = input.policyStore ?? {
    read: () => memoryPolicy,
    write: (value) => {
      memoryPolicy = value;
    },
  };
  let queue: Queued[] = [];
  const dropped = new Map<DropReason, number>();
  let spansDropped = 0;
  let heldRead = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerImmediate = false;
  let probing = false;
  let nextProbeAt = 0;
  /** Milliseconds. */
  let reprobeWait: number = reporterBounds.reprobe;
  /** Milliseconds. */
  let probeRetryWait: number = reporterBounds.probeRetry;
  /** Milliseconds a policy answer is cached. */
  let policyLifetime: number = policyMaxAgeBounds.minimum * 1000;
  let announced: PolicyState = 'unknown';
  let consentUnknownSince: number | undefined;
  let identityUnresolvedSince: number | undefined;
  let sending: Promise<IngestReceipt | undefined> | undefined;
  let disposed = false;
  /* A host handler that throws never breaks delivery. */
  const policyTopic = new Topic<TelemetryPolicyAnswer['policy']>({
    name: 'telemetry-policy',
    onError: () => undefined,
  });

  const count = (reason: DropReason, amount: number): void => {
    if (amount > 0) {
      dropped.set(reason, (dropped.get(reason) ?? 0) + amount);
    }
  };
  const dropQueue = (reason: DropReason): void => {
    count(reason, queue.length);
    queue = [];
  };
  const policyState = (): PolicyState => {
    const cached = store.read();
    return cached !== undefined && now() < cached.expiresAt ? cached.policy : 'unknown';
  };
  const announce = (policy: TelemetryPolicyAnswer['policy']): void => {
    if (announced !== policy) {
      announced = policy;
      policyTopic.emit(policy);
    }
  };
  const applyPolicy = (policy: TelemetryPolicyAnswer['policy'], maxAgeSeconds: number): void => {
    const bounded = Math.min(Math.max(maxAgeSeconds, policyMaxAgeBounds.minimum), policyMaxAgeBounds.maximum);
    policyLifetime = bounded * 1000;
    store.write({ policy, expiresAt: now() + policyLifetime });
    if (policy === 'on') {
      reprobeWait = reporterBounds.reprobe;
    } else {
      nextProbeAt = Math.max(now() + policyLifetime, now() + reprobeWait);
      reprobeWait = Math.min(reprobeWait * 2, reporterBounds.reprobeCap);
      dropQueue('policy-off');
    }
    announce(policy);
  };
  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const probe = async (): Promise<void> => {
    probing = true;
    try {
      const response = await send(input.policyEndpoint, { method: 'GET', credentials: 'omit' });
      if (response.status === 404) {
        applyPolicy('off', policyMaxAgeBounds.minimum);
      } else {
        const answer = policyProbeSchema.safeParse(response.ok ? await response.json() : undefined);
        if (answer.success) {
          probeRetryWait = reporterBounds.probeRetry;
          applyPolicy(answer.data.policy, answer.data.maxAge);
        } else {
          throw new Error('policy probe failed');
        }
      }
    } catch {
      nextProbeAt = now() + probeRetryWait;
      probeRetryWait = Math.min(probeRetryWait * 2, reporterBounds.reprobe);
    } finally {
      probing = false;
    }
    schedule();
  };

  function schedule(): void {
    if (
      timer !== undefined &&
      !timerImmediate &&
      queue.length >= reporterBounds.batchEntries &&
      policyState() === 'on'
    ) {
      clearTimer();
    }
    if (disposed || timer !== undefined || probing || queue.length === 0) {
      return;
    }
    const state = policyState();
    if (state === 'unknown') {
      const wait = nextProbeAt - now();
      if (wait <= 0) {
        void probe();
      } else {
        timer = unrefTimer(() => {
          timer = undefined;
          schedule();
        }, wait);
      }
      return;
    }
    timerImmediate = queue.length >= reporterBounds.batchEntries;
    timer = unrefTimer(
      () => {
        timer = undefined;
        void flush({ reason: 'interval' });
      },
      timerImmediate ? 0 : reporterBounds.interval,
    );
  }

  const merge = (item: Queued): boolean => {
    const key = input.merge === 'default' && queue.length > reporterBounds.queue / 2 ? mergeKey(item.entry) : undefined;
    const existing =
      key === undefined
        ? undefined
        : queue.find((queued) => queued.principal === item.principal && mergeKey(queued.entry) === key);
    if (existing === undefined || existing.entry.name !== RuntimeEntryName.OPERATION) {
      return false;
    }
    const incoming = item.entry as RuntimeOperationEntry;
    const total = (existing.entry.detail.count ?? 1) + (incoming.detail.count ?? 1);
    existing.entry = {
      ...existing.entry,
      duration: incoming.duration,
      detail: { ...existing.entry.detail, count: Math.min(total, 500) },
    };
    return true;
  };

  const record = (entry: RuntimeIngestEntry): void => {
    try {
      if (disposed) {
        return;
      }
      if (input.consent() === 'denied') {
        dropQueue('consent-withdrawn');
        return;
      }
      const state = policyState();
      if (state === 'off') {
        count('policy-off', 1);
        return;
      }
      const item: Queued = { entry, principal: input.identity(), at: now() };
      if (!merge(item)) {
        if (queue.length >= reporterBounds.queue) {
          count('queue-full', 1);
          if (state === 'on') {
            return; /* Drop-newest once sending; drop-oldest while the policy is held. */
          }
          queue.shift();
        }
        queue.push(item);
      }
      schedule();
    } catch {
      /* Never throws into the host. */
    }
  };

  const expire = (reason: DropReason, since: number | undefined): void => {
    if (since !== undefined && now() - since >= reporterBounds.expiry) {
      dropQueue(reason);
    }
  };

  /**
   * The current principal at send, or `'defer'` while it is unresolved.
   *
   * @returns The principal, `undefined` signed out, or `'defer'`.
   */
  const principalAtSend = async (): Promise<string | undefined | 'defer'> => {
    if (input.identityAtSend === undefined) {
      return input.identity();
    }
    let identity: TauIdentity;
    try {
      identity = await input.identityAtSend();
    } catch {
      identity = { kind: 'unresolved', reason: 'provider-threw' };
    }
    if (identity.kind === 'unresolved') {
      identityUnresolvedSince ??= now();
      expire('identity-unresolved', identityUnresolvedSince);
      return 'defer';
    }
    identityUnresolvedSince = undefined;
    return identity.kind === 'signed-in' ? identity.principalId : undefined;
  };

  const deliveryEntry = (oldest: number): DeliveryHealthEntry => ({
    name: RuntimeEntryName.DELIVERY,
    duration: 0,
    detail: {
      route: input.route,
      oldest: clampMilliseconds(oldest),
      dropped: Object.fromEntries(dropped),
      ...optional('spansDropped', spansDropped === 0 ? undefined : Math.min(spansDropped, 100_000_000)),
    },
  });

  /**
   * POST one batch with the retry rules: 400 and other 4xx reject, 413 is reported to the caller to split, 425, 429,
   * 5xx and network faults retry the SAME id up to three times inside a 60 s budget; a keepalive send is at most once.
   *
   * @param body - The serialized batch.
   * @param keepalive - Whether this is the page-exit send.
   * @returns What happened.
   */
  const post = async (body: string, keepalive: boolean): Promise<SendResult> => {
    const started = now();
    for (let attempt = 0; ; attempt += 1) {
      let wait: number | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop -- retries of one batch are sequential by definition.
        const response = await send(input.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive,
          credentials: 'include',
        });
        if (response.ok) {
          // oxlint-disable-next-line no-await-in-loop -- the body of the one response that ends the retry loop.
          const parsed = receiptSchema.safeParse(response.status === 200 ? await readJson(response) : undefined);
          return { kind: 'receipt', receipt: parsed.success ? parsed.data : undefined };
        }
        if (response.status === 413) {
          return { kind: 'too-large' };
        }
        if (!retryableStatuses.has(response.status) && response.status < 500) {
          return { kind: 'rejected' };
        }
        wait = retryAfterOf(response);
      } catch {
        /* A network fault is retryable. */
      }
      const backoff = wait ?? jitter() * Math.min(reporterBounds.retryCap, reporterBounds.retryBase * 2 ** attempt);
      if (keepalive || attempt >= reporterBounds.retries || now() - started + backoff > reporterBounds.retryBudget) {
        return { kind: 'exhausted' };
      }
      // oxlint-disable-next-line no-await-in-loop -- the backoff between sequential retries.
      await sleep(backoff);
    }
  };

  /**
   * Build and deliver one batch from `items`, splitting once on 413.
   *
   * @param items - The entries to send.
   * @param reason - Why the reporter flushed; `pagehide` is the keepalive send.
   * @param split - Whether this batch is already a half of a split.
   * @returns The receipt, when one arrived.
   */
  const deliver = async (items: Queued[], reason: FlushReason, split: boolean): Promise<IngestReceipt | undefined> => {
    const keepalive = reason === 'pagehide';
    const oldest = Math.min(...items.map((item) => item.at));
    const health = deliveryEntry(now() - oldest);
    const reported = new Map(dropped);
    dropped.clear();
    const reportedSpans = spansDropped;
    spansDropped = 0;
    const restore = (): void => {
      for (const [dropReason, amount] of reported) {
        count(dropReason, amount);
      }
      spansDropped += reportedSpans;
    };
    const body = JSON.stringify({
      batch: newBatchId(),
      reason,
      entries: [...items.map((item) => item.entry), health],
    });
    const result = await post(body, keepalive);
    switch (result.kind) {
      case 'receipt': {
        if (result.receipt !== undefined) {
          applyPolicy(result.receipt.policy, policyLifetime / 1000);
        }
        return result.receipt;
      }
      case 'too-large': {
        restore();
        if (split || items.length < 2) {
          count('rejected', items.length);
          return undefined;
        }
        const half = Math.ceil(items.length / 2);
        const first = await deliver(items.slice(0, half), reason, true);
        const second = await deliver(items.slice(half), reason, true);
        return second ?? first;
      }
      case 'rejected': {
        restore();
        count('rejected', items.length);
        return undefined;
      }
      default: {
        restore();
        count('retry-exhausted', items.length);
        return undefined;
      }
    }
  };

  /**
   * Take the next batch from the queue: at most 255 entries (one slot is the delivery-health entry) under the body
   * bound; an entry that alone exceeds it is dropped as `payload-too-large`.
   *
   * @param maxBytes - The body bound.
   * @returns The entries of the batch.
   */
  const takeBatch = (maxBytes: number): Queued[] => {
    const batch: Queued[] = [];
    let bytes = envelopeBytes;
    while (queue.length > 0 && batch.length < ingestBodyBounds.maxEntries - 1) {
      const next = queue[0]!;
      const size = encoder.encode(JSON.stringify(next.entry)).length + 1;
      if (envelopeBytes + size > maxBytes) {
        queue.shift();
        count('payload-too-large', 1);
        continue;
      }
      if (bytes + size > maxBytes) {
        break;
      }
      bytes += size;
      batch.push(queue.shift()!);
    }
    return batch;
  };

  const flushNow = async (reason: FlushReason): Promise<IngestReceipt | undefined> => {
    clearTimer();
    if (!heldRead && input.heldDropped !== undefined) {
      heldRead = true;
      count('queue-full', input.heldDropped());
    }
    const state = policyState();
    if (state !== 'on') {
      if (state === 'off') {
        dropQueue('policy-off');
      } else if (reason !== 'interval') {
        dropQueue('policy-unknown');
      }
      return undefined;
    }
    const consent = input.consent();
    if (consent === 'denied') {
      dropQueue('consent-withdrawn');
      return undefined;
    }
    if (consent === 'unknown') {
      consentUnknownSince ??= now();
      expire('consent-unresolved', consentUnknownSince);
      return undefined;
    }
    consentUnknownSince = undefined;
    const principal = await principalAtSend();
    if (principal === 'defer') {
      return undefined;
    }
    const kept = queue.filter((item) => item.principal === principal && now() - item.at < reporterBounds.expiry);
    for (const item of queue) {
      if (!kept.includes(item)) {
        count(item.principal === principal ? 'expired' : 'identity-changed', 1);
      }
    }
    queue = kept;
    const keepalive = reason === 'pagehide';
    const maxBytes = keepalive ? reporterBounds.keepaliveBytes : ingestBodyBounds.maxBytes;
    let receipt: IngestReceipt | undefined;
    let items = takeBatch(maxBytes);
    while (items.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- batches are sequential: one in flight per reporter.
      receipt = (await deliver(items, reason, false)) ?? receipt;
      items = keepalive || policyState() !== 'on' ? [] : takeBatch(maxBytes);
    }
    return receipt;
  };

  const flush = async (flushInput: Readonly<{ reason: FlushReason }>): Promise<IngestReceipt | undefined> => {
    if (disposed) {
      return undefined;
    }
    if (sending !== undefined) {
      return sending;
    }
    const run = async (): Promise<IngestReceipt | undefined> => {
      try {
        return await flushNow(flushInput.reason);
      } catch {
        return undefined;
      } finally {
        sending = undefined;
        schedule();
      }
    };
    sending = run();
    return sending;
  };

  const cached = policyState();
  if (cached !== 'unknown') {
    announced = cached;
  }

  return {
    noteHeldDropped: (amount) => {
      count('queue-full', Math.max(0, Math.trunc(amount)));
    },
    noteDropped: (reason, amount) => {
      count(reason, Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0);
    },
    noteSpansDropped: (amount) => {
      spansDropped += Math.max(0, Math.trunc(amount));
    },
    onPolicy: (handler) => {
      const unsubscribe = policyTopic.subscribe(handler);
      if (announced !== 'unknown') {
        try {
          handler(announced);
        } catch {
          /* A host handler never breaks delivery. */
        }
      }
      return unsubscribe;
    },
    record,
    flush,
    dispose: async () => {
      disposed = true;
      clearTimer();
      policyTopic.dispose();
      await sending;
    },
  };
};

/** The ingest body schema the reporter writes, for tests and hosts that validate locally. @public */
export const ingestBatchSchema = z.object({
  batch: z.string().regex(ingestBodyBounds.batchId),
  reason: z.enum(['interval', 'pagehide', 'shutdown']).optional(),
  entries: z.array(z.object({ name: z.string() }).loose()).max(ingestBodyBounds.maxEntries),
});
