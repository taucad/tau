import { readUIMessageStream } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import type { AgentLiveEvent } from '@taucad/agent-host';
import { describe, expect, it, vi } from 'vitest';
import { chunksOf, initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionReadAnswer } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { openRunWatch } from '#chat-clients/_internal/run-watch.js';

const batch = (rows: readonly unknown[], cursor: number): ChatProjectionReadAnswer => ({
  status: 'batch',
  cursor,
  nextCursor: cursor + rows.length,
  endCursor: cursor + rows.length,
  events: rows,
});

describe('openRunWatch', () => {
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
