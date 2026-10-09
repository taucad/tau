import { describe, expect, it } from 'vitest';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import { classifyLogRow, fileRefBlockSchema, userProviderMessageSchema } from '#log/event-schema.js';

const hash = 'a'.repeat(64);

describe('fileRefBlockSchema', () => {
  it('should accept an image reference without a filename', () => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 12 };

    expect(fileRefBlockSchema.parse(block)).toEqual(block);
  });

  it('should accept a document reference carrying its filename', () => {
    const block = {
      type: 'file-ref',
      path: `attachments/${hash}.pdf`,
      mimeType: 'application/pdf',
      byteLength: 2048,
      filename: 'bracket-spec.pdf',
    };

    expect(fileRefBlockSchema.parse(block)).toEqual(block);
  });

  /* P29: a draft hydrated from a record holds a file part with no size at all,
     and that is the reload-then-send path this whole program exists for. The
     field is written when a producer genuinely has it and omitted otherwise —
     never fabricated, and never a reason to refuse the turn. */
  it('should accept a reference that names no byte length', () => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png' };

    expect(fileRefBlockSchema.parse(block)).toEqual(block);
  });

  it.each([
    ['a data URL', { path: 'data:image/png;base64,AAAA' }],
    ['an absolute path', { path: `/attachments/${hash}.png` }],
    ['a traversal', { path: `attachments/../${hash}.png` }],
    ['a short hash', { path: `attachments/${'a'.repeat(63)}.png` }],
    ['an uppercase hash', { path: `attachments/${'A'.repeat(64)}.png` }],
    ['an unsupported extension', { path: `attachments/${hash}.svg` }],
    ['a nested directory', { path: `attachments/nested/${hash}.png` }],
  ])('should reject %s as an attachment path', (_label, override) => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 12 };

    expect(fileRefBlockSchema.safeParse({ ...block, ...override }).success).toBe(false);
  });

  it.each([
    ['a negative byte length', { byteLength: -1 }],
    ['a fractional byte length', { byteLength: 1.5 }],
    ['a missing media type', { mimeType: undefined }],
    ['an empty media type', { mimeType: '' }],
    ['an unknown key', { data: 'AAAA' }],
    ['a wrong block type', { type: 'image' }],
  ])('should reject %s', (_label, override) => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 12 };

    expect(fileRefBlockSchema.safeParse({ ...block, ...override }).success).toBe(false);
  });
});

describe('userProviderMessageSchema', () => {
  it('should accept a user message carrying both the reference and the legacy inline arms', () => {
    const message = {
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'Read these.' },
        {
          type: 'file-ref',
          path: `attachments/${hash}.pdf`,
          mimeType: 'application/pdf',
          byteLength: 9,
          filename: 's.pdf',
        },
        { type: 'image', mimeType: 'image/png', data: 'AAAA' },
      ],
    };

    expect(userProviderMessageSchema.parse(message)).toEqual(message);
  });
});

describe('tolerant reading (CL-R1, CL-A2)', () => {
  const envelope = (sequence: number) => ({
    version: 1,
    leaderEpoch: 'e01',
    epoch: 1,
    sequence,
    recordedAt: '2026-09-26T00:00:00.000Z',
    runId: 'run-1',
  });
  const line = (row: Record<string, unknown>) => `${JSON.stringify(row)}\n`;
  const logOf = async (lines: readonly string[]) => {
    const file = memoryEventLogStorage(new TextEncoder().encode(lines.join('')));
    return createEventLogAppender(file.storage);
  };

  it('should open a log whose middle line is unreadable and quarantine it', async () => {
    const log = await logOf([
      line({ ...envelope(0), type: 'run.lifecycle', state: 'admitted' }),
      'garbage\n',
      line({ ...envelope(1), type: 'run.lifecycle', state: 'running' }),
    ]);

    await expect(log.read()).resolves.toHaveLength(2);
    await expect(log.anomalies()).resolves.toEqual([expect.objectContaining({ kind: 'quarantined' })]);
  });

  it('should keep a row with an unknown enum value as opaque', async () => {
    const suspended = { ...envelope(1), type: 'run.lifecycle', state: 'suspended' };
    const log = await logOf([line({ ...envelope(0), type: 'run.lifecycle', state: 'admitted' }), line(suspended)]);
    const ledger = foldChatLedger(emptyChatLedger, await log.read());

    expect(classifyLogRow(suspended).class).toBe('opaque');
    const rows = await log.read();
    expect(rows[1]).toEqual(suspended);
    expect(ledger.runs['run-1']).toMatchObject({ lifecycle: 'admitted', opaque: true });
  });

  it('should refuse commands on a run that holds an opaque row', async () => {
    const log = await logOf([
      line({ ...envelope(0), type: 'message.appended', message: { id: 'turn-1', role: 'user', content: 'Hi.' } }),
      line({ ...envelope(1), type: 'run.lifecycle', state: 'admitted' }),
      line({ ...envelope(2), type: 'run.lifecycle', state: 'running' }),
      line({ ...envelope(3), version: 2, type: 'run.lifecycle', state: 'running', lane: 'newer' }),
    ]);
    const host = createTauAgentHost({
      systemPrompt: 'opaque',
      model: { id: 'opaque-model', contextWindow: 1000 },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream() {
          yield* [];
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      placement: fakePlacement({
        registry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      }).port,
      openEventLog: async () => log,
    });

    await expect(host.resume('chat-1')).rejects.toMatchObject({ code: 'RUN_UNREADABLE' });
    await expect(log.read()).resolves.toHaveLength(4);
    await host.close();
  });

  // CL-S2: read tolerantly, execute strictly. A lost history line leaves the chat readable and refuses to run it.
  const hostOver = (log: EventLogAppender) =>
    createTauAgentHost({
      systemPrompt: 'history',
      model: { id: 'history-model', contextWindow: 1000 },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream() {
          yield { type: 'completed', stopReason: 'stop' } as const;
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      placement: fakePlacement({
        registry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      }).port,
      openEventLog: async () => log,
    });
  const brokenHistoryLines = (middle: (sequence: number) => string, counted: boolean): string[] => {
    const at = (offset: number) => (counted ? offset + 1 : offset);
    return [
      line({ ...envelope(0), type: 'message.appended', message: { id: 'turn-1', role: 'user', content: 'Hi.' } }),
      middle(1),
      line({ ...envelope(at(1)), type: 'run.lifecycle', state: 'admitted' }),
      line({ ...envelope(at(2)), type: 'run.lifecycle', state: 'running' }),
      line({
        ...envelope(at(3)),
        type: 'run.lifecycle',
        state: 'failed',
        detail: { message: 'rate', code: 'RATE_LIMITED' },
      }),
    ];
  };

  /* A lost line answers HISTORY_INVALID; a newer build's history row (D16), in any run, answers RUN_UNREADABLE, so the
   * person is offered the update rather than told the chat is corrupt. */
  it.each([
    {
      name: 'a garbage message.appended line',
      middle: () => '{"type":"message.appended","message":{"id":"turn-2"}\n',
      counted: false,
      code: 'HISTORY_INVALID',
    },
    {
      name: 'an opaque message.appended row',
      middle: (sequence: number) =>
        line({ ...envelope(sequence), runId: 'run-0', type: 'message.appended', message: { id: 'turn-2' } }),
      counted: true,
      code: 'RUN_UNREADABLE',
    },
  ])('should read a chat with $name but refuse to start or resume it', async ({ middle, counted, code }) => {
    const log = await logOf(brokenHistoryLines(middle, counted));
    const host = hostOver(log);

    await expect(log.read()).resolves.toHaveLength(counted ? 5 : 4);
    await expect(log.historyIntact()).resolves.toBe(false);
    await expect(
      host.admit({
        chatId: 'chat-1',
        runId: 'run-2',
        trigger: 'submit',
        message: { id: 'turn-3', role: 'user', content: 'Go.' },
      }),
    ).rejects.toMatchObject({ code });
    await expect(host.resume('chat-1')).rejects.toMatchObject({ code });
    await host.close();
  });

  // CL-A22
  it('should keep unknown tauInternal fields', () => {
    const row = {
      ...envelope(0),
      type: 'message.appended',
      message: {
        id: 'turn-1',
        role: 'user',
        content: 'Hi.',
        metadata: { tauInternal: { kind: 'external-agent', futureLimit: { resetsAt: 7 } } },
      },
    };

    expect(classifyLogRow(row)).toMatchObject({ class: 'known', event: row });
  });
});

describe('generic classifier observable inputs', () => {
  it.each(['getter', 'proxy'])('preserves the generic union observation order for a %s', (kind) => {
    let reads = 0;
    const value = {
      version: 1,
      leaderEpoch: 'e',
      sequence: 0,
      recordedAt: 'now',
      runId: 'r',
      state: 'running',
    };
    const readType = () => {
      reads++;
      return reads === 2 ? 'future.row' : 'run.lifecycle';
    };
    const input =
      kind === 'getter'
        ? Object.defineProperty(value, 'type', { enumerable: true, get: readType })
        : new Proxy(
            { ...value, type: 'run.lifecycle' },
            {
              get(target, key, receiver): unknown {
                return key === 'type' ? readType() : Reflect.get(target, key, receiver);
              },
            },
          );

    expect(classifyLogRow(input).class).toBe('known');
    expect(reads).toBeGreaterThan(2);
  });
});
