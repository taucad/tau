import { readSync } from 'node:fs';
import type { BroadWorkloadPlan } from '#bench/lib';

/** Selected actual worker state; absent mode retains the original cold contract. @internal */
export type WorkerState = {
  mode: 'cold-process' | 'warm-engine-cold-subject' | 'resident-warm' | 'incremental-edit' | 'persisted-warm';
  prior?: BroadWorkloadPlan;
};

/** Publish the prepared live state and wait for the parent's measurement-start ACK.
 * @internal
 * @param state - Actual prepared state and retained prefill reports.
 */
export const acknowledgeState = (state: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify({ event: 'state-ready', ...state })}\n`);
  const acknowledgement = Buffer.alloc(1);
  if (readSync(0, acknowledgement, 0, 1, null) !== 1 || acknowledgement[0] !== 10) {
    throw new Error('State start acknowledgement missing.');
  }
};

/** Prefill the retained subject through exactly the public evaluator used by the measured claims.
 * @internal
 * @param options - Existing live subject evaluator and selected state.
 * @returns Full prefill reports, preserved for independent post-boundary qualification.
 */
export const prepareResident = async ({
  state,
  workload,
  evaluate,
  ready = acknowledgeState,
}: {
  state: WorkerState;
  workload: BroadWorkloadPlan;
  evaluate: (claims: BroadWorkloadPlan['claims']) => Promise<Array<Record<string, unknown>>>;
  ready?: (record: Record<string, unknown>) => void;
}): Promise<void> => {
  if (state.mode !== 'resident-warm' && state.mode !== 'incremental-edit') {
    return;
  }
  const prior = state.mode === 'incremental-edit' ? state.prior : workload;
  if (!prior) {
    throw new Error('Incremental claim-edit requires the frozen prior workload.');
  }
  if (
    prior.subject.primary.sha256 !== workload.subject.primary.sha256 ||
    JSON.stringify(prior.subject.resources) !== JSON.stringify(workload.subject.resources)
  ) {
    throw new Error('Claim-edit requires the same admitted subject bytes/resources.');
  }
  const reports = await evaluate(prior.claims);
  ready({
    mode: state.mode,
    retainedSubject: true,
    preparedClaims: prior.claims,
    prefillReports: reports,
    edit: state.mode === 'incremental-edit' ? 'claims-only; same live engine and admitted subject' : undefined,
  });
};
