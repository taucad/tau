import { describe, expect, it } from 'vitest';
import { emptyChatLedger, foldChatLedger, gateRows, stampRows } from '#log/chat-ledger.js';
import { reduceEventLog } from '#log/reducer.js';
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';

const hash = 'b'.repeat(64);

const base = (sequence: number) =>
  ({
    version: 1,
    leaderEpoch: 'epoch-file-ref',
    sequence,
    recordedAt: '2026-09-16T00:00:00.000Z',
    runId: 'run-file-ref',
  }) as const;

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
