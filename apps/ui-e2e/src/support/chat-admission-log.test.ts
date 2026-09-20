// @vitest-environment node
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { foldChatLog } from './chat-admission-log.ts';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import type { LogRecord } from './chat-admission-log.ts';

/**
 * The invariant `expectLogInvariant` folds, pinned where it is pure.
 *
 * Nine of the twelve invariants were mutation-resistant; this fold was not one
 * of them. It counted runs and settlements and nothing else, so a cancelled run
 * that settled `turn.finalized`, a run executed twice under one run id, and a
 * lifecycle row written into a settled ledger all passed (blueprint Finding 10,
 * T5 (d)).
 */
const lifecycle = (runId: string, state: string): LogRecord => ({ runId, type: 'run.lifecycle', state });
const settled = (runId: string, type = 'turn.finalized'): LogRecord => ({ runId, type });

const oneCleanRun: readonly LogRecord[] = [
  lifecycle('run-1', 'admitted'),
  lifecycle('run-1', 'running'),
  lifecycle('run-1', 'completed'),
  settled('run-1'),
];

describe('foldChatLog', () => {
  it('accepts one admitted run that executed once and settled once', () => {
    expect(foldChatLog(oneCleanRun, { runs: 1 })).toEqual({ runs: 1, violations: [] });
  });

  it('reports a run the log never admitted', () => {
    const fold = foldChatLog([settled('run-1')], { runs: 1 });
    expect(fold.violations.map((shape) => shape.admissions)).toEqual([0]);
  });

  it('reports a second admission of one run', () => {
    const records = [lifecycle('run-1', 'admitted'), ...oneCleanRun];
    expect(foldChatLog(records, { runs: 1 }).violations.map((shape) => shape.admissions)).toEqual([2]);
  });

  it('reports a duplicate non-reopening lifecycle row', () => {
    const records = [...oneCleanRun.slice(0, 3), lifecycle('run-1', 'completed'), settled('run-1')];
    expect(foldChatLog(records, { runs: 1 }).violations.map((shape) => shape.duplicateLifecycle)).toEqual([
      ['completed'],
    ]);
  });

  it('reports a non-reopening lifecycle row written after the settlement', () => {
    const records = [...oneCleanRun, lifecycle('run-1', 'cancelled')];
    expect(foldChatLog(records, { runs: 1 }).violations.map((shape) => shape.afterSettlement)).toEqual([
      ['run.lifecycle:cancelled'],
    ]);
  });

  it('accepts a reopening row after the settlement, and counts the second attempt', () => {
    const records = [...oneCleanRun, lifecycle('run-1', 'running'), settled('run-1', 'turn.failed')];
    expect(foldChatLog(records, { runs: 1, executions: [2] })).toEqual({
      runs: 1,
      executions: [2],
      violations: [],
    });
  });

  it('refuses a second execution the caller did not ask for', () => {
    const records = [...oneCleanRun, lifecycle('run-1', 'running'), settled('run-1', 'turn.failed')];
    expect(foldChatLog(records, { runs: 1 }).violations.map((shape) => shape.executions)).toEqual([2]);
  });

  it('reports the settlement kind of each run so the caller can assert it', () => {
    const records = [
      lifecycle('run-1', 'admitted'),
      lifecycle('run-1', 'running'),
      settled('run-1', 'turn.failed'),
      lifecycle('run-2', 'admitted'),
      lifecycle('run-2', 'running'),
      settled('run-2'),
    ];
    expect(foldChatLog(records, { runs: 2, settlements: ['turn.failed', 'turn.finalized'] })).toEqual({
      runs: 2,
      settlements: ['turn.failed', 'turn.finalized'],
      violations: [],
    });
  });

  it('keeps a settlement that precedes the admission a violation', () => {
    const records = [settled('run-1'), lifecycle('run-1', 'admitted'), lifecycle('run-1', 'running')];
    expect(foldChatLog(records, { runs: 1 }).violations.map((shape) => shape.settlesAfterAdmission)).toEqual([false]);
  });
});
