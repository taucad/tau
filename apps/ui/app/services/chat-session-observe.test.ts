import { describe, expect, it, vi } from 'vitest';
import type { ReadAnswer } from '@taucad/agent-host/wire';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { lifecycleRow } from '#machines/chat-projection.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { publishChatLogAnswer } from '#chat-clients/_internal/browser-agent-host-transport.js';

const unusedHostCommand = async (): Promise<never> => {
  throw new Error('Unexpected host command.');
};

describe('ChatSessionStore.observe', () => {
  it('cancels an unopened projected run through its host without acquiring an SDK session', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_unseen', 'project_1');
    const hostCommand = vi.fn(async (command: { commandId: string }) => ({
      commandId: command.commandId,
      generation: 1,
      status: 'applied' as const,
      effect: 'durable' as const,
      cursor: 2,
    }));
    const unpublish = store.publishProjectHostConnector('project_1', async () => ({
      read: vi.fn(),
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        queueMicrotask(() => {
          parameters[3]?.({
            status: 'batch',
            chatId: 'chat_unseen',
            cursor: 0,
            nextCursor: 2,
            endCursor: 2,
            events: [lifecycleRow(0, 'admitted', 'run-unseen'), lifecycleRow(1, 'running', 'run-unseen')],
          });
        });
        return vi.fn();
      },
      hostCommand,
      close: async () => undefined,
    }));
    await vi.waitFor(() => expect(store.getProjection('chat_unseen')?.ledger.position.cursor).toBe(2));

    await store.cancelProjectedRun('chat_unseen');
    expect(store.get('chat_unseen')).toBeUndefined();
    expect(hostCommand).toHaveBeenCalledWith({
      type: 'cancel',
      commandId: expect.any(String),
      payload: { chatId: 'chat_unseen', runId: 'run-unseen' },
    });
    expect(hostCommand).toHaveBeenCalledOnce();
    unpublish();
    release();
  });
  it('retains an unreadable fault without retrying the same log forever', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_unreadable', 'project_1');
    const connect = vi.fn(async () => ({
      read: vi.fn(),
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        queueMicrotask(() => {
          parameters[3]?.({ status: 'refused', chatId: 'chat_unreadable', reason: 'unreadable' });
          parameters[2]?.();
        });
        return vi.fn();
      },
      hostCommand: unusedHostCommand,
      close: async () => undefined,
    }));
    const unpublish = store.publishProjectHostConnector('project_1', connect);
    await vi.waitFor(() => expect(store.getProjection('chat_unreadable')?.fault).toBeDefined());
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    expect(connect).toHaveBeenCalledOnce();
    unpublish();
    release();
  });
  it('reads every observed chat without acquiring an SDK session and preserves its cursor across connector churn', async () => {
    const store = new ChatSessionStore();
    const close = vi.fn(async () => undefined);
    const read = vi.fn(
      async ({ chatId, cursor }: { chatId: string; cursor: number }): Promise<ReadAnswer> => ({
        status: 'batch',
        chatId,
        cursor,
        nextCursor: cursor === 0 ? 1 : cursor,
        endCursor: 1,
        events: cursor === 0 ? [lifecycleRow(0, 'admitted')] : [],
      }),
    );
    const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
      const input = parameters[0];
      const onAnswer = parameters[3];
      if (input.cursor === 0) {
        queueMicrotask(() => {
          onAnswer?.({
            status: 'batch',
            chatId: input.chatId,
            cursor: 0,
            nextCursor: 1,
            endCursor: 1,
            events: [lifecycleRow(0, 'admitted')],
          });
        });
      }
      return vi.fn();
    });
    const connect = vi.fn(
      async (_chatId: string): Promise<Pick<AgentHostClient, 'read' | 'subscribe' | 'hostCommand' | 'close'>> => ({
        read,
        subscribe,
        hostCommand: unusedHostCommand,
        close,
      }),
    );
    const releaseA = store.observe('chat_a', 'project_1');
    const releaseB = store.observe('chat_b', 'project_1');
    expect(store.get('chat_a')).toBeUndefined();
    expect(store.observedChatIdsOf('project_1')).toEqual(['chat_a', 'chat_b']);
    const unpublish = store.publishProjectHostConnector('project_1', connect);
    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledTimes(2);
    });
    expect(store.getProjection('chat_a')?.ledger.position.cursor).toBe(1);
    expect(store.getProjection('chat_b')?.ledger.position.cursor).toBe(1);
    publishChatLogAnswer('chat_a', {
      status: 'batch',
      cursor: 1,
      nextCursor: 2,
      endCursor: 2,
      events: [lifecycleRow(1, 'completed')],
    });
    expect(store.getProjection('chat_a')?.ledger.position.cursor).toBe(1);
    unpublish();
    expect(close).toHaveBeenCalledTimes(2);
    const unpublishAgain = store.publishProjectHostConnector('project_1', connect);
    await vi.waitFor(() => {
      expect(subscribe).toHaveBeenCalledTimes(4);
    });
    expect(subscribe.mock.calls.slice(2).map(([input]) => input.cursor)).toEqual([1, 1]);
    expect(read).not.toHaveBeenCalled();
    unpublishAgain();
    releaseA();
    releaseB();
    expect(store.observedChatIdsOf('project_1')).toEqual([]);
  });

  it('counts a projected run in an unopened chat before project Close', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_unopened', 'project_2');
    const unpublish = store.publishProjectHostConnector('project_2', async () => ({
      read: async (): Promise<ReadAnswer> => ({
        status: 'batch',
        chatId: 'chat_unopened',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
      }),
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        const onAnswer = parameters[3];
        queueMicrotask(() => {
          onAnswer?.({
            status: 'batch',
            chatId: 'chat_unopened',
            cursor: 0,
            nextCursor: 2,
            endCursor: 2,
            events: [lifecycleRow(0, 'admitted'), lifecycleRow(1, 'running')],
          });
        });
        return () => undefined;
      },
      hostCommand: unusedHostCommand,
      close: async () => undefined,
    }));
    await vi.waitFor(() => {
      expect(store.getProjection('chat_unopened')?.ledger.position.cursor).toBe(2);
    });
    expect(store.get('chat_unopened')).toBeUndefined();
    const runs: string[] = [];
    const send = vi.fn((event: { type: string; chatId: string }) => {
      if (event.type === 'runStarted') {
        runs.push(event.chatId);
      }
    });
    store.setProjectSession('project_2', {
      getSnapshot: () => ({ context: { runs } }),
      send,
    } as unknown as ProjectSessionActorRef);
    expect(send).toHaveBeenCalledWith({ type: 'runStarted', chatId: 'chat_unopened' });
    expect(runs).toEqual(['chat_unopened']);
    store.setProjectSession('project_2', undefined);
    unpublish();
    release();
  });
});
