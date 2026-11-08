/**
 * The evidence recorder a funded model invocation reports to (agent
 * observability, blueprint T07). Billing injects it; the app binds it to the
 * agent-observability recorder (`app/composition/model-invocation.module.ts`).
 * Absent, nothing is recorded.
 */
export const invocationEvidenceRecorderToken = Symbol('INVOCATION_EVIDENCE_RECORDER');

/**
 * @see invocationEvidenceRecorderToken
 * @typeParam Settlement - The settlement fact the payer reports once the ledger has terminalized an operation.
 */
export type InvocationEvidenceRecorder<Settlement> = {
  recordSettlement(settlement: Settlement): void;
};
