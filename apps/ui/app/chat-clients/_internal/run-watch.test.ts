import { readUIMessageStream } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import type { AgentLiveEvent } from '@taucad/agent-host';
import { describe, expect, it, vi } from 'vitest';
import { chunksOf, initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionReadAnswer } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { openRunWatch } from '#chat-clients/_internal/run-watch.js';

const batch = (rows: readonly unknown[], cursor: number): Extract<ChatProjectionReadAnswer, { status: 'batch' }> => ({
  status: 'batch',
  cursor,
  nextCursor: cursor + rows.length,
  endCursor: cursor + rows.length,
  events: rows,
});

describe('openRunWatch', () => {
  it.each([
    { before: [{ type: 'text', text: 'original long' }], after: 'short', expected: [{ type: 'text', text: 'short' }] },
    {
      before: [{ type: 'text', text: 'same' }],
      after: [{ type: 'thinking', thinking: 'same' }],
      expected: [{ type: 'reasoning', text: 'same' }],
    },
    {
      before: [
        { type: 'text', text: 'keep' },
        { type: 'text', text: 'remove' },
      ],
      after: [{ type: 'text', text: 'keep' }],
      expected: [{ type: 'text', text: 'keep' }],
    },
  ])(
    'should restart from corrected durable parts instead of a stale live overlay ($after)',
    async ({ before, after, expected }) => {
      const assistant = (content: unknown) => ({
        id: 'a1',
        role: 'assistant',
        content,
        metadata: { tauInternal: { kind: 'stream', streamState: 'checkpoint' } },
      });
      let projection = reduceChatProjection(initialChatProjection, {
        type: 'batch',
        answer: batch(
          [
            lifecycleRow(0, 'admitted'),
            lifecycleRow(1, 'running'),
            logRow(2, { type: 'message.appended', message: assistant(before) }),
          ],
          0,
        ),
      }).state;
      projection = reduceChatProjection(projection, {
        type: 'live',
        event: {
          type: 'text-delta',
          chatId: 'chat_1',
          runId: 'run_1',
          messageId: 'a1',
          contentIndex: 0,
          delta: '',
        },
      }).state;
      expect(projection.live).toBeDefined();
      const listeners = new Set<() => void>();
      const source = {
        runId: 'run_1',
        getProjection: () => projection,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      const original = openRunWatch(source);
      projection = reduceChatProjection(projection, {
        type: 'batch',
        answer: batch(
          [logRow(3, { type: 'message.envelope-replaced', messageId: 'a1', replacement: assistant(after) })],
          3,
        ),
      }).state;
      for (const listener of listeners) {
        listener();
      }
      expect(listeners.size).toBe(0);
      for await (const _chunk of original.stream) {
        /* Drain the stream closed by the correction. */
      }
      const restarted = openRunWatch(source);
      restarted.detach();
      let reply: MyUIMessage | undefined;
      for await (const message of readUIMessageStream<MyUIMessage>({ stream: restarted.stream })) {
        reply = message;
      }
      expect(
        reply?.parts
          .filter((part) => part.type === 'text' || part.type === 'reasoning')
          .map(({ type, text }) => ({ type, text })),
      ).toEqual(expected);
      expect(listeners.size).toBe(0);
    },
  );

  it('replays durable chunks and ends at the terminal row without a settlement', async () => {
    let projection: ChatProjection = initialChatProjection;
    const listeners = new Set<() => void>();
    const subscribe = vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    const update = (rows: readonly unknown[], cursor: number) => {
      projection = reduceChatProjection(projection, { type: 'batch', answer: batch(rows, cursor) }).state;
      for (const listener of listeners) {
        listener();
      }
    };
    update([lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')], 0);

    const watch = openRunWatch({ runId: 'run_1', getProjection: () => projection, subscribe });
    const reader = watch.stream.getReader();
    const started = await reader.read();
    const running = await reader.read();
    expect(started.value).toMatchObject({ type: 'start', messageId: 'run_1' });
    expect(running.value).toMatchObject({ type: 'start-step' });

    update([lifecycleRow(2, 'completed')], 2);
    const finished = await reader.read();
    const ended = await reader.read();
    expect(finished.value).toMatchObject({ type: 'finish' });
    expect(ended.done).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('detaches on readable cancellation and sends no host command', async () => {
    const onDetach = vi.fn();
    const subscribe = vi.fn(() => onDetach);
    const watch = openRunWatch({ runId: 'run_1', getProjection: () => initialChatProjection, subscribe });

    await watch.stream.cancel();

    expect(subscribe).toHaveBeenCalledOnce();
    expect(onDetach).toHaveBeenCalledOnce();
  });

  it('streams a live preview before the durable message and emits its text once', async () => {
    let projection: ChatProjection = reduceChatProjection(initialChatProjection, {
      type: 'batch',
      answer: batch([lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')], 0),
    }).state;
    const listeners = new Set<() => void>();
    const update = (): void => {
      for (const listener of listeners) {
        listener();
      }
    };
    const watch = openRunWatch({
      runId: 'run_1',
      getProjection: () => projection,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const reader = watch.stream.getReader();
    await reader.read();
    await reader.read();
    projection = reduceChatProjection(projection, {
      type: 'live',
      event: {
        type: 'text-delta',
        chatId: 'chat_1',
        runId: 'run_1',
        messageId: 'assistant-1',
        contentIndex: 0,
        delta: 'Partial reply',
      },
    }).state;
    update();
    const textStart = await reader.read();
    const textDelta = await reader.read();
    expect(textStart.value).toMatchObject({ type: 'text-start' });
    expect(textDelta.value).toMatchObject({ type: 'text-delta', delta: 'Partial reply' });
    projection = reduceChatProjection(projection, {
      type: 'batch',
      answer: batch(
        [
          logRow(2, {
            type: 'message.appended',
            message: {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text', text: 'Partial reply' }],
            },
          }),
          lifecycleRow(3, 'completed'),
        ],
        2,
      ),
    }).state;
    update();
    const remaining = [];
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Consume the finite terminal stream in order.
      const next = await reader.read();
      if (next.done) {
        break;
      }
      remaining.push(next.value);
    }
    expect(remaining.some((chunk) => chunk.type === 'finish')).toBe(true);
    expect(remaining.filter((chunk) => chunk.type === 'text-delta')).toHaveLength(0);
    expect(listeners.size).toBe(0);
  });
});

it.each([false, true])(
  'should feed causally valid interleaved tools to the real SDK (external=%s)',
  async (external) => {
    let projection = reduceChatProjection(initialChatProjection, {
      type: 'batch',
      answer: batch([lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')], 0),
    }).state;
    const listeners = new Set<() => void>();
    const watch = openRunWatch({
      runId: 'run_1',
      getProjection: () => projection,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const errors: unknown[] = [];
    let parts: MyUIMessage['parts'] = [];
    const consumed = (async () => {
      for await (const message of readUIMessageStream<MyUIMessage>({
        stream: watch.stream,
        onError: (error) => {
          errors.push(error);
        },
      })) {
        parts = message.parts;
      }
    })();
    const notify = (): void => {
      for (const listener of listeners) {
        listener();
      }
    };
    const live = (event: AgentLiveEvent): void => {
      projection = reduceChatProjection(projection, { type: 'live', event }).state;
      notify();
    };
    let cursor = 2;
    const durable = (message: Record<string, unknown>): void => {
      projection = reduceChatProjection(projection, {
        type: 'batch',
        answer: batch([logRow(cursor, { type: 'message.appended', message })], cursor),
      }).state;
      cursor++;
      notify();
    };
    const identity = { chatId: 'chat_1', runId: 'run_1', messageId: 'assistant', contentIndex: 0, toolName: 'edit' };
    const preview = (toolCallId: string): void => {
      live({ ...identity, toolCallId, type: 'tool-input-start' });
      live({ ...identity, toolCallId, type: 'tool-input-delta', delta: '{"stale":' });
      live({ ...identity, toolCallId, type: 'tool-input-end', input: { stale: true } });
    };
    live({ ...identity, toolCallId: 'a', type: 'tool-output-update', output: 'early', isError: false });
    live({ ...identity, toolCallId: 'b', type: 'tool-input-delta', delta: 'orphan' });
    live({ ...identity, toolCallId: 'b', type: 'tool-input-end', input: { orphan: true } });
    if (!external) {
      live({ ...identity, toolCallId: 'a', type: 'tool-input-start' });
      live({ ...identity, toolCallId: 'a', type: 'tool-output-update', output: 'before-input', isError: false });
      live({ ...identity, toolCallId: 'a', type: 'tool-input-delta', delta: '{"file":' });
      live({ ...identity, toolCallId: 'a', type: 'tool-input-start' });
      live({ ...identity, toolCallId: 'a', type: 'tool-input-delta', delta: '"a.ts"}' });
      live({ ...identity, toolCallId: 'a', type: 'tool-input-end', input: { file: 'a.ts' } });
    }
    const metadata = external
      ? { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } }
      : undefined;
    for (const toolCallId of ['a', 'b']) {
      durable({
        id: `input-${toolCallId}`,
        role: 'tool-input',
        toolCallId,
        toolName: 'edit',
        content: { file: `${toolCallId}.ts` },
        metadata,
      });
      preview(toolCallId);
      live({ ...identity, toolCallId, type: 'tool-output-update', output: 'working', isError: false });
    }
    durable({
      id: 'refine-a',
      role: 'tool-input',
      toolCallId: 'a',
      toolName: 'edit',
      content: { file: 'a.ts', diff: '+saved' },
      metadata,
    });
    for (const toolCallId of ['b', 'a']) {
      durable({
        id: `output-${toolCallId}`,
        role: 'tool-output',
        toolCallId,
        toolName: 'edit',
        content: { saved: toolCallId },
        isError: false,
        metadata,
      });
      preview(toolCallId);
      live({ ...identity, toolCallId, type: 'tool-output-update', output: 'late', isError: false });
    }
    projection = reduceChatProjection(projection, {
      type: 'batch',
      answer: batch([lifecycleRow(cursor, 'completed')], cursor),
    }).state;
    notify();
    await consumed;
    expect(errors).toEqual([]);
    const chunks = chunksOf(projection.live?.chunks);
    expect(chunks.filter((chunk) => chunk.type === 'tool-input-start')).toHaveLength(external ? 0 : 1);
    expect(chunks.filter((chunk) => chunk.type === 'tool-input-delta')).toHaveLength(external ? 0 : 2);
    const tools = parts.filter((part) => 'toolCallId' in part);
    expect(tools).toHaveLength(2);
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'a',
          state: 'output-available',
          input: { file: 'a.ts', diff: '+saved' },
          output: { saved: 'a' },
        }),
        expect.objectContaining({
          toolCallId: 'b',
          state: 'output-available',
          input: { file: 'b.ts' },
          output: { saved: 'b' },
        }),
      ]),
    );
    expect(listeners.size).toBe(0);
  },
);

describe('validated capture live reconciliation', () => {
  it.each([
    { captured: 'corrected', later: undefined, expected: ['corrected'] },
    {
      before: [
        { type: 'text', text: 'original' },
        { type: 'text', text: 'remove' },
      ],
      captured: [{ type: 'text', text: 'original' }],
      later: undefined,
      expected: ['original'],
    },
    { captured: [{ type: 'thinking', thinking: 'original' }], later: undefined, expected: [], reasoning: ['original'] },
    { captured: 'ori', later: { messageId: 'a1', delta: ' old suffix', offset: 8 }, expected: ['ori'] },
    {
      captured: 'corrected',
      later: { messageId: 'a2', delta: 'New live answer', offset: 0 },
      expected: ['corrected', 'New live answer'],
    },
    {
      captured: 'original prefix',
      later: { messageId: 'a1', delta: ' prefix and live tail', offset: 8 },
      expected: ['original prefix and live tail'],
    },
  ])(
    'should reconcile captured $captured with provable live extensions $later',
    async ({ captured, later, expected, before, reasoning }) => {
      const assistant = (content: unknown) => ({
        id: 'a1',
        role: 'assistant',
        content,
        metadata: { tauInternal: { kind: 'stream', streamState: 'checkpoint' } },
      });
      const rows = [
        lifecycleRow(0, 'admitted'),
        lifecycleRow(1, 'running'),
        logRow(2, { type: 'message.appended', message: assistant(before ?? 'original') }),
      ];
      const first = reduceChatProjection(initialChatProjection, {
        type: 'batch',
        answer: { ...batch(rows, 0), sourceGeneration: 'same' },
      }).state;
      const base = reduceChatProjection(first, {
        type: 'live',
        event: {
          type: 'text-delta',
          chatId: 'chat_1',
          runId: 'run_1',
          messageId: 'a1',
          contentIndex: 0,
          delta: '',
          offset: 8,
        },
      }).state;
      const current =
        later === undefined
          ? base
          : reduceChatProjection(base, {
              type: 'live',
              event: {
                type: 'text-delta',
                chatId: 'chat_1',
                runId: 'run_1',
                contentIndex: 0,
                ...later,
              },
            }).state;
      const capturedRows = [
        ...rows,
        logRow(3, { type: 'message.envelope-replaced', messageId: 'a1', replacement: assistant(captured) }),
      ];
      const projection = reduceChatProjection(initialChatProjection, {
        type: 'batch',
        answer: { ...batch(capturedRows, 0), sourceGeneration: 'same' },
      }).state;
      const published = reduceChatProjection(current, { type: 'catch-up', base, projection }).state;
      const watch = openRunWatch({ runId: 'run_1', getProjection: () => published, subscribe: () => () => undefined });
      watch.detach();
      let reply: MyUIMessage | undefined;
      for await (const message of readUIMessageStream<MyUIMessage>({ stream: watch.stream })) {
        reply = message;
      }
      expect(reply?.parts.filter((part) => part.type === 'text').map((part) => part.text)).toEqual(expected);
      expect(reply?.parts.filter((part) => part.type === 'reasoning').map((part) => part.text)).toEqual(
        reasoning ?? [],
      );
    },
  );
});

it('should prefer captured tool input over ambiguous retained input deltas', async () => {
  const rows = [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')];
  let base = reduceChatProjection(initialChatProjection, {
    type: 'batch',
    answer: { ...batch(rows, 0), sourceGeneration: 'same' },
  }).state;
  base = reduceChatProjection(base, {
    type: 'live',
    event: {
      type: 'tool-input-start',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'tool-message',
      contentIndex: 0,
      toolCallId: 'call',
      toolName: 'read',
    },
  }).state;
  const current = reduceChatProjection(base, {
    type: 'live',
    event: {
      type: 'tool-input-delta',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'tool-message',
      contentIndex: 0,
      toolCallId: 'call',
      toolName: 'read',
      delta: '{"file":"old.ts"}',
    },
  }).state;
  const projection = reduceChatProjection(initialChatProjection, {
    type: 'batch',
    answer: {
      ...batch(
        [
          ...rows,
          logRow(2, {
            type: 'message.appended',
            message: {
              id: 'tool-message',
              role: 'tool-input',
              toolCallId: 'call',
              toolName: 'read',
              content: { file: 'current.ts' },
            },
          }),
        ],
        0,
      ),
      sourceGeneration: 'same',
    },
  }).state;
  const published = reduceChatProjection(current, { type: 'catch-up', base, projection }).state;
  const watch = openRunWatch({ runId: 'run_1', getProjection: () => published, subscribe: () => () => undefined });
  watch.detach();
  let reply: MyUIMessage | undefined;
  for await (const message of readUIMessageStream<MyUIMessage>({ stream: watch.stream })) {
    reply = message;
  }
  expect(reply?.parts).toContainEqual(
    expect.objectContaining({ toolCallId: 'call', state: 'input-available', input: { file: 'current.ts' } }),
  );
});

it.each([false, true])(
  'should retain tool preview output across capture with an unchanged durable input: %s',
  async (durableInput) => {
    const input = { file: 'same.ts' };
    const rows = [
      lifecycleRow(0, 'admitted'),
      lifecycleRow(1, 'running'),
      ...(durableInput
        ? [
            logRow(2, {
              type: 'message.appended',
              message: { id: 'tool-message', role: 'tool-input', toolCallId: 'call', toolName: 'read', content: input },
            }),
          ]
        : []),
    ];
    const projection = reduceChatProjection(initialChatProjection, {
      type: 'batch',
      answer: { ...batch(rows, 0), sourceGeneration: 'same' },
    }).state;
    let current = projection;
    const identity = {
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'tool-message',
      contentIndex: 0,
      toolCallId: 'call',
      toolName: 'read',
    };
    if (!durableInput) {
      current = reduceChatProjection(current, { type: 'live', event: { type: 'tool-input-start', ...identity } }).state;
      current = reduceChatProjection(current, {
        type: 'live',
        event: { type: 'tool-input-end', ...identity, input },
      }).state;
    }
    current = reduceChatProjection(current, {
      type: 'live',
      event: { type: 'tool-output-update', ...identity, output: 'Preview result', isError: false },
    }).state;
    const published = reduceChatProjection(current, { type: 'catch-up', base: projection, projection }).state;
    const watch = openRunWatch({ runId: 'run_1', getProjection: () => published, subscribe: () => () => undefined });
    watch.detach();
    let reply: MyUIMessage | undefined;
    for await (const message of readUIMessageStream<MyUIMessage>({ stream: watch.stream })) {
      reply = message;
    }
    expect(reply?.parts).toContainEqual(
      expect.objectContaining({
        toolCallId: 'call',
        state: 'output-available',
        input,
        output: 'Preview result',
        preliminary: true,
      }),
    );
  },
);
