import { describe, expect, it, vi } from 'vitest';

import {
  foreignRunStaleMilliseconds,
  isAbandonedForeignRun,
  liveForeignRun,
  unsettledForeignRuns,
  unsettledParsedRuns,
} from '#log/foreign-runs.js';
import type { ForeignRun } from '#log/foreign-runs.js';
import { serializeLogEvent } from '#log/serialization.js';
import { abandonedTurnOf } from '#log/event-types.js';
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

const run = (observedAt: number, runId = 'run-1', lastRecordedAt = observedAt): ForeignRun => ({
  deviceId: 'device-desktop',
  runId,
  state: 'running',
  lastRecordedAt,
  tip: { leaderEpoch: `epoch-${runId}`, sequence: 1 },
  observedAt,
});

const now = Date.parse('2026-10-23T10:00:00.000Z');

describe('the cross-device run fence (XD3)', () => {
  /* A refold reads every segment again; one whose rows did not change is not folded on its ledger again. */
  it('should fold a segment’s runs once for as long as its parsed rows are the same', () => {
    const events = [lifecycle('run-live', 0, { state: 'admitted', at: '2026-10-23T09:58:00.000Z' })];
    const first = unsettledParsedRuns([{ deviceId: 'device-desktop', events }]);
    const again = unsettledParsedRuns([{ deviceId: 'device-desktop', events }]);
    const elsewhere = unsettledParsedRuns([{ deviceId: 'device-phone', events }]);

    expect(again[0]).toBe(first[0]);
    expect(elsewhere[0]).toMatchObject({ deviceId: 'device-phone' });
  });

  it('should read each segment on its own ledger and keep only runs that have not settled', () => {
    const runs = unsettledForeignRuns(
      [
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
      ],
      now,
    );

    expect(runs).toEqual([
      {
        deviceId: 'device-desktop',
        runId: 'run-live',
        state: 'running',
        lastRecordedAt: Date.parse('2026-10-23T09:59:00.000Z'),
        tip: { leaderEpoch: 'epoch-run-live', sequence: 1 },
        observedAt: now,
      },
      {
        deviceId: 'device-laptop',
        runId: 'run-admitted',
        state: 'admitted',
        lastRecordedAt: Date.parse('2026-10-23T09:30:00.000Z'),
        tip: { leaderEpoch: 'epoch-run-admitted', sequence: 0 },
        observedAt: now,
      },
    ]);
  });

  /* A paused run, or a long tool call, writes no content: its device's heartbeat is what keeps it holding the chat. */
  it('should read a paused run as live from its heartbeat alone', () => {
    const paused = [
      lifecycle('run-paused', 0, { state: 'admitted', at: '2026-10-23T09:00:00.000Z' }),
      lifecycle('run-paused', 1, { state: 'running', at: '2026-10-23T09:00:01.000Z' }),
      lifecycle('run-paused', 2, { state: 'paused', at: '2026-10-23T09:01:00.000Z' }),
    ];
    const heartbeat = {
      version: 1,
      leaderEpoch: 'epoch-run-paused',
      sequence: 3,
      recordedAt: '2026-10-23T09:59:00.000Z',
      runId: 'run-paused',
      type: 'run.heartbeat',
    } as const satisfies AgentLogEvent;
    const seenAt = now - foreignRunStaleMilliseconds - 1;
    unsettledForeignRuns([segment('device-desktop', paused)], seenAt);

    const [held] = unsettledForeignRuns([segment('device-desktop', [...paused, heartbeat])], now);

    expect(held).toMatchObject({ state: 'paused', lastRecordedAt: Date.parse(heartbeat.recordedAt), observedAt: now });
    expect(liveForeignRun(unsettledForeignRuns([segment('device-desktop', paused)], now), now)).toBeUndefined();
    expect(liveForeignRun([held!], now)).toBe(held);
  });

  it('should hold the chat for a run this device saw change inside the bound', () => {
    expect(isAbandonedForeignRun(run(now - foreignRunStaleMilliseconds), now)).toBe(false);
    expect(liveForeignRun([run(now - 60_000)], now)).toEqual(run(now - 60_000));
  });

  it('should treat a run this device has not seen change for longer than the bound as abandoned', () => {
    expect(isAbandonedForeignRun(run(now - foreignRunStaleMilliseconds - 1), now)).toBe(true);
    expect(liveForeignRun([run(now - foreignRunStaleMilliseconds - 1)], now)).toBeUndefined();
  });

  /* Round 16: one fast or corrupt clock must not decide the fence; the run's own `recordedAt` is never read for it. */
  it('should judge a run by when this device saw it change, whatever its rows’ clock says', () => {
    const day = 24 * 60 * 60 * 1000;

    expect(isAbandonedForeignRun(run(now - foreignRunStaleMilliseconds - 1, 'run-1', now + day), now)).toBe(true);
    expect(isAbandonedForeignRun(run(now - 60_000, 'run-1', now - day), now)).toBe(false);
    expect(isAbandonedForeignRun(run(now, 'run-1', now + day), now)).toBe(false);
  });

  it('should keep the time a run’s newest row was first seen, and see it anew once that row changes', () => {
    const rows = [lifecycle('run-seen', 0, { state: 'admitted', at: '2026-10-23T09:00:00.000Z' })];
    const later = [...rows, lifecycle('run-seen', 1, { state: 'running', at: '2026-10-23T09:00:01.000Z' })];

    expect(unsettledForeignRuns([segment('device-desktop', rows)], now - 5000)[0]?.observedAt).toBe(now - 5000);
    expect(unsettledForeignRuns([segment('device-desktop', rows)], now)[0]?.observedAt).toBe(now - 5000);
    expect(unsettledForeignRuns([segment('device-desktop', later)], now)[0]?.observedAt).toBe(now);
  });

  /* Round 16: a device that went on past a run says its turn; every other device then reads the run as let go. */
  it('should read a run another device said the turn of as abandoned, though its own segment still holds it open', () => {
    const open = [lifecycle('run-taken', 0, { state: 'admitted', at: '2026-10-23T09:59:00.000Z' })];
    const said = {
      version: 1,
      leaderEpoch: 'epoch-phone',
      sequence: 0,
      recordedAt: '2026-10-23T10:00:00.000Z',
      runId: 'run-taken',
      type: 'message.appended',
      message: abandonedTurnOf({ id: 'user-taken', role: 'user', content: 'taken over' }),
    } as const satisfies AgentLogEvent;

    const [alone] = unsettledForeignRuns([segment('device-desktop', open)], now);
    const [taken] = unsettledForeignRuns([segment('device-desktop', open), segment('device-phone', [said])], now);

    expect(alone).not.toHaveProperty('takenOver');
    expect(liveForeignRun([alone!], now)).toBe(alone);
    expect(taken).toMatchObject({ runId: 'run-taken', takenOver: true });
    expect(liveForeignRun([taken!], now)).toBeUndefined();
  });

  it('should name the most recently changed of several live runs', () => {
    const older = run(now - 120_000, 'run-older');
    const newer = run(now - 60_000, 'run-newer');

    expect(liveForeignRun([older, newer], now)).toBe(newer);
  });

  /*
   * Round 17: the page and the agent host's worker are two module instances on one device. Each first reads a segment
   * when it happens to, so a sighting each keeps for itself makes them disagree about the same run for up to the bound.
   * Both read the same file's modification time here, so both measure from it.
   */
  it('should measure a run from when its segment last changed on this device, whichever reader first reads it', async () => {
    const rows = [lifecycle('run-shared', 0, { state: 'admitted', at: '2026-10-23T09:00:00.000Z' })];
    const parsed = { deviceId: 'device-desktop', events: rows, receivedAt: now - foreignRunStaleMilliseconds - 1 };
    vi.resetModules();
    const page = await import('#log/foreign-runs.js');
    vi.resetModules();
    const host = await import('#log/foreign-runs.js');

    const [seenByPage] = page.unsettledParsedRuns([parsed], now - foreignRunStaleMilliseconds);
    const [seenByHost] = host.unsettledParsedRuns([parsed], now);

    expect(seenByPage?.observedAt).toBe(now - foreignRunStaleMilliseconds - 1);
    expect(seenByHost?.observedAt).toBe(now - foreignRunStaleMilliseconds - 1);
    expect(host.isAbandonedForeignRun(seenByHost!, now)).toBe(page.isAbandonedForeignRun(seenByPage!, now));
  });

  /* Round 17: a segment with no modification time falls back to first sight; a sighting read again stays the newest. */
  it('should keep a sighting that is read again when the oldest sightings go', async () => {
    vi.resetModules();
    const fresh = await import('#log/foreign-runs.js');
    const many = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        lifecycle(`run-${String(from + index)}`, 0, { state: 'admitted', at: '2026-10-23T09:00:00.000Z' }),
      );
    const read = (events: readonly AgentLogEvent[], at: number) =>
      fresh.unsettledParsedRuns([{ deviceId: 'device-desktop', events }], at);
    const first = many(0, 1);

    read(first, 1);
    read(many(1, 4095), 2);
    read(first, 3);
    read(many(4096, 1), 4);

    expect(read(first, 5)[0]?.observedAt).toBe(1);
    expect(read(many(1, 1), 6)[0]?.observedAt).toBe(6);
  });
});
