import { describe, expect, it, vi } from 'vitest';
import { initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
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
