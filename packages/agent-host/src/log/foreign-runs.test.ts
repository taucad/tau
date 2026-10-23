import { describe, expect, it } from 'vitest';

import {
  foreignRunStaleMilliseconds,
  isAbandonedForeignRun,
  liveForeignRun,
  unsettledForeignRuns,
} from '#log/foreign-runs.js';
import type { ForeignRun } from '#log/foreign-runs.js';
import { serializeLogEvent } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';

const encoder = new TextEncoder();

const lifecycle = (runId: string, sequence: number, row: Readonly<{ state: string; at: string }>): AgentLogEvent =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- seeded rows over a closed body union.
  ({
    version: 1,
    leaderEpoch: `epoch-${runId}`,
    sequence,
    recordedAt: row.at,
    runId,
    type: 'run.lifecycle',
    state: row.state,
  }) as AgentLogEvent;

const segment = (deviceId: string, events: readonly AgentLogEvent[]) => ({
  deviceId,
  bytes: encoder.encode(events.map((event) => serializeLogEvent(event)).join('')),
});

const run = (lastRecordedAt: number, runId = 'run-1'): ForeignRun => ({
  deviceId: 'device-desktop',
  runId,
  state: 'running',
  lastRecordedAt,
  tip: { leaderEpoch: `epoch-${runId}`, sequence: 1 },
});

const now = Date.parse('2026-10-23T10:00:00.000Z');

describe('the cross-device run fence (XD3)', () => {
  it('should read each segment on its own ledger and keep only runs that have not settled', () => {
    const runs = unsettledForeignRuns([
      segment('device-desktop', [
        lifecycle('run-done', 0, {
          state: 'admitted',
          at: '2026-10-23T09:00:00.000Z',
        }),
        lifecycle('run-done', 1, {
          state: 'completed',
          at: '2026-10-23T09:01:00.000Z',
        }),
        lifecycle('run-live', 0, {
          state: 'admitted',
          at: '2026-10-23T09:58:00.000Z',
        }),
        lifecycle('run-live', 1, {
          state: 'running',
          at: '2026-10-23T09:59:00.000Z',
        }),
      ]),
      segment('device-laptop', [
        lifecycle('run-admitted', 0, {
          state: 'admitted',
          at: '2026-10-23T09:30:00.000Z',
        }),
      ]),
    ]);

    expect(runs).toEqual([
      {
        deviceId: 'device-desktop',
        runId: 'run-live',
        state: 'running',
        lastRecordedAt: Date.parse('2026-10-23T09:59:00.000Z'),
        tip: { leaderEpoch: 'epoch-run-live', sequence: 1 },
      },
      {
        deviceId: 'device-laptop',
        runId: 'run-admitted',
        state: 'admitted',
        lastRecordedAt: Date.parse('2026-10-23T09:30:00.000Z'),
        tip: { leaderEpoch: 'epoch-run-admitted', sequence: 0 },
      },
    ]);
  });

  it('should hold the chat for a run whose newest row is inside the bound', () => {
    expect(isAbandonedForeignRun(run(now - foreignRunStaleMilliseconds), now)).toBe(false);
    expect(liveForeignRun([run(now - 60_000)], now)).toEqual(run(now - 60_000));
  });

  it('should treat a run with no new row past the bound as abandoned', () => {
    expect(isAbandonedForeignRun(run(now - foreignRunStaleMilliseconds - 1), now)).toBe(true);
    expect(liveForeignRun([run(now - foreignRunStaleMilliseconds - 1)], now)).toBeUndefined();
  });

  it('should hold the chat for a device whose clock runs ahead by less than the bound, and not past it', () => {
    expect(isAbandonedForeignRun(run(now + 5 * 60_000), now)).toBe(false);
    expect(isAbandonedForeignRun(run(now + foreignRunStaleMilliseconds + 1), now)).toBe(true);
  });

  it('should name the newest of several live runs', () => {
    const older = run(now - 120_000, 'run-older');
    const newer = run(now - 60_000, 'run-newer');

    expect(liveForeignRun([older, newer], now)).toBe(newer);
  });
});
