/** Deterministic benchmark regression comparison used by the CLI and CI gate. */

import { maximumBudgetCoefficientOfVariation } from '#benchmarks/measurement-tags.js';
import type { MeasurementTags } from '#benchmarks/measurement-tags.js';

export type ComparableBenchmarkResult = {
  readonly name: string;
  readonly median: number;
  readonly workloadFingerprint: string;
  readonly outputHash: string;
  readonly improvementExplanation?: string;
  /**
   * Spread of the samples the median came from (charter D14). A run recorded
   * before this field existed leaves it absent and is refused the same way an
   * over-spread one is: an unknown spread is not a comparable number.
   */
  readonly coefficientOfVariation?: number;
};

export type ComparableBenchmarkRun = {
  readonly runnerFingerprint: string;
  readonly results: readonly ComparableBenchmarkResult[];
  /** Conditions the run was measured under (charter D14); absent on runs recorded before S0. */
  readonly measurement?: MeasurementTags;
};

export type BenchmarkComparisonIssue = {
  readonly caseName: string;
  readonly kind: 'incompatible' | 'regression' | 'unstable' | 'unreviewed-improvement';
  readonly message: string;
};

/**
 * The conditions two runs must share to be comparable at all (charter D14).
 * Contention is deliberately excluded: it varies by occasion, gates budgets
 * rather than comparisons, and would otherwise make every busy CI run
 * incomparable.
 */
const measurementIdentity = (tags: MeasurementTags | undefined): string =>
  JSON.stringify([tags?.build, tags?.wasmVariant, tags?.adapter, tags?.kernelProcess.kind, tags?.crossOriginIsolated]);

/** The spread refusal: a case is rejected rather than averaged when either side is too noisy. */
const unstableSide = (result: ComparableBenchmarkResult, side: string): string | undefined => {
  if (result.coefficientOfVariation === undefined) {
    return `${side} coefficient of variation is unrecorded`;
  }
  return result.coefficientOfVariation > maximumBudgetCoefficientOfVariation
    ? `${side} coefficient of variation ${(result.coefficientOfVariation * 100).toFixed(1)}% exceeds ${maximumBudgetCoefficientOfVariation * 100}%`
    : undefined;
};

/** Process status for the pinned-runner regression gate. */
export const benchmarkGateExitCode = (comparison: { readonly issues: readonly BenchmarkComparisonIssue[] }): 0 | 1 =>
  comparison.issues.length === 0 ? 0 : 1;

export const compareBenchmarkRuns = (
  baseline: ComparableBenchmarkRun,
  current: ComparableBenchmarkRun,
): { readonly compared: number; readonly issues: readonly BenchmarkComparisonIssue[] } => {
  if (baseline.runnerFingerprint !== current.runnerFingerprint) {
    return {
      compared: 0,
      issues: [{ caseName: '*', kind: 'incompatible', message: 'runner fingerprints differ' }],
    };
  }
  const conditions = measurementIdentity(baseline.measurement);
  if (conditions !== measurementIdentity(current.measurement)) {
    return {
      compared: 0,
      issues: [{ caseName: '*', kind: 'incompatible', message: 'measurement conditions differ' }],
    };
  }

  const baselineByName = new Map(baseline.results.map((result) => [result.name, result]));
  const issues: BenchmarkComparisonIssue[] = [];
  let compared = 0;
  for (const result of current.results) {
    const reference = baselineByName.get(result.name);
    if (!reference) {
      continue;
    }
    if (reference.workloadFingerprint !== result.workloadFingerprint) {
      issues.push({ caseName: result.name, kind: 'incompatible', message: 'workload fingerprints differ' });
      continue;
    }
    if (reference.outputHash !== result.outputHash) {
      issues.push({ caseName: result.name, kind: 'incompatible', message: 'output hashes differ' });
      continue;
    }
    const unstable = unstableSide(reference, 'baseline') ?? unstableSide(result, 'current');
    if (unstable !== undefined) {
      issues.push({ caseName: result.name, kind: 'unstable', message: unstable });
      continue;
    }

    compared += 1;
    const delta = reference.median === 0 ? 0 : (result.median - reference.median) / reference.median;
    if (delta > 0.1) {
      issues.push({
        caseName: result.name,
        kind: 'regression',
        message: `median regressed by ${(delta * 100).toFixed(1)}%`,
      });
    } else if (delta < -0.25 && !result.improvementExplanation) {
      issues.push({
        caseName: result.name,
        kind: 'unreviewed-improvement',
        message: `median improved by ${(-delta * 100).toFixed(1)}% without an explanation or case rename`,
      });
    }
  }
  return { compared, issues };
};
