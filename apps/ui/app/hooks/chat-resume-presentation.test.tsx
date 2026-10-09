// @vitest-environment jsdom
import { act, render, screen, cleanup } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ChatSessionStore } from '#services/chat-session-store.js';
import type { ChatSession, ChatSessionDeps } from '#services/chat-session-store.js';
import { lifecycleRow, logRow, publishLogRows } from '#machines/chat-projection.fixture.js';

const binding = vi.hoisted(() => ({
  store: undefined as ChatSessionStore | undefined,
  session: undefined as ChatSession | undefined,
}));
// eslint-disable-next-line @typescript-eslint/naming-convention -- Mirror the environment module wire names.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'http://test.local' } }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => binding.store }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: () => ({ activeChatId: 'chat_1', draftActorRef: binding.session?.draftActorRef }),
  useChatComposer: () => {
    throw new Error('Unexpected composer access');
  },
}));
const { useChatSelector } = await import('#hooks/use-chat.js');

it.each(['text', 'interrupted-tool', 'approval'] as const)(
  'should preserve coherent assistant presentation and DOM identity throughout cumulative Resume replay with %s',
  async (tail) => {
    const sequence = (value: number): number => value + (tail !== 'text' && value >= 7 ? 1 : 0);
    const store = new ChatSessionStore();
    store.setDependencies(
      mock<ChatSessionDeps>({
        getChat: vi.fn(async () => ({
          id: 'chat_1',
          resourceId: 'project_1',
          name: '',
          messages: [],
          createdAt: 0,
          updatedAt: 0,
        })),
        client: mock<ChatSessionDeps['client']>({
          readFile: vi.fn(async () => {
            throw Object.assign(new Error('Missing record'), { code: 'ENOENT' });
          }),
          readdir: vi.fn(async () => []),
          exists: vi.fn(async () => false),
          writeFile: vi.fn(async () => undefined),
        }),
      }),
    );
    binding.store = store;
    const session = store.acquire('chat_1', 'project_1');
    binding.session = session;
    const admitted = (sequence: number, runId: string): Record<string, unknown> => ({
      ...lifecycleRow(sequence, 'admitted', runId),
      admission: {
        kind: 'tau',
        turnId: `user_${runId}`,
        message: { id: `user_${runId}`, role: 'user', content: `Ask ${runId}` },
      },
    });
    const prose = (sequence: number, runId: string, text: string): Record<string, unknown> =>
      logRow(sequence, {
        runId,
        type: 'message.appended',
        message: { id: `assistant_${runId}`, role: 'assistant', content: [{ type: 'text', text }] },
      });
    await vi.waitFor(() => {
      expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
    });
    publishLogRows(store, 'chat_1', [
      admitted(0, 'earlier'),
      lifecycleRow(1, 'running', 'earlier'),
      prose(2, 'earlier', 'Earlier completed answer'),
      lifecycleRow(3, 'completed', 'earlier'),
      admitted(4, 'current'),
      lifecycleRow(5, 'running', 'current'),
      prose(6, 'current', 'Prior paragraph'),
      ...(tail === 'interrupted-tool'
        ? [
            logRow(7, {
              runId: 'current',
              type: 'message.appended',
              message: {
                id: 'tool-input',
                role: 'tool-input',
                toolCallId: 'held-tool',
                toolName: 'read',
                content: { file: 'main.ts' },
              },
            }),
          ]
        : []),
      ...(tail === 'approval'
        ? [
            logRow(7, {
              runId: 'current',
              type: 'interrupt.recorded',
              interruptId: 'held-approval',
              phase: 'requested',
              reason: 'Approve read',
            }),
          ]
        : []),
      { ...lifecycleRow(sequence(7), 'cancelled', 'current'), detail: { code: 'USER_STOPPED', message: 'Stopped' } },
    ]);
    await vi.waitFor(() => {
      expect(
        session.chat.messages
          .flatMap((message) => message.parts)
          .some((part) => part.type === 'text' && part.text === 'Prior paragraph'),
      ).toBe(true);
    });
    const commits: string[][] = [];
    function Message({ id }: { readonly id: string }): React.JSX.Element {
      const message = useChatSelector((state) => state.messagesById.get(id));
      return <article>{message?.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')}</article>;
    }
    function History(): React.JSX.Element {
      const messages = useChatSelector((state) => state.messages);
      const order = useChatSelector((state) => state.messageOrder);
      const groups = useChatSelector((state) => state.turnGroups);
      useLayoutEffect(() => {
        commits.push(
          messages.flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))),
        );
      }, [messages]);
      expect(messages.map((message) => message.id)).toEqual(order);
      expect(groups.flatMap((group) => group.messageIds)).toEqual(order);
      return (
        <section>
          {order.map((id) => (
            <Message key={id} id={id} />
          ))}
        </section>
      );
    }
    render(<History />);
    const prior = screen.getByText('Prior paragraph');
    const earlier = screen.getByText('Earlier completed answer');
    try {
      await act(async () => {
        publishLogRows(
          store,
          'chat_1',
          [logRow(sequence(8), { runId: 'current', type: 'run.lifecycle', state: 'running', attempt: 2 })],
          sequence(8),
        );
      });
      await vi.waitFor(() => {
        expect(session.chat.status).toBe('streaming');
      });
      expect(commits.every((messages) => messages.filter((text) => text === 'Prior paragraph').length === 1)).toBe(
        true,
      );
      expect(screen.getByText('Prior paragraph')).toBe(prior);
      expect(screen.getByText('Earlier completed answer')).toBe(earlier);
      await act(async () => {
        publishLogRows(
          store,
          'chat_1',
          [
            logRow(sequence(9), {
              runId: 'current',
              type: 'message.appended',
              message: {
                id: 'resumed-output',
                role: 'assistant',
                content: [
                  { type: 'thinking', thinking: 'New reasoning' },
                  { type: 'text', text: 'Resumed paragraph' },
                ],
              },
            }),
          ],
          sequence(9),
        );
      });
      await vi.waitFor(() => {
        expect(screen.getByText(/Resumed paragraph/)).toBeDefined();
      });
      expect(screen.getByText(/Prior paragraph/)).toBe(prior);
      expect(
        session.messages
          .flatMap((message) => message.parts)
          .filter((part) => part.type === 'reasoning' && part.text === 'New reasoning'),
      ).toHaveLength(1);
      await act(async () => {
        publishLogRows(
          store,
          'chat_1',
          [
            {
              ...lifecycleRow(sequence(10), 'cancelled', 'current'),
              detail: { code: 'USER_STOPPED', message: 'Stopped again' },
            },
          ],
          sequence(10),
        );
      });
      await vi.waitFor(() => {
        expect(session.chat.status).toBe('ready');
      });
      await act(async () => {
        publishLogRows(
          store,
          'chat_1',
          [logRow(sequence(11), { runId: 'current', type: 'run.lifecycle', state: 'running', attempt: 3 })],
          sequence(11),
        );
      });
      await vi.waitFor(() => {
        expect(session.chat.status).toBe('streaming');
      });
      expect(screen.getByText(/Prior paragraph/)).toBe(prior);
      expect(session.messages.filter((message) => message.role === 'user').map((message) => message.id)).toEqual([
        'user_earlier',
        'user_current',
      ]);
      expect(commits.every((messages) => messages.join('|').split('Prior paragraph').length === 2)).toBe(true);
      await act(async () => {
        store.receiveHostReadAnswer('chat_1', {
          status: 'refused',
          reason: 'identity-mismatch',
        });
        publishLogRows(store, 'chat_1', [
          admitted(0, 'replacement'),
          lifecycleRow(1, 'running', 'replacement'),
          prose(2, 'replacement', 'Replacement source'),
          lifecycleRow(3, 'completed', 'replacement'),
        ]);
      });
      await vi.waitFor(() => {
        expect(screen.queryByText(/Prior paragraph/)).toBeNull();
      });
      expect(screen.getByText('Replacement source')).toBeDefined();
    } finally {
      cleanup();
      const cursor = store.getProjection('chat_1')?.ledger.position.cursor ?? 0;
      publishLogRows(store, 'chat_1', [lifecycleRow(cursor, 'completed', 'replacement')], cursor);
      store.release('chat_1');
      binding.session = undefined;
      binding.store = undefined;
    }
  },
);
