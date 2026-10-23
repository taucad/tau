/**
 * XD3: a heartbeat grows one device's segment by a row every minute; its runs are folded on from the rows already
 * folded, never again from the start.
 */
import { describe, expect, it, vi } from 'vitest';

import type * as ChatLedgerModule from '#log/chat-ledger.js';
import type { AgentLogEvent } from '#log/event-types.js';

const folded = vi.hoisted(() => ({ rows: 0 }));

vi.mock('#log/chat-ledger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatLedgerModule>();
  return {
    ...actual,
    foldChatLedger: (ledger: Parameters<typeof actual.foldChatLedger>[0], rows: readonly unknown[]) => {
      folded.rows += rows.length;
      return actual.foldChatLedger(ledger, rows);
    },
  };
});

const { noteGrownRows, unsettledParsedRuns } = await import('#log/foreign-runs.js');

const row = (sequence: number, body: Record<string, unknown>): AgentLogEvent =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- seeded rows over a closed body union.
  ({
    version: 1,
    leaderEpoch: 'epoch-phone',
    sequence,
    recordedAt: new Date(Date.UTC(2026, 9, 23, 10, 0, sequence)).toISOString(),
    runId: 'run-phone',
    ...body,
  }) as AgentLogEvent;

describe('a growing segment’s runs', () => {
  it('should fold only the rows a segment appended, and answer as a whole fold would', () => {
    const prior = [
      row(0, { type: 'run.lifecycle', state: 'admitted' }),
      row(1, { type: 'run.lifecycle', state: 'running' }),
    ];
    unsettledParsedRuns([{ deviceId: 'device-phone', events: prior }]);
    folded.rows = 0;
    const grown = [...prior, row(2, { type: 'run.heartbeat' })];
    noteGrownRows(grown, prior);

    const runs = unsettledParsedRuns([{ deviceId: 'device-phone', events: grown }]);

    expect(folded.rows).toBe(1);
    expect(runs).toEqual([
      {
        deviceId: 'device-phone',
        runId: 'run-phone',
        state: 'running',
        lastRecordedAt: Date.UTC(2026, 9, 23, 10, 0, 2),
        tip: { leaderEpoch: 'epoch-phone', sequence: 2 },
      },
    ]);
  });
});
