import type { Evidence } from '@taucad/agent-observability/contract';
import type { CorpusEligibility } from '@taucad/agent-observability/evaluation';
import { corpusEligibility } from '@taucad/agent-observability/evaluation';
import type { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';

/*
 * T16: the selector every reusable evaluation case passes through, built from
 * admitted evidence. A case's origin is never claimed by the caller: evidence
 * is operator-owned only when its principal is one of the operator accounts
 * the selection was configured with, and everything else is customer
 * material that needs its account's `reuse` purpose allowed now, for the
 * project it came from. The decision is taken again at every selection.
 */

/** A source account's `reuse` purpose for one project, resolved at selection time. @public */
export type ReuseAuthority = (principal: string, project: string) => Promise<'allowed' | 'denied' | 'unknown'>;

/**
 * The live `reuse` purpose, as purpose authority resolves it. A lookup that
 * fails is unknown, which refuses the case rather than defaulting to allowed.
 *
 * @param purposes - Purpose authority.
 * @returns A reuse lookup.
 * @public
 */
export const purposeReuse =
  (purposes: Pick<TelemetryPurposeService, 'getAdmissionAuthority'>): ReuseAuthority =>
  async (principal, project) => {
    try {
      const { effective } = await purposes.getAdmissionAuthority(principal, project);
      return effective.purposes.find(({ purpose }) => purpose === 'reuse')?.allowed === true ? 'allowed' : 'denied';
    } catch {
      return 'unknown';
    }
  };

/** Who the selection treats as Tau's own. @public */
export type SelectionAuthority = Readonly<{
  /** Operator-owned principals: their evidence needs no account's reuse purpose. */
  operators: ReadonlySet<string>;
  reuse: ReuseAuthority;
}>;

/**
 * Decide whether a case built from admitted evidence may enter a reusable corpus now.
 *
 * @param evidence - Every envelope the case was built from.
 * @param authority - The operator accounts and the live reuse lookup.
 * @param at - The selection time, in milliseconds.
 * @returns Eligible, or the refusal that holds.
 * @public
 */
export const selectEvaluationCase = async (
  evidence: readonly Evidence[],
  authority: SelectionAuthority,
  at: number,
): Promise<CorpusEligibility> => {
  const lineage = evidence.flatMap((item) => item.lineage);
  /* An envelope past its own retention is gone for every purpose, whatever its sources say. */
  const retained = evidence.every(({ retention }) => retention.expiresAt > at);
  const scopes = new Map(
    evidence
      .filter(({ scope }) => !authority.operators.has(scope.principal))
      .map(({ scope }) => [JSON.stringify([scope.principal, scope.project]), scope] as const),
  );
  const answers = await Promise.all(
    [...scopes.values()].map(async ({ principal, project }) => authority.reuse(principal, project)),
  );
  const reuse = answers.includes('denied')
    ? 'denied'
    : answers.every((answer) => answer === 'allowed')
      ? 'allowed'
      : 'unknown';
  const decision = corpusEligibility({ origin: scopes.size === 0 ? 'operator' : 'customer', lineage, reuse }, at);
  if (decision.eligible && !retained) {
    return { eligible: false, refusal: 'expired' };
  }
  return decision;
};
