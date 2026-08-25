/** Deterministic benchmark regression comparison used by the CLI and CI gate. */

export type ComparableBenchmarkResult = {
  readonly name: string;
  readonly median: number;
  readonly workloadFingerprint: string;
  readonly outputHash: string;
  readonly improvementExplanation?: string;
};

export type ComparableBenchmarkRun = {
  readonly runnerFingerprint: string;
  readonly results: readonly ComparableBenchmarkResult[];
};

export type BenchmarkComparisonIssue = {
  readonly caseName: string;
  readonly kind: 'incompatible' | 'regression' | 'unreviewed-improvement';
  readonly message: string;
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
