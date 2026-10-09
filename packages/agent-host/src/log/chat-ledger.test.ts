import { describe, expect, it } from 'vitest';
import {
  emptyChatLedger,
  foldChatLedger,
  foldReadAnswer,
  gateRows,
  replayedStartOutcome,
  stampRows,
} from '#log/chat-ledger.js';
import type { ChatLedger, LogRowBody } from '#log/chat-ledger.js';
import type { AgentLogEvent } from '#log/event-types.js';

/** Rows of one term, `e01` with epoch 1, numbered from 0 in order. */
const term = (bodies: ReadonlyArray<Record<string, unknown>>, leaderEpoch = 'e01', epoch = 1): AgentLogEvent[] =>
  bodies.map(
    (body, sequence) =>
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- seeded rows over a closed body union.
      ({
        version: 1,
        leaderEpoch,
        epoch,
        sequence,
        recordedAt: '2026-09-26T00:00:00.000Z',
        runId: 'run-1',
        ...body,
      }) as AgentLogEvent,
  );

const life = (state: string, extra: Record<string, unknown> = {}) => ({ type: 'run.lifecycle', state, ...extra });
const failed = (code: string) => life('failed', { detail: { message: code, code } });
const settled = (reason: string, extra: Record<string, unknown> = {}) => ({
  type: 'turn.failed',
  turnId: 'turn-1',
  chatId: 'chat-1',
  reason,
  ...extra,
});
const committed = {
  type: 'turn.history-projection-committed',
  retainedMessageIds: [],
  message: { id: 'turn-1', role: 'user', content: 'Hello.' },
  context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
};

const batch = (cursor: number, events: readonly AgentLogEvent[], endCursor = cursor + events.length) =>
  ({ status: 'batch', cursor, nextCursor: cursor + events.length, endCursor, events }) as const;

describe('turn change proof', () => {
  it('should retain proof by attempt without changing lifecycle or transcript', () => {
    const rows = term([
      life('admitted'),
      committed,
      life('running', { attempt: 1 }),
      { type: 'turn.changed', turnId: 'turn-1', chatId: 'chat-1', attempt: 1, checkoutId: 'live' },
      failed('RUN_ABANDONED'),
      life('running', { attempt: 2 }),
    ]);
    const ledger = foldChatLedger(emptyChatLedger, rows);
    expect(ledger.runs['run-1']).toMatchObject({
      attempt: 2,
      lifecycle: 'running',
      changes: { 1: { checkoutId: 'live' } },
    });
    const stamped = stampRows({
      ledger,
      leaderEpoch: 'e01',
      recordedAt: 'now',
      runId: 'run-1',
      bodies: [{ type: 'turn.changed', turnId: 'turn-1', chatId: 'chat-1', attempt: 1, checkoutId: 'live' }],
    });
    expect(stamped[0]?.attempt).toBe(1);
    expect(foldChatLedger(ledger, stamped).runs['run-1']?.changes?.[2]).toBeUndefined();
  });

  it('should refuse proof for another turn or a future attempt', () => {
    const ledger = foldChatLedger(emptyChatLedger, term([life('admitted'), committed, life('running')]));
    for (const [turnId, attempt] of [
      ['foreign', 1],
      ['turn-1', 2],
    ] as const) {
      expect(
        gateRows(
          ledger,
          term([{ type: 'turn.changed', turnId, chatId: 'chat-1', attempt, checkoutId: 'live' }], 'proof', 2),
        ),
      ).toMatchObject({ ok: false, code: 'TURN_CHANGE_UNPLACED' });
    }
  });
});

describe('foldReadAnswer', () => {
  const rows = term([life('admitted'), life('running'), life('completed')]);
  const read = foldChatLedger(emptyChatLedger, rows);

  it('keeps semantic ordering across a duplicate while advancing physical command positions', () => {
    const first = term(
      [
        { type: 'snapshot-context.refreshed', messageId: 'm', content: [] },
        { type: 'snapshot-context.refreshed', messageId: 'm', content: [], commandId: 'after-duplicate' },
      ],
      'first',
      1,
    );
    const second = term([{ type: 'snapshot-context.refreshed', messageId: 'm', content: [] }], 'second', 2);
    const physical = [first[0]!, second[0]!, first[0]!, first[1]!];

    const folded = foldReadAnswer(emptyChatLedger, batch(0, physical));

    expect(folded.kind).toBe('folded');
    if (folded.kind !== 'folded') {
      throw new Error('Expected an aligned physical batch');
    }
    expect(folded.ledger.anomalies).toEqual(foldChatLedger(emptyChatLedger, physical).anomalies);
    expect(folded.ledger.anomalies).toContainEqual({ kind: 'order', row: { leaderEpoch: 'first', sequence: 1 } });
    expect(folded.ledger.position).toEqual({ cursor: 4, last: { leaderEpoch: 'first', sequence: 1 } });
    expect(folded.ledger.applied['after-duplicate']?.cursor).toBe(3);

    const endingAtDuplicate = foldReadAnswer(emptyChatLedger, batch(0, physical.slice(0, 3)));
    expect(endingAtDuplicate).toMatchObject({
      kind: 'folded',
      ledger: { position: { cursor: 3, last: { leaderEpoch: 'first', sequence: 0 } } },
    });
  });

  it('keeps a closed semantic term closed when a duplicate ends the previous physical page', () => {
    const first = term(
      [
        { type: 'snapshot-context.refreshed', messageId: 'm', content: [] },
        { type: 'snapshot-context.refreshed', messageId: 'm', content: [], commandId: 'after-duplicate' },
      ],
      'first',
      1,
    );
    const second = term([{ type: 'snapshot-context.refreshed', messageId: 'm', content: [] }], 'second', 2);
    const prefix = foldReadAnswer(emptyChatLedger, batch(0, [first[0]!, second[0]!, first[0]!], 4));
    if (prefix.kind !== 'folded') {
      throw new Error('Expected an aligned prefix');
    }
    expect(prefix.ledger.position).toEqual({ cursor: 3, last: { leaderEpoch: 'first', sequence: 0 } });

    const suffix = foldReadAnswer(prefix.ledger, batch(3, [first[1]!]));
    expect(suffix).toMatchObject({
      kind: 'folded',
      ledger: {
        position: { cursor: 4, last: { leaderEpoch: 'first', sequence: 1 } },
        anomalies: [{ kind: 'order', row: { leaderEpoch: 'first', sequence: 1 } }],
        applied: { 'after-duplicate': { cursor: 3 } },
      },
    });
  });

  // CL-A4, T5
  it('should report a clamped read from a v1 server', () => {
    // A v1 server whose log holds one row answers a cursor of 3 at its end: 1, not 3.
    expect(foldReadAnswer(read, batch(1, [], 1))).toEqual({ kind: 'reset', reason: 'clamped' });
  });

  it('should reset on an identity mismatch', () => {
    expect(foldReadAnswer(read, { status: 'refused', reason: 'identity-mismatch' })).toEqual({
      kind: 'reset',
      reason: 'identity-mismatch',
    });
    expect(foldReadAnswer(read, { status: 'refused', reason: 'cursor-ahead' })).toEqual({
      kind: 'reset',
      reason: 'cursor-ahead',
    });
    expect(foldReadAnswer(read, { status: 'refused', reason: 'owner-fenced' })).toEqual({
      kind: 'refused',
      reason: 'owner-fenced',
    });
  });

  it('should discard a batch that does not start at the reader cursor as stale', () => {
    expect(foldReadAnswer(read, batch(1, rows.slice(1)))).toEqual({ kind: 'stale' });
    expect(foldReadAnswer(emptyChatLedger, batch(0, rows))).toMatchObject({ kind: 'folded' });
  });
});

describe('foldChatLedger', () => {
  // CL-A5, T6, I5
  it('should fold identically under any chunking and skip redelivered rows', () => {
    const rows = term([
      life('admitted'),
      committed,
      life('running'),
      failed('RATE_LIMITED'),
      settled('first'),
      life('running'),
      life('completed'),
      settled('second'),
    ]);
    const whole = foldChatLedger(emptyChatLedger, rows);

    for (let size = 1; size <= rows.length; size++) {
      let chunked: ChatLedger = emptyChatLedger;
      for (let at = 0; at < rows.length; at += size) {
        const answer = foldReadAnswer(chunked, batch(at, rows.slice(at, at + size), rows.length));
        expect(answer.kind).toBe('folded');
        chunked = answer.kind === 'folded' ? answer.ledger : chunked;
      }
      expect(chunked).toEqual(whole);
    }
    // S5 D7: a redelivered prefix changes nothing.
    expect(foldChatLedger(whole, rows.slice(2, 6))).toBe(whole);
  });

  // CL-A6, T4, I10
  it('should reopen only an attempt that failed resumably', () => {
    const resumable = foldChatLedger(
      emptyChatLedger,
      term([life('admitted'), life('running'), failed('RATE_LIMITED'), settled('first'), life('running')]),
    );
    const fatal = foldChatLedger(
      emptyChatLedger,
      term([life('admitted'), life('running'), failed('FATAL_TEST'), settled('first')]),
    );

    const unsettled = foldChatLedger(
      emptyChatLedger,
      term([life('admitted'), life('running'), failed('RATE_LIMITED'), life('running')]),
    );

    expect(resumable.runs['run-1']).toMatchObject({ attempt: 2, lifecycle: 'running', appendState: 'open' });
    // W7.r1 finding 1 (ChatRunSlot.tla:327, Att(T)+1): a resume without placement opens attempt 2 as well, so a stale
    // driver of attempt 1 can never pass for the resumed one.
    expect(unsettled.runs['run-1']).toMatchObject({ attempt: 2, lifecycle: 'running' });
    // S5 D2: the gate refuses the reopening row of a fatal failure, and a second settlement of attempt 1.
    const reopen = stampRows({
      ledger: fatal,
      leaderEpoch: 'e02',
      runId: 'run-1',
      recordedAt: '2026-09-26T00:00:01.000Z',
      bodies: [{ type: 'run.lifecycle', state: 'running' }],
    });
    expect(gateRows(fatal, reopen)).toMatchObject({ ok: false, code: 'RUN_ID_TAKEN' });
    const second = stampRows({
      ledger: fatal,
      leaderEpoch: 'e02',
      runId: 'run-1',
      recordedAt: '2026-09-26T00:00:01.000Z',
      bodies: [settled('second') as LogRowBody],
    });
    expect(gateRows(fatal, second)).toMatchObject({ ok: false, code: 'SETTLEMENT_CONFLICT' });
  });

  it('should keep a settlement recorded before the running row', () => {
    // S5 D3: a settlement that lands while the attempt runs survives the attempt's own `running` row.
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([life('admitted'), settled('early'), life('running'), life('completed')]),
    );

    expect(ledger.runs['run-1']).toMatchObject({ attempt: 1, appendState: 'settled' });
    expect(ledger.runs['run-1']?.settlements).toHaveLength(1);
  });

  // CL-A7, L2a D6
  it('should answer recover for an admitted run with no commit', () => {
    const admitted = foldChatLedger(emptyChatLedger, term([life('admitted')]));
    const running = foldChatLedger(emptyChatLedger, term([life('admitted'), committed, life('running')]));
    const ended = foldChatLedger(emptyChatLedger, term([life('admitted'), committed, life('completed')]));

    expect(replayedStartOutcome(admitted, 'run-1')).toBe('recover');
    expect(replayedStartOutcome(running, 'run-1')).toBe('resume');
    expect(replayedStartOutcome(ended, 'run-1')).toBe('settled');
    expect(replayedStartOutcome(ended, 'run-2')).toBe('admit');
  });

  // CL-A20
  it('should survive a JSON round trip unchanged', () => {
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([
        life('admitted'),
        committed,
        life('running', { placement: { checkoutId: 'checkout-1', mode: 'direct' } }),
        { type: 'model.invocation-prepared', attemptId: 'attempt-1', purpose: 'generation', modelId: 'm' },
        { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'requested', reason: 'ask' },
        failed('RATE_LIMITED'),
        settled('first', { commandId: 'command-1' }),
        { type: 'future.fact', note: 'opaque' },
      ]),
    );

    // The ledger must survive a JSON round trip, which `structuredClone` does not test.
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- The JSON round trip is the property under test.
    expect(JSON.parse(JSON.stringify(ledger))).toEqual(ledger);
  });

  // CL-A21
  it('should close an open invocation on its settled row', () => {
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([
        life('admitted'),
        { type: 'model.invocation-prepared', attemptId: 'attempt-1', purpose: 'generation', modelId: 'm' },
        {
          type: 'model.invocation-settled',
          attemptId: 'attempt-1',
          outcome: 'released',
          operationId: 'operation-1',
          chargedCreditAtoms: '0',
        },
      ]),
    );

    expect(ledger.runs['run-1']?.openInvocation).toBeUndefined();
    expect(ledger.invocations['attempt-1']?.settled).toMatchObject({ outcome: 'released', chargedCreditAtoms: '0' });
  });

  it('should not count a failure message as a shown reply', () => {
    const reply = (stopReason: string) => ({
      type: 'message.appended',
      message: {
        id: `reply-${stopReason}`,
        role: 'assistant',
        content: 'x',
        metadata: { stopReason, tauInternal: { kind: 'billing-invocation', attemptId: 'attempt-1' } },
      },
    });
    const prepared = { type: 'model.invocation-prepared', attemptId: 'attempt-1', purpose: 'generation', modelId: 'm' };
    const failedReply = foldChatLedger(emptyChatLedger, term([life('admitted'), prepared, reply('error')]));
    const shownReply = foldChatLedger(emptyChatLedger, term([life('admitted'), prepared, reply('stop')]));

    expect(failedReply.invocations['attempt-1']?.shown).toBe(false);
    expect(failedReply.runs['run-1']?.openInvocation).toBe('attempt-1');
    expect(shownReply.invocations['attempt-1']?.shown).toBe(true);
    expect(shownReply.runs['run-1']?.openInvocation).toBeUndefined();
  });

  // CL-A22
  it('should close an interrupt on a resolved row whatever its payload', () => {
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([
        life('admitted'),
        { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'requested', reason: 'ask' },
        { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'resolved', reason: 'answered', payload: 7 },
      ]),
    );

    expect(ledger.runs['run-1']?.pendingInterrupts).toEqual({});
    expect(ledger.runs['run-1']?.lastResolution).toBeUndefined();
  });

  it('should refuse a second resolution of one interrupt', () => {
    const rows = term([
      life('admitted'),
      { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'requested', reason: 'ask' },
      { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'resolved', reason: 'approved' },
      { type: 'interrupt.recorded', interruptId: 'interrupt-2', phase: 'requested', reason: 'ask' },
      { type: 'interrupt.recorded', interruptId: 'interrupt-2', phase: 'resolved', reason: 'approved' },
      { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'resolved', reason: 'denied' },
    ]);
    expect(gateRows(emptyChatLedger, rows)).toMatchObject({ ok: false, code: 'INTERRUPT_ALREADY_RESOLVED', row: 5 });
  });

  // CL-A23
  it('should take the placement of record from the running row of attempt 1', () => {
    const placement = (checkoutId: string) => ({ placement: { checkoutId, mode: 'candidate' } });
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([
        life('admitted'),
        life('running', placement('first')),
        life('paused'),
        life('running', placement('second')),
        failed('RATE_LIMITED'),
        settled('first'),
        life('running', placement('third')),
      ]),
    );

    expect(ledger.runs['run-1']).toMatchObject({ attempt: 3, placement: { checkoutId: 'first' } });
  });

  it('should read a settlement without attempt as the attempt its position implies', () => {
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([
        life('admitted'),
        life('running'),
        failed('RATE_LIMITED'),
        settled('first'),
        life('running'),
        life('completed'),
        settled('second'),
      ]),
    );

    expect(ledger.runs['run-1']?.settlements.map((settlement) => settlement.attempt)).toEqual([1, 2]);
  });

  it('should key pending interrupts and the last terminal row by row', () => {
    const ledger = foldChatLedger(
      emptyChatLedger,
      term([
        life('admitted'),
        { type: 'interrupt.recorded', interruptId: 'interrupt-1', phase: 'requested', reason: 'ask' },
        life('cancelled'),
      ]),
    );

    expect(ledger.runs['run-1']?.pendingInterrupts).toEqual({ 'interrupt-1': { leaderEpoch: 'e01', sequence: 1 } });
    expect(ledger.lastTerminal).toEqual({
      runId: 'run-1',
      outcome: 'cancelled',
      row: { leaderEpoch: 'e01', sequence: 2 },
    });
  });
});

// EQ1, RV1-F3: no re-prepare while any generation invocation of the run is unresolved. A compaction's own
// invocation closes on `history.compacted`, but the generation it interrupted stays open (seed
// prepare-compaction-while-open).
describe('gateRows invocations', () => {
  const prepared = (attemptId: string, purpose: 'generation' | 'compaction') => ({
    type: 'model.invocation-prepared',
    attemptId,
    purpose,
    modelId: 'm',
  });
  const compacted = {
    type: 'history.compacted',
    evictedMessageIds: ['m0'],
    summary: { id: 's1', role: 'user', content: 'summary' },
  };

  it('should refuse a generation prepare while an earlier generation of the run is unresolved', () => {
    const rows = term([
      life('admitted'),
      life('running'),
      prepared('run-1:1:1', 'generation'),
      prepared('run-1:1:2', 'compaction'),
      compacted,
      prepared('run-1:1:3', 'generation'),
    ]);
    const open = foldChatLedger(emptyChatLedger, rows.slice(0, 5));

    expect(gateRows(open, rows.slice(5))).toMatchObject({ ok: false, code: 'INVOCATION_UNRESOLVED' });
  });
});

describe('intentional cancellation retention', () => {
  it('should reopen a committed USER_STOPPED cancellation and retire its marker', () => {
    const rows = term([
      life('admitted'),
      life('running'),
      committed,
      life('cancelled', { detail: { code: 'USER_STOPPED', message: 'Stopped.' } }),
      settled('stop'),
      life('running'),
    ]);
    const ledger = foldChatLedger(emptyChatLedger, rows);
    expect(ledger.runs['run-1']).toMatchObject({ attempt: 2, lifecycle: 'running', appendState: 'open' });
    expect(ledger.runs['run-1']?.failure).toBeUndefined();
  });
});
