import { describe, expect, it } from 'vitest';

import { createEventLogAppender } from '#log/event-log-appender.js';
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

/** A log whose storage reads `segments` as the chat's other devices' segments, as they are when read. */
const openLog = async (own: readonly AgentLogEvent[], segments: { current: readonly ChatLogSegment[] }) => {
  const { storage } = memoryEventLogStorage(bytesOf(own));
  return createEventLogAppender({ ...storage, segments: async () => segments.current });
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
});
