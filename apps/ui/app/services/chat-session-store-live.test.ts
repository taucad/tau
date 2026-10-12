// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ProviderMessage } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { lifecycleRow, logRow, publishLogRows, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';

const visible = (messages: readonly MyUIMessage[]): Array<{ id: string; text: string }> =>
  messages.map((message) => ({
    id: message.id,
    text: message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(''),
  }));

const createStore = (
  foreign?: Readonly<{ readdir: () => Promise<string[]>; readFile: () => Promise<Uint8Array<ArrayBuffer>> }>,
): ChatSessionStore => {
  const store = new ChatSessionStore();
  const missing = async (): Promise<never> => {
    throw Object.assign(new Error('Missing record'), { code: 'ENOENT' });
  };
  store.setDependencies({
    getChat: async () => ({
      id: 'chat',
      resourceId: 'project',
      name: '',
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    }),
    patchChat: async () => undefined,
    touchChatRecency: async () => undefined,
    consumeChatStartupRequest: async () => undefined,
    commitCancelledDraftRestore: async () => undefined,
    client: {
      readFile: async (path) =>
        foreign !== undefined && path.endsWith('/peer.jsonl') ? foreign.readFile() : missing(),
      readdir: foreign?.readdir ?? (async () => []),
      exists: async () => false,
      writeFile: async () => undefined,
      rmdir: async () => undefined,
      unlink: async () => undefined,
    },
  });
  return store;
};

describe('ChatSessionStore with the pinned real SDK', () => {
  it.each(['running', 'paused'] as const)(
    'should defer foreign storage refresh during %s until the host settles while preserving active local output',
    async (phase) => {
      const encode = new TextEncoder();
      let foreignRows: readonly unknown[] = [];
      const readFile = vi.fn(async () =>
        encode.encode(foreignRows.map((row) => JSON.stringify(row)).join('\n') + '\n'),
      );
      const store = createStore({ readdir: async () => (foreignRows.length === 0 ? [] : ['peer.jsonl']), readFile });
      const { chat } = store.acquire('chat', 'project');
      await vi.waitFor(() => {
        expect(store.get('chat')?.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      publishLogRows(store, 'chat', [
        {
          ...lifecycleRow(0, 'admitted', 'local'),
          admission: {
            kind: 'tau',
            turnId: 'local-u',
            message: { id: 'local-u', role: 'user', content: 'Local prompt' },
          },
        },
        lifecycleRow(1, 'running', 'local'),
        logRow(2, {
          runId: 'local',
          type: 'message.appended',
          message: { id: 'local-a', role: 'assistant', content: [{ type: 'text', text: 'Held local output' }] },
        }),
      ]);
      await vi.waitFor(() => {
        expect(visible(chat.messages).map((message) => message.text)).toContain('Held local output');
      });
      foreignRows = [
        {
          ...lifecycleRow(0, 'admitted', 'foreign'),
          leaderEpoch: 'peer',
          recordedAt: '2026-09-27T00:00:00.000Z',
          admission: {
            kind: 'tau',
            turnId: 'peer-u',
            message: { id: 'peer-u', role: 'user', content: 'Foreign prompt' },
          },
        },
        { ...lifecycleRow(1, 'running', 'foreign'), leaderEpoch: 'peer' },
        {
          ...logRow(2, {
            runId: 'foreign',
            type: 'message.appended',
            message: { id: 'peer-a', role: 'assistant', content: [{ type: 'text', text: 'Unique foreign answer' }] },
          }),
          leaderEpoch: 'peer',
        },
        { ...lifecycleRow(3, 'completed', 'foreign'), leaderEpoch: 'peer' },
      ];
      if (phase === 'paused') {
        publishLogRows(store, 'chat', [lifecycleRow(3, 'paused', 'local')], 3);
        await vi.waitFor(() => {
          expect(chat.status).toBe('ready');
        });
      }
      const terminalCursor = phase === 'paused' ? 4 : 3;
      try {
        await store.refreshFromStorage('chat');
        expect(readFile).not.toHaveBeenCalled();
        expect(visible(chat.messages).map((message) => message.text)).toContain('Held local output');
        publishLogRows(store, 'chat', [lifecycleRow(terminalCursor, 'completed', 'local')], terminalCursor);
        await vi.waitFor(() => {
          expect(visible(chat.messages).map((message) => message.text)).toEqual([
            'Foreign prompt',
            'Unique foreign answer',
            'Local prompt',
            'Held local output',
          ]);
        });
        expect(readFile).toHaveBeenCalledTimes(1);
      } finally {
        publishLogRows(store, 'chat', [lifecycleRow(terminalCursor + 1, 'completed', 'local')], terminalCursor + 1);
        store.release('chat');
      }
    },
  );

  it.each([
    { kind: 'text', checkpoint: false },
    { kind: 'thinking', checkpoint: false },
    { kind: 'text', checkpoint: true },
    { kind: 'thinking', checkpoint: true },
  ] as const)(
    'should rearm the real SDK when authoritative $kind replaces its preview (checkpoint=$checkpoint)',
    async ({ kind, checkpoint }) => {
      const store = createStore();
      const startCursor = checkpoint ? 3 : 2;
      const canonical: Extract<ProviderMessage, { role: 'assistant' }> = {
        id: 'assistant-1',
        role: 'assistant',
        content: [kind === 'text' ? { type: 'text', text: 'BBBB' } : { type: 'thinking', thinking: 'BBBB' }],
      };
      let deliverLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
      let endLive: (() => void) | undefined;
      const hostCommand = vi.fn<AgentHostClient['hostCommand']>();
      const connect = async () => ({
        hostCommand,
        catchUp: writerOwnedCatchUp,
        read: vi.fn<AgentHostClient['read']>(),
        subscribe: (...parameters: Parameters<AgentHostClient['subscribe']>) => {
          queueMicrotask(() => {
            parameters[3]?.({
              status: 'batch',
              sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
              sourceGeneration: 'writer-live',
              chatId: 'chat',
              cursor: parameters[0].cursor,
              nextCursor: startCursor,
              endCursor: startCursor,
              events:
                parameters[0].cursor === 0
                  ? [
                      {
                        ...lifecycleRow(0, 'admitted'),
                        admission: { kind: 'tau', turnId: 'u', message: { id: 'u', role: 'user', content: 'Prompt' } },
                      },
                      lifecycleRow(1, 'running'),
                      ...(checkpoint
                        ? [
                            logRow(2, {
                              type: 'message.appended',
                              message: {
                                ...canonical,
                                content: [
                                  kind === 'text'
                                    ? { type: 'text', text: 'AAAA' }
                                    : { type: 'thinking', thinking: 'AAAA' },
                                ],
                                metadata: { tauInternal: { kind: 'stream-checkpoint', streamState: 'checkpoint' } },
                              },
                            }),
                          ]
                        : []),
                    ]
                  : [],
            });
          });
          return vi.fn();
        },
        subscribeLive: (
          _chatId: string,
          listener: Parameters<AgentHostClient['subscribeLive']>[1],
          onEnded?: () => void,
        ) => {
          deliverLive = listener;
          endLive = onEnded;
          return vi.fn();
        },
        close: vi.fn(async () => undefined),
      });
      const { chat } = store.acquire('chat', 'project');
      const unobserve = store.observe('chat', 'project');
      const unpublish = store.publishProjectHostConnector('project', connect);
      const output = (): string =>
        chat.messages
          .flatMap((message) =>
            message.parts.flatMap((part) => (part.type === 'text' || part.type === 'reasoning' ? [part.text] : [])),
          )
          .join('|');
      await vi.waitFor(() => {
        expect(deliverLive).toBeDefined();
        expect(chat.messages[0]?.id).toBe('u');
      });
      const identity = {
        sourceGeneration: 'writer-live',
        chatId: 'chat',
        runId: 'run_1',
        messageId: 'assistant-1',
        contentIndex: 0,
      };
      deliverLive?.('chat', {
        ...identity,
        type: kind === 'text' ? 'text-delta' : 'thinking-delta',
        delta: 'AAAA',
        offset: 0,
      });
      await vi.waitFor(() => {
        expect(output()).toBe('Prompt|AAAA');
      });
      deliverLive?.('chat', { ...identity, type: kind === 'text' ? 'text-end' : 'thinking-end', content: 'BBBB' });
      await vi.waitFor(() => {
        expect(output()).toBe('Prompt|BBBB');
      });
      publishLogRows(
        store,
        'chat',
        [
          logRow(
            startCursor,
            checkpoint
              ? {
                  type: 'message.envelope-replaced',
                  messageId: canonical.id,
                  replacement: canonical,
                }
              : { type: 'message.appended', message: canonical },
          ),
        ],
        startCursor,
      );
      endLive?.();
      await vi.waitFor(() => {
        expect(output()).toBe('Prompt|BBBB');
      });
      publishLogRows(store, 'chat', [lifecycleRow(startCursor + 1, 'completed')], startCursor + 1);
      await vi.waitFor(() => {
        expect(chat.status).toBe('ready');
        expect(output()).toBe('Prompt|BBBB');
      });
      expect(hostCommand).not.toHaveBeenCalled();
      unpublish();
      unobserve();
      store.release('chat');
    },
  );

  it('keeps durable steering between preceding and subsequent output throughout the live watch', async () => {
    const store = createStore();
    const { chat } = store.acquire('chat', 'project');
    const user = { id: 'original', role: 'user', content: 'Make a part' };
    const snapshots: Array<ReturnType<typeof visible>> = [];
    chat['~registerMessagesCallback'](() => {
      snapshots.push(visible(chat.messages));
    });
    publishLogRows(store, 'chat', [
      {
        ...lifecycleRow(0, 'admitted'),
        admission: { kind: 'tau', turnId: user.id, message: user },
      },
      lifecycleRow(1, 'running'),
      logRow(2, {
        type: 'message.appended',
        message: {
          id: 'before',
          role: 'assistant',
          content: [{ type: 'text', text: 'Before steering' }],
        },
      }),
    ]);
    await vi.waitFor(() => {
      expect(visible(chat.messages)).toEqual([
        { id: 'original', text: 'Make a part' },
        { id: 'run_1', text: 'Before steering' },
      ]);
    });
    publishLogRows(
      store,
      'chat',
      [
        logRow(3, {
          type: 'message.appended',
          message: { id: 'steer:command', role: 'user', content: 'Use PETG' },
        }),
      ],
      3,
    );
    await vi.waitFor(() => {
      expect(visible(chat.messages).slice(0, 3)).toEqual([
        { id: 'original', text: 'Make a part' },
        { id: 'run_1', text: 'Before steering' },
        { id: 'steer:command', text: 'Use PETG' },
      ]);
    });
    publishLogRows(
      store,
      'chat',
      [
        logRow(4, {
          type: 'message.appended',
          message: {
            id: 'after',
            role: 'assistant',
            content: [{ type: 'text', text: 'After steering' }],
          },
        }),
      ],
      4,
    );
    await vi.waitFor(() => {
      expect(visible(chat.messages)).toEqual([
        { id: 'original', text: 'Make a part' },
        { id: 'run_1', text: 'Before steering' },
        { id: 'steer:command', text: 'Use PETG' },
        { id: 'run_1:steer:command', text: 'After steering' },
      ]);
    });
    publishLogRows(store, 'chat', [lifecycleRow(5, 'completed')], 5);
    await vi.waitFor(() => {
      expect(chat.status).toBe('ready');
    });
    expect(snapshots.every((snapshot) => new Set(snapshot.map((message) => message.id)).size === snapshot.length)).toBe(
      true,
    );
    expect(visible(chat.messages).map((message) => message.text)).toEqual([
      'Make a part',
      'Before steering',
      'Use PETG',
      'After steering',
    ]);
    store.release('chat');
  });

  it('does not arm a new response until its canonical input is available', async () => {
    const store = createStore();
    const { chat } = store.acquire('chat', 'project');
    const first = { id: 'original', role: 'user', content: 'Which printer?' };
    publishLogRows(store, 'chat', [
      {
        ...lifecycleRow(0, 'admitted'),
        admission: { kind: 'tau', turnId: first.id, message: first },
      },
      lifecycleRow(1, 'running'),
      logRow(2, {
        type: 'message.appended',
        message: {
          id: 'before',
          role: 'assistant',
          content: [{ type: 'text', text: 'Use X1C' }],
        },
      }),
      lifecycleRow(3, 'completed'),
    ]);
    await vi.waitFor(() => {
      expect(visible(chat.messages)).toEqual([
        { id: 'original', text: 'Which printer?' },
        { id: 'run_1', text: 'Use X1C' },
      ]);
    });
    publishLogRows(store, 'chat', [lifecycleRow(4, 'admitted', 'next'), lifecycleRow(5, 'running', 'next')], 4);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(visible(chat.messages)).toEqual([
      { id: 'original', text: 'Which printer?' },
      { id: 'run_1', text: 'Use X1C' },
    ]);
    expect(chat.status).toBe('ready');
    publishLogRows(
      store,
      'chat',
      [
        logRow(6, {
          runId: 'next',
          type: 'message.appended',
          message: {
            id: 'next-user',
            role: 'user',
            content: 'What other printers?',
          },
        }),
        logRow(7, {
          runId: 'next',
          type: 'message.appended',
          message: {
            id: 'after',
            role: 'assistant',
            content: [{ type: 'text', text: 'A1 is available' }],
          },
        }),
        lifecycleRow(8, 'completed', 'next'),
      ],
      6,
    );
    await vi.waitFor(() => {
      expect(visible(chat.messages).map((message) => message.text)).toEqual([
        'Which printer?',
        'Use X1C',
        'What other printers?',
        'A1 is available',
      ]);
    });
    store.release('chat');
  });
});
