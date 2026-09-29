// @vitest-environment node
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { attemptsOf, foldChatLog } from './chat-admission-log.ts';
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
 *
 * The unit it checks is the **attempt**, not the run (I1): a resumable failure
 * is reopened by a `running` row, runs again under the same run id and settles
 * again. The split mirrors `runLedgerOf` in
 * `packages/agent-host/src/host/tau-agent-host.ts` exactly — a `running` row
 * arriving when the attempt already holds a settlement starts the next one —
 * and the per-attempt clauses mirror `isHostLifecycleLegal`.
 */
/*
 * Rows as the log holds them: the ledger reads envelopes and settlement bodies, so the fixtures carry both. Each
 * fixture is re-sequenced by `log` wherever it is spliced.
 */
const lifecycle = (runId: string, state: string, code?: string): LogRecord => {
  const row = {
    runId,
    type: 'run.lifecycle',
    state,
    ...(code === undefined ? {} : { detail: { message: code, code } }),
  };
  return row;
};
const settled = (runId: string, type = 'turn.finalized'): LogRecord => {
  const row = {
    runId,
    type,
    turnId: `turn-${runId}`,
    chatId: 'chat-1',
    ...(type === 'turn.failed' ? { reason: 'The turn ended before it recorded a revision.' } : {}),
    ...(type === 'turn.finalized'
      ? { projectId: 'project-1', changedPaths: [], trigger: 'turn', runIds: [runId] }
      : {}),
  };
  return row;
};
const log = (records: readonly LogRecord[]): LogRecord[] =>
  records.map((record, sequence) => ({
    version: 1,
    leaderEpoch: 'e01',
    sequence,
    recordedAt: '2026-09-26T00:00:00.000Z',
    ...record,
  }));

const oneCleanRun: readonly LogRecord[] = [
  lifecycle('run-1', 'admitted'),
  lifecycle('run-1', 'running'),
  lifecycle('run-1', 'completed'),
  settled('run-1'),
];

/** A resumable failure, reopened and carried to completion under one run id. */
const reopenedRun: readonly LogRecord[] = [
  lifecycle('run-1', 'admitted'),
  lifecycle('run-1', 'running'),
  lifecycle('run-1', 'failed', 'RATE_LIMITED'),
  settled('run-1', 'turn.failed'),
  lifecycle('run-1', 'running'),
  lifecycle('run-1', 'completed'),
  settled('run-1', 'turn.finalized'),
];

describe('attemptsOf', () => {
  it('splits a run at the reopening row and nowhere else', () => {
    expect(attemptsOf(log(reopenedRun)).map((attempt) => attempt.map((record) => record.state ?? record.type))).toEqual(
      [
        ['admitted', 'running', 'failed', 'turn.failed'],
        ['running', 'completed', 'turn.finalized'],
      ],
    );
  });

  // The ledger's one reopen predicate (I10): a settled failure that is not resumable opens no second attempt.
  it('does not split a settled run whose failure cannot be resumed', () => {
    const records = [...reopenedRun.slice(0, 2), lifecycle('run-1', 'failed', 'FATAL'), ...reopenedRun.slice(3)];
    expect(attemptsOf(log(records))).toHaveLength(1);
  });

  it('keeps one attempt when a run never settled', () => {
    expect(attemptsOf(log(oneCleanRun.slice(0, 3)))).toHaveLength(1);
  });

  it('does not split on a `running` row that no settlement precedes', () => {
    const records = [lifecycle('run-1', 'admitted'), lifecycle('run-1', 'running'), lifecycle('run-1', 'running')];
    expect(attemptsOf(log(records))).toHaveLength(1);
  });

  /* `isHostLifecycleLegal`: a settlement that landed while the attempt was
   * still executing closed its *lease*, not its execution — the run still owes
   * the log the record of how it ended. */
  it('does not split when the settlement arrived before the attempt ended', () => {
    const records = [
      lifecycle('run-1', 'admitted'),
      lifecycle('run-1', 'running'),
      settled('run-1'),
      lifecycle('run-1', 'completed'),
    ];
    expect(attemptsOf(log(records))).toHaveLength(1);
  });
});

describe('foldChatLog', () => {
  it('accepts one admitted run that executed once and settled once', () => {
    expect(foldChatLog(log(oneCleanRun), { runs: 1 })).toEqual({ runs: 1, violations: [] });
  });

  it('accepts a reopened run as one run of two attempts', () => {
    expect(
      foldChatLog(log(reopenedRun), {
        runs: 1,
        attempts: [2],
        settlements: ['turn.failed', 'turn.finalized'],
      }),
    ).toEqual({
      runs: 1,
      attempts: [2],
      settlements: ['turn.failed', 'turn.finalized'],
      violations: [],
    });
  });

  it('reads settlements flat, in log order, across runs', () => {
    const records = [
      ...oneCleanRun,
      lifecycle('run-2', 'admitted'),
      lifecycle('run-2', 'running'),
      lifecycle('run-2', 'failed', 'RATE_LIMITED'),
      settled('run-2', 'turn.failed'),
      lifecycle('run-2', 'running'),
      lifecycle('run-2', 'completed'),
      settled('run-2', 'turn.finalized'),
    ];
    expect(
      foldChatLog(log(records), { runs: 2, settlements: ['turn.finalized', 'turn.failed', 'turn.finalized'] }),
    ).toEqual({
      runs: 2,
      settlements: ['turn.finalized', 'turn.failed', 'turn.finalized'],
      violations: [],
    });
  });

  it('reports a run the log never admitted', () => {
    expect(foldChatLog(log([settled('run-1')]), { runs: 1 }).violations).toEqual([
      { runId: 'run-1', attempt: 0, reason: 'admitted 0 times, expected exactly once' },
    ]);
  });

  it('reports a second admission of one run', () => {
    const records = [lifecycle('run-1', 'admitted'), ...oneCleanRun];
    expect(foldChatLog(log(records), { runs: 1 }).violations).toContainEqual({
      runId: 'run-1',
      attempt: 0,
      reason: 'admitted 2 times, expected exactly once',
    });
  });

  it('reports a duplicate non-reopening lifecycle row inside one attempt', () => {
    const records = [...oneCleanRun.slice(0, 3), lifecycle('run-1', 'completed'), settled('run-1')];
    expect(foldChatLog(log(records), { runs: 1 }).violations).toEqual([
      { runId: 'run-1', attempt: 1, reason: 'duplicate lifecycle rows: completed' },
    ]);
  });

  /* The clause the reopen must not erase: a second attempt is legal, a second
   * `failed` inside ONE attempt is still a duplicate writer. */
  it('still reports a duplicate inside the second attempt of a reopened run', () => {
    const records = [...reopenedRun.slice(0, 6), lifecycle('run-1', 'completed'), settled('run-1')];
    expect(foldChatLog(log(records), { runs: 1, attempts: [2] }).violations).toEqual([
      { runId: 'run-1', attempt: 2, reason: 'duplicate lifecycle rows: completed' },
    ]);
  });

  it('reports a lifecycle row written after the attempt closed', () => {
    const records = [...oneCleanRun, lifecycle('run-1', 'cancelled')];
    expect(foldChatLog(log(records), { runs: 1 }).violations).toEqual([
      { runId: 'run-1', attempt: 1, reason: 'lifecycle row after the attempt closed: cancelled' },
    ]);
  });

  it('accepts the record of how a run ended when its settlement came first', () => {
    const records = [
      lifecycle('run-1', 'admitted'),
      lifecycle('run-1', 'running'),
      settled('run-1'),
      lifecycle('run-1', 'completed'),
    ];
    expect(foldChatLog(log(records), { runs: 1 })).toEqual({ runs: 1, violations: [] });
  });

  it('reports an attempt that settled twice', () => {
    const records = [...oneCleanRun, settled('run-1', 'turn.conflicted')];
    expect(foldChatLog(log(records), { runs: 1 }).violations).toEqual([
      { runId: 'run-1', attempt: 1, reason: 'settled 2 times, expected exactly once' },
    ]);
  });

  it('reports an attempt that never settled', () => {
    expect(foldChatLog(log(oneCleanRun.slice(0, 3)), { runs: 1 }).violations).toEqual([
      { runId: 'run-1', attempt: 1, reason: 'settled 0 times, expected exactly once' },
    ]);
  });

  it('keeps a settlement that precedes the admission a violation', () => {
    const records = [settled('run-1'), lifecycle('run-1', 'admitted'), lifecycle('run-1', 'running')];
    expect(foldChatLog(log(records), { runs: 1 }).violations).toContainEqual({
      runId: 'run-1',
      attempt: 1,
      reason: 'settled before it was admitted',
    });
  });

  it('echoes attempts per run only when the caller asked for them', () => {
    expect(foldChatLog(log(reopenedRun), { runs: 1 })).toEqual({
      runs: 1,
      violations: [],
    });
    expect(foldChatLog(log(reopenedRun), { runs: 1, attempts: [1] })).toEqual({
      runs: 1,
      attempts: [2],
      violations: [],
    });
  });
});
