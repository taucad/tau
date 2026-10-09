import { describe, expect, it } from 'vitest';
import { emptyChatLedger, foldChatLedger, gateRows, stampRows } from '#log/chat-ledger.js';
import { createEventLogReducer, reduceEventLog } from '#log/reducer.js';
import { parseReplayEventLogBytes } from '#log/serialization.js';
import { projectLogRow } from '#log/projection-facts.js';
import type { AgentLogEvent, JsonValue, MessageAppendedEvent } from '#log/event-types.js';

const hash = 'b'.repeat(64);

const base = (sequence: number) =>
  ({
    version: 1,
    leaderEpoch: 'epoch-file-ref',
    sequence,
    recordedAt: '2026-09-16T00:00:00.000Z',
    runId: 'run-file-ref',
  }) as const;

describe('private immutable replay identity verdicts', () => {
  const owned = (value: unknown) => {
    const row = parseReplayEventLogBytes(new TextEncoder().encode(JSON.stringify(value) + '\n')).rows[0];
    if (!row) {
      throw new Error('Expected a kept source row');
    }
    return row;
  };

  it.each(['raw', 'fact'] as const)(
    'keeps the first identity across repeated equal/conflicting collisions after %s mutation',
    (exposure) => {
      const original = {
        ...base(0),
        type: 'message.appended',
        message: { id: 'm', role: 'user', content: 'original' },
      };
      const first = owned(original);
      const reducer = createEventLogReducer();
      expect(reducer.replayOwned(first)).toEqual({ duplicate: false });
      if (first.event.type !== 'message.appended') {
        throw new Error('Expected message');
      }
      if (exposure === 'raw') {
        Reflect.set(first.event.message, 'content', 'mutated');
      } else {
        const fact = projectLogRow(first);
        if (fact.classification !== 'known' || fact.effect.type !== 'message.appended') {
          throw new Error('Expected message fact');
        }
        Reflect.set(fact.effect.message, 'content', 'mutated');
      }
      expect(reducer.replayOwned(owned(original))).toEqual({ duplicate: true });
      const conflict = { ...original, message: { ...original.message, content: 'mutated' } };
      expect(reducer.replayOwned(owned(conflict))).toMatchObject({ duplicate: false, anomaly: { kind: 'conflict' } });
      expect(reducer.replayOwned(owned(conflict))).toMatchObject({ duplicate: false, anomaly: { kind: 'conflict' } });
      expect(reducer.replayOwned(owned(original))).toEqual({ duplicate: true });
      expect(reducer.historyIntact()).toBe(true);
    },
  );

  it('normalizes known anchor extras through the existing classifier before comparing identities', () => {
    const message = { id: 'm', role: 'user', content: 'first' };
    const reducer = createEventLogReducer();
    expect(reducer.replayOwned(owned({ ...base(0), type: 'message.appended', message }))).toEqual({ duplicate: false });
    const details = {
      lane: 'start_of_turn',
      tier: 'summarization',
      tokensBefore: 10,
      tokensAfter: 5,
      cleared: 0,
      evicted: 1,
      summarizerAttempts: 1,
      summarizerUsage: null,
      futureDetail: 'carried',
      anchor: { messageId: 'm', tokens: 1, futureAnchor: 'ignored' },
    };
    const original = {
      ...base(1),
      type: 'message.envelope-replaced',
      messageId: 'm',
      replacement: { ...message, content: 'replacement' },
      details,
    };
    const first = owned(original);
    expect(first.opaque).toBe(false);
    expect(reducer.replayOwned(first)).toEqual({ duplicate: false });
    expect(
      reducer.replayOwned(
        owned({
          ...original,
          details: { ...details, anchor: { messageId: 'm', tokens: 1, futureAnchor: 'different ignored value' } },
        }),
      ),
    ).toEqual({ duplicate: true });
    expect(
      reducer.replayOwned(owned({ ...original, details: { ...details, futureDetail: 'different retained value' } })),
    ).toMatchObject({ duplicate: false, anomaly: { kind: 'conflict' } });
    expect(reducer.historyIntact()).toBe(true);
  });

  it('preserves independent opaque duplicate and conflict verdicts', () => {
    const reducer = createEventLogReducer();
    const first = { ...base(0), type: 'future.row', payload: { a: 1, b: 2 } };
    expect(reducer.replayOwned(owned(first))).toEqual({ duplicate: false });
    expect(reducer.replayOwned(owned({ ...first, payload: { b: 2, a: 1 } }))).toEqual({ duplicate: true });
    expect(reducer.replayOwned(owned({ ...first, payload: { b: 3, a: 1 } }))).toMatchObject({
      duplicate: false,
      anomaly: { kind: 'conflict' },
    });
    expect(reducer.replayOwned(owned(first))).toEqual({ duplicate: true });
  });
});

describe('eager generic identity ownership', () => {
  it('retains the checked identity when the exposed prepared row mutates before commit', () => {
    const original: MessageAppendedEvent = {
      ...base(0),
      type: 'message.appended',
      message: { id: 'm', role: 'user', content: 'original' },
    };
    const reducer = createEventLogReducer();
    const transition = reducer.prepare(original);
    if (transition.duplicate || transition.event.type !== 'message.appended') {
      throw new Error('Expected a prepared message');
    }
    Reflect.set(transition.event.message, 'content', 'mutated after check');
    transition.commit();
    expect(reducer.replay({ ...original, message: { ...original.message } })).toEqual({ duplicate: true });
    const changed: MessageAppendedEvent = {
      ...original,
      message: { ...original.message, content: 'mutated after check' },
    };
    expect(reducer.replay(changed)).toMatchObject({ duplicate: false, anomaly: { kind: 'conflict' } });
    expect(() => reducer.prepare({ ...changed, message: { ...changed.message } })).toThrow(
      're-used with different content',
    );
  });
});

describe('reduceEventLog attachments', () => {
  it('should carry a file-ref block and a legacy inline image block through replay unchanged', () => {
    const content: JsonValue[] = [
      { type: 'text', text: 'Check the bracket.' },
      { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 3 },
      {
        type: 'file-ref',
        path: `attachments/${hash}.pdf`,
        mimeType: 'application/pdf',
        byteLength: 4096,
        filename: 'bracket-spec.pdf',
      },
      { type: 'image', mimeType: 'image/jpeg', data: 'AAAA' },
    ];
    const events: readonly AgentLogEvent[] = [
      { ...base(0), type: 'message.appended', message: { id: 'user-1', role: 'user', content } },
    ];

    expect(reduceEventLog(events)).toEqual([{ id: 'user-1', role: 'user', content }]);
  });
});

describe('model.invocation-settled (CL-S12, CL-A21)', () => {
  const invocation = (sequence: number, body: Record<string, unknown>) =>
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- seeded rows over a closed body union.
    ({ ...base(sequence), ...body }) as AgentLogEvent;
  const prepared = (sequence: number, attemptId = 'attempt-1') =>
    invocation(sequence, { type: 'model.invocation-prepared', attemptId, purpose: 'generation', modelId: 'm' });
  const settled = (sequence: number, outcome = 'settled') =>
    invocation(sequence, {
      type: 'model.invocation-settled',
      attemptId: 'attempt-1',
      outcome,
      operationId: 'operation-1',
      chargedCreditAtoms: outcome === 'settled' ? '12' : '0',
    });

  it('should refuse a second invocation settlement for one attempt', () => {
    expect(() => reduceEventLog([prepared(0), settled(1), settled(2, 'released')])).toThrow(
      expect.objectContaining({ code: 'HISTORY_INVALID' }),
    );
  });

  it('should refuse an invocation settlement without a prepared attempt', () => {
    expect(() => reduceEventLog([settled(0)])).toThrow(expect.objectContaining({ code: 'HISTORY_INVALID' }));
  });

  it("should refuse a prepared row while the run's last invocation is open", () => {
    const admitted = invocation(0, { type: 'run.lifecycle', state: 'admitted' });
    const open = foldChatLedger(emptyChatLedger, [admitted, prepared(1)]);
    const next = stampRows({
      ledger: open,
      leaderEpoch: 'epoch-next',
      runId: 'run-file-ref',
      recordedAt: '2026-09-16T00:00:01.000Z',
      bodies: [{ type: 'model.invocation-prepared', attemptId: 'attempt-2', purpose: 'generation', modelId: 'm' }],
    });

    expect(gateRows(open, next)).toMatchObject({ ok: false, code: 'INVOCATION_UNRESOLVED' });
    // A zero-charge settled row resolves it, and the re-prepare lands (RV1-F4).
    const released = foldChatLedger(open, [settled(2, 'released')]);
    expect(gateRows(released, next)).toMatchObject({ ok: true });
  });
});
