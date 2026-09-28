import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import type { ReadAnswer } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';

describe('hostAttachment', () => {
  it('feeds live preview through the owned read-only connection and fences it after detach', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const stopLive = vi.fn();
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribeLive = vi.fn((_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
      onLive = listener;
      return stopLive;
    });
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() =>
        parameters[3]?.({
          status: 'batch',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        }),
      );
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({
          read: vi.fn(),
          subscribe,
          subscribeLive,
          close: async () => undefined,
        }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    const delta = {
      type: 'text-delta',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
    } as const;
    onLive?.('chat_1', delta);
    expect(projection.getSnapshot().context.live?.chunks).toContainEqual(
      expect.objectContaining({
        type: 'text-delta',
        delta: 'Partial',
      }),
    );
    actor.stop();
    expect(stopLive).toHaveBeenCalledOnce();
    onLive?.('chat_1', { ...delta, delta: ' after stop' });
    expect(projection.getSnapshot().context.live).toBeUndefined();
    projection.stop();
  });

  it('retires live preview after terminal delivery while preserving the durable transcript', async () => {
    const projection = createActor(chatProjectionLogic).start();
    let onAnswer: Parameters<AgentHostClient['subscribe']>[3];
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      onAnswer = parameters[3];
      queueMicrotask(() =>
        onAnswer?.({
          status: 'batch',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        }),
      );
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        connect: async () => ({
          read: vi.fn(),
          subscribe,
          subscribeLive: (_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
            onLive = listener;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    onLive?.('chat_1', {
      type: 'text-delta',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
    });
    expect(projection.getSnapshot().context.live).toBeDefined();
    onAnswer?.({
      status: 'batch',
      chatId: 'chat_1',
      cursor: 2,
      nextCursor: 4,
      endCursor: 4,
      events: [
        {
          version: 1,
          leaderEpoch: 'g1',
          sequence: 2,
          recordedAt: '2026-09-28T00:00:00.000Z',
          runId: 'run_1',
          type: 'message.appended',
          message: {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Partial' }],
          },
        },
        lifecycleRow(3, 'completed'),
      ],
    });
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.live).toBeUndefined();
    });
    expect(projection.getSnapshot().context.views['run_1']?.chunks).toContainEqual(
      expect.objectContaining({
        type: 'text-delta',
        delta: 'Partial',
      }),
    );
    actor.stop();
    projection.stop();
  });

  it('drops an overlay when live delivery fails even while durable reads remain open', async () => {
    const projection = createActor(chatProjectionLogic).start();
    let onLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    let onLiveEnded: (() => void) | undefined;
    const stopRead = vi.fn();
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        projection,
        onStatus,
        connect: async () => ({
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            queueMicrotask(() =>
              parameters[3]?.({
                status: 'batch',
                chatId: 'chat_1',
                cursor: 0,
                nextCursor: 2,
                endCursor: 2,
                events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
              }),
            );
            return stopRead;
          },
          subscribeLive: (
            _chatId: string,
            listener: Parameters<AgentHostClient['subscribeLive']>[1],
            ended?: () => void,
          ) => {
            onLive = listener;
            onLiveEnded = ended;
            return vi.fn();
          },
          close: async () => undefined,
        }),
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    onLive?.('chat_1', {
      type: 'text-delta',
      chatId: 'chat_1',
      runId: 'run_1',
      messageId: 'assistant-1',
      contentIndex: 0,
      delta: 'Partial',
    });
    onLiveEnded?.();
    expect(projection.getSnapshot().context.live).toBeUndefined();
    expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.lost', reason: 'live subscriber ended' });
    expect(stopRead).not.toHaveBeenCalled();
    actor.stop();
    projection.stop();
  });
  it('reports an unreadable log once without reporting a lost follower', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const onStatus = vi.fn();
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() => {
        parameters[3]?.({ status: 'refused', chatId: 'chat_1', reason: 'unreadable' });
        parameters[2]?.();
      });
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({ read: vi.fn(), subscribe, close: async () => undefined }),
        projection,
        onStatus,
      },
    }).start();

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.refused', reason: 'unreadable' });
    });
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
    actor.stop();
    projection.stop();
  });
  it('attaches an idle chat without parking on an empty long-poll read', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const read = vi.fn(
      async (): Promise<ReadAnswer> =>
        new Promise<ReadAnswer>(() => {
          /* An empty long poll must never be opened by the attachment. */
        }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      queueMicrotask(() =>
        parameters[3]?.({
          status: 'batch',
          chatId: 'chat_idle',
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
        }),
      );
      return vi.fn();
    });
    const onStatus = vi.fn();
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_idle',
        connect: async () => ({ read, subscribe, close: async () => undefined }),
        projection,
        onStatus,
      },
    }).start();

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({ type: 'attachment.attached' });
    });
    expect(subscribe).toHaveBeenCalledWith(
      { chatId: 'chat_idle', cursor: 0 },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(read).not.toHaveBeenCalled();
    actor.stop();
    projection.stop();
  });
  it('does not call a connected socket caught up before its first answer', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const onStatus = vi.fn();
    const subscribe = vi.fn(() => vi.fn());
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_idle',
        connect: async () => ({ read: vi.fn(), subscribe, close: async () => undefined }),
        projection,
        onStatus,
      },
    }).start();
    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledOnce();
    });
    expect(onStatus).not.toHaveBeenCalledWith({ type: 'attachment.attached' });
    actor.stop();
    projection.stop();
  });
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
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const onAnswer = parameters[3];
      queueMicrotask(() => {
        onAnswer?.({
          status: 'batch',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
        });
      });
      return unsubscribe;
    });
    const actor = createActor(hostAttachment, {
      input: { chatId: 'chat_1', connect: async () => ({ read, subscribe, close }), projection },
    }).start();

    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(2);
    });
    expect(read).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(
      { chatId: 'chat_1', cursor: 0 },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    actor.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    projection.stop();
  });

  it('rereads from zero after a cursor-ahead refusal', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const read = vi.fn(
      async (): Promise<ReadAnswer> =>
        new Promise<ReadAnswer>(() => {
          /* A refused follow restarts without a second long poll. */
        }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const onAnswer = parameters[3];
      queueMicrotask(() => {
        onAnswer?.({ status: 'refused', chatId: 'chat_1', reason: 'cursor-ahead' });
        onAnswer?.({
          status: 'batch',
          chatId: 'chat_1',
          cursor: 0,
          nextCursor: 1,
          endCursor: 1,
          events: [lifecycleRow(0, 'admitted')],
        });
      });
      return vi.fn();
    });
    const actor = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({ read, subscribe, close: vi.fn(async () => undefined) }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    });
    expect(read).not.toHaveBeenCalled();
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
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const onEnded = parameters[2];
      const onAnswer = parameters[3];
      if (onEnded) {
        ended.push(onEnded);
      }
      if (ended.length === 1) {
        queueMicrotask(() => {
          onAnswer?.({
            status: 'batch',
            chatId: 'chat_1',
            cursor: 0,
            nextCursor: 1,
            endCursor: 1,
            events: [lifecycleRow(0, 'admitted')],
          });
        });
      }
      return vi.fn();
    });
    const connect = vi.fn(async () => ({
      read,
      subscribe,
      close,
    }));
    const first = createActor(hostAttachment, { input: { chatId: 'chat_1', connect, projection } }).start();
    await vi.waitFor(() => {
      expect(ended).toHaveLength(1);
    });
    ended[0]!();
    first.stop();
    const second = createActor(hostAttachment, { input: { chatId: 'chat_1', connect, projection } }).start();
    await vi.waitFor(() => {
      expect(ended).toHaveLength(2);
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenNthCalledWith(
      2,
      { chatId: 'chat_1', cursor: 1, last: { leaderEpoch: 'g1', sequence: 0 } },
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(read).not.toHaveBeenCalled();
    second.stop();
    expect(close).toHaveBeenCalledTimes(2);
    projection.stop();
  });

  it('ignores a retired attachment’s late success and loss after its replacement observed a newer failure', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const oldStatus = vi.fn();
    let oldAnswer: Parameters<AgentHostClient['subscribe']>[3];
    let oldEnded: Parameters<AgentHostClient['subscribe']>[2];
    const old = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            oldEnded = parameters[2];
            oldAnswer = parameters[3];
            return vi.fn();
          },
          close: async () => undefined,
        }),
        projection,
        onStatus: oldStatus,
      },
    }).start();
    await vi.waitFor(() => {
      expect(oldAnswer).toBeDefined();
    });
    old.stop();
    const replacement = createActor(hostAttachment, {
      input: {
        chatId: 'chat_1',
        connect: async () => ({
          read: vi.fn(),
          subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
            queueMicrotask(() => {
              parameters[3]?.({
                status: 'batch',
                chatId: 'chat_1',
                cursor: 0,
                nextCursor: 1,
                endCursor: 1,
                events: [{ ...lifecycleRow(0, 'failed'), detail: { message: 'Current failure' } }],
              });
            });
            return vi.fn();
          },
          close: async () => undefined,
        }),
        projection,
      },
    }).start();
    await vi.waitFor(() => {
      expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    });
    oldAnswer?.({
      status: 'batch',
      chatId: 'chat_1',
      cursor: 1,
      nextCursor: 2,
      endCursor: 2,
      events: [lifecycleRow(1, 'completed')],
    });
    oldEnded?.();
    expect(projection.getSnapshot().context.ledger.position.cursor).toBe(1);
    expect(projection.getSnapshot().context.failure?.text).toBe('Current failure');
    expect(oldStatus).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'attachment.lost' }));
    replacement.stop();
    projection.stop();
  });
});
