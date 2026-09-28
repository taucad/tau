// @vitest-environment node
/**
 * A committed parameter edit — the sidecar record staged with the render and no override, which is
 * what the Parameters pane sends — should cost what a parameter override costs on the same
 * 100-field model (parameter performance close-out, budget: commit p50 ≤ 1.1 × override p50).
 *
 * The two cases run in one process on the same machine at the same moment, so the ratio survives
 * an unquiet host better than an absolute figure. It still binds only when `budgetVerdict` accepts
 * the run (quiet, production, both series' variation within ten percent); otherwise it is recorded.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBenchmarks } from '#benchmarks/benchmark-runner.js';
import { filterBenchmarks } from '#benchmarks/benchmark-suite.js';
import { budgetVerdict } from '#benchmarks/measurement-tags.js';

const maximumCommitToOverrideRatio = 1.1;
const outputDirectory = resolve(import.meta.dirname, '../../../../out/reports/benchmarks/runtime-e2e');

/** Median time per span name across a case's measured iterations, so a gap can be attributed. */
const medianSpans = (telemetry: ReadonlyArray<ReadonlyArray<{ name: string; duration: number }>>) => {
  const perName = new Map<string, number[]>();
  for (const [iteration, entries] of telemetry.entries()) {
    for (const { name, duration } of entries) {
      const totals = perName.get(name) ?? Array.from({ length: telemetry.length }, () => 0);
      totals[iteration] = (totals[iteration] ?? 0) + duration;
      perName.set(name, totals);
    }
  }
  return Object.fromEntries(
    [...perName].map(([name, totals]) => [
      name,
      totals.toSorted((left, right) => left - right)[Math.floor(totals.length / 2)],
    ]),
  );
};

describe('box-parameter-commit', () => {
  it('should render a committed record like the matching override, at no more than 1.1 times its cost', async () => {
    const run = await runBenchmarks(filterBenchmarks(['box-parameter-override-100', 'box-parameter-commit']), {
      iterations: 20,
      operation: 'render',
    });
    const override = run.results.find((result) => result.name === 'box-parameter-override-100');
    const commit = run.results.find((result) => result.name === 'box-parameter-commit');
    if (!override || !commit) {
      throw new Error('The commit benchmark pair did not both run.');
    }
    const ratio = commit.median / override.median;
    const verdict = budgetVerdict({
      tags: run.measurement,
      coefficientOfVariation: Math.max(commit.coefficientOfVariation, override.coefficientOfVariation),
    });
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      resolve(outputDirectory, 'parameter-commit.json'),
      `${JSON.stringify(
        {
          timestamp: run.timestamp,
          measurement: run.measurement,
          ratio,
          budget: maximumCommitToOverrideRatio,
          verdict,
          cases: [override, commit].map(({ name, median, p95, coefficientOfVariation, timings, telemetry }) => ({
            name,
            median,
            p95,
            coefficientOfVariation,
            timings,
            spans: medianSpans(telemetry),
          })),
        },
        null,
        2,
      )}\n`,
    );

    // The staged record, not an override, decided the values: both cases drew the same last model.
    expect(commit.outputHash).toBe(override.outputHash);
    if (verdict.eligible) {
      expect(ratio).toBeLessThanOrEqual(maximumCommitToOverrideRatio);
    }
  }, 600_000);
});
