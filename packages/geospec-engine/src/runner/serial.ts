/**
 * The per-file execution step and result accounting shared by the pool.
 *
 * Every pool worker funnels each file through {@link executeGeoSpecFile}, and
 * the pool folds the results with {@link accumulateFileResult}, so a sharded
 * run counts exactly as `createNativeGeoSpecRunner` from `geospec/runner/native`
 * counts the same files serially.
 *
 * @module
 */

import { runGeoSpecModule } from 'geospec/runner';
import type { GeoSpecModuleBundleCache } from 'geospec/runner';
import type { GeoSpecRunnerOptions, GeoSpecRunnerResult } from 'geospec/runner/worker';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';
import { forensicSpanAsync } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';

/** A run-level issue: the substrate's `VmIssue` shape, declared structurally. */
export type RunnerIssue = NonNullable<GeoSpecRunnerResult['issues']>[number];

/**
 * Count non-skipped pass/fail totals for a runner aggregate.
 *
 * @param tests - Collected tests from one file.
 * @returns Passed and failed counts.
 * @public
 */
export const countRunnerTests = (tests: readonly GeoSpecTestCase[]): { passed: number; failed: number } => {
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    if (test.status === 'failed') {
      failed += 1;
    } else if (test.status === 'passed') {
      passed += 1;
    }
  }
  return { passed, failed };
};

/**
 * Fold one file's module result into a running aggregate.
 *
 * Shared with the pool so a sharded run and a serial run count identically:
 * a file that failed to execute at all is ONE failure, and a file that ran
 * contributes its non-skipped test outcomes.
 *
 * @param totals - The running totals, mutated in place.
 * @param result - One file's module result.
 * @public
 */
export const accumulateFileResult = (
  totals: { passed: number; failed: number; selectedTests: number },
  result: GeoSpecRunResult,
): void => {
  if (!result.success) {
    totals.failed += 1;
    return;
  }
  totals.selectedTests += result.tests.length;
  const counts = countRunnerTests(result.tests);
  totals.passed += counts.passed;
  totals.failed += counts.failed;
};

/**
 * Execute one GeoSpec file through the VM.
 *
 * Every runner host — serial, pool worker, list-only collection — funnels
 * through this one call so a shard result is byte-comparable to the serial
 * result for the same file (R3).
 *
 * @param options - Runner options and the file.
 * @returns The module result.
 * @public
 */
export const executeGeoSpecFile = async (options: {
  runner: GeoSpecRunnerOptions;
  file: string;
  testNamePattern?: string | RegExp;
  testTimeout?: number;
  matcherWallBackstop?: number;
  forensic?: boolean;
  forensicSink?: ForensicSink;
  collectOnly?: boolean;
  bundleCache?: GeoSpecModuleBundleCache;
}): Promise<GeoSpecRunResult> => {
  const { runner, file } = options;
  return forensicSpanAsync(
    'runner.file',
    async () =>
      runGeoSpecModule({
        filesystem: runner.filesystem,
        entryPath: file,
        ...(options.testNamePattern === undefined ? {} : { testNamePattern: options.testNamePattern }),
        ...(options.testTimeout === undefined ? {} : { testTimeout: options.testTimeout }),
        ...(options.matcherWallBackstop === undefined ? {} : { matcherWallBackstop: options.matcherWallBackstop }),
        ...(options.forensic === undefined ? {} : { forensic: options.forensic }),
        nativeAssertions: runner.nativeAssertions,
        ...(runner.nativeModelLoader ? { nativeModelLoader: runner.nativeModelLoader } : {}),
        ...(runner.builtinModules ? { builtinModules: runner.builtinModules } : {}),
        ...(options.bundleCache ? { bundleCache: options.bundleCache } : {}),
        ...(options.collectOnly === true ? { collectOnly: true } : {}),
      }),
    options.forensicSink,
  );
};
