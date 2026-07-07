/**
 * Per-matcher wall-clock budget (WS-C).
 *
 * The proof matchers run synchronously and in-process on an in-process native
 * handle (`classifyPoints`/`faceFacts`). R1 bounds the model *load* by
 * terminating its worker thread; nothing bounds *matcher execution*, and a
 * heavy synchronous native sweep (void-continuity's flood-fill, contact-area's
 * sampling lattice) can stall the whole run the way an oversized STEP export
 * did.
 *
 * Because the work is in-process it cannot be thread-killed — the bound is
 * cooperative: {@link withMatcherBudget} stamps a budget around a matcher's
 * evaluation, the heavy proofs call {@link checkBudget} between fixed-size
 * chunks, and an over-budget matcher fails with a bounded `MATCHER_TIMEOUT`
 * diagnostic (mirroring R1's `MODEL_LOAD_TIMEOUT`) instead of hanging. A matcher
 * that never checks the budget (a fast one) simply completes; the budget is set
 * and cleared with no measurable cost.
 *
 * Determinism (C2): the *verdict* of a completed proof is unchanged; only a
 * proof that would otherwise stall becomes a deterministic, budget-named
 * failure. The message reports the budget, not the elapsed time, so it is
 * identical run to run.
 *
 * @module
 */

import type { GeometryDiagnostic } from '#mesh/types.js';

/**
 * Thrown by {@link checkBudget} when the active matcher outruns its budget.
 * Caught by {@link withMatcherBudget} and converted to a `MATCHER_TIMEOUT`
 * diagnostic; any other error propagates unchanged.
 */
export class MatcherBudgetExceeded extends Error {
  public readonly matcher: string;
  public readonly budget: number;

  public constructor(matcher: string, budget: number) {
    super(`matcher '${matcher}' exceeded the ${budget} ms budget`);
    this.name = 'MatcherBudgetExceeded';
    this.matcher = matcher;
    this.budget = budget;
  }
}

type ActiveBudget = { expiresAt: number; matcher: string; budget: number };

/**
 * The active matcher budget. Matchers run one at a time, synchronously, so a
 * single module-scoped slot is sufficient; {@link withMatcherBudget} saves and
 * restores any outer budget so nesting stays safe.
 */
let activeBudget: ActiveBudget | undefined;

/**
 * Resolve the per-matcher wall-clock budget. Generous by default so a healthy
 * heavy proof never false-times-out (C1), well under the suite watchdog.
 * Override with `GEOSPEC_MATCHER_TIMEOUT_MS`.
 *
 * @returns Budget in milliseconds.
 */
const resolveMatcherBudget = (): number => {
  const raw = Number(process.env['GEOSPEC_MATCHER_TIMEOUT_MS']);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
};

/**
 * Throw if the active matcher has outrun its budget. Cheap (one clock read and
 * a comparison); heavy proofs call it between chunks so a synchronous native
 * sweep becomes preemptible at chunk boundaries. A no-op when no budget is
 * active (a proof invoked outside the matcher path).
 */
export const checkBudget = (): void => {
  const current = activeBudget;
  if (current && Date.now() > current.expiresAt) {
    throw new MatcherBudgetExceeded(current.matcher, current.budget);
  }
};

/**
 * The bounded diagnostic emitted when a matcher outruns its budget. Fails the
 * assertion (severity `error`): an un-completable proof is never a pass (C1).
 *
 * @param error - The budget-exceeded signal carrying the matcher + budget.
 * @returns A `MATCHER_TIMEOUT` diagnostic.
 */
const matcherTimeoutDiagnostic = (error: MatcherBudgetExceeded): GeometryDiagnostic => ({
  code: 'MATCHER_TIMEOUT',
  severity: 'error',
  message: `GeoSpec matcher '${error.matcher}' exceeded the ${error.budget} ms execution budget and was abandoned (non-terminating or oversized synchronous proof).`,
  suggestion:
    'Narrow the claim (declare a material set or bounds), coarsen the sampling resolution, or raise GEOSPEC_MATCHER_TIMEOUT_MS if a healthy heavy proof legitimately needs longer.',
  details: { matcher: error.matcher, budget: error.budget },
});

/**
 * Run a matcher's evaluation under a wall-clock budget. On expiry the matcher
 * fails with a bounded {@link matcherTimeoutDiagnostic} instead of stalling the
 * run; any other error propagates unchanged. Saves and restores an outer budget
 * so nesting is safe.
 *
 * @param matcher - Matcher kind, named in the diagnostic.
 * @param evaluate - The matcher's proof thunk.
 * @returns The proof diagnostics, or a single timeout diagnostic on expiry.
 */
export const withMatcherBudget = (matcher: string, evaluate: () => GeometryDiagnostic[]): GeometryDiagnostic[] => {
  const previous = activeBudget;
  const budget = resolveMatcherBudget();
  activeBudget = { expiresAt: Date.now() + budget, matcher, budget };
  try {
    return evaluate();
  } catch (error) {
    if (error instanceof MatcherBudgetExceeded) {
      return [matcherTimeoutDiagnostic(error)];
    }
    throw error;
  } finally {
    activeBudget = previous;
  }
};
