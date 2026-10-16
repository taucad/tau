import { describe, expect, it, vi } from 'vitest';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import type { GeoSpecRunResult, GeoSpecTestCase } from 'geospec/runner';
import type { GeoSpecRunner, GeoSpecRunnerEvent } from 'geospec/runner/worker';

import { runnerResultToTestModelOutput } from '#geospec/result.js';
import { createGeoSpecRunProgress, markGeoSpecRunTimeout, observeGeoSpecRunProgress } from '#geospec/run-progress.js';
import type { GeoSpecRunProgressEvent } from '#geospec/run-progress.js';

/** A runner slice whose lifecycle the test drives by hand. */
const eventRunner = (): Pick<GeoSpecRunner, 'on'> & { emit(event: GeoSpecRunnerEvent): void } => {
  const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();
  return {
    on(type, handler) {
      const matches = (event: GeoSpecRunnerEvent): event is Extract<GeoSpecRunnerEvent, { type: typeof type }> =>
        event.type === type;
      const listener = (event: GeoSpecRunnerEvent): void => {
        if (matches(event)) {
          handler(event);
        }
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
};

const settled = (name: string, status: GeoSpecTestCase['status'], ordinal: number): GeoSpecTestCase => ({
  suite: ['lamp'],
  name,
  ordinal,
  status,
  assertions: [],
  diagnostics:
    status === 'failed' ? [{ code: 'GEOSPEC_BOUNDS_MISMATCH', severity: 'error', message: 'Too tall by 4 mm.' }] : [],
});

const moduleResult = (tests: GeoSpecTestCase[]): GeoSpecRunResult => ({
  success: true,
  passed: tests.every((test) => test.status === 'passed'),
  tests,
  bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
  accounting: {
    discovered: tests.length,
    selected: tests.length,
    completed: tests.length,
    passed: tests.filter((test) => test.status === 'passed').length,
    failed: tests.filter((test) => test.status === 'failed').length,
    unsupported: 0,
    inconclusive: 0,
    skipped: 0,
    notRun: 0,
  },
});

/** Drive a two-file run that is cut off while the second file's second test runs. */
const interruptedRun = (secondStatus: GeoSpecTestCase['status'] = 'passed') => {
  const runner = eventRunner();
  const progress = createGeoSpecRunProgress();
  const events: GeoSpecRunProgressEvent[] = [];
  const stop = observeGeoSpecRunProgress(runner, (event) => {
    events.push(event);
    progress.apply(event);
  });
  const bounds = settled('fits the print bed', 'passed', 0);
  const ring = settled('shade ring is one piece', secondStatus, 0);
  runner.emit({ type: 'run-start', files: ['base.geospec.ts', 'shade.geospec.ts'] });
  runner.emit({ type: 'file-start', file: 'base.geospec.ts' });
  runner.emit({
    type: 'test-start',
    file: 'base.geospec.ts',
    test: { suite: ['lamp'], name: bounds.name, ordinal: 0 },
  });
  runner.emit({ type: 'test-complete', file: 'base.geospec.ts', test: bounds });
  runner.emit({ type: 'file-complete', file: 'base.geospec.ts', result: moduleResult([bounds]) });
  runner.emit({ type: 'file-start', file: 'shade.geospec.ts' });
  runner.emit({ type: 'test-start', file: 'shade.geospec.ts', test: { suite: ['lamp'], name: ring.name, ordinal: 0 } });
  runner.emit({ type: 'test-complete', file: 'shade.geospec.ts', test: ring });
  runner.emit({
    type: 'test-start',
    file: 'shade.geospec.ts',
    test: { suite: ['lamp'], name: 'shade is one piece', ordinal: 1 },
  });
  return { progress, events, stop, runner };
};

describe('createGeoSpecRunProgress', () => {
  it('should report completed requirements, the requirement in flight and typed timeout facts', () => {
    const { progress } = interruptedRun();

    const output = progress.timedOut({ budget: 180_000, elapsed: 180_004.4 });

    expect(testModelOutputSchema.parse(output)).toStrictEqual(output);
    expect(output.timeout).toStrictEqual({
      errorCode: 'OPERATION_TIMEOUT',
      code: 'GEOSPEC_RUN_TIMEOUT',
      budget: 180_000,
      elapsed: 180_004,
      phase: 'running',
      file: 'shade.geospec.ts',
      requirement: 'lamp > shade is one piece',
    });
    expect(output.runStatus).toBe('inconclusive');
    expect(output.passes.map((pass) => pass.requirement)).toStrictEqual([
      'lamp > fits the print bed',
      'lamp > shade ring is one piece',
    ]);
    expect(output.tests?.map(({ requirement, status }) => ({ requirement, status }))).toStrictEqual([
      { requirement: 'lamp > fits the print bed', status: 'passed' },
      { requirement: 'lamp > shade ring is one piece', status: 'passed' },
      { requirement: 'lamp > shade is one piece', status: 'not-run' },
    ]);
    expect(output.accounting).toStrictEqual({
      discovered: 3,
      selected: 3,
      completed: 2,
      passed: 2,
      failed: 0,
      unsupported: 0,
      inconclusive: 0,
      skipped: 0,
      notRun: 1,
      requestedFiles: ['base.geospec.ts', 'shade.geospec.ts'],
      completedFiles: ['base.geospec.ts'],
      notRunFiles: ['shade.geospec.ts'],
      discoveryComplete: false,
      cancelled: true,
      bailed: false,
    });
    expect(output.failures).toHaveLength(1);
    expect(output.failures[0]).toMatchObject({
      id: 'GEOSPEC_RUN_TIMEOUT',
      category: 'timeout',
      targetFile: 'shade.geospec.ts',
      diagnostics: [{ code: 'GEOSPEC_RUN_TIMEOUT', details: output.timeout }],
    });
    expect(output.failures[0]?.reason).toContain('"lamp > shade is one piece" in shade.geospec.ts');
    expect(output.failures[0]?.suggestion).toContain('files: ["shade.geospec.ts"]');
  });

  it('should keep a completed failure decisive when the run later times out', () => {
    const { progress } = interruptedRun('failed');

    const output = progress.timedOut({ budget: 180_000, elapsed: 180_000 });

    expect(output.runStatus).toBe('failed');
    expect(output.failures.map((failure) => failure.id)).toStrictEqual([
      'GEOSPEC_RUN_TIMEOUT',
      'shade.geospec.ts:lamp > shade ring is one piece',
    ]);
  });

  it('should report a run that never left the queue as queued, with nothing completed', () => {
    const output = createGeoSpecRunProgress().timedOut({ budget: 180_000, elapsed: 180_001 });

    expect(testModelOutputSchema.safeParse(output).success).toBe(true);
    expect(output).toMatchObject({
      passed: 0,
      total: 0,
      runStatus: 'inconclusive',
      timeout: { phase: 'queued', budget: 180_000, elapsed: 180_001 },
    });
    expect(output.timeout).not.toHaveProperty('file');
    expect(output.failures[0]?.suggestion).toContain('one at a time');
  });
});

describe('observeGeoSpecRunProgress', () => {
  it('should forward test rows without claim reports and stop after unsubscribe', () => {
    const { events, stop, runner } = interruptedRun();
    expect(events.map((event) => event.type)).toStrictEqual([
      'run-start',
      'file-start',
      'test-start',
      'test-complete',
      'file-complete',
      'file-start',
      'test-start',
      'test-complete',
      'test-start',
    ]);
    stop();
    runner.emit({ type: 'run-start', files: [] });
    expect(events).toHaveLength(9);
  });

  it('should keep the run going when its progress receiver throws', () => {
    const runner = eventRunner();
    const onProgress = vi.fn(() => {
      throw new Error('receiver gone');
    });
    observeGeoSpecRunProgress(runner, onProgress);
    expect(() => {
      runner.emit({ type: 'run-start', files: ['a.geospec.ts'] });
    }).not.toThrow();
    expect(onProgress).toHaveBeenCalledOnce();
  });
});

describe('markGeoSpecRunTimeout', () => {
  const complete = runnerResultToTestModelOutput(
    {
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: [{ file: 'base.geospec.ts', result: moduleResult([settled('fits', 'passed', 0)]) }],
      accounting: {
        ...moduleResult([settled('fits', 'passed', 0)]).accounting!,
        requestedFiles: ['base.geospec.ts', 'shade.geospec.ts'],
        completedFiles: ['base.geospec.ts'],
        notRunFiles: ['shade.geospec.ts'],
        discoveryComplete: false,
        cancelled: true,
        bailed: false,
      },
      lineageStatus: 'complete',
    },
    ['base.geospec.ts', 'shade.geospec.ts'],
  );

  it('should mark a run the budget cut short and refuse to let it pass', () => {
    const marked = markGeoSpecRunTimeout(complete, { budget: 180_000, elapsed: 183_000 }, { file: 'shade.geospec.ts' });

    expect(testModelOutputSchema.safeParse(marked).success).toBe(true);
    expect(marked.timeout).toMatchObject({ phase: 'running', file: 'shade.geospec.ts', elapsed: 183_000 });
    expect(marked.failures[0]?.id).toBe('GEOSPEC_RUN_TIMEOUT');
    expect(marked.runStatus).not.toBe('passed');
  });

  it('should leave a run that finished every file inside the abort grace as it is', () => {
    const finished = {
      ...complete,
      accounting: { ...complete.accounting!, cancelled: false, notRunFiles: [] },
    };
    expect(markGeoSpecRunTimeout(finished, { budget: 180_000, elapsed: 181_000 })).toBe(finished);
  });
});
