import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import type {
  GeoSpecRunner,
  GeoSpecRunnerEvent,
  GeoSpecRunnerOptions,
  GeoSpecRunnerResult,
  GeoSpecRunnerRunOptions,
} from '#runner/worker/index.js';
import { createNoMatchingGeoSpecTestsIssue } from '#runner/worker/index.js';
import type { GeoSpecModuleBundleCache, GeoSpecTestCase, GeoSpecRunResult } from '#runner/types.js';
import type { GeoSpecRunnerAccounting } from '#runner/worker/runner-types.js';
import type { VmIssue } from '@taucad/esbuild/vm';

const createRunnerClosedIssue = (): VmIssue => ({
  code: 'GEOSPEC_RUNNER_CLOSED',
  message: 'GeoSpec runner is closed.',
  severity: 'error',
  type: 'runtime',
});

const createRunnerActiveIssue = (): VmIssue => ({
  code: 'GEOSPEC_RUNNER_ACTIVE',
  message: 'GeoSpec runner already has an active run.',
  severity: 'error',
  type: 'runtime',
});

const createRunnerAbortedIssue = (reason: string | undefined): VmIssue => ({
  code: 'GEOSPEC_RUNNER_ABORTED',
  message: reason ? `GeoSpec run aborted: ${reason}` : 'GeoSpec run aborted.',
  severity: 'error',
  type: 'runtime',
});

const createRunnerBailIssue = (file: string): VmIssue => ({
  code: 'GEOSPEC_RUNNER_BAILED',
  message: `GeoSpec run stopped after first failure (--bail): ${file}. Remaining files were not executed.`,
  severity: 'error',
  type: 'runtime',
});

/**
 * Count non-skipped pass/fail totals for runner aggregates.
 * @param tests - Settled tests from one module run.
 * @returns Passed and failed test counts.
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
    } else if (test.status === 'passed') {
      passed += 1;
    }
  }
  return { passed, failed };
};

/**
 * Create a runner that executes GeoSpec files serially in the current worker host.
 *
 * @internal
 * @param options - Shared runner dependencies and lifecycle event observer.
 * @returns A GeoSpec runner with run, abort, and close lifecycle methods.
 */
export const createSerialGeoSpecRunner = (options: GeoSpecRunnerOptions): GeoSpecRunner => {
  const state: { closed: boolean; aborted?: string } = { closed: false };
  const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();
  let activeDrain: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  // One cache serves every run; an entry is reused only while the bundler's reads still return the same answers.
  const bundleCache: GeoSpecModuleBundleCache = new Map();

  const emit = (event: GeoSpecRunnerEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const getAbortReason = (): string | undefined => state.aborted;

  const emptyAccounting = (files: readonly string[]): GeoSpecRunnerAccounting => ({
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
  const failedResult = (issue: VmIssue, files: readonly string[]): GeoSpecRunnerResult => ({
    success: false,
    passed: 0,
    failed: 1,
    selectedTests: 0,
    files: [],
    issues: [issue],
    accounting: emptyAccounting(files),
    lineageStatus: 'unavailable',
  });

  const executeRun = async (runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> => {
    const files = [...runOptions.files];
    const runStartedAt = performance.now();
    emit({ type: 'run-start', files });
    let releasedNativeSubjects = false;
    const releaseNativeSubjects = async (): Promise<void> => {
      if (releasedNativeSubjects) {
        return;
      }
      releasedNativeSubjects = true;
      await options.nativeModelLoader?.releaseAll();
    };

    let passed = 0;
    let failed = 0;
    let selectedTests = 0;
    const fileResults: GeoSpecRunnerResult['files'] = [];
    const issues: VmIssue[] = [];
    const accounting = emptyAccounting(files);
    let complete = true;
    let lineageStatus: 'complete' | 'unavailable' | 'mixed' = 'complete';
    const sourceFiles = new Map<string, string>();
    try {
      for (const file of files) {
        const abortReason = getAbortReason();
        if (abortReason !== undefined) {
          const issue = createRunnerAbortedIssue(abortReason);
          issues.push(issue);
          failed += 1;
          emit({ type: 'abort', reason: abortReason });
          accounting.cancelled = true;
          complete = false;
          break;
        }

        emit({ type: 'file-start', file });
        const fileStartedAt = performance.now();
        // oxlint-disable-next-line no-await-in-loop -- Within one worker, CAD tests run serially for deterministic evidence and bounded runtime pressure; the pool runner (R3) parallelizes across workers.
        const result: GeoSpecRunResult = await runGeoSpecModule({
          filesystem: options.filesystem,
          entryPath: file,
          testNamePattern: runOptions.testNamePattern,
          testTimeout: runOptions.testTimeout,
          matcherWallBackstop: runOptions.matcherWallBackstop,
          forensic: runOptions.forensic,
          bundleCache,
          nativeAssertions: options.nativeAssertions,
          ...(options.nativeModelLoader ? { nativeModelLoader: options.nativeModelLoader } : {}),
          ...(options.builtinModules ? { builtinModules: options.builtinModules } : {}),
        }).catch(
          (error: unknown): GeoSpecRunResult => ({
            success: false,
            issues: [
              {
                code: 'GEOSPEC_MODULE_INTERRUPTED',
                message: error instanceof Error ? error.message : String(error),
                severity: 'error',
                type: 'runtime',
              },
            ],
          }),
        );
        const durationMs = performance.now() - fileStartedAt;
        emit({ type: 'file-complete', file, result, durationMs });
        fileResults.push({ file, result, durationMs });
        accounting.completedFiles = fileResults.map((entry) => entry.file);
        accounting.notRunFiles = files.slice(fileResults.length);
        complete &&= result.success && result.passed;
        if (result.lineage === undefined || result.lineage.status === 'unavailable') {
          if (lineageStatus !== 'mixed') {
            lineageStatus = 'unavailable';
          }
        } else if (result.lineage.status === 'mixed') {
          lineageStatus = 'mixed';
        }
        const directGraphs =
          result.lineage?.loads.flatMap((load) => {
            const { evidence } = load;
            const primary = evidence?.artifacts[0];
            if (evidence?.exportOptions !== undefined) {
              return [];
            }
            return [
              ...(evidence?.artifacts ?? []).flatMap((artifact) =>
                artifact.sourcePath === undefined ? [] : [{ [artifact.sourcePath]: `sha256:${artifact.sha256}` }],
              ),
              ...(evidence?.sourcePath === undefined || primary === undefined
                ? []
                : [{ [evidence.sourcePath]: `sha256:${primary.sha256}` }]),
            ];
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

        if (result.success) {
          selectedTests += result.tests.length;
          const counts = countRunnerTests(result.tests);
          passed += counts.passed;
          failed += counts.failed;
        } else {
          failed += 1;
        }

        if (runOptions.bail === true && (!complete || failed > 0)) {
          issues.push(createRunnerBailIssue(file));
          accounting.bailed = true;
          break;
        }
      }

      if (selectedTests === 0 && failed === 0) {
        issues.push(createNoMatchingGeoSpecTestsIssue());
        failed += 1;
      }

      try {
        await releaseNativeSubjects();
      } catch (error) {
        issues.push({
          code: 'GEOSPEC_NATIVE_CLEANUP_FAILED',
          message: error instanceof Error ? error.message : String(error),
          severity: 'error',
          type: 'runtime',
        });
        complete = false;
      }
      accounting.discoveryComplete =
        accounting.notRunFiles.length === 0 &&
        fileResults.every((entry) => entry.result.success && entry.result.accounting !== undefined);
      const aggregate: GeoSpecRunnerResult = {
        success: complete && lineageStatus === 'complete' && failed === 0 && issues.length === 0,
        passed,
        failed,
        selectedTests,
        files: fileResults,
        ...(issues.length > 0 ? { issues } : {}),
        durationMs: performance.now() - runStartedAt,
        accounting,
        lineageStatus,
      };
      emit({ type: 'run-complete', result: aggregate });
      return aggregate;
    } finally {
      await releaseNativeSubjects();
    }
  };

  return {
    async run(runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> {
      if (new Set(runOptions.files).size !== runOptions.files.length) {
        return failedResult(
          {
            code: 'GEOSPEC_DUPLICATE_FILES',
            message: 'GeoSpec requested files must be unique.',
            severity: 'error',
            type: 'runtime',
          },
          runOptions.files,
        );
      }
      if (state.closed) {
        return failedResult(createRunnerClosedIssue(), runOptions.files);
      }
      if (activeDrain !== undefined) {
        return failedResult(createRunnerActiveIssue(), runOptions.files);
      }

      delete state.aborted;
      let finishDrain: () => void = () => undefined;
      const currentDrain = new Promise<void>((resolve) => {
        finishDrain = resolve;
      });
      activeDrain = currentDrain;
      try {
        return await executeRun(runOptions);
      } finally {
        finishDrain();
        if (activeDrain === currentDrain) {
          activeDrain = undefined;
        }
      }
    },

    on(event, handler) {
      const listener = (emitted: GeoSpecRunnerEvent): void => {
        if (emitted.type === event) {
          handler(emitted as Extract<GeoSpecRunnerEvent, { type: typeof event }>);
        }
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    abort(reason?: string): void {
      state.aborted = reason ?? 'requested';
    },

    async close(): Promise<void> {
      if (closePromise === undefined) {
        state.closed = true;
        state.aborted ??= 'runner closed';
        closePromise = (async () => {
          await activeDrain;
          bundleCache.clear();
          emit({ type: 'close' });
        })();
      }
      await closePromise;
    },
  };
};
