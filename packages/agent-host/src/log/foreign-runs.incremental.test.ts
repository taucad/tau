/**
 * XD3: a heartbeat grows one device's segment by a row every minute; its runs are folded on from the rows already
 * folded, never again from the start.
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

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
        observedAt: expect.any(Number) as unknown,
      },
    ]);
  });

  /*
   * Round 22, finding 2: each grown array kept the array it grew from, which kept the one before it, so a segment that
   * a heartbeat grows every minute kept every earlier copy of its rows alive, in the worker and in the page. A grown
   * array keeps only the fold of the rows it grew from, never those rows.
   */
  it('should keep no array a segment grew from alive once only its newest rows are held', async () => {
    setFlagsFromString('--expose-gc');
    const collect = runInNewContext('gc') as () => void;
    const earlier: Array<WeakRef<readonly AgentLogEvent[]>> = [];
    let rows: readonly AgentLogEvent[] = [
      row(0, { type: 'run.lifecycle', state: 'admitted' }),
      row(1, { type: 'run.lifecycle', state: 'running' }),
    ];
    for (let beat = 2; beat < 8; beat++) {
      unsettledParsedRuns([{ deviceId: 'device-phone', events: rows }]);
      earlier.push(new WeakRef(rows));
      const grown = [...rows, row(beat, { type: 'run.heartbeat' })];
      noteGrownRows(grown, rows);
      rows = grown;
    }
    folded.rows = 0;
    const runs = unsettledParsedRuns([{ deviceId: 'device-phone', events: rows }]);
    for (let round = 0; round < 5; round++) {
      // oxlint-disable-next-line no-await-in-loop -- each round lets the last one's releases run before collecting.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      collect();
    }

    expect(folded.rows).toBe(1);
    expect(runs).toMatchObject([{ runId: 'run-phone', tip: { sequence: 7 } }]);
    expect(earlier.filter((array) => array.deref() !== undefined)).toEqual([]);
    expect(rows).toHaveLength(8);
  });
});
