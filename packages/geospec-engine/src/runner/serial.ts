/**
 * The serial execution shell shared by every GeoSpec runner host.
 *
 * One worker executes CAD files one at a time. That is not a limitation to be
 * removed later: a single OCCT wasm module holds a shared heap, and two
 * concurrent reads on it corrupt each other. Parallelism lives one level up,
 * across worker boundaries ({@link import('#runner/pool/pool.js')}), where the
 * only channel between workers is the content-addressed evidence cache.
 *
 * Two things the shell owns for a whole run, and only once (D-S3, and the R9
 * affinity payoff):
 *
 * - **one resource scope** — every subject a load resolves is tracked in it,
 *   and it disposes once at the end. A per-file scope would delete an
 *   Emscripten handle a later file still reads through the model-load cache;
 * - **one cached model loader** — identical `loadModel(...)` calls across the
 *   selected files resolve to one load. Its first cache key per file is the
 *   affinity telemetry the pool schedules on.
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
import { createCachedModelLoader } from '#runner/model-load-cache.js';
import { createRunnerEventChannel } from '#runner/events.js';
import { setModelLoaderForensicSink } from '#model/load-model.js';
import { forensicSpanAsync, forwardProtocolForensicMeasurement } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';
import type { GeoSpecResourceScope } from '#runner/resource-scope.js';
import { resolvePublicEngineSubject } from '#engine/subject-store.js';
import { clearOccurrenceSolidCache } from '#proofs/occurrence-solids.js';

/** A run-level issue: the substrate's `VmIssue` shape, declared structurally. */
export type RunnerIssue = NonNullable<GeoSpecRunnerResult['issues']>[number];

const runnerIssue = (code: string, message: string): RunnerIssue => ({
  code,
  message,
  severity: 'error',
  type: 'runtime',
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
    if (test.status === 'skipped') {
      continue;
    }
    if (test.status === 'failed') {
      failed += 1;
    } else {
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
 * The run-wide singletons a serial shell owns: one scope, one cached loader,
 * and the per-file affinity key the loader observes.
 *
 * The pool worker host builds one of these per WORKER LIFETIME rather than per
 * run — that is the whole point of affinity scheduling — so it is a separate
 * factory from {@link createSerialGeoSpecRunner}.
 *
 * @public
 */
export type SerialRunContext = {
  resourceScope: GeoSpecResourceScope;
  modelLoader: GeoSpecRunnerOptions['modelLoader'];
  /** Start observing a new file; clears the recorded affinity key. */
  beginFile(): void;
  /** The first deterministic model-load key observed since `beginFile`. */
  fileLoadKey(): string | undefined;
  /** Route runtime tracer measures for the active run/shard. */
  setForensicSink(sink?: ForensicSink): void;
};

/**
 * Build the run-wide scope and cached loader.
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
  const managedLoader = options.modelLoader as
    | (NonNullable<GeoSpecRunnerOptions['modelLoader']> & {
        dispose?: () => void | Promise<void>;
      })
    | undefined;
  if (managedLoader?.dispose !== undefined) {
    resourceScope.register((): void | Promise<void> => managedLoader.dispose?.());
  }
  let currentFileLoadKey: string | undefined;
  const modelLoader =
    createCachedModelLoader(options.modelLoader, {
      ...(options.internalProfile ? { stats: options.internalProfile.aggregateModelLoadCache } : {}),
      onLoadResolved: (subject) => {
        const retained = resolvePublicEngineSubject(subject);
        if (retained === undefined) {
          throw new TypeError('GeoSpec runners require model loaders to return an ingested subject reference.');
        }
        resourceScope.trackSubject(retained);
      },
      onCacheKey: (key) => {
        currentFileLoadKey ??= key;
      },
    }) ?? options.modelLoader;
  let clearForensicSink = (): void => undefined;
  resourceScope.register(() => {
    clearForensicSink();
  });

  return {
    resourceScope,
    modelLoader,
    beginFile() {
      currentFileLoadKey = undefined;
    },
    fileLoadKey: () => currentFileLoadKey,
    setForensicSink(sink) {
      clearForensicSink();
      clearForensicSink = setModelLoaderForensicSink(options.modelLoader, sink);
    },
  };
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

  return {
    async run(runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> {
      if (state.closed) {
        return {
          success: false,
          passed: 0,
          failed: 1,
          selectedTests: 0,
          files: [],
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
      const context = createSerialRunContext(options);
      const forensicSink: ForensicSink | undefined =
        runOptions.forensic === true
          ? ({ name, value, unit }) => {
              events.emit({ type: 'forensic', name, value, unit });
            }
          : undefined;
      context.setForensicSink(forensicSink);
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
          context.beginFile();
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
          });
          const durationMs = performance.now() - fileStartedAt;
          const primaryLoadKey = context.fileLoadKey();

          events.emit({
            type: 'file-complete',
            file,
            result,
            durationMs,
            ...(primaryLoadKey ? { primaryLoadKey } : {}),
          });
          fileResults.push({ file, result, durationMs, ...(primaryLoadKey ? { primaryLoadKey } : {}) });
          accumulateFileResult(totals, result);

          if (runOptions.bail === true && totals.failed > 0) {
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
        await context.resourceScope.dispose();
      }

      if (totals.selectedTests === 0 && totals.failed === 0) {
        issues.push(createNoMatchingGeoSpecTestsIssue());
        totals.failed += 1;
      }

      const aggregate: GeoSpecRunnerResult = {
        success: totals.failed === 0 && issues.length === 0,
        passed: totals.passed,
        failed: totals.failed,
        selectedTests: totals.selectedTests,
        files: fileResults,
        ...(issues.length > 0 ? { issues } : {}),
        durationMs: performance.now() - runStartedAt,
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
      events.emit({ type: 'close' });
      events.clear();
    },
  };
};
