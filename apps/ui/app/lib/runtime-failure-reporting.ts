import type { RuntimeObservationInput } from '@taucad/telemetry/client';
import type { ErrorDetails } from '#lib/error-details.js';
import { reportUiError } from '#lib/error-reporting.js';

/*
 * Kernel attempts that end in a failure of the runtime rather than of the model (SB4): `terminated`, `timed-out` and
 * `discarded` are reported, with the runtime vocabulary (browser observability blueprint, "Runtime vocabulary
 * alignment"), so the Sentry event and the runtime's own series for the same attempt join on the same names. A
 * field the observation does not carry stays absent. A termination is reported with its transport close cause and
 * never named out-of-memory (runtime I5): memory is named only from typed evidence, which this reporter does not
 * infer. Nothing here wraps or times a runtime call.
 */

/** The outcomes reported; `succeeded`, `cancelled`, `superseded` and `abandoned` are never errors here. */
const reportedOutcomes: ReadonlySet<string> = new Set(['terminated', 'timed-out', 'discarded']);

/** The runtime's closed phase names (`RuntimePhase`); any other value is left absent. */
const runtimePhases: ReadonlySet<string> = new Set([
  'prepare',
  'resolve',
  'compute',
  'mesh',
  'export',
  'reuse',
  'other',
]);

/** A settled attempt as the client emits it: the shared input shape, plus the fields only the runtime's own carries. */
type ObservedAttempt = RuntimeObservationInput & Readonly<{ operationId?: string; issues?: readonly string[] }>;

/** A kernel attempt the runtime could not complete: terminated, timed out or discarded. */
export class RuntimeAttemptFailure extends Error {
  public override readonly name = 'RuntimeAttemptFailure';
}

/** Copy only the defined entries, so an unknown field stays absent rather than `undefined`. */
const defined = <Value>(entries: Readonly<Record<string, Value | undefined>>): Record<string, Value> =>
  Object.fromEntries(Object.entries(entries).filter((entry): entry is [string, Value] => entry[1] !== undefined));

/**
 * The report for one settled attempt, or `undefined` when its outcome is not a runtime failure.
 *
 * @param observation - The attempt as the runtime client observed it.
 * @returns The error and the details to report it with.
 */
export const runtimeFailureReport = (
  observation: ObservedAttempt,
): Readonly<{ error: RuntimeAttemptFailure; details: ErrorDetails }> | undefined => {
  const { outcome } = observation;
  if (!reportedOutcomes.has(outcome.type)) {
    return undefined;
  }
  const close = outcome.type === 'terminated' ? outcome.close : undefined;
  const timedOutPhase = outcome.type === 'timed-out' ? outcome.phase : undefined;
  const phase = timedOutPhase !== undefined && runtimePhases.has(timedOutPhase) ? timedOutPhase : undefined;
  const code = outcome.type === 'discarded' ? outcome.code : undefined;
  const tags = defined<string>({
    kernel: observation.kernel,
    'runtime.operation': observation.operation,
    'runtime.outcome': outcome.type,
    'runtime.close': close,
    'runtime.phase': phase,
    'runtime.transport': observation.transport,
  });
  const runtimeContext = defined<unknown>({
    operationId: observation.operationId,
    issues: observation.issues !== undefined && observation.issues.length > 0 ? [...observation.issues] : undefined,
    code,
    heapBytes: observation.worker?.heapBytes,
    heapSource: observation.worker?.heapSource,
    realm: observation.worker?.realm,
    phases: observation.worker?.phases,
  });
  const cause = close ?? code ?? phase;
  return {
    error: new RuntimeAttemptFailure(
      `Kernel ${observation.operation} ${outcome.type}${cause === undefined ? '' : ` (${cause})`}`,
    ),
    details: {
      tags,
      contexts: { 'tau.runtime': runtimeContext },
      fingerprint: [
        'runtime-attempt',
        observation.kernel ?? 'no-kernel',
        observation.operation,
        outcome.type,
        close ?? '',
      ],
    },
  };
};

/** The part of a runtime client this reporter listens to. */
type ObservedClient = Readonly<{
  on: (event: 'operation', handler: (observation: RuntimeObservationInput) => void) => () => void;
}>;

/**
 * Report each runtime failure a client's attempts end in, whatever the telemetry consent: error reporting is not
 * consent-gated (D1). Attach before `connect()` so `initialize` is covered.
 *
 * @param client - The runtime client.
 * @returns The unsubscribe.
 */
export const reportRuntimeFailures = (client: ObservedClient): (() => void) =>
  client.on('operation', (observation) => {
    const report = runtimeFailureReport(observation);
    if (report !== undefined) {
      // async-iife: bootstrap -- an observation handler cannot await; reporting never rejects.
      void reportUiError(report.error, report.details);
    }
  });
