import { describe, expect, it } from 'vitest';
import {
  formatTestModelHeadline,
  isUndecidedFailure,
  runStatusFromCounts,
  summarizeTestModelOutput,
} from '#schemas/tools/test-model-summary.js';
import type { TestModelOutput } from '#schemas/tools/test-model.tool.schema.js';

const accounting = {
  discovered: 10,
  selected: 10,
  completed: 10,
  passed: 5,
  failed: 0,
  unsupported: 0,
  inconclusive: 5,
  skipped: 0,
  notRun: 0,
  requestedFiles: ['main.geospec.ts'],
  completedFiles: ['main.geospec.ts'],
  notRunFiles: [],
  discoveryComplete: true,
  cancelled: false,
  bailed: false,
};

const row = (
  id: string,
  fields: Partial<TestModelOutput['failures'][number]> = {},
): TestModelOutput['failures'][number] => ({
  id,
  requirement: id,
  reason: 'reason',
  suggestion: 'suggestion',
  targetFile: 'main.ts',
  ...fields,
});

/** The planetary run of the audit: five passed, three interference claims over the analysis limit, two on mesh. */
const planetary: TestModelOutput = {
  passed: 5,
  total: 10,
  runStatus: 'inconclusive',
  accounting,
  passes: [],
  failures: [
    row('interference sun', { status: 'inconclusive', category: 'analysis-limit' }),
    row('interference planets', { status: 'inconclusive', category: 'analysis-limit' }),
    row('interference ring', { status: 'inconclusive', category: 'analysis-limit' }),
    row('bore', { status: 'inconclusive', category: 'unsupported-evidence' }),
    row('trim', { status: 'inconclusive', category: 'unsupported-evidence' }),
  ],
};

describe('summarizeTestModelOutput', () => {
  it('should report the planetary run as inconclusive with no failing IDs', () => {
    const summary = summarizeTestModelOutput(planetary);

    expect(summary.line).toBe(
      'GeoSpec inconclusive: 5 passed, 0 failed, 5 inconclusive of 10. Undecided: interference sun (analysis-limit), interference planets (analysis-limit), interference ring (analysis-limit), bore (unsupported-evidence), trim (unsupported-evidence).',
    );
    expect(summary.failedIds).toStrictEqual([]);
    expect(summary.decided).toBe(false);
    expect(summary.counts).toStrictEqual({
      passed: 5,
      failed: 0,
      inconclusive: 5,
      unsupported: 0,
      notRun: 0,
      skipped: 0,
      total: 10,
    });
  });

  it('should never say "passed 0 of 1" for one refused requirement', () => {
    const summary = summarizeTestModelOutput({
      passed: 0,
      total: 1,
      runStatus: 'inconclusive',
      accounting: { ...accounting, discovered: 10, selected: 1, completed: 1, passed: 0, inconclusive: 1 },
      passes: [],
      failures: [row('interference sun', { status: 'inconclusive', category: 'analysis-limit' })],
    });

    expect(summary.line).toBe(
      'GeoSpec inconclusive: 0 passed, 0 failed, 1 inconclusive of 1. Undecided: interference sun (analysis-limit).',
    );
    expect(summary.line).not.toContain('passed 0 of 1');
  });

  it('should list failed rows apart from undecided ones and cap each list at twenty', () => {
    const failures = Array.from({ length: 22 }, (_, index) =>
      row(`f${String(index)}`, { status: 'failed', category: 'geometry' }),
    );
    const summary = summarizeTestModelOutput({
      passed: 0,
      total: 23,
      runStatus: 'failed',
      accounting: {
        ...accounting,
        selected: 23,
        completed: 23,
        passed: 0,
        failed: 22,
        unsupported: 1,
        inconclusive: 0,
      },
      passes: [],
      failures: [...failures, row('mesh only', { status: 'unsupported', category: 'unsupported-evidence' })],
    });

    expect(summary.line).toMatch(
      /^GeoSpec failed: 0 passed, 22 failed, 1 unsupported of 23\. Failed: f0, f1, .*, f19 and 2 more\. Undecided: mesh only \(unsupported-evidence\)\.$/u,
    );
    expect(summary.failedIds).toHaveLength(22);
  });

  it('should count from the test rows, then from the failure rows, when the result has no accounting', () => {
    const fromTests = summarizeTestModelOutput({
      passed: 1,
      total: 3,
      passes: [],
      failures: [],
      tests: [
        { id: 'a', requirement: 'a', targetFile: 'main.ts', status: 'passed' },
        { id: 'b', requirement: 'b', targetFile: 'main.ts', status: 'not-run' },
        { id: 'c', requirement: 'c', targetFile: 'main.ts', status: 'skipped' },
      ],
    });
    const fromRows = summarizeTestModelOutput({
      passed: 1,
      total: 3,
      passes: [],
      failures: [row('x', { status: 'inconclusive', category: 'work-budget' }), row('y')],
    });

    expect(fromTests.line).toBe('GeoSpec unqualified: 1 passed, 0 failed, 1 not run, 1 skipped of 3.');
    expect(fromRows.line).toBe(
      'GeoSpec unqualified: 1 passed, 1 failed, 1 inconclusive of 3. Failed: y. Undecided: x (work-budget).',
    );
  });

  it('should trim each listed id', () => {
    const summary = summarizeTestModelOutput({
      passed: 0,
      total: 2,
      passes: [],
      failures: [
        row('  bore \n', { status: 'failed', category: 'geometry' }),
        row(' sun ', { status: 'inconclusive', category: 'analysis-limit' }),
      ],
    });

    expect(summary.line).toBe(
      'GeoSpec unqualified: 0 passed, 1 failed, 1 inconclusive of 2. Failed: bore. Undecided: sun (analysis-limit).',
    );
    expect(summary.failedIds).toStrictEqual(['bore']);
  });

  it('should name omitted rows and an expired run budget', () => {
    const summary = summarizeTestModelOutput({
      ...planetary,
      omittedFailures: 3,
      timeout: {
        errorCode: 'OPERATION_TIMEOUT',
        code: 'GEOSPEC_RUN_TIMEOUT',
        budget: 600_000,
        elapsed: 600_010,
        phase: 'running',
      },
    });

    expect(summary.line).toMatch(
      / 3 more non-passing rows are in the full report\. The run budget of 600000 ms expired\.$/u,
    );
  });
});

describe('isUndecidedFailure', () => {
  it('should read the requirement status first, then the category of a run issue', () => {
    expect(isUndecidedFailure({ status: 'failed', category: 'timeout' })).toBe(false);
    expect(isUndecidedFailure({ status: 'inconclusive', category: 'infrastructure' })).toBe(true);
    expect(isUndecidedFailure({ status: 'not-run' })).toBe(true);
    expect(isUndecidedFailure({ category: 'timeout' })).toBe(true);
    expect(isUndecidedFailure({ category: 'infrastructure' })).toBe(false);
    expect(isUndecidedFailure({})).toBe(false);
  });
});

describe('formatTestModelHeadline', () => {
  // `geospec run` prints the same line from the same counts (`formatRunHeadline` in geospec-engine's cli.test.ts).
  it('should print the headline geospec run prints for the same counts', () => {
    expect(formatTestModelHeadline('inconclusive', summarizeTestModelOutput(planetary).counts)).toBe(
      'GeoSpec inconclusive: 5 passed, 0 failed, 5 inconclusive of 10.',
    );
  });
});

describe('runStatusFromCounts', () => {
  const counts = { passed: 1, failed: 0, inconclusive: 0, unsupported: 0, notRun: 0, skipped: 0, total: 1 };

  it.each([
    [{ ...counts, failed: 1, inconclusive: 1 }, { completed: true }, 'failed'],
    [{ ...counts, inconclusive: 1 }, { completed: true }, 'inconclusive'],
    [{ ...counts, unsupported: 1 }, { completed: true }, 'unsupported'],
    [{ ...counts, passed: 0, unsupported: 1 }, { completed: false, cancelled: true }, 'inconclusive'],
    [{ ...counts, passed: 0, skipped: 1 }, { completed: true }, 'not-run'],
    [counts, { completed: true }, 'passed'],
    [counts, { completed: true, cancelled: true }, 'inconclusive'],
    [{ ...counts, notRun: 1, total: 2 }, { completed: false }, 'inconclusive'],
  ] as const)('should qualify %o (%o) as %s', (input, run, status) => {
    expect(runStatusFromCounts(input, run)).toBe(status);
  });
});
