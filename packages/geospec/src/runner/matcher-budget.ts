/**
 * Per-matcher deterministic work-unit budget (R13 of the suite-throughput
 * blueprint, generalizing the wall-thickness facet's work-unit precedent).
 *
 * The proof matchers run synchronously and in-process on an in-process native
 * handle (`classifyPoints`/`extrema`/`commonVolume`). Nothing can thread-kill
 * them, so the bound is cooperative: {@link withMatcherBudget} stamps a budget
 * around a matcher's evaluation and the heavy proofs call {@link chargeBudget}
 * with the native work they are about to perform (points classified, extrema
 * solved, pair volumes computed).
 *
 * Why work units and not wall-clock: a wall-clock budget's *firing* is
 * load-dependent — the same flood that passes at 118 s serial can exceed a
 * 120 s wall under a loaded worker pool and flip pass → `MATCHER_TIMEOUT`.
 * Parallelism must never change a verdict, so the verdict-bearing budget
 * counts deterministic work units: identical inputs charge identical units in
 * identical order on any machine, any platform, any pool size.
 *
 * Wall-clock survives only as a generous NON-VERDICT backstop
 * (`MATCHER_STALLED`): it reports an infrastructure failure (pathological
 * contention or a non-terminating native call), never a proof verdict, and is
 * sized so no healthy matcher can reach it (5× the heaviest observed healthy
 * matcher).
 *
 * Determinism (C2): the *verdict* of a completed proof is unchanged; a proof
 * that exhausts its unit budget fails with a deterministic, budget-named
 * `MATCHER_TIMEOUT` whose message is identical run to run.
 *
 * @module
 */

import type { GeometryDiagnostic } from '#mesh/types.js';

/**
 * Thrown by {@link chargeBudget} when the active matcher exhausts its
 * deterministic work-unit budget. Caught by {@link withMatcherBudget} and
 * converted to a `MATCHER_TIMEOUT` diagnostic; any other error propagates.
 */
export class MatcherBudgetExceeded extends Error {
  public readonly matcher: string;
  public readonly budget: number;
  public readonly unitsUsed: number;

  public constructor(matcher: string, budget: number, unitsUsed: number) {
    super(`matcher '${matcher}' exceeded the ${budget} work-unit budget`);
    this.name = 'MatcherBudgetExceeded';
    this.matcher = matcher;
    this.budget = budget;
    this.unitsUsed = unitsUsed;
  }
}

/**
 * Thrown by {@link chargeBudget} when the non-verdict wall backstop fires:
 * infrastructure failure (pathological contention or a non-terminating native
 * call), never a proof verdict.
 */
export class MatcherWallBackstopExceeded extends Error {
  public readonly matcher: string;
  public readonly backstop: number;

  public constructor(matcher: string, backstop: number) {
    super(`matcher '${matcher}' exceeded the ${backstop} ms non-verdict wall backstop`);
    this.name = 'MatcherWallBackstopExceeded';
    this.matcher = matcher;
    this.backstop = backstop;
  }
}

type ActiveBudget = {
  matcher: string;
  unitBudget: number;
  unitsUsed: number;
  backstop: number;
  backstopExpiresAt: number;
};

/**
 * The active matcher budget. Matchers run one at a time, synchronously, so a
 * single module-scoped slot is sufficient; {@link withMatcherBudget} saves and
 * restores any outer budget so nesting stays safe.
 */
let activeBudget: ActiveBudget | undefined;

/**
 * Per-family deterministic unit budgets (OQ7 calibration: sized so no
 * currently-completing proof regresses — generous, provisional; tighten from
 * R2 span telemetry once suite-scale unit counts are recorded). One unit = one
 * native classification point, one extrema solve, or one pair volume.
 */
/** Default unit budget for matcher families without a dedicated entry. */
const defaultUnitBudget = 8_000_000;

/** Resolve the versioned deterministic unit budget. */
export const resolveMatcherWorkUnitBudget = (_matcher: string): number => defaultUnitBudget;

/**
 * Resolve the non-verdict wall backstop. Generous by default (5× the heaviest
 * observed healthy matcher) so it can only fire on genuine infrastructure
 * failure.
 */
export const defaultMatcherWallBackstop = 600_000;

/**
 * Charge deterministic work units against the active matcher budget. Heavy
 * proofs call this with the batch size they are about to (or just did)
 * process, so a runaway claim fails bounded at the next charge point. Cheap:
 * one addition and two comparisons. A no-op when no budget is active (a proof
 * invoked outside the matcher path).
 *
 * @param units - Native work units in this batch (points, extrema, volumes).
 */
export const chargeBudget = (units: number): void => {
  const current = activeBudget;
  if (!current) {
    return;
  }
  current.unitsUsed += units;
  if (current.unitsUsed > current.unitBudget) {
    throw new MatcherBudgetExceeded(current.matcher, current.unitBudget, current.unitsUsed);
  }
  if (Date.now() > current.backstopExpiresAt) {
    throw new MatcherWallBackstopExceeded(current.matcher, current.backstop);
  }
};

/**
 * Legacy chunk-boundary check: charges no units, still enforces the wall
 * backstop. Retained for call sites whose unit accounting happens at the
 * native call itself.
 */
export const checkBudget = (): void => {
  chargeBudget(0);
};

/**
 * The bounded diagnostic emitted when a matcher exhausts its deterministic
 * unit budget. Fails the assertion (severity `error`): an un-completable proof
 * is never a pass (C1). Message is identical run to run (unit counts are
 * scheduling-independent).
 */
const matcherTimeoutDiagnostic = (error: MatcherBudgetExceeded): GeometryDiagnostic => ({
  code: 'MATCHER_TIMEOUT',
  severity: 'error',
  message: `GeoSpec matcher '${error.matcher}' exhausted its ${error.budget} work-unit execution budget and was abandoned (oversized or non-terminating proof).`,
  suggestion:
    'Narrow the claim, adjust evidence precision where the matcher permits it, or report a reproducible corpus that proves the canonical budget needs recalibration.',
  details: { matcher: error.matcher, budget: error.budget, unitsUsed: error.unitsUsed, unit: 'work-units' },
});

/**
 * The non-verdict infrastructure diagnostic emitted when the wall backstop
 * fires. Still fails the assertion (an undecided proof is never a pass), but
 * names itself an infrastructure failure so it is never read as a geometry
 * verdict — and at 5× the heaviest healthy matcher it cannot fire under sane
 * load.
 */
const matcherStalledDiagnostic = (error: MatcherWallBackstopExceeded): GeometryDiagnostic => ({
  code: 'MATCHER_STALLED',
  severity: 'error',
  message: `GeoSpec matcher '${error.matcher}' exceeded the ${error.backstop} ms non-verdict wall backstop: infrastructure failure (extreme load or a non-terminating native call), not a geometry verdict.`,
  suggestion:
    'Re-run with less machine contention or fewer workers, or pass a larger explicit runner matcherWallBackstop.',
  details: { matcher: error.matcher, backstop: error.backstop, infrastructure: true },
});

/**
 * Run a matcher's evaluation under the deterministic work-unit budget plus the
 * non-verdict wall backstop. On unit exhaustion the matcher fails with a
 * bounded {@link matcherTimeoutDiagnostic}; on backstop expiry with a
 * {@link matcherStalledDiagnostic}; any other error propagates unchanged.
 * Saves and restores an outer budget so nesting is safe.
 *
 * @param options - Matcher, proof thunk, and optional private test limits.
 * @returns The proof diagnostics, or a single bounded diagnostic on expiry.
 */
export const withMatcherBudget = (options: {
  matcher: string;
  evaluate: () => GeometryDiagnostic[];
  workUnitBudget?: number;
  wallBackstop?: number;
}): GeometryDiagnostic[] => {
  const previous = activeBudget;
  const backstop = options.wallBackstop ?? defaultMatcherWallBackstop;
  activeBudget = {
    matcher: options.matcher,
    unitBudget: options.workUnitBudget ?? resolveMatcherWorkUnitBudget(options.matcher),
    unitsUsed: 0,
    backstop,
    backstopExpiresAt: Date.now() + backstop,
  };
  try {
    return options.evaluate();
  } catch (error) {
    if (error instanceof MatcherBudgetExceeded) {
      return [matcherTimeoutDiagnostic(error)];
    }
    if (error instanceof MatcherWallBackstopExceeded) {
      return [matcherStalledDiagnostic(error)];
    }
    throw error;
  } finally {
    activeBudget = previous;
  }
};
