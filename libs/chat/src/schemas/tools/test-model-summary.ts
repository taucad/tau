/**
 * One summary of a `test_model` result, shared by every surface that prints one (MCP text, `tau test`, the chat
 * transcript and the desktop card), so a requirement the engine could not decide is never called failing.
 *
 * @module
 */

import type { TestFailure, TestModelOutput } from '#schemas/tools/test-model.tool.schema.js';

type RunStatus = NonNullable<TestModelOutput['runStatus']>;
type FailureCategory = NonNullable<TestFailure['category']>;

/** Requirement counts of one run, by status. @public */
export type TestModelCounts = {
  readonly passed: number;
  readonly failed: number;
  readonly inconclusive: number;
  readonly unsupported: number;
  readonly notRun: number;
  readonly skipped: number;
  /** Selected requirements, skipped ones included. */
  readonly total: number;
};

/** A requirement row that was neither passed nor decided false. @public */
export type TestModelUndecided = {
  readonly id: string;
  /** The row's category, else its status. */
  readonly reason: string;
};

/** What {@link summarizeTestModelOutput} reports. @public */
export type TestModelSummary = {
  /** One line: the headline, then the failed and undecided rows. */
  readonly line: string;
  readonly counts: TestModelCounts;
  /** True when every selected requirement was decided: none inconclusive, unsupported or not run. */
  readonly decided: boolean;
  readonly failedIds: readonly string[];
  readonly undecided: readonly TestModelUndecided[];
};

/** The categories of a claim that was refused, not decided false. */
const undecidedCategories: ReadonlySet<FailureCategory> = new Set([
  'unsupported-evidence',
  'analysis-limit',
  'resource-limit',
  'work-budget',
  'timeout',
]);

const listed = 20;

/**
 * Whether a failure row is undecided rather than failed: its requirement status when it carries one, else (a run
 * issue) whether its category is a refusal.
 *
 * @param row - A `test_model` failure row.
 * @returns True for an inconclusive, unsupported or not-run requirement.
 * @public
 */
export const isUndecidedFailure = (row: Pick<TestFailure, 'status' | 'category'>): boolean =>
  row.status === undefined
    ? row.category !== undefined && undecidedCategories.has(row.category)
    : row.status !== 'failed';

const countsOf = (output: TestModelOutput): TestModelCounts => {
  const { accounting, tests } = output;
  if (accounting !== undefined) {
    return {
      passed: accounting.passed,
      failed: accounting.failed,
      inconclusive: accounting.inconclusive,
      unsupported: accounting.unsupported,
      notRun: accounting.notRun,
      skipped: accounting.skipped,
      total: accounting.selected,
    };
  }
  const statuses = tests?.map((test) => test.status) ?? output.failures.flatMap((row) => row.status ?? []);
  const tally = (status: string): number => statuses.filter((value) => value === status).length;
  const inconclusive = tally('inconclusive');
  const unsupported = tally('unsupported');
  const notRun = tally('not-run');
  const skipped = tally('skipped');
  return {
    passed: output.passed,
    // Without test rows, a requirement that neither passed nor was left undecided failed.
    failed:
      tests === undefined
        ? Math.max(0, output.total - output.passed - inconclusive - unsupported - notRun)
        : tally('failed'),
    inconclusive,
    unsupported,
    notRun,
    skipped,
    total: output.total,
  };
};

/**
 * The counts every GeoSpec surface prints: passed and failed, then each non-zero undecided or skipped count.
 *
 * @param counts - The run's requirement counts.
 * @returns For example `5 passed, 0 failed, 5 inconclusive`.
 * @public
 */
export const formatTestModelCounts = (counts: TestModelCounts): string => {
  const parts = [`${String(counts.passed)} passed`, `${String(counts.failed)} failed`];
  for (const [count, label] of [
    [counts.inconclusive, 'inconclusive'],
    [counts.unsupported, 'unsupported'],
    [counts.notRun, 'not run'],
    [counts.skipped, 'skipped'],
  ] as const) {
    if (count > 0) {
      parts.push(`${String(count)} ${label}`);
    }
  }
  return parts.join(', ');
};

/**
 * The headline every GeoSpec surface prints for a run: its status, then passed and failed, then each non-zero
 * undecided count.
 *
 * @param runStatus - The run qualification; absent reads as unqualified.
 * @param counts - The run's requirement counts.
 * @returns For example `GeoSpec inconclusive: 5 passed, 0 failed, 5 inconclusive of 10.`
 * @public
 */
export const formatTestModelHeadline = (runStatus: RunStatus | undefined, counts: TestModelCounts): string =>
  `GeoSpec ${runStatus ?? 'unqualified'}: ${formatTestModelCounts(counts)} of ${String(counts.total)}.`;

/**
 * The run status counts imply, for a surface that has counts but no `runStatus`: failed when any requirement
 * failed, else inconclusive when any was or the run was cancelled, else unsupported when any was, else not run when
 * nothing ran, else passed when the run completed. It orders the cases as the host's `test_model` `runStatus` and
 * `geospec run`'s headline do.
 *
 * @param counts - The run's requirement counts.
 * @param run - Whether every selected requirement ran to a verdict, and whether the run was cancelled.
 * @returns The run status.
 * @public
 */
export const runStatusFromCounts = (
  counts: TestModelCounts,
  run: { readonly completed: boolean; readonly cancelled?: boolean },
): RunStatus => {
  if (counts.failed > 0) {
    return 'failed';
  }
  if (counts.inconclusive > 0 || run.cancelled === true) {
    return 'inconclusive';
  }
  if (counts.unsupported > 0) {
    return 'unsupported';
  }
  if (counts.total === counts.skipped) {
    return 'not-run';
  }
  return run.completed ? 'passed' : 'inconclusive';
};

const list = (label: string, items: readonly string[]): string =>
  items.length === 0
    ? ''
    : ` ${label}: ${items.slice(0, listed).join(', ')}${items.length > listed ? ` and ${String(items.length - listed)} more` : ''}.`;

/**
 * Summarize a `test_model` result from its own taxonomy: counts from `accounting` (else its rows), failed rows only
 * when their requirement failed, and every other non-passing row as undecided with its category.
 *
 * @param output - The `test_model` result, inline or compact.
 * @returns The line and the parts it was built from.
 * @public
 */
export const summarizeTestModelOutput = (output: TestModelOutput): TestModelSummary => {
  const counts = countsOf(output);
  const failedIds: string[] = [];
  const undecided: TestModelUndecided[] = [];
  for (const row of output.failures) {
    if (isUndecidedFailure(row)) {
      undecided.push({ id: row.id.trim(), reason: row.category ?? row.status ?? 'undecided' });
    } else {
      failedIds.push(row.id.trim());
    }
  }
  const omitted = output.omittedFailures ?? 0;
  const line = [
    formatTestModelHeadline(output.runStatus, counts),
    list('Failed', failedIds),
    list(
      'Undecided',
      undecided.map(({ id, reason }) => `${id} (${reason})`),
    ),
    omitted === 0 ? '' : ` ${String(omitted)} more non-passing rows are in the full report.`,
    output.timeout === undefined ? '' : ` The run budget of ${String(output.timeout.budget)} ms expired.`,
  ].join('');
  return {
    line,
    counts,
    decided:
      counts.inconclusive + counts.unsupported + counts.notRun === 0 &&
      output.timeout === undefined &&
      undecided.length === 0,
    failedIds,
    undecided,
  };
};
