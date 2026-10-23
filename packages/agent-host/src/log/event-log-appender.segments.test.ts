import { describe, expect, it } from 'vitest';

import { pendingToolCalls } from '#host/run-history.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import { foreignRunStaleMilliseconds, foreignRunStanding } from '#log/foreign-runs.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import type { ChatLogSegment } from '#log/segments.js';
import { serializeLogEvent } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';

const encoder = new TextEncoder();

const base = (leaderEpoch: string, sequence: number, recordedAt: string) =>
  ({ version: 1, leaderEpoch, sequence, recordedAt, runId: `run-${leaderEpoch}` }) as const;

const said = (row: Readonly<{ leaderEpoch: string; sequence: number; at: string; text: string }>): AgentLogEvent => ({
  ...base(row.leaderEpoch, row.sequence, row.at),
  type: 'message.appended',
  message: { id: `${row.leaderEpoch}-${String(row.sequence)}`, role: 'user', content: row.text },
});

const bytesOf = (events: readonly AgentLogEvent[]): Uint8Array<ArrayBuffer> =>
  encoder.encode(events.map((event) => serializeLogEvent(event)).join(''));

const segment = (deviceId: string, events: readonly AgentLogEvent[]): ChatLogSegment => ({
  deviceId,
  bytes: bytesOf(events),
});

/** This device's clock in these tests, unless one names another: a few minutes after the rows below. */
const clock = { now: Date.parse('2026-10-23T10:05:00.000Z') };

/** A log whose storage reads `segments` as the chat's other devices' segments, as they are when read. */
const openLog = async (own: readonly AgentLogEvent[], segments: { current: readonly ChatLogSegment[] }) => {
  const { storage } = memoryEventLogStorage(bytesOf(own));
  return createEventLogAppender({ ...storage, segments: async () => segments.current }, { now: () => clock.now });
};

const desktopTurn = [
  said({ leaderEpoch: 'epoch-desktop', sequence: 0, at: '2026-10-23T08:00:00.000Z', text: 'desktop asks' }),
  said({ leaderEpoch: 'epoch-desktop', sequence: 1, at: '2026-10-23T08:00:01.000Z', text: 'desktop again' }),
];
const phoneTurn = [
  said({ leaderEpoch: 'epoch-phone', sequence: 0, at: '2026-10-23T09:00:00.000Z', text: 'phone asks' }),
];

const ids = (messages: ReadonlyArray<{ readonly id: string }>): readonly string[] =>
  messages.map((message) => message.id);

describe('an event log with other devices’ segments (XD1)', () => {
  it('should give the history over every segment while read() stays this device’s rows', async () => {
    const log = await openLog(phoneTurn, { current: [segment('device-desktop', desktopTurn)] });

    expect(ids(await log.messages())).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0']);
    expect(await log.read()).toEqual(phoneTurn);
    expect(await log.historyIntact()).toBe(true);
  });

  it('should check an own history row against the merged history and append it to this device’s file only', async () => {
    const { storage, bytes } = memoryEventLogStorage(bytesOf(phoneTurn));
    const log = await createEventLogAppender({
      ...storage,
      segments: async () => [segment('device-desktop', desktopTurn)],
    });
    /* A retry on the phone keeps the desktop's first message: an id only the merged history holds. */
    const rewound: AgentLogEvent = {
      ...base('epoch-phone', 1, '2026-10-23T09:00:01.000Z'),
      type: 'history.rewound',
      trigger: 'retry',
      retainedMessageIds: ['epoch-desktop-0'],
    };

    await expect(log.append(rewound)).resolves.toEqual({ appended: true, endCursor: 2 });
    expect(ids(await log.messages())).toEqual(['epoch-desktop-0']);
    expect(new TextDecoder().decode(bytes())).toBe(new TextDecoder().decode(bytesOf([...phoneTurn, rewound])));
  });

  it('should count this device’s rows once when a segment repeats them', async () => {
    const log = await openLog(phoneTurn, {
      current: [segment('device-desktop', desktopTurn), segment('device-phone-former-actor', phoneTurn)],
    });

    expect(ids(await log.messages())).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0']);
  });

  it('should take what sync brought since the open only on refresh', async () => {
    const segments: { current: readonly ChatLogSegment[] } = { current: [] };
    const log = await openLog(phoneTurn, segments);
    expect(ids(await log.messages())).toEqual(['epoch-phone-0']);

    segments.current = [segment('device-desktop', desktopTurn)];
    expect(ids(await log.messages())).toEqual(['epoch-phone-0']);
    await log.refresh?.();

    expect(ids(await log.messages())).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0']);
  });

  it('should keep this device’s history and report the divergence when the segments do not fold onto it', async () => {
    /* The desktop retried later keeping a message the phone never saw: the merge cannot fold that, the phone's rows
     * alone still can. */
    const diverged = segment('device-desktop', [
      said({ leaderEpoch: 'epoch-desktop', sequence: 0, at: '2026-10-23T10:00:00.000Z', text: 'desktop asks' }),
      {
        ...base('epoch-desktop', 1, '2026-10-23T10:00:01.000Z'),
        type: 'history.rewound',
        trigger: 'retry',
        retainedMessageIds: ['epoch-desktop-0', 'unseen-message'],
      },
    ]);
    const log = await openLog(phoneTurn, { current: [diverged] });

    expect(ids(await log.messages())).toEqual(['epoch-phone-0']);
    expect(await log.historyIntact()).toBe(true);
    expect(await log.anomalies()).toContainEqual({
      kind: 'history',
      message:
        "The other devices' segments do not fold onto this device's log; the history is this device's rows alone.",
    });
  });

  describe('another device’s run in flight (XD3)', () => {
    const at = (minute: number): string => `2026-10-23T10:${String(minute).padStart(2, '0')}:00.000Z`;
    const row = (sequence: number, body: Readonly<Record<string, unknown>>): AgentLogEvent =>
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- seeded rows over a closed body union.
      ({
        version: 1,
        leaderEpoch: 'epoch-desktop-2',
        sequence,
        recordedAt: at(sequence),
        runId: 'run-desktop-2',
        ...body,
      }) as AgentLogEvent;
    /* The desktop's second run: admitted, its user turn and a tool call recorded, the tool still running. */
    const inFlight = [
      row(0, { type: 'run.lifecycle', state: 'admitted' }),
      row(1, {
        type: 'message.appended',
        message: {
          id: 'desktop-2-user',
          role: 'user',
          content: 'desktop asks again',
        },
      }),
      row(2, { type: 'run.lifecycle', state: 'running' }),
      row(3, {
        type: 'message.appended',
        message: {
          id: 'desktop-2-assistant',
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-desktop',
              name: 'edit_file',
              arguments: {},
            },
          ],
        },
      }),
    ];
    const settled = [
      ...inFlight,
      row(4, {
        type: 'message.appended',
        message: {
          id: 'desktop-2-output',
          role: 'tool-output',
          toolCallId: 'call-desktop',
          toolName: 'edit_file',
          content: 'edited',
          isError: false,
        },
      }),
      row(5, { type: 'run.lifecycle', state: 'completed' }),
    ];

    it('should leave the run out of the history until its device settles it', async () => {
      const segments = {
        current: [segment('device-desktop', [...desktopTurn, ...inFlight])],
      };
      const log = await openLog(phoneTurn, segments);

      const held = await log.messages();
      expect(ids(held)).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0']);
      /* Its open call is not this device's to close as disconnected. */
      expect(pendingToolCalls(held)).toEqual([]);

      segments.current = [segment('device-desktop', [...desktopTurn, ...settled])];
      await log.refresh?.();
      expect(ids(await log.messages())).toEqual([
        'epoch-desktop-0',
        'epoch-desktop-1',
        'epoch-phone-0',
        'desktop-2-user',
        'desktop-2-assistant',
        'desktop-2-output',
      ]);
    });

    it('should report the run, with its device and its newest row, until it settles', async () => {
      const segments = {
        current: [segment('device-desktop', [...desktopTurn, ...inFlight])],
      };
      const log = await openLog(phoneTurn, segments);

      expect(await log.foreignRuns?.()).toEqual([
        {
          deviceId: 'device-desktop',
          runId: 'run-desktop-2',
          state: 'running',
          lastRecordedAt: Date.parse(at(3)),
          tip: { leaderEpoch: 'epoch-desktop-2', sequence: 3 },
        },
      ]);

      segments.current = [segment('device-desktop', [...desktopTurn, ...settled])];
      await log.refresh?.();
      expect(await log.foreignRuns?.()).toEqual([]);
    });

    it('should not take this device’s own run, read back from a segment, for another device’s', async () => {
      const own = inFlight.slice(0, 2);
      const log = await openLog(own, {
        current: [segment('device-phone-former-actor', own)],
      });

      expect(await log.foreignRuns?.()).toEqual([]);
      expect(ids(await log.messages())).toEqual(['desktop-2-user']);
    });

    /* Its device went away mid-run: the person's turn rejoins, and nothing the run left half done does. */
    it('should take the user turn of a run gone stale into the history, without its dangling call', async () => {
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
      const log = await openLog(phoneTurn, { current: [segment('device-desktop', [...desktopTurn, ...inFlight])] });
      expect(ids(await log.messages())).not.toContain('desktop-2-user');

      /* No new row arrives; only the time passes the bound, and the next admission's refresh sees it. */
      clock.now = Date.parse(at(3)) + foreignRunStaleMilliseconds + 1;
      await log.refresh?.();
      const history = await log.messages();

      expect(ids(history)).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0', 'desktop-2-user']);
      expect(pendingToolCalls(history)).toEqual([]);
      expect(await log.historyIntact()).toBe(true);
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
    });

    /* A run dated past the bound in this device's future is out of the history and the fence alike, and both take it
     * up together once this clock comes within the bound: the history refolds then, with no new row. */
    it('should take a future-dated run into the fence and the history at the same moment', async () => {
      const future = Date.parse(at(3));
      clock.now = future - foreignRunStaleMilliseconds - 60_000;
      const log = await openLog(phoneTurn, { current: [segment('device-desktop', [...desktopTurn, ...inFlight])] });
      expect(ids(await log.messages())).toContain('desktop-2-user');

      clock.now = future - foreignRunStaleMilliseconds + 1;
      await log.refresh?.();

      expect(ids(await log.messages())).not.toContain('desktop-2-user');
      expect(foreignRunStanding({ lastRecordedAt: future }, clock.now).abandoned).toBe(false);
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
    });

    /* A segment that is there but cannot be read may hold a live run: the fence never reads that as none. */
    it('should refuse to answer the fence while the other devices’ segments cannot be read', async () => {
      const { storage } = memoryEventLogStorage(bytesOf(phoneTurn));
      let failing = true;
      const log = await createEventLogAppender({
        ...storage,
        segments: async () => {
          if (failing) {
            throw new Error('EIO: the segment could not be read');
          }
          return [];
        },
      });

      await expect(log.foreignRuns?.()).rejects.toMatchObject({ code: 'SEGMENTS_UNREADABLE' });
      failing = false;
      await log.refresh?.();
      await expect(log.foreignRuns?.()).resolves.toEqual([]);
    });

    it('should have no fence to answer where the storage has no segments', async () => {
      const { storage } = memoryEventLogStorage(bytesOf(phoneTurn));
      const log = await createEventLogAppender(storage);

      expect(log.foreignRuns).toBeUndefined();
      expect(ids(await log.messages())).toEqual(['epoch-phone-0']);
    });
  });
});
