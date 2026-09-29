import { describe, expect, it, vi } from 'vitest';
import { createSessionRecord } from '#harness/session-record.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import { memoryEventLogStorage, withLength } from '#log/event-log-storage.fixture.js';
import type { BareEventLogStorage } from '#log/event-log-storage.fixture.js';
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

/** A lifecycle row of run `run-a`: `admitted` at 0, `running` after. */
const lifecycleRow = (sequence: number): AgentLogEvent => ({
  ...base(sequence),
  type: 'run.lifecycle',
  state: sequence === 0 ? 'admitted' : 'running',
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

  it('requires preparation and rejects conflicting operation bindings', () => {
    const prepared: AgentLogEvent = {
      ...base(0),
      type: 'model.invocation-prepared',
      attemptId: 'attempt-1',
      purpose: 'generation',
      modelId: 'model-1',
    };
    const bound: AgentLogEvent = {
      ...base(1),
      type: 'model.invocation-bound',
      attemptId: 'attempt-1',
      operationId: 'operation-1',
      status: 'pending',
    };
    expect(reduceEventLog([prepared, bound])).toEqual([]);
    expect(() => reduceEventLog([{ ...bound, sequence: 0 }])).toThrow('must be prepared before binding');
    expect(() =>
      reduceEventLog([prepared, bound, { ...bound, sequence: 2, operationId: 'operation-2', status: 'terminal' }]),
    ).toThrow('cannot bind to two operations');
  });

  it('discards only a torn final line', () => {
    const events = appendEvents(2);
    const text = events.map((event) => serializeLogEvent(event)).join('');

    expect(parseEventLog(`${text}{"version":1`)).toEqual(events);
  });

  // CL-A2: a terminated line with no row envelope is quarantined wherever it is; the rows around it stay readable.
  it('should quarantine an invalid line in the middle of a log and keep the rows around it', () => {
    const events = appendEvents(2);

    expect(parseEventLog(`${events.map((event) => serializeLogEvent(event)).join('')}not-json\n`)).toEqual(events);
    expect(parseEventLog(`${serializeLogEvent(events[0]!)}not-json\n${serializeLogEvent(events[1]!)}`)).toEqual(events);
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
  // CL-A8, T9: the torn-tail repair truncates only the torn bytes it read; a same-length write by another writer is
  // not a torn tail, so the stale writer is fenced and the other writer's bytes survive.
  it('should fence a stale writer whose torn tail another writer replaced with bytes of the same length', async () => {
    const encoder = new TextEncoder();
    const row = `${serializeLogEvent(appendEvents(1)[0]!)}`;
    const torn = '{"version":';
    const file = memoryEventLogStorage(encoder.encode(`${row}${torn}`));
    const stale = await createEventLogAppender(file.storage);

    // Another writer repairs the tail and writes a line exactly as long as the torn bytes.
    const other = encoder.encode(`${'x'.repeat(torn.length - 1)}\n`);
    await file.storage.truncate(encoder.encode(row).byteLength);
    await file.storage.append(other);

    await expect(stale.append({ ...base(1), type: 'message.appended', message: messageFor(1) })).rejects.toMatchObject({
      code: 'LOG_FENCED',
    });
    expect(new TextDecoder().decode(file.bytes())).toBe(`${row}${'x'.repeat(torn.length - 1)}\n`);
  });

  // CL-A3, I3: the appender itself enforces the term rules, whoever writes (S6 `EpochStartsAtZero`).
  it('should refuse a new term that does not start at sequence 0', async () => {
    const log = await createEventLogAppender(memoryEventLogStorage().storage);
    await log.append({ ...lifecycleRow(0), epoch: 1 });

    await expect(log.append({ ...lifecycleRow(1), leaderEpoch: 'epoch-b', epoch: 2 })).rejects.toMatchObject({
      code: 'EVENT_OUT_OF_ORDER',
    });
    await expect(log.append({ ...lifecycleRow(0), leaderEpoch: 'epoch-b', epoch: 2 })).resolves.toMatchObject({
      appended: true,
    });
  });

  it('should refuse a claiming epoch that does not exceed every earlier epoch', async () => {
    const log = await createEventLogAppender(memoryEventLogStorage().storage);
    await log.append({ ...lifecycleRow(0), epoch: 3 });

    for (const epoch of [1, 3]) {
      // oxlint-disable-next-line no-await-in-loop -- one claim at a time.
      await expect(log.append({ ...lifecycleRow(0), leaderEpoch: `epoch-${epoch}`, epoch })).rejects.toMatchObject({
        code: 'EVENT_OUT_OF_ORDER',
      });
    }
    // A legacy term is admitted only while the whole log is legacy.
    await expect(log.append({ ...lifecycleRow(0), leaderEpoch: 'epoch-legacy' })).rejects.toMatchObject({
      code: 'EVENT_OUT_OF_ORDER',
    });
    await expect(log.append({ ...lifecycleRow(1), epoch: 4 })).rejects.toMatchObject({ code: 'EVENT_OUT_OF_ORDER' });
  });

  // CL-A8, I1, I2, T9: S3 F1's race. Another writer appended after this one read the log.
  it('should refuse a stale writer without writing and leave the log readable', async () => {
    const file = memoryEventLogStorage();
    const stale = await createEventLogAppender(file.storage);
    const current = await createEventLogAppender(file.storage);
    await current.append({ ...lifecycleRow(0), leaderEpoch: 'epoch-current', epoch: 1 });
    const bytes = file.bytes();

    await expect(stale.append({ ...lifecycleRow(0), leaderEpoch: 'epoch-stale', epoch: 1 })).rejects.toMatchObject({
      code: 'LOG_FENCED',
    });
    // Fenced for good: the next append is refused too, even one that would fit the bytes.
    await expect(stale.append({ ...lifecycleRow(0), leaderEpoch: 'epoch-stale', epoch: 1 })).rejects.toMatchObject({
      code: 'LOG_FENCED',
    });
    expect(file.bytes()).toEqual(bytes);
    const reader = await createEventLogAppender(file.storage);
    await expect(reader.read()).resolves.toEqual([{ ...lifecycleRow(0), leaderEpoch: 'epoch-current', epoch: 1 }]);
    await expect(reader.anomalies()).resolves.toEqual([]);
  });

  // CL-A1, T1 (S5 D1, W0.1): S5's minimal trace `E 0 0 3 L 5 1`, then the same row carrying an undefined-valued key.
  // The bytes on disk drop that key, so after a reload the row is a duplicate, never EVENT_MUTATED.
  it('should treat a reloaded identical row with an undefined key as a duplicate', async () => {
    let bytes = new Uint8Array(new ArrayBuffer(0));
    const storage: BareEventLogStorage = {
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
    const row: AgentLogEvent = {
      version: 1,
      leaderEpoch: 'e00',
      sequence: 0,
      recordedAt: '2026-09-01T00:00:00.001Z',
      runId: 'r3',
      type: 'run.lifecycle',
      state: 'failed',
      detail: { message: 'rate', code: 'RATE_LIMITED' },
    };
    const first = await createEventLogAppender(withLength(storage));
    await expect(first.append(row)).resolves.toMatchObject({ appended: true });
    await first.close();

    const reloaded = await createEventLogAppender(withLength(storage));

    await expect(reloaded.append({ ...row, storageDurability: undefined })).resolves.toMatchObject({ appended: false });
    await reloaded.close();
  });

  it.each([
    ['invalid JSON', new TextEncoder().encode('not-json\n')],
    ['invalid schema', new TextEncoder().encode('{"version":1}\n')],
    ['invalid UTF-8', new Uint8Array([0xff, 0x0a])],
  ])('should quarantine a terminated %s line without truncating it', async (_name, initialBytes) => {
    let bytes = new Uint8Array(initialBytes);
    const truncate = vi.fn(async (size: number) => {
      bytes = bytes.slice(0, size);
    });
    const storage: BareEventLogStorage = {
      read: async () => bytes,
      append: async () => undefined,
      truncate,
      close: async () => undefined,
    };

    const log = await createEventLogAppender(withLength(storage));

    await expect(log.read()).resolves.toEqual([]);
    await expect(log.anomalies()).resolves.toEqual([expect.objectContaining({ kind: 'quarantined', byteOffset: 0 })]);
    expect(truncate).not.toHaveBeenCalled();
    expect(bytes).toEqual(initialBytes);
  });

  it('should roll back a partial append and remain usable when truncation succeeds', async () => {
    let bytes = new Uint8Array(new ArrayBuffer(0));
    let failNextAppend = true;
    const storage: BareEventLogStorage = {
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
    const log = await createEventLogAppender(withLength(storage));

    await expect(log.append(appendEvents(1)[0]!)).rejects.toThrow('injected partial write');
    expect(bytes).toHaveLength(0);
    await expect(log.append(appendEvents(1)[0]!)).resolves.toMatchObject({ appended: true });
    expect(parseEventLog(new TextDecoder().decode(bytes))).toEqual(appendEvents(1));
    await log.close();
  });

  it('should poison the appender when a failed append cannot be rolled back', async () => {
    let bytes = new Uint8Array(new ArrayBuffer(0));
    const storage: BareEventLogStorage = {
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
    const log = await createEventLogAppender(withLength(storage));

    await expect(log.append(appendEvents(1)[0]!)).rejects.toMatchObject({
      name: 'EventLogError',
      code: 'LOG_POISONED',
    });
    await expect(log.read()).rejects.toMatchObject({ name: 'EventLogError', code: 'LOG_POISONED' });
    await log.close();
  });

  it('should reject an invalid reducer transition before writing it', async () => {
    const append = vi.fn(async () => undefined);
    const storage: BareEventLogStorage = {
      read: async () => new Uint8Array(new ArrayBuffer(0)),
      append,
      truncate: async () => undefined,
      close: async () => undefined,
    };
    const log = await createEventLogAppender(withLength(storage));
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
    const storage: BareEventLogStorage = {
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
    const log = await createEventLogAppender(withLength(storage));
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

  /*
   * D14: an event a newer writer produced must not cost an older reader the
   * chat. Both halves are covered here — an unknown field on a known type, and
   * an unknown type — because either one used to raise `LINE_INVALID` for the
   * whole file and leave the transcript unopenable.
   */
  it('preserves an unknown event type and an unknown field on a known one', async () => {
    const seeded = [
      '{"version":1,"leaderEpoch":"epoch-a","sequence":0,"recordedAt":"2026-08-31T00:00:00.000Z","runId":"run-a","type":"run.lifecycle","state":"admitted","futureField":{"kept":true}}',
      '{"version":1,"leaderEpoch":"epoch-a","sequence":1,"recordedAt":"2026-08-31T00:00:00.000Z","runId":"run-a","type":"future.fact","note":"kept"}',
    ]
      .map((line) => `${line}\n`)
      .join('');
    let bytes = new TextEncoder().encode(seeded);
    const storage: BareEventLogStorage = {
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
    const log = await createEventLogAppender(withLength(storage));

    const events = await log.read();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'run.lifecycle', state: 'admitted', futureField: { kept: true } });
    expect(events[1]).toMatchObject({ type: 'future.fact', note: 'kept' });
    // Byte-identical: the reader re-emits what it could not interpret.
    expect(events.map((event) => serializeLogEvent(event)).join('')).toBe(seeded);
    await expect(log.readBatch({ cursor: 0, limit: 16 })).resolves.toMatchObject({ nextCursor: 2, events });
    // Preserved without being executed: neither record reaches provider history.
    expect(reduceEventLog(events)).toEqual([]);

    // The log stays writable behind a record this reader does not understand.
    await expect(log.append({ ...base(2), type: 'message.appended', message: messageFor(0) })).resolves.toMatchObject({
      appended: true,
    });
    expect(new TextDecoder().decode(bytes).startsWith(seeded)).toBe(true);
    await log.close();
  });

  it('parses and reduces an unknown compaction trace field from a newer writer', () => {
    const appended = appendEvents(1)[0]!;
    const compacted = parseLogEvent({
      ...base(1),
      type: 'history.compacted',
      evictedMessageIds: [appended.message.id],
      summary: { id: 'summary-future', role: 'user', content: 'summary' },
      details: {
        lane: 'start_of_turn',
        tier: 'summarization',
        tokensBefore: 7000,
        tokensAfter: 1000,
        cleared: 0,
        evicted: 1,
        summarizerAttempts: 1,
        summarizerUsage: null,
        futureTraceField: { kept: true },
      },
    });

    if (compacted.type !== 'history.compacted') {
      throw new Error('Expected a parsed compaction event.');
    }
    expect(compacted.details).toMatchObject({ futureTraceField: { kept: true } });
    expect(reduceEventLog([appended, compacted])).toEqual([{ id: 'summary-future', role: 'user', content: 'summary' }]);
  });

  it('still fails closed for a malformed record of a known type', () => {
    expect(() => parseLogEvent({ ...base(0), type: 'run.lifecycle', state: 'not-a-lifecycle-state' })).toThrow(
      expect.objectContaining({ code: 'EVENT_INVALID' }),
    );
  });

  it('reads replay through bounded cursor batches without returning the full log', async () => {
    const storage: BareEventLogStorage = {
      read: async () => new Uint8Array(new ArrayBuffer(0)),
      append: async () => undefined,
      truncate: async () => undefined,
      close: async () => undefined,
    };
    const log = await createEventLogAppender(withLength(storage));
    for (const event of appendEvents(5)) {
      // oxlint-disable-next-line no-await-in-loop -- the fixture preserves physical append order.
      await log.append(event);
    }

    await expect(log.readBatch({ cursor: 1, limit: 2 })).resolves.toEqual({
      status: 'batch',
      cursor: 1,
      nextCursor: 3,
      endCursor: 5,
      events: appendEvents(5).slice(1, 3),
    });
    await log.close();
  });

  /*
   * A count is not a bound: one record holding a file read can be larger than
   * every other record in the log (P5). The byte budget is measured with the
   * same serializer the page is sent with.
   */
  it('bounds a batch by serialized bytes and still advances past an oversized record', async () => {
    const storage: BareEventLogStorage = {
      read: async () => new Uint8Array(new ArrayBuffer(0)),
      append: async () => undefined,
      truncate: async () => undefined,
      close: async () => undefined,
    };
    const log = await createEventLogAppender(withLength(storage));
    const large = (sequence: number): AgentLogEvent => ({
      ...base(sequence),
      type: 'message.appended',
      message: { id: `large-${sequence}`, role: 'user', content: 'x'.repeat(400_000) },
    });
    for (const event of [large(0), large(1), large(2)]) {
      // oxlint-disable-next-line no-await-in-loop -- the fixture preserves physical append order.
      await log.append(event);
    }

    await expect(log.readBatch({ cursor: 0, limit: 16, maxBytes: 500_000 })).resolves.toMatchObject({
      cursor: 0,
      nextCursor: 1,
      endCursor: 3,
    });
    // One record larger than the whole budget still advances the cursor.
    await expect(log.readBatch({ cursor: 0, limit: 16, maxBytes: 1 })).resolves.toMatchObject({ nextCursor: 1 });
    // Two fit in a budget that holds two.
    await expect(log.readBatch({ cursor: 0, limit: 16, maxBytes: 900_000 })).resolves.toMatchObject({ nextCursor: 2 });
    await expect(log.readBatch({ cursor: 0, limit: 16, maxBytes: 0 })).rejects.toMatchObject({
      code: 'EVENT_INVALID',
    });
    await log.close();
  });
});
