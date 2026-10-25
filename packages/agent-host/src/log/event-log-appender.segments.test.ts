import { describe, expect, it } from 'vitest';

import { openToolCalls } from '#host/run-history.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';
import { abandonedTurnOf } from '#log/event-types.js';
import { foreignClockAheadMilliseconds } from '#log/segments.js';
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

  /*
   * A row this device wrote over the merged history can name another device's message. When that segment cannot be
   * read, this device's rows alone do not fold: the history is unknown, not invalid, and the chat waits for the read.
   */
  describe('when this device’s rows build on another device’s segment', () => {
    const builtOn: readonly AgentLogEvent[] = [
      ...phoneTurn,
      {
        ...base('epoch-phone', 1, '2026-10-23T09:00:01.000Z'),
        type: 'history.rewound',
        trigger: 'retry',
        retainedMessageIds: ['epoch-desktop-0'],
      },
      said({ leaderEpoch: 'epoch-phone', sequence: 2, at: '2026-10-23T09:00:02.000Z', text: 'phone retries' }),
    ];

    it('should refuse retryably, never read an invalid history, while that segment cannot be read', async () => {
      const { storage } = memoryEventLogStorage(bytesOf(builtOn));
      const log = await createEventLogAppender({
        ...storage,
        segments: async () => {
          throw new Error('EIO: the segments could not be listed');
        },
      });

      expect(await log.historyIntact()).toBe(true);
      await expect(log.foreignRuns?.()).rejects.toMatchObject({ code: 'SEGMENTS_UNREADABLE' });
      /* Unknown, not intact: nothing may continue on this device's rows alone, inside a paused run's hold or not. */
      await expect(log.historyUnknown?.()).resolves.toBe(true);
    });

    /* A device removed from the project takes its segment with it: what this device's rows named of it is gone. */
    it('should keep the history it can and name what is missing once that segment is gone', async () => {
      const log = await openLog(builtOn, { current: [] });

      expect(await log.historyIntact()).toBe(true);
      expect(ids(await log.messages())).toEqual(['epoch-phone-2']);
      await expect(log.foreignRuns?.()).resolves.toEqual([]);
      const anomalies = await log.anomalies();
      expect(
        anomalies.some((anomaly) => anomaly.kind === 'history' && anomaly.message.includes('no segment here holds')),
      ).toBe(true);
    });

    /*
     * Round 17: the rule is the merge's, however many segments remain. One device's segment gone and another's present,
     * the names of what is gone are left out of the merge, and the rest folds with the device still there.
     */
    it('should leave out what a gone segment held while another device’s segment is still there', async () => {
      const tabletTurn = [
        said({ leaderEpoch: 'epoch-tablet', sequence: 0, at: '2026-10-23T09:30:00.000Z', text: 'tablet asks' }),
      ];
      const log = await openLog(builtOn, { current: [segment('device-tablet', tabletTurn)] });

      expect(await log.historyIntact()).toBe(true);
      expect(ids(await log.messages())).toEqual(['epoch-phone-2', 'epoch-tablet-0']);
      const anomalies = await log.anomalies();
      expect(
        anomalies.some((anomaly) => anomaly.kind === 'history' && anomaly.message.includes('no segment here holds')),
      ).toBe(true);
    });

    /* A name a segment here does hold, but only after the row that names it, is a broken history, never a gone one. */
    it('should not leave out a name that a segment here holds', async () => {
      const lateDesktop = [
        said({ leaderEpoch: 'epoch-desktop', sequence: 0, at: '2026-10-23T09:30:00.000Z', text: 'desktop asks' }),
      ];
      const log = await openLog(builtOn, { current: [segment('device-desktop', lateDesktop)] });
      await log.refresh?.();

      expect(ids(await log.messages())).not.toEqual(['epoch-phone-2', 'epoch-desktop-0']);
    });

    it('should fold the merged history again once the segment is back', async () => {
      const segments: { current: readonly ChatLogSegment[] } = { current: [] };
      const log = await openLog(builtOn, segments);

      segments.current = [segment('device-desktop', desktopTurn)];
      await log.refresh?.();

      expect(ids(await log.messages())).toEqual(['epoch-desktop-0', 'epoch-phone-2']);
      expect(await log.anomalies()).toEqual([]);
    });
  });

  /* A heartbeat appends one row to one device's segment every minute: the rows already read are neither parsed nor
   * replayed again, so the history keeps the very messages it held. */
  it('should fold only what a segment appended, keeping the history it already held', async () => {
    const segments: { current: readonly ChatLogSegment[] } = { current: [segment('device-desktop', desktopTurn)] };
    const log = await openLog(phoneTurn, segments);
    const before = await log.messages();

    segments.current = [
      segment('device-desktop', [
        ...desktopTurn,
        {
          ...base('epoch-desktop', 2, '2026-10-23T09:30:00.000Z'),
          type: 'run.heartbeat',
        },
      ]),
    ];
    await log.refresh?.();
    const after = await log.messages();

    expect(ids(after)).toEqual(ids(before));
    expect(after[0]).toBe(before[0]);
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

  /*
   * Round 16: a clock is bounded by this device's. A term dated past the bound waits out of the history, said so, and
   * the stamp this device writes by follows only what the history kept: one fast clock carries nobody's rows ahead.
   */
  describe('with another device’s clock far ahead', () => {
    const ahead = said({ leaderEpoch: 'epoch-ahead', sequence: 0, at: '2026-10-24T10:05:00.000Z', text: 'from ahead' });

    it('should leave the term out of the history and the stamp until this clock comes within the bound', async () => {
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
      const log = await openLog(phoneTurn, { current: [segment('device-desktop', [...desktopTurn, ahead])] });

      expect(ids(await log.messages())).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0']);
      expect(await log.stampAfterRead?.(clock.now)).toBe(clock.now);
      expect(await log.anomalies()).toContainEqual({
        kind: 'history',
        message: expect.stringContaining('Leader epoch "epoch-ahead" starts at 2026-10-24T10:05:00.000Z') as unknown,
      });

      clock.now = Date.parse('2026-10-24T10:05:00.000Z') - foreignClockAheadMilliseconds;
      await log.refresh?.();

      expect(ids(await log.messages())).toEqual([
        'epoch-desktop-0',
        'epoch-desktop-1',
        'epoch-phone-0',
        'epoch-ahead-0',
      ]);
      expect(await log.stampAfterRead?.(clock.now)).toBe(Date.parse('2026-10-24T10:05:00.000Z') + 1);
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
    });

    it('should stamp after the newest term start the history kept, within the bound', async () => {
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
      const near = said({ leaderEpoch: 'epoch-near', sequence: 0, at: '2026-10-23T10:09:00.000Z', text: 'near' });
      const log = await openLog(phoneTurn, { current: [segment('device-desktop', [...desktopTurn, near])] });

      expect(await log.stampAfterRead?.(clock.now)).toBe(Date.parse('2026-10-23T10:09:00.000Z') + 1);
    });

    /*
     * A run another device has not settled stays out of the history, but its rows were read all the same: a term this
     * device writes, a takeover's included, starts after it and merges after it once that device settles the run.
     */
    it('should stamp after a term within the bound that the history holds back as an unsettled run', async () => {
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
      const held: AgentLogEvent = {
        version: 1,
        leaderEpoch: 'epoch-held',
        sequence: 0,
        recordedAt: '2026-10-23T10:09:00.000Z',
        runId: 'run-held',
        type: 'run.lifecycle',
        state: 'admitted',
      };
      const log = await openLog(phoneTurn, { current: [segment('device-desktop', [...desktopTurn, held])] });

      expect(await log.foreignRuns?.()).toEqual([expect.objectContaining({ runId: 'run-held' })]);
      expect(await log.stampAfterRead?.(clock.now)).toBe(Date.parse('2026-10-23T10:09:00.000Z') + 1);
    });
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
    /* The person's turn of the desktop's run, appended here under this device's own term (`abandonedTurnOf`). */
    const takeover = (sequence: number, id: string, content: string): AgentLogEvent => ({
      version: 1,
      leaderEpoch: 'epoch-phone',
      sequence,
      recordedAt: '2026-10-23T10:30:00.000Z',
      runId: 'run-desktop-2',
      type: 'message.appended',
      message: abandonedTurnOf({ id, role: 'user', content }),
    });
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
      expect(openToolCalls(held)).toEqual([]);

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
          observedAt: clock.now,
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

    /*
     * Round 16: the history is a function of the rows, never of when they are read. A run gone stale stays out of it
     * until a row says otherwise: the device that goes on past it appends the person's turn (`abandonedTurnOf`), and
     * nothing the run left half done joins.
     */
    it('should keep a run gone stale out of the history until a device appends its person’s turn', async () => {
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
      const log = await openLog(phoneTurn, { current: [segment('device-desktop', [...desktopTurn, ...inFlight])] });
      const before = ids(await log.messages());
      expect(before).not.toContain('desktop-2-user');

      clock.now += foreignRunStaleMilliseconds + 1;
      await log.refresh?.();
      expect(ids(await log.messages())).toEqual(before);

      await log.append(takeover(1, 'desktop-2-user', 'desktop asks again'));
      const history = await log.messages();

      expect(ids(history)).toEqual(['epoch-desktop-0', 'epoch-desktop-1', 'epoch-phone-0', 'desktop-2-user']);
      expect(openToolCalls(history)).toEqual([]);
      expect(await log.foreignRuns?.()).toEqual([]);
      expect(await log.historyIntact()).toBe(true);
      clock.now = Date.parse('2026-10-23T10:05:00.000Z');
    });

    /*
     * The copy can merge before the run's own turn: here it went under this device's older term, and a device whose
     * clock ran far ahead lands its term after any takeover. Whichever merges first, the turn is one message.
     */
    it('should keep the history whole when the run’s device settles it after another device said its turn', async () => {
      const log = await openLog([...phoneTurn, takeover(1, 'desktop-2-user', 'desktop asks again')], {
        current: [segment('device-desktop', [...desktopTurn, ...settled])],
      });

      expect(ids(await log.messages())).toEqual([
        'epoch-desktop-0',
        'epoch-desktop-1',
        'epoch-phone-0',
        'desktop-2-user',
        'desktop-2-assistant',
        'desktop-2-output',
      ]);
      expect(await log.historyIntact()).toBe(true);
    });

    /*
     * A run its device admitted and then lost before it said the person's words: whichever device settles it appends
     * them as data, and every copy of them merges as one.
     */
    describe('an admitted run that never said the person’s words', () => {
      const words = { id: 'desktop-2-user', role: 'user', content: 'desktop asks again' } as const;
      const admitted = row(0, {
        type: 'run.lifecycle',
        state: 'admitted',
        admission: { kind: 'tau', turnId: 'desktop-2-user', message: words },
      });
      const failed = [
        row(1, { type: 'message.appended', message: abandonedTurnOf(words) }),
        row(2, {
          type: 'run.lifecycle',
          state: 'failed',
          detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
          executed: false,
        }),
      ];

      it('should keep its words, said by its own device as it settled, on every device', async () => {
        const settledHere = await openLog([...desktopTurn, admitted, ...failed], {
          current: [segment('device-phone', phoneTurn)],
        });
        const readElsewhere = await openLog(phoneTurn, {
          current: [segment('device-desktop', [...desktopTurn, admitted, ...failed])],
        });

        expect(ids(await settledHere.messages())).toEqual(ids(await readElsewhere.messages()));
        expect(ids(await readElsewhere.messages())).toContain('desktop-2-user');
        expect(await readElsewhere.historyIntact()).toBe(true);
      });

      it('should merge the words two devices said as one', async () => {
        const log = await openLog([...phoneTurn, takeover(1, 'desktop-2-user', 'desktop asks again')], {
          current: [segment('device-desktop', [...desktopTurn, admitted, ...failed])],
        });
        const history = ids(await log.messages());

        expect(history.filter((id) => id === 'desktop-2-user')).toHaveLength(1);
        expect(await log.historyIntact()).toBe(true);
      });
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

    /* A segment left out after the staleness bound releases the fence, and the history says why it is missing. */
    it('should answer the fence and name a segment the storage left out as unreadable', async () => {
      const { storage } = memoryEventLogStorage(bytesOf(phoneTurn));
      const log = await createEventLogAppender({
        ...storage,
        segments: async () => [{ deviceId: 'device-desktop', bytes: new Uint8Array(), unreadable: 'EISDIR' }],
      });

      await expect(log.foreignRuns?.()).resolves.toEqual([]);
      const anomalies = await log.anomalies();
      expect(
        anomalies.some((anomaly) => anomaly.kind === 'history' && /"device-desktop".*EISDIR/.test(anomaly.message)),
      ).toBe(true);
    });

    it('should have no fence to answer where the storage has no segments', async () => {
      const { storage } = memoryEventLogStorage(bytesOf(phoneTurn));
      const log = await createEventLogAppender(storage);

      expect(log.foreignRuns).toBeUndefined();
      expect(ids(await log.messages())).toEqual(['epoch-phone-0']);
    });
  });

  /*
   * Round 21, finding 3: the merge orders terms by their start, so a row this device appends under a term that began
   * before another device's later term merges before that term, not at the merge's tail. The appender kept the merged
   * fold incrementally by putting every own row at the tail, so `messages()` served a tool output after the other
   * device's turn, a stray result, until the segments next changed.
   */
  describe('a row appended under a term older than another device’s', () => {
    const ownTurn: readonly AgentLogEvent[] = [
      said({ leaderEpoch: 'epoch-own', sequence: 0, at: '2026-10-23T09:00:00.000Z', text: 'own asks' }),
      {
        ...base('epoch-own', 1, '2026-10-23T09:00:01.000Z'),
        type: 'message.appended',
        message: {
          id: 'own-call',
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-read', name: 'read_file', arguments: {} }],
          metadata: { stopReason: 'toolUse' },
        },
      },
    ];
    const laterPhoneTurn = [
      said({ leaderEpoch: 'epoch-phone', sequence: 0, at: '2026-10-23T09:30:00.000Z', text: 'phone asks' }),
    ];
    const output: AgentLogEvent = {
      ...base('epoch-own', 2, '2026-10-23T10:00:00.000Z'),
      type: 'message.appended',
      message: {
        id: 'own-output',
        role: 'tool-output',
        toolCallId: 'call-read',
        toolName: 'read_file',
        content: 'ok',
        isError: false,
      },
    };

    it('should serve the history a fresh fold of the same rows serves', async () => {
      const segments = { current: [segment('device-phone', laterPhoneTurn)] };
      const { storage, bytes } = memoryEventLogStorage(bytesOf(ownTurn));
      const log = await createEventLogAppender(
        { ...storage, segments: async () => segments.current },
        { now: () => clock.now },
      );

      await log.append(output);

      const fresh = await createEventLogAppender(
        { ...memoryEventLogStorage(bytes()).storage, segments: async () => segments.current },
        { now: () => clock.now },
      );
      expect(ids(await fresh.messages())).toEqual(['epoch-own-0', 'own-call', 'own-output', 'epoch-phone-0']);
      expect(ids(await log.messages())).toEqual(ids(await fresh.messages()));
    });
  });
});
