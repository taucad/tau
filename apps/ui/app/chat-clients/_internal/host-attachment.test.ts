import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import type { ReadAnswer } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';

describe('hostAttachment', () => {
  it('folds a host read into the projection and detaches without cancelling', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const unsubscribe = vi.fn();
    const close = vi.fn(async () => undefined);
    const read = vi.fn(
      async (): Promise<ReadAnswer> => ({
        status: 'batch',
        chatId: 'chat_1',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      }),
    );
    const subscribe = vi.fn(() => unsubscribe);
    const actor = createActor(hostAttachment, {
      input: { chatId: 'chat_1', connect: async () => ({ read, subscribe, close }), projection },
    }).start();

    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    expect(read).toHaveBeenCalledWith({ chatId: 'chat_1', cursor: 0 });
    expect(subscribe).toHaveBeenCalledWith({ chatId: 'chat_1', cursor: 2 }, expect.any(Function), expect.any(Function));
    actor.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    projection.stop();
  });

  it('rereads from zero after a cursor-ahead refusal', async () => {
    const projection = createActor(chatProjectionLogic).start();
    let reads = 0;
    const read = vi.fn(async (): Promise<ReadAnswer> => {
      reads++;
      return reads === 1
        ? { status: 'refused', chatId: 'chat_1', reason: 'cursor-ahead' }
        : {
            status: 'batch',
            chatId: 'chat_1',
            cursor: 0,
            nextCursor: 1,
            endCursor: 1,
            events: [lifecycleRow(0, 'admitted')],
          };
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({ read, subscribe: vi.fn(() => vi.fn()), close: vi.fn(async () => undefined) }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    });
    expect(read).toHaveBeenCalledTimes(2);
    actor.stop();
    projection.stop();
  });

  it('opens a new owned connection at the folded cursor after the previous follow ends', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const ended: Array<() => void> = [];
    const close = vi.fn(async () => undefined);
    const read = vi.fn(
      async ({ cursor }: { cursor: number }): Promise<ReadAnswer> => ({
        status: 'batch',
        chatId: 'chat_1',
        cursor,
        nextCursor: cursor === 0 ? 1 : cursor,
        endCursor: 1,
        events: cursor === 0 ? [lifecycleRow(0, 'admitted')] : [],
      }),
    );
    const connect = vi.fn(async () => ({
      read,
      subscribe: vi.fn((...[, , onEnded]: Parameters<AgentHostClient['subscribe']>) => {
        if (onEnded) ended.push(onEnded);
        return vi.fn();
      }),
      close,
    }));
    const first = createActor(hostAttachment, { input: { chatId: 'chat_1', connect, projection } }).start();
    await vi.waitFor(() => expect(ended).toHaveLength(1));
    ended[0]!();
    first.stop();
    const second = createActor(hostAttachment, { input: { chatId: 'chat_1', connect, projection } }).start();
    await vi.waitFor(() => expect(ended).toHaveLength(2));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]?.[0]).toMatchObject({ chatId: 'chat_1', cursor: 1 });
    second.stop();
    expect(close).toHaveBeenCalledTimes(2);
    projection.stop();
  });
});
