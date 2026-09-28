import { describe, expect, it, vi } from 'vitest';
import { initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionReadAnswer } from '#machines/chat-projection.logic.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
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
});
