import { describe, expect, it, vi } from 'vitest';
import { createSessionRecord } from '#harness/session-record.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import { invalidHistoryFixtures } from '#log/invalid-history.fixture.js';
import { parseLogEvent } from '#log/event-schema.js';
import { parseEventLog, serializeLogEvent } from '#log/serialization.js';
import { reduceEventLog } from '#log/reducer.js';
import type { AgentLogEvent, LogEventBase, MessageAppendedEvent, ProviderMessage } from '#log/event-types.js';

const base = (sequence: number): LogEventBase => ({
  version: 1,
  leaderEpoch: 'epoch-a',
  sequence,
  recordedAt: '2026-08-31T00:00:00.000Z',
  runId: 'run-a',
});

const messageFor = (index: number): ProviderMessage => {
  const role = index % 4;
  if (role === 0) {
    return { id: `message-${index}`, role: 'user', content: { index } };
  }
  if (role === 1) {
    return { id: `message-${index}`, role: 'assistant', content: [{ type: 'text', text: `${index}` }] };
  }
  if (role === 2) {
    return {
      id: `message-${index}`,
      role: 'tool-input',
      toolCallId: `call-${index}`,
      toolName: 'inspect',
      content: { index },
    };
  }
  return {
    id: `message-${index}`,
    role: 'tool-output',
    toolCallId: `call-${index - 1}`,
    toolName: 'inspect',
    content: { index },
    isError: false,
  };
};

const appendEvents = (count: number): MessageAppendedEvent[] =>
  Array.from({ length: count }, (_, sequence) => ({
    ...base(sequence),
    type: 'message.appended',
    message: messageFor(sequence),
  }));

describe('event-log reducer properties', () => {
  it('records storage durability and rejects malformed typed provider metadata at the boundary', () => {
    expect(
      parseLogEvent({ ...base(0), type: 'run.lifecycle', state: 'admitted', storageDurability: 'ephemeral' }),
    ).toMatchObject({ storageDurability: 'ephemeral' });
    expect(() =>
      parseLogEvent({
        ...base(0),
        type: 'message.appended',
        message: {
          id: 'assistant-1',
          role: 'assistant',
          content: 'done',
          metadata: { usage: { input: 'not-a-number', output: 1 } },
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'EVENT_INVALID' }));
  });

  it.each([1, 2, 8, 32])('replays %i append-only messages identically', (count) => {
    const events = appendEvents(count);
    const serialized = events.map((event) => serializeLogEvent(event)).join('');

    expect(reduceEventLog(parseEventLog(serialized))).toEqual(events.map((event) => event.message));
  });

  it('makes an exact leader-epoch re-append idempotent', () => {
    const [first, second] = appendEvents(2);
    expect(reduceEventLog([first!, first!, second!, first!])).toEqual([first!.message, second!.message]);
  });

  it('discards only a torn final line', () => {
    const events = appendEvents(2);
    const text = events.map((event) => serializeLogEvent(event)).join('');

    expect(parseEventLog(`${text}{"version":1`)).toEqual(events);
    expect(() => parseEventLog(`${text}not-json\n`)).toThrow(
      expect.objectContaining({ name: 'EventLogError', code: 'LINE_INVALID' }),
    );
    expect(() => parseEventLog(`${serializeLogEvent(events[0]!)}not-json\n${serializeLogEvent(events[1]!)}`)).toThrow();
  });

  it('keeps a committed projection prefix byte-stable', () => {
    const events = appendEvents(3);
    const projected: ProviderMessage = { id: 'message-3', role: 'user', content: 'next turn' };
    const projection: AgentLogEvent = {
      ...base(3),
      type: 'turn.history-projection-committed',
      runId: 'run-b',
      retainedMessageIds: [events[0]!.message.id],
      message: projected,
      context: { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] },
    };

    const messages = reduceEventLog([...events, projection]);
    expect(messages).toEqual([events[0]!.message, projected]);
    expect(JSON.stringify(messages[0])).toBe(JSON.stringify(events[0]!.message));
  });

  it('applies replacement, snapshot refresh, and compaction without reordering survivors', () => {
    const [user, tool, assistant] = appendEvents(3);
    const replacement = { ...tool!.message, content: { persistedAt: '.tau/tool-output.txt' } };
    const summary: ProviderMessage = { id: 'summary-1', role: 'user', content: 'summary' };
    const events: AgentLogEvent[] = [
      user!,
      tool!,
      assistant!,
      { ...base(3), type: 'message.envelope-replaced', messageId: tool!.message.id, replacement },
      {
        ...base(4),
        type: 'snapshot-context.refreshed',
        messageId: user!.message.id,
        content: 'fresh snapshot',
      },
      {
        ...base(5),
        type: 'history.compacted',
        evictedMessageIds: [user!.message.id, tool!.message.id],
        summary,
      },
    ];

    expect(reduceEventLog(events)).toEqual([summary, assistant!.message]);
  });

  it('keeps safeguard, interrupt, and lifecycle records out of provider history', () => {
    const [message] = appendEvents(1);
    const events: AgentLogEvent[] = [
      message!,
      { ...base(1), type: 'safeguard.recorded', safeguardId: 'guard-1', action: 'terminate', reason: 'loop' },
      {
        ...base(2),
        type: 'interrupt.recorded',
        interruptId: 'interrupt-1',
        phase: 'requested',
        reason: 'approval',
        payload: { tool: 'inspect' },
      },
      { ...base(3), type: 'run.lifecycle', state: 'paused' },
    ];

    expect(reduceEventLog(events)).toEqual([message!.message]);
  });

  it('records an explicit rewind and reduces to its unchanged history prefix', () => {
    const events = appendEvents(4);
    const rewind: AgentLogEvent = {
      ...base(4),
      type: 'history.rewound',
      runId: 'run-retry',
      trigger: 'retry',
      retainedMessageIds: events.slice(0, 2).map((event) => event.message.id),
    };

    expect(reduceEventLog([...events, rewind])).toEqual(events.slice(0, 2).map((event) => event.message));
  });

  it.each(invalidHistoryFixtures)('fails closed for $name', ({ events }) => {
    expect(() => reduceEventLog(events)).toThrow();
  });
});

describe('event-log appender durability', () => {
  it.each([
    ['invalid JSON', new TextEncoder().encode('not-json\n')],
    ['invalid schema', new TextEncoder().encode('{"version":1}\n')],
    ['invalid UTF-8', new Uint8Array([0xff, 0x0a])],
  ])('should fail closed without truncating a terminated %s record', async (_name, initialBytes) => {
    let bytes = new Uint8Array(initialBytes);
    const truncate = vi.fn(async (size: number) => {
      bytes = bytes.slice(0, size);
    });
    const storage: EventLogStorage = {
      read: async () => bytes,
      append: async () => undefined,
      truncate,
      close: async () => undefined,
    };

    await expect(createEventLogAppender(storage)).rejects.toMatchObject({
      name: 'EventLogError',
      code: 'LINE_INVALID',
    });
    expect(truncate).not.toHaveBeenCalled();
    expect(bytes).toEqual(initialBytes);
  });

  it('should roll back a partial append and remain usable when truncation succeeds', async () => {
    let bytes = new Uint8Array(new ArrayBuffer(0));
    let failNextAppend = true;
    const storage: EventLogStorage = {
      read: async () => bytes,
      append: async (next) => {
        if (failNextAppend) {
          failNextAppend = false;
          bytes = next.slice(0, Math.floor(next.byteLength / 2));
          throw new Error('injected partial write');
        }
        bytes = new Uint8Array(next);
      },
      truncate: async (size) => {
        bytes = bytes.slice(0, size);
      },
      close: async () => undefined,
    };
    const log = await createEventLogAppender(storage);

    await expect(log.append(appendEvents(1)[0]!)).rejects.toThrow('injected partial write');
    expect(bytes).toHaveLength(0);
    await expect(log.append(appendEvents(1)[0]!)).resolves.toEqual({ appended: true });
    expect(parseEventLog(new TextDecoder().decode(bytes))).toEqual(appendEvents(1));
    await log.close();
  });

  it('should poison the appender when a failed append cannot be rolled back', async () => {
    let bytes = new Uint8Array(new ArrayBuffer(0));
    const storage: EventLogStorage = {
      read: async () => bytes,
      append: async (next) => {
        bytes = next.slice(0, 1);
        throw new Error('injected partial write');
      },
      truncate: async () => {
        throw new Error('injected rollback failure');
      },
      close: async () => undefined,
    };
    const log = await createEventLogAppender(storage);

    await expect(log.append(appendEvents(1)[0]!)).rejects.toMatchObject({
      name: 'EventLogError',
      code: 'LOG_POISONED',
    });
    await expect(log.read()).rejects.toMatchObject({ name: 'EventLogError', code: 'LOG_POISONED' });
    await log.close();
  });

  it('should reject an invalid reducer transition before writing it', async () => {
    const append = vi.fn(async () => undefined);
    const storage: EventLogStorage = {
      read: async () => new Uint8Array(new ArrayBuffer(0)),
      append,
      truncate: async () => undefined,
      close: async () => undefined,
    };
    const log = await createEventLogAppender(storage);
    await log.append(appendEvents(1)[0]!);
    append.mockClear();

    await expect(
      log.append({
        ...base(1),
        type: 'message.envelope-replaced',
        messageId: 'missing-message',
        replacement: { id: 'missing-message', role: 'user', content: 'replacement' },
      }),
    ).rejects.toMatchObject({ name: 'EventLogError', code: 'HISTORY_INVALID' });
    expect(append).not.toHaveBeenCalled();
    await log.close();
  });

  it('should serialize concurrent session cursor allocation with its physical append', async () => {
    let bytes = new Uint8Array(new ArrayBuffer(0));
    const storage: EventLogStorage = {
      read: async () => bytes,
      append: async (next) => {
        const combined = new Uint8Array(bytes.byteLength + next.byteLength);
        combined.set(bytes);
        combined.set(next, bytes.byteLength);
        bytes = combined;
      },
      truncate: async (size) => {
        bytes = bytes.slice(0, size);
      },
      close: async () => undefined,
    };
    const log = await createEventLogAppender(storage);
    const record = await createSessionRecord({
      log,
      runId: 'run-concurrent',
      leaderEpoch: 'epoch-concurrent',
      now: () => '2026-09-01T00:00:00.000Z',
    });

    await Promise.all([
      record.append({
        type: 'message.appended',
        message: { id: 'concurrent-1', role: 'user', content: 'first' },
      }),
      record.append({
        type: 'message.appended',
        message: { id: 'concurrent-2', role: 'user', content: 'second' },
      }),
    ]);

    expect(await record.history()).toEqual([
      { id: 'concurrent-1', role: 'user', content: 'first' },
      { id: 'concurrent-2', role: 'user', content: 'second' },
    ]);
    const events = await record.events();
    expect(events.map((event) => event.sequence)).toEqual([0, 1]);
    await log.close();
  });

  it('reads replay through bounded cursor batches without returning the full log', async () => {
    const storage: EventLogStorage = {
      read: async () => new Uint8Array(new ArrayBuffer(0)),
      append: async () => undefined,
      truncate: async () => undefined,
      close: async () => undefined,
    };
    const log = await createEventLogAppender(storage);
    for (const event of appendEvents(5)) {
      // oxlint-disable-next-line no-await-in-loop -- the fixture preserves physical append order.
      await log.append(event);
    }

    await expect(log.readBatch({ cursor: 1, limit: 2 })).resolves.toEqual({
      cursor: 1,
      nextCursor: 3,
      endCursor: 5,
      events: appendEvents(5).slice(1, 3),
    });
    await log.close();
  });
});
