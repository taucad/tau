/**
 * The worker half of page runtime telemetry (runtime observability PR-3, `host-agent.ts`). A page worker that owns a
 * runtime client (the agent host, the GeoSpec runner) maps its own observations with the context the page handed it
 * and forwards each finished entry to the page, which records it under its own identity and consent. Workers read no
 * identity or consent, and a worker the page gave no context maps nothing.
 *
 * Forwarding is fire-and-forget: a forward that fails is lost, never retried.
 *
 * @module
 */

import { toLateEntry, toRuntimeEntry, verifyEntry } from '@taucad/telemetry/client';
import type { GeoSpecRunInput, RuntimeIngestEntry } from '@taucad/telemetry/client';
import type { ObservedRuntimeClient, PageTelemetryContext } from '#telemetry/page-telemetry.js';

/** Who issued a worker's attempts. */
export type WorkerCaller = 'agent' | 'geospec';

/** Where a worker sends a finished entry. */
export type ForwardEntry = (entry: RuntimeIngestEntry) => void;

/** The page's context plus the route back to it, as a worker holds them. */
export type WorkerTelemetry = Readonly<{ context: PageTelemetryContext; forward: ForwardEntry }>;

/**
 * Forward every attempt `client` settles to the page under `caller`.
 *
 * @param client - The worker's runtime client.
 * @param caller - Who issues its attempts.
 * @param telemetry - The page's context and the forward.
 * @returns The unsubscribe.
 */
export const forwardOperations = (
  client: Pick<ObservedRuntimeClient, 'on'>,
  caller: WorkerCaller,
  telemetry: WorkerTelemetry,
): (() => void) => {
  const context = { ...telemetry.context, caller };
  const send = (entry: RuntimeIngestEntry): void => {
    try {
      telemetry.forward(entry);
    } catch {
      /* Fire-and-forget: a closed channel loses the entry. */
    }
  };
  const offOperation = client.on('operation', (observation) => {
    send(toRuntimeEntry(observation, context));
  });
  const offLate = client.on('operation-late', (late) => {
    send(toLateEntry(late, context));
  });
  return () => {
    offOperation();
    offLate();
  };
};

/** The part of a GeoSpec run's output the run-level entry reads; test names, specs and values never leave. */
export type GeoSpecRunSummary = Readonly<{
  passed: number;
  total: number;
  failures: readonly unknown[];
  accounting?: Readonly<{ selected: number; passed: number; failed: number; requestedFiles: readonly string[] }>;
  tests?: ReadonlyArray<
    Readonly<{ status: string; limit?: Readonly<{ kind: string; declared?: number; measured?: number }> }>
  >;
}>;

/**
 * FR-16: classify one settled GeoSpec run for `verifyEntry`. No discovered file is `no-files`; a test left undecided by
 * its work-unit budget is `limit`, its origin `host-option` when the run named a `workUnitLimit` and `default`
 * otherwise; anything else `completed`.
 *
 * @param output - The run's output.
 * @param input - The run's wall time and whether the run named its own work-unit limit.
 * @returns The run input.
 */
export const geoSpecRunOf = (
  output: GeoSpecRunSummary,
  input: Readonly<{ duration: number; workUnitLimitArgument: boolean }>,
): GeoSpecRunInput => {
  const requested = output.accounting?.requestedFiles.length;
  if (requested === 0 && output.total === 0) {
    return { status: 'no-files', duration: input.duration };
  }
  const counts = {
    selected: output.accounting?.selected ?? output.total,
    passed: output.accounting?.passed ?? output.passed,
    failed: output.accounting?.failed ?? output.failures.length,
    duration: input.duration,
  };
  const budget = output.tests?.find(
    (test) => test.status !== 'passed' && test.limit?.kind === 'budget' && test.limit.declared !== undefined,
  )?.limit;
  if (budget?.declared !== undefined) {
    return {
      status: 'limit',
      ...counts,
      maximum: budget.declared,
      demand: budget.measured ?? budget.declared,
      origin: input.workUnitLimitArgument ? 'host-option' : 'default',
    };
  }
  return { status: 'completed', ...counts };
};

/**
 * The run-level `verify` entry of one GeoSpec run.
 *
 * @param output - The run's output.
 * @param input - The run's wall time and whether it named its own work-unit limit.
 * @param context - The page's context.
 * @returns The entry.
 */
export const geoSpecVerifyEntry = (
  output: GeoSpecRunSummary,
  input: Readonly<{ duration: number; workUnitLimitArgument: boolean }>,
  context: PageTelemetryContext,
): RuntimeIngestEntry => verifyEntry(geoSpecRunOf(output, input), { ...context, caller: 'geospec' });
