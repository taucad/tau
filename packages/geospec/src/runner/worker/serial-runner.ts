import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import type {
  GeoSpecRunner,
  GeoSpecRunnerEvent,
  GeoSpecRunnerOptions,
  GeoSpecRunnerResult,
  GeoSpecRunnerRunOptions,
} from '#runner/worker/index.js';
import { createNoMatchingGeoSpecTestsIssue } from '#runner/worker/index.js';
import type { GeoSpecTestCase } from '#runner/types.js';
import type { VmIssue } from '@taucad/esbuild/vm';

const createRunnerClosedIssue = (): VmIssue => ({
  code: 'GEOSPEC_RUNNER_CLOSED',
  message: 'GeoSpec runner is closed.',
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

/** Count non-skipped pass/fail totals for runner aggregates (shared with the pool runner, R3). */
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
 * Create a runner that executes GeoSpec files serially in the current worker host.
 *
 * @param options - Shared runner dependencies and lifecycle event observer.
 * @returns A GeoSpec runner with run, abort, and close lifecycle methods.
 *
 * @internal
 */
export const createSerialGeoSpecRunner = (options: GeoSpecRunnerOptions): GeoSpecRunner => {
  const state: { closed: boolean; aborted?: string } = { closed: false };
  const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();

  const emit = (event: GeoSpecRunnerEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const getAbortReason = (): string | undefined => state.aborted;

  return {
    async run(runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> {
      if (state.closed) {
        const issue = createRunnerClosedIssue();
        return { success: false, passed: 0, failed: 1, selectedTests: 0, files: [], issues: [issue] };
      }

      delete state.aborted;
      const files = [...runOptions.files];
      const runStartedAt = performance.now();
      emit({ type: 'run-start', files });

      let passed = 0;
      let failed = 0;
      let selectedTests = 0;
      const fileResults: GeoSpecRunnerResult['files'] = [];
      const issues: VmIssue[] = [];
      for (const file of files) {
        const abortReason = getAbortReason();
        if (abortReason !== undefined) {
          const issue = createRunnerAbortedIssue(abortReason);
          issues.push(issue);
          failed += 1;
          emit({ type: 'abort', reason: abortReason });
          break;
        }

        emit({ type: 'file-start', file });
        const fileStartedAt = performance.now();
        // oxlint-disable-next-line no-await-in-loop -- Within one worker, CAD tests run serially for deterministic evidence and bounded runtime pressure; the pool runner (R3) parallelizes across workers.
        const result = await runGeoSpecModule({
          filesystem: options.filesystem,
          entryPath: file,
          testNamePattern: runOptions.testNamePattern,
          testTimeout: runOptions.testTimeout,
          matcherWallBackstop: runOptions.matcherWallBackstop,
          forensic: runOptions.forensic,
          ...(options.modelLoader ? { modelLoader: options.modelLoader } : {}),
          ...(options.stepLoader ? { stepLoader: options.stepLoader } : {}),
          ...(options.builtinModules ? { builtinModules: options.builtinModules } : {}),
          ...(options.internalProfile ? { internalProfile: options.internalProfile } : {}),
        });
        const durationMs = performance.now() - fileStartedAt;
        emit({ type: 'file-complete', file, result, durationMs });
        fileResults.push({ file, result, durationMs });

        if (result.success) {
          selectedTests += result.tests.length;
          const counts = countRunnerTests(result.tests);
          passed += counts.passed;
          failed += counts.failed;
        } else {
          failed += 1;
        }

        if (runOptions.bail === true && failed > 0) {
          issues.push(createRunnerBailIssue(file));
          break;
        }
      }

      if (selectedTests === 0 && failed === 0) {
        issues.push(createNoMatchingGeoSpecTestsIssue());
        failed += 1;
      }

      const aggregate: GeoSpecRunnerResult = {
        success: failed === 0 && issues.length === 0,
        passed,
        failed,
        selectedTests,
        files: fileResults,
        ...(issues.length > 0 ? { issues } : {}),
        durationMs: performance.now() - runStartedAt,
      };
      emit({ type: 'run-complete', result: aggregate });
      return aggregate;
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
      if (state.closed) {
        return;
      }
      state.closed = true;
      emit({ type: 'close' });
    },
  };
};
