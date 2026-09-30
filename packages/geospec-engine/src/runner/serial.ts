/**
 * The serial execution shell shared by every GeoSpec runner host.
 *
 * One worker executes CAD files one at a time. That is not a limitation to be
 * removed later: a single OCCT wasm module holds a shared heap, and two
 * concurrent reads on it corrupt each other. Parallelism lives one level up,
 * across worker boundaries ({@link import('#runner/pool/pool.js')}), where the
 * only channel between workers is the content-addressed evidence cache.
 *
 * One resource scope owns run cleanup. Canonical model loaders retain their
 * own opaque subjects and read every requested source afresh; the shell must
 * neither project those subjects into reference-engine handles nor memoize
 * authored source loads across files.
 *
 * @module
 */

import { runGeoSpecModule } from 'geospec/runner';
import type { GeoSpecModuleBundleCache } from 'geospec/runner';
import { getGeoSpecEngineProtocol } from 'geospec/engine';
import { createNoMatchingGeoSpecTestsIssue } from 'geospec/runner/worker';
import { assertRootedPath } from '@taucad/runtime/kernel';
import type {
  GeoSpecRunner,
  GeoSpecRunnerOptions,
  GeoSpecRunnerResult,
  GeoSpecRunnerRunOptions,
} from 'geospec/runner/worker';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';
import { createRunnerEventChannel } from '#runner/events.js';
import { forensicSpanAsync, forwardProtocolForensicMeasurement } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';
import type { GeoSpecResourceScope } from '#runner/resource-scope.js';
import { clearOccurrenceSolidCache } from '#proofs/occurrence-solids.js';

/** A run-level issue: the substrate's `VmIssue` shape, declared structurally. */
export type RunnerIssue = NonNullable<GeoSpecRunnerResult['issues']>[number];

const runnerIssue = (code: string, message: string): RunnerIssue => ({
  code,
  message,
  severity: 'error',
  type: 'runtime',
});

const emptyAccounting = (files: readonly string[]): NonNullable<GeoSpecRunnerResult['accounting']> => ({
  requestedFiles: [...files],
  completedFiles: [],
  notRunFiles: [...files],
  discoveryComplete: false,
  discovered: 0,
  selected: 0,
  completed: 0,
  passed: 0,
  failed: 0,
  unsupported: 0,
  inconclusive: 0,
  skipped: 0,
  notRun: 0,
  cancelled: false,
  bailed: false,
});

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
 * A serial shell's resource scope and caller-owned canonical loader.
 *
 * @public
 */
export type SerialRunContext = {
  resourceScope: GeoSpecResourceScope;
  modelLoader: GeoSpecRunnerOptions['modelLoader'];
};

/**
 * Build the run-wide cleanup scope without wrapping model loads.
 *
 * @param options - The runner's loader and profile counters.
 * @returns The shared context.
 * @public
 */
export const createSerialRunContext = (
  options: Pick<GeoSpecRunnerOptions, 'modelLoader' | 'internalProfile'>,
): SerialRunContext => {
  const resourceScope = createGeoSpecResourceScope(
    options.internalProfile?.resourceScope === undefined ? {} : { profile: options.internalProfile.resourceScope },
  );
  resourceScope.register(clearOccurrenceSolidCache);
  const managedLoader = options.modelLoader;
  if (managedLoader !== undefined && 'dispose' in managedLoader && typeof managedLoader.dispose === 'function') {
    const { dispose } = managedLoader;
    resourceScope.register(async () => {
      await dispose.call(managedLoader);
    });
  }
  return { resourceScope, modelLoader: managedLoader };
};

/**
 * Execute one GeoSpec file through the VM.
 *
 * Every runner host — serial, pool worker, list-only collection — funnels
 * through this one call so a shard result is byte-comparable to the serial
 * result for the same file (R3).
 *
 * @param options - Runner options, the shared context, and the file.
 * @returns The module result.
 * @public
 */
export const executeGeoSpecFile = async (options: {
  runner: GeoSpecRunnerOptions;
  context: SerialRunContext;
  file: string;
  testNamePattern?: string | RegExp;
  testTimeout?: number;
  matcherWallBackstop?: number;
  forensic?: boolean;
  forensicSink?: ForensicSink;
  collectOnly?: boolean;
  bundleCache?: GeoSpecModuleBundleCache;
}): Promise<GeoSpecRunResult> => {
  const { runner, context, file } = options;
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
        ...(context.modelLoader ? { modelLoader: context.modelLoader } : {}),
        ...(runner.nativeAssertions ? { nativeAssertions: runner.nativeAssertions } : {}),
        ...(runner.nativeModelLoader ? { nativeModelLoader: runner.nativeModelLoader } : {}),
        ...(runner.stepLoader ? { stepLoader: runner.stepLoader } : {}),
        ...(runner.builtinModules ? { builtinModules: runner.builtinModules } : {}),
        ...(runner.internalProfile ? { internalProfile: runner.internalProfile } : {}),
        ...(options.bundleCache ? { bundleCache: options.bundleCache } : {}),
        ...(options.collectOnly === true ? { collectOnly: true } : {}),
      }),
    options.forensicSink,
  );
};

/**
 * Create a runner that executes GeoSpec files serially in this isolate.
 *
 * @param options - Filesystem, project root, loaders, and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createSerialGeoSpecRunner = (options: GeoSpecRunnerOptions): GeoSpecRunner => {
  const state: { closed: boolean; aborted?: string } = { closed: false };
  // Read through an accessor: control-flow analysis would otherwise narrow the
  // closure-written field to `undefined` after the `delete` below.
  const abortedReason = (): string | undefined => state.aborted;
  const events = createRunnerEventChannel();
  // Every run executes a cached bundle under its own run token, so overlapping runs can share this cache.
  const bundleCache: GeoSpecModuleBundleCache = new Map();

  return {
    async run(runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> {
      const initialAccounting = emptyAccounting(runOptions.files);
      if (new Set(runOptions.files).size !== runOptions.files.length) {
        return {
          success: false,
          passed: 0,
          failed: 1,
          selectedTests: 0,
          files: [],
          accounting: initialAccounting,
          lineageStatus: 'unavailable',
          issues: [runnerIssue('GEOSPEC_DUPLICATE_FILES', 'GeoSpec requested files must be unique.')],
        };
      }
      if (state.closed) {
        return {
          success: false,
          passed: 0,
          failed: 1,
          selectedTests: 0,
          files: [],
          accounting: initialAccounting,
          lineageStatus: 'unavailable',
          issues: [runnerIssue('GEOSPEC_RUNNER_CLOSED', 'GeoSpec runner is closed.')],
        };
      }
      delete state.aborted;

      const files = runOptions.files.map(assertRootedPath);
      const runStartedAt = performance.now();
      events.emit({ type: 'run-start', files });

      const totals = { passed: 0, failed: 0, selectedTests: 0 };
      const fileResults: GeoSpecRunnerResult['files'] = [];
      const issues: RunnerIssue[] = [];
      let complete = true;
      const context = createSerialRunContext(options);
      const forensicSink: ForensicSink | undefined =
        runOptions.forensic === true
          ? ({ name, value, unit }) => {
              events.emit({ type: 'forensic', name, value, unit });
            }
          : undefined;
      if (runOptions.forensic === true) {
        const unsubscribe = getGeoSpecEngineProtocol()?.on('forensic-span', (event) => {
          forwardProtocolForensicMeasurement(event.payload, ({ name, value, unit }) => {
            events.emit({ type: 'forensic', name, value, unit });
          });
        });
        if (unsubscribe) {
          context.resourceScope.register(unsubscribe);
        }
      }

      try {
        for (const file of files) {
          const abortReason = abortedReason();
          if (abortReason !== undefined) {
            issues.push(
              runnerIssue(
                'GEOSPEC_RUNNER_ABORTED',
                abortReason.length > 0 ? `GeoSpec run aborted: ${abortReason}` : 'GeoSpec run aborted.',
              ),
            );
            totals.failed += 1;
            events.emit({ type: 'abort', reason: abortReason });
            break;
          }

          events.emit({ type: 'file-start', file });
          const fileStartedAt = performance.now();
          // oxlint-disable-next-line no-await-in-loop -- Within one isolate CAD files run serially: the OCCT module is a shared heap. The pool (R3) parallelizes across workers.
          const result = await executeGeoSpecFile({
            runner: options,
            context,
            file,
            ...(runOptions.testNamePattern === undefined ? {} : { testNamePattern: runOptions.testNamePattern }),
            ...(runOptions.testTimeout === undefined ? {} : { testTimeout: runOptions.testTimeout }),
            ...(runOptions.matcherWallBackstop === undefined
              ? {}
              : { matcherWallBackstop: runOptions.matcherWallBackstop }),
            ...(runOptions.forensic === undefined ? {} : { forensic: runOptions.forensic }),
            ...(forensicSink === undefined ? {} : { forensicSink }),
            bundleCache,
          });
          const durationMs = performance.now() - fileStartedAt;

          events.emit({
            type: 'file-complete',
            file,
            result,
            durationMs,
          });
          fileResults.push({ file, result, durationMs });
          accumulateFileResult(totals, result);

          complete &&= result.success && result.passed;
          if (runOptions.bail === true && (!complete || totals.failed > 0)) {
            issues.push(
              runnerIssue(
                'GEOSPEC_RUNNER_BAILED',
                `GeoSpec run stopped after first failure (--bail): ${file}. Remaining files were not executed.`,
              ),
            );
            break;
          }
        }
      } finally {
        try {
          await context.resourceScope.dispose();
        } finally {
          try {
            await options.nativeModelLoader?.releaseAll();
          } catch (error) {
            complete = false;
            issues.push(
              runnerIssue('GEOSPEC_NATIVE_CLEANUP_FAILED', error instanceof Error ? error.message : String(error)),
            );
          }
        }
      }

      if (totals.selectedTests === 0 && totals.failed === 0) {
        issues.push(createNoMatchingGeoSpecTestsIssue());
        totals.failed += 1;
      }

      const accounting: NonNullable<GeoSpecRunnerResult['accounting']> = {
        requestedFiles: files,
        completedFiles: fileResults.map((entry) => entry.file),
        notRunFiles: files.slice(fileResults.length),
        discoveryComplete:
          fileResults.length === files.length &&
          fileResults.every((entry) => entry.result.success && entry.result.accounting !== undefined),
        discovered: 0,
        selected: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        unsupported: 0,
        inconclusive: 0,
        skipped: 0,
        notRun: 0,
        cancelled: issues.some((issue) => issue.code === 'GEOSPEC_RUNNER_ABORTED'),
        bailed: issues.some((issue) => issue.code === 'GEOSPEC_RUNNER_BAILED'),
      };
      let lineageStatus: NonNullable<GeoSpecRunnerResult['lineageStatus']> = 'complete';
      const sourceFiles = new Map<string, string>();
      for (const { result } of fileResults) {
        if (result.accounting !== undefined) {
          for (const key of [
            'discovered',
            'selected',
            'completed',
            'passed',
            'failed',
            'unsupported',
            'inconclusive',
            'skipped',
            'notRun',
          ] as const) {
            accounting[key] += result.accounting[key];
          }
        }
        if (result.lineage?.status === 'mixed') {
          lineageStatus = 'mixed';
        } else if (result.lineage?.status !== 'complete' && lineageStatus !== 'mixed') {
          lineageStatus = 'unavailable';
        }
        const directGraphs =
          result.lineage?.loads.flatMap(({ evidence }) => {
            const primary = evidence?.artifacts[0];
            return evidence?.sourcePath === undefined || evidence.exportOptions !== undefined || primary === undefined
              ? []
              : [{ [evidence.sourcePath]: `sha256:${primary.sha256}` }];
          }) ?? [];
        for (const graph of [
          ...(result.lineage?.modules.map((module_) => module_.files) ?? []),
          ...directGraphs,
          ...(result.lineage?.loads.map((load) => load.evidence?.sourceRevision?.files ?? {}) ?? []),
        ]) {
          for (const [path, digest] of Object.entries(graph)) {
            if (sourceFiles.has(path) && sourceFiles.get(path) !== digest) {
              lineageStatus = 'mixed';
            }
            sourceFiles.set(path, digest);
          }
        }
      }
      const aggregate: GeoSpecRunnerResult = {
        success: complete && lineageStatus === 'complete' && totals.failed === 0 && issues.length === 0,
        passed: totals.passed,
        failed: totals.failed,
        selectedTests: totals.selectedTests,
        files: fileResults,
        ...(issues.length > 0 ? { issues } : {}),
        durationMs: performance.now() - runStartedAt,
        accounting,
        lineageStatus,
      };
      events.emit({ type: 'run-complete', result: aggregate });
      return aggregate;
    },

    on: events.on,

    abort(reason?: string): void {
      state.aborted = reason ?? 'requested';
    },

    async close(): Promise<void> {
      if (state.closed) {
        return;
      }
      state.closed = true;
      bundleCache.clear();
      events.emit({ type: 'close' });
      events.clear();
    },
  };
};
