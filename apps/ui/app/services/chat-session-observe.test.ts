import { describe, expect, it, vi } from 'vitest';
import type { CommandAnswer, HostCommand, ReadAnswer } from '@taucad/agent-host/wire';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { chunksOf } from '#machines/chat-projection.logic.js';
import type { ChatSessionDeps } from '#services/chat-session-store.js';
import { compactRow, lifecycleRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';

const unusedHostCommand = async (): Promise<never> => {
  throw new Error('Unexpected host command.');
};

describe('ChatSessionStore.observe', () => {
  for (const { ending, sameTurn } of [
    { ending: 'live-ended', sameTurn: false },
    { ending: 'unreadable', sameTurn: false },
    { ending: 'live-ended', sameTurn: true },
    { ending: 'unreadable', sameTurn: true },
  ] as const) {
    it(`retires the fenced-reader retry when its retained attachment becomes ${ending} ${sameTurn ? 'before' : 'after'} retry scheduling`, async () => {
      const store = new ChatSessionStore();
      const release = store.observe('chat_retry_owner', 'project_1');
      let answer: Parameters<AgentHostClient['subscribe']>[3];
      let endLive: (() => void) | undefined;
      const connect = vi.fn(async () => ({
        catchUp: writerOwnedCatchUp,
        read: vi.fn(),
        close: async () => undefined,
        hostCommand: unusedHostCommand,
        subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
          answer = parameters[3];
          return vi.fn();
        },
        subscribeLive: (
          _chatId: string,
          _listener: Parameters<AgentHostClient['subscribeLive']>[1],
          ended?: () => void,
        ) => {
          endLive = ended;
          return vi.fn();
        },
      }));
      const unpublish = store.publishProjectHostConnector('project_1', connect);
      try {
        await vi.waitFor(() => {
          expect(answer).toBeDefined();
        });
        vi.useFakeTimers();
        answer?.({ status: 'refused', chatId: 'chat_retry_owner', reason: 'owner-fenced' });
        if (!sameTurn) {
          await Promise.resolve();
        }
        if (ending === 'live-ended') {
          endLive?.();
        } else {
          answer?.({ status: 'refused', chatId: 'chat_retry_owner', reason: 'unreadable' });
        }
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(250);
        expect(connect).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(250);
        expect(connect).toHaveBeenCalledTimes(ending === 'live-ended' ? 2 : 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(connect).toHaveBeenCalledTimes(ending === 'live-ended' ? 2 : 1);
      } finally {
        unpublish();
        release();
        vi.useRealTimers();
      }
    });
  }

  it('retains live delivery while the existing retry owner recaptures a fenced reader', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_reader_recovery', 'project_1');
    let answer: Parameters<AgentHostClient['subscribe']>[3];
    let ended: (() => void) | undefined;
    let live: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
    const liveState = { active: false };
    let captures = 0;
    const close = vi.fn(async () => undefined);
    const stopLive = vi.fn(() => {
      liveState.active = false;
    });
    const subscribeLive = vi.fn((_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
      liveState.active = true;
      live = listener;
      return stopLive;
    });
    const catchUp = async function* (): ReturnType<AgentHostClient['catchUp']> {
      captures += 1;
      if (captures === 1) {
        yield {
          type: 'refused',
          answer: { status: 'refused', chatId: 'chat_reader_recovery', reason: 'writer-owned' },
        };
        return;
      }
      yield {
        type: 'page',
        answer: {
          status: 'batch',
          chatId: 'chat_reader_recovery',
          sourceGeneration: 'replacement-writer',
          cursor: 0,
          nextCursor: 2,
          endCursor: 2,
          facts: [lifecycleRow(0, 'admitted', 'same-run'), lifecycleRow(1, 'running', 'same-run')].map((row) =>
            compactRow(row),
          ),
        },
      };
      yield {
        type: 'validated',
        health: { historyIntact: true, newerHistory: false, quarantined: false },
        position: {
          cursor: 2,
          sourceGeneration: 'replacement-writer',
          last: { leaderEpoch: 'g1', sequence: 1 },
        },
        observedEndCursor: 2,
      };
    };
    const connect = vi.fn(async () => ({
      catchUp,
      read: vi.fn(),
      close,
      hostCommand: unusedHostCommand,
      subscribeLive,
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        answer = parameters[3];
        ended = parameters[2];
        return vi.fn();
      },
    }));
    const unpublish = store.publishProjectHostConnector('project_1', connect);
    try {
      await vi.waitFor(() => {
        expect(answer).toBeDefined();
      });
      answer?.({ status: 'refused', chatId: 'chat_reader_recovery', reason: 'owner-fenced' });
      ended?.();
      await Promise.resolve();
      if (liveState.active) {
        live?.('chat_reader_recovery', {
          chatId: 'chat_reader_recovery',
          runId: 'same-run',
          sourceGeneration: 'replacement-writer',
          type: 'text-delta',
          messageId: 'assistant-1',
          contentIndex: 0,
          delta: 'first resumed prefix',
        });
      }
      await vi.waitFor(() => {
        expect(captures).toBe(2);
      });
      expect(connect).toHaveBeenCalledOnce();
      expect(subscribeLive).toHaveBeenCalledOnce();
      expect(stopLive).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(chunksOf(store.getProjection('chat_reader_recovery')?.live?.chunks)).toContainEqual(
        expect.objectContaining({ type: 'text-delta', delta: 'first resumed prefix' }),
      );
    } finally {
      unpublish();
      release();
    }
  });

  it('should refuse cross-project acquisition before allocating a retained session', () => {
    const store = new ChatSessionStore();
    const release = store.observe('shared-chat', 'original-project');
    expect(() => store.acquire('shared-chat', 'other-project')).toThrow('already observed');
    expect(store.get('shared-chat')).toBeUndefined();
    expect(store.observedChatIdsOf('original-project')).toEqual(['shared-chat']);
    expect(store.observedChatIdsOf('other-project')).toEqual([]);
    release();
    expect(store.observedChatIdsOf('original-project')).toEqual([]);
  });

  it('answers a reloaded approval from the projected run without acquiring a chat or sending Start', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_approval', 'project_1');
    const hostCommand = vi.fn(
      async (command: HostCommand): Promise<CommandAnswer> => ({
        commandId: command.commandId,
        generation: 1,
        status: 'applied',
        effect: 'durable',
        cursor: 3,
      }),
    );
    const unpublish = store.publishProjectHostConnector('project_1', async () => ({
      catchUp: writerOwnedCatchUp,
      read: vi.fn(),
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        queueMicrotask(() => {
          parameters[3]?.({
            status: 'batch',
            sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
            chatId: 'chat_approval',
            cursor: 0,
            nextCursor: 4,
            endCursor: 4,
            events: [
              lifecycleRow(0, 'admitted', 'run-reloaded'),
              lifecycleRow(1, 'running', 'run-reloaded'),
              {
                ...lifecycleRow(2, 'paused', 'run-reloaded'),
                type: 'interrupt.recorded',
                interruptId: 'interrupt-1',
                phase: 'requested',
                reason: 'ask',
              },
              lifecycleRow(3, 'paused', 'run-reloaded'),
            ],
          });
        });
        return () => undefined;
      },
      hostCommand,
      close: async () => undefined,
    }));
    await vi.waitFor(() => {
      expect(store.getProjection('chat_approval')?.ledger.position.cursor).toBe(4);
    });

    expect(
      await store.respondToProjectedApproval('chat_approval', 'interrupt-1', { approved: true, optionId: 'once' }),
    ).toBe(true);
    expect(hostCommand.mock.calls.map(([command]) => command.type)).toEqual(['resolve-interrupt', 'resume']);
    expect(hostCommand.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        chatId: 'chat_approval',
        runId: 'run-reloaded',
        interruptId: 'interrupt-1',
        outcome: 'approved',
        optionId: 'once',
      },
    });
    expect(hostCommand.mock.calls[1]?.[0]).toMatchObject({
      payload: { chatId: 'chat_approval', runId: 'run-reloaded' },
    });
    expect(store.get('chat_approval')).toBeUndefined();
    unpublish();
    release();
  });

  it('classifies unseen projected runs for Close without acquiring an SDK session', async () => {
    const store = new ChatSessionStore();
    store.setDependencies({
      getChat: async (chatId: string) => ({ name: `Name ${chatId}` }),
    } as ChatSessionDeps);
    const releases = ['chat_local', 'chat_foreign', 'chat_background'].map((chatId) =>
      store.observe(chatId, 'project_close'),
    );
    const unpublish = store.publishProjectHostConnector(
      'project_close',
      async () => ({
        catchUp: writerOwnedCatchUp,
        read: vi.fn(),
        subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
          const { chatId } = parameters[0];
          queueMicrotask(() => {
            parameters[3]?.({
              status: 'batch',
              sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
              chatId,
              cursor: 0,
              nextCursor: 2,
              endCursor: 2,
              events: [lifecycleRow(0, 'admitted', `run-${chatId}`), lifecycleRow(1, 'running', `run-${chatId}`)],
            });
          });
          return () => undefined;
        },
        hostCommand: unusedHostCommand,
        close: async () => undefined,
      }),
      async (chatId) =>
        chatId === 'chat_local' ? 'stoppable' : chatId === 'chat_foreign' ? 'other-build' : 'background-window',
    );
    await vi.waitFor(() => {
      expect(store.getProjection('chat_background')?.ledger.position.cursor).toBe(2);
    });
    expect(await store.getProjectClosePlan('project_close')).toEqual({
      stoppableRunCount: 1,
      stoppableChatIds: ['chat_local'],
      liveChatIds: ['chat_local', 'chat_foreign', 'chat_background'],
      continuingRuns: [
        { id: 'run-chat_foreign', label: 'Name chat_foreign', reason: 'other-build' },
        { id: 'run-chat_background', label: 'Name chat_background', reason: 'background-window' },
      ],
    });
    expect(store.get('chat_local')).toBeUndefined();
    unpublish();
    for (const release of releases) {
      release();
    }
  });

  it('cancels an unopened projected run through its host without acquiring an SDK session', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_unseen', 'project_1');
    const hostCommand = vi.fn(
      async (command: HostCommand): Promise<CommandAnswer> => ({
        commandId: command.commandId,
        generation: 1,
        status: 'applied',
        effect: 'durable',
        cursor: 2,
      }),
    );
    const unpublish = store.publishProjectHostConnector('project_1', async () => ({
      catchUp: writerOwnedCatchUp,
      read: vi.fn(),
      subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
        queueMicrotask(() => {
          parameters[3]?.({
            status: 'batch',
            sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
    await vi.waitFor(() => {
      expect(store.getProjection('chat_unseen')?.ledger.position.cursor).toBe(2);
    });

    await store.cancelProjectedRun('chat_unseen');
    expect(store.get('chat_unseen')).toBeUndefined();
    expect(hostCommand.mock.calls[0]?.[0]).toMatchObject({
      type: 'cancel',
      payload: { chatId: 'chat_unseen', runId: 'run-unseen' },
    });
    expect(hostCommand.mock.calls[0]?.[0].commandId).toMatch(/^req_/u);
    expect(hostCommand).toHaveBeenCalledOnce();
    unpublish();
    release();
  });
  it('retains an unreadable fault without retrying the same log forever', async () => {
    const store = new ChatSessionStore();
    const release = store.observe('chat_unreadable', 'project_1');
    const connect = vi.fn(async () => ({
      catchUp: writerOwnedCatchUp,
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
    await vi.waitFor(() => {
      expect(store.getProjection('chat_unreadable')?.fault).toBeDefined();
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 350);
    });
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
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
            sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
      async (
        _chatId: string,
      ): Promise<Pick<AgentHostClient, 'read' | 'catchUp' | 'subscribe' | 'hostCommand' | 'close'>> => ({
        catchUp: writerOwnedCatchUp,
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
    const classification = Promise.withResolvers<'stoppable'>();
    const release = store.observe('chat_unopened', 'project_2');
    const unpublish = store.publishProjectHostConnector(
      'project_2',
      async () => ({
        catchUp: writerOwnedCatchUp,
        read: async (): Promise<ReadAnswer> => ({
          status: 'batch',
          sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
              sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
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
      }),
      async () => classification.promise,
    );
    await vi.waitFor(() => {
      expect(store.getProjection('chat_unopened')?.ledger.position.cursor).toBe(2);
    });
    expect(store.get('chat_unopened')).toBeUndefined();
    let runs: readonly string[] = [];
    let stoppableRuns: readonly string[] = [];
    const send = vi.fn((event: { type: string; runs: readonly string[]; stoppableRuns: readonly string[] }) => {
      if (event.type === 'projectedRunsChanged') {
        runs = event.runs;
        stoppableRuns = event.stoppableRuns;
      }
    });
    store.setProjectSession('project_2', {
      getSnapshot: () => ({ context: { runs, stoppableRuns } }),
      send,
    } as unknown as ProjectSessionActorRef);
    expect(send).toHaveBeenCalledWith({
      type: 'projectedRunsChanged',
      runs: ['chat_unopened'],
      stoppableRuns: [],
    });
    expect(runs).toEqual(['chat_unopened']);
    classification.resolve('stoppable');
    await vi.waitFor(() => {
      expect(stoppableRuns).toEqual(['chat_unopened']);
    });
    store.setProjectSession('project_2', undefined);
    unpublish();
    release();
  });
});
