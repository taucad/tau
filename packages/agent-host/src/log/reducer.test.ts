import { describe, expect, it } from 'vitest';
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
      { ...base(1), type: 'message.appended', message: { id: 'user-1', role: 'user', content } },
    ];

    expect(reduceEventLog(events)).toEqual([{ id: 'user-1', role: 'user', content }]);
  });
});
