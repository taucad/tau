/**
 * Partial `test_model` results for a run that outlives its budget.
 *
 * A browser run reports progress while it runs: each test as it starts and
 * settles and each file as it completes, already projected to JSON-safe rows.
 * Progress never answers the call. The run's one authoritative reply is its
 * own result; only when the host's run budget expires first does the host
 * answer with {@link GeoSpecRunProgress.timedOut}, which reports the
 * requirements that completed and leaves the rest not run, never passed.
 *
 * @module
 */

import type { RunGeoSpecTestsRpcResult } from '@taucad/chat';
import type { GeoSpecRunTimeout } from '@taucad/chat/schemas/tools/test-model';
import { geoSpecTimeoutCode } from 'geospec/runner/worker';
import type { GeoSpecRunner } from 'geospec/runner/worker';

import { projectGeoSpecFile, projectGeoSpecTest } from '#geospec/result.js';
import type {
  GeoSpecFileProjection,
  GeoSpecProjectedTest,
  GeoSpecTestCounts,
  TestModelOutput,
} from '#geospec/result.js';

type RunGeoSpecTestFailure = Extract<RunGeoSpecTestsRpcResult, { success: true }>['failures'][number];
type TestRow = NonNullable<TestModelOutput['tests']>[number];

/**
 * One progress event of a running `test_model` call. Every payload is
 * JSON-safe, so it crosses a worker boundary by structured clone.
 *
 * @public
 */
export type GeoSpecRunProgressEvent =
  | { readonly type: 'run-start'; readonly files: readonly string[] }
  | { readonly type: 'file-start'; readonly file: string }
  | { readonly type: 'test-start'; readonly file: string; readonly test: TestRow }
  | { readonly type: 'test-complete'; readonly file: string; readonly projected: GeoSpecProjectedTest }
  | { readonly type: 'file-complete'; readonly file: string; readonly projection: GeoSpecFileProjection };

/**
 * Forward a runner's lifecycle as projected progress events.
 *
 * Test rows carry no claim reports: a completed file re-sends its rows with
 * them, and a timed-out run is partial evidence anyway.
 *
 * @param runner - The runner whose events to observe.
 * @param onProgress - Receives each projected event; its errors never reach the run.
 * @returns Unsubscribes every listener.
 * @public
 */
export const observeGeoSpecRunProgress = (
  runner: Pick<GeoSpecRunner, 'on'>,
  onProgress: (event: GeoSpecRunProgressEvent) => void,
): (() => void) => {
  const send = (event: GeoSpecRunProgressEvent): void => {
    try {
      onProgress(event);
    } catch {
      // Progress reports; it never decides or interrupts a run.
    }
  };
  const unsubscribers = [
    runner.on('run-start', ({ files }) => {
      send({ type: 'run-start', files: [...files] });
    }),
    runner.on('file-start', ({ file }) => {
      send({ type: 'file-start', file });
    }),
    runner.on('test-start', ({ file, test }) => {
      const requirement = [...test.suite, test.name].join(' > ');
      send({
        type: 'test-start',
        file,
        test: {
          id: `${file}:${test.ordinal ?? requirement}`,
          requirement,
          targetFile: file,
          status: 'not-run',
          ...(test.ordinal === undefined ? {} : { ordinal: test.ordinal }),
        },
      });
    }),
    runner.on('test-complete', ({ file, test }) => {
      send({ type: 'test-complete', file, projected: projectGeoSpecTest(file, test, { reports: false }) });
    }),
    runner.on('file-complete', ({ file, result, durationMs }) => {
      send({
        type: 'file-complete',
        file,
        projection: projectGeoSpecFile({ file, result, ...(durationMs === undefined ? {} : { durationMs }) }),
      });
    }),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
};

/** Budget facts the host knows when its run budget expires. @public */
export type GeoSpecRunTimeoutFacts = {
  /** The run budget. Milliseconds. */
  readonly budget: number;
  /** How long the run had taken. Milliseconds. */
  readonly elapsed: number;
};

/** Accumulates one run's progress so its budget expiry can still report. @public */
export type GeoSpecRunProgress = {
  /** Whether the worker reported that the run started. */
  readonly started: boolean;
  /** Record one progress event. */
  apply(event: GeoSpecRunProgressEvent): void;
  /**
   * The `test_model` answer for a run whose budget expired: completed rows,
   * the requirement in flight as not run, and a `GEOSPEC_RUN_TIMEOUT` row.
   */
  timedOut(facts: GeoSpecRunTimeoutFacts): TestModelOutput;
};

const emptyCounts = (): GeoSpecTestCounts => ({
  discovered: 0,
  selected: 0,
  completed: 0,
  passed: 0,
  failed: 0,
  unsupported: 0,
  inconclusive: 0,
  skipped: 0,
  notRun: 0,
});

const countStatus = (counts: GeoSpecTestCounts, status: TestRow['status']): void => {
  counts.discovered += 1;
  counts.selected += 1;
  if (status === 'skipped') {
    counts.skipped += 1;
    return;
  }
  if (status === 'not-run') {
    counts.notRun += 1;
    return;
  }
  counts.completed += 1;
  counts[status] += 1;
};

const addCounts = (total: GeoSpecTestCounts, counts: GeoSpecTestCounts): void => {
  for (const key of Object.keys(total) as Array<keyof GeoSpecTestCounts>) {
    total[key] += counts[key];
  }
};

/** Mark a run timeout on rows, the timeout block first so it is read first. */
const withTimeout = (
  output: TestModelOutput,
  runTimeout: GeoSpecRunTimeout,
  row: RunGeoSpecTestFailure,
): TestModelOutput => ({
  ...output,
  failures: [row, ...output.failures],
  runStatus: output.runStatus === 'failed' ? 'failed' : 'inconclusive',
  timeout: runTimeout,
});

const timeoutRow = (options: {
  readonly runTimeout: GeoSpecRunTimeout;
  readonly completed: number;
  readonly unfinished: readonly string[];
  readonly fallbackFile: string;
}): RunGeoSpecTestFailure => {
  const { runTimeout, completed, unfinished } = options;
  const where =
    runTimeout.file === undefined
      ? 'before any GeoSpec file started'
      : `while running ${runTimeout.requirement === undefined ? '' : `"${runTimeout.requirement}" in `}${runTimeout.file}`;
  const reason =
    runTimeout.phase === 'queued'
      ? `GeoSpec run waited ${runTimeout.elapsed} ms behind an earlier test_model run in this session and never started within its ${runTimeout.budget} ms budget.`
      : `GeoSpec run exceeded its ${runTimeout.budget} ms browser run budget after ${runTimeout.elapsed} ms ${where}. ${completed} requirement(s) completed and are reported; ${unfinished.length} file(s) did not finish. This is a wall-clock timeout, not a geometry verdict.`;
  const rerun =
    unfinished.length === 0 ? '' : ` Re-run only what did not finish with files: ${JSON.stringify(unfinished)}.`;
  return {
    id: geoSpecTimeoutCode.run,
    requirement: 'The GeoSpec run must finish within its run budget',
    reason,
    suggestion:
      runTimeout.phase === 'queued'
        ? 'Re-run it once the earlier test_model call has returned; run test_model calls one at a time.'
        : `Keep the assertions.${rerun} Pass a larger testTimeout to raise the run budget up to this host's maximum, which the host can raise. If the run still cannot finish here, report the unfinished requirements as not decided at this capacity, keeping the model at its full geometry and resolution.`,
    category: 'timeout',
    targetFile: runTimeout.file ?? options.fallbackFile,
    diagnostics: [
      {
        code: geoSpecTimeoutCode.run,
        severity: 'error',
        message: reason,
        details: structuredClone(runTimeout),
      },
    ],
  };
};

/**
 * Start accumulating one run's progress.
 *
 * @returns An accumulator whose {@link GeoSpecRunProgress.timedOut} answers a budget expiry.
 * @public
 */
export const createGeoSpecRunProgress = (): GeoSpecRunProgress => {
  let requestedFiles: readonly string[] = [];
  let started = false;
  let inFlightFile: string | undefined;
  let inFlightTest: TestRow | undefined;
  const completedFiles = new Map<string, GeoSpecFileProjection>();
  const partialTests = new Map<string, GeoSpecProjectedTest[]>();

  const apply = (event: GeoSpecRunProgressEvent): void => {
    switch (event.type) {
      case 'run-start': {
        started = true;
        requestedFiles = [...event.files];
        return;
      }
      case 'file-start': {
        inFlightFile = event.file;
        inFlightTest = undefined;
        return;
      }
      case 'test-start': {
        inFlightFile = event.file;
        inFlightTest = event.test;
        return;
      }
      case 'test-complete': {
        partialTests.set(event.file, [...(partialTests.get(event.file) ?? []), event.projected]);
        if (inFlightTest?.id === event.projected.test.id) {
          inFlightTest = undefined;
        }
        return;
      }
      case 'file-complete': {
        completedFiles.set(event.file, event.projection);
        partialTests.delete(event.file);
        if (inFlightFile === event.file) {
          inFlightFile = undefined;
          inFlightTest = undefined;
        }
      }
    }
  };

  const timedOut = (facts: GeoSpecRunTimeoutFacts): TestModelOutput => {
    const runTimeout: GeoSpecRunTimeout = {
      errorCode: 'OPERATION_TIMEOUT',
      code: geoSpecTimeoutCode.run,
      budget: Math.round(facts.budget),
      elapsed: Math.round(facts.elapsed),
      phase: started ? 'running' : 'queued',
      ...(inFlightFile === undefined ? {} : { file: inFlightFile }),
      ...(inFlightTest === undefined ? {} : { requirement: inFlightTest.requirement }),
    };
    const files = [
      ...requestedFiles,
      ...[...completedFiles.keys(), ...partialTests.keys()].filter((file) => !requestedFiles.includes(file)),
    ];
    const failures: RunGeoSpecTestFailure[] = [];
    const passes: TestModelOutput['passes'] = [];
    const tests: TestRow[] = [];
    const lineage: NonNullable<TestModelOutput['lineage']> = [];
    const sourceRevisions: NonNullable<TestModelOutput['sourceRevisions']> = [];
    const counts = emptyCounts();
    for (const file of files) {
      const projection = completedFiles.get(file);
      if (projection !== undefined) {
        failures.push(...projection.failures);
        passes.push(...projection.passes);
        tests.push(...projection.tests);
        sourceRevisions.push(...projection.sourceRevisions);
        if (projection.lineage !== undefined) {
          lineage.push(projection.lineage);
        }
        if (projection.counts === undefined) {
          for (const test of projection.tests) {
            countStatus(counts, test.status);
          }
        } else {
          addCounts(counts, projection.counts);
        }
        continue;
      }
      for (const projected of partialTests.get(file) ?? []) {
        tests.push(projected.test);
        countStatus(counts, projected.test.status);
        if (projected.failure !== undefined) {
          failures.push(projected.failure);
        }
        if (projected.pass !== undefined) {
          passes.push(projected.pass);
        }
      }
      if (inFlightTest !== undefined && inFlightTest.targetFile === file) {
        tests.push(inFlightTest);
        countStatus(counts, 'not-run');
      }
    }
    const completedFileList = files.filter((file) => completedFiles.has(file));
    const unfinished = files.filter((file) => !completedFiles.has(file));
    const output: TestModelOutput = {
      failures,
      passes,
      passed: passes.length,
      total: counts.selected,
      runStatus: tests.some((test) => test.status === 'failed') ? 'failed' : 'inconclusive',
      tests,
      accounting: {
        ...counts,
        requestedFiles: [...requestedFiles],
        completedFiles: completedFileList,
        notRunFiles: unfinished,
        discoveryComplete: false,
        cancelled: true,
        bailed: false,
      },
      lineageStatus: 'unavailable',
      ...(lineage.length === 0 ? {} : { lineage }),
      ...(sourceRevisions.length === 0 ? {} : { sourceRevisions }),
    };
    return withTimeout(
      output,
      runTimeout,
      timeoutRow({
        runTimeout,
        completed: counts.completed,
        unfinished,
        fallbackFile: requestedFiles[0] ?? '*.geospec.ts',
      }),
    );
  };

  return {
    apply,
    get started() {
      return started;
    },
    timedOut,
  };
};

/**
 * Mark a complete runner answer that arrived after its run budget expired.
 * A run that still finished every file stands as it is; one the budget cut
 * short gains the timeout block and row, and can no longer pass.
 *
 * @param output - The run's own answer.
 * @param facts - The budget and the time the run took.
 * @param inFlight - The file and requirement in flight when the budget expired.
 * @returns The answer, marked when the budget cut the run short.
 * @public
 */
export const markGeoSpecRunTimeout = (
  output: TestModelOutput,
  facts: GeoSpecRunTimeoutFacts,
  inFlight: { readonly file?: string; readonly requirement?: string } = {},
): TestModelOutput => {
  const { accounting } = output;
  if (accounting !== undefined && !accounting.cancelled && accounting.notRunFiles.length === 0) {
    return output;
  }
  const runTimeout: GeoSpecRunTimeout = {
    errorCode: 'OPERATION_TIMEOUT',
    code: geoSpecTimeoutCode.run,
    budget: Math.round(facts.budget),
    elapsed: Math.round(facts.elapsed),
    phase: 'running',
    ...(inFlight.file === undefined ? {} : { file: inFlight.file }),
    ...(inFlight.requirement === undefined ? {} : { requirement: inFlight.requirement }),
  };
  const unfinished = accounting?.notRunFiles ?? [];
  return withTimeout(
    output,
    runTimeout,
    timeoutRow({
      runTimeout,
      completed: accounting?.completed ?? output.passes.length,
      unfinished,
      fallbackFile: accounting?.requestedFiles[0] ?? '*.geospec.ts',
    }),
  );
};
