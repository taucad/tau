// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { createActor } from 'xstate';
import { expect, it, vi } from 'vitest';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { publishChatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';

const dependencies = vi.hoisted(() => {
  const missing = async (): Promise<never> => {
    throw Object.assign(new Error('Missing record'), { code: 'ENOENT' });
  };
  return {
    activeSession: undefined as ChatSession | undefined,
    getChat: async () => ({ id: 'mounted', resourceId: 'project', name: '', messages: [], createdAt: 0, updatedAt: 0 }),
    patchChat: async () => undefined,
    touchChatRecency: async () => undefined,
    consumeChatStartupRequest: async () => undefined,
    commitCancelledDraftRestore: async () => undefined,
    client: {
      readFile: missing,
      readdir: async () => [],
      exists: async () => false,
      writeFile: async () => undefined,
      rmdir: async () => undefined,
      unlink: async () => undefined,
    },
  };
});
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => dependencies }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ recordFiles: dependencies.client }) }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: () => ({ activeChatId: 'mounted', draftActorRef: dependencies.activeSession?.draftActorRef }),
}));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));
const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
const { useChatSession, useChatSessionSnapshot } = await import('#hooks/use-chat-session.js');
const { useChatSelector } = await import('#hooks/use-chat.js');

it('should deliver a reply through the retained active session without a sidebar observation', async () => {
  let store: ChatSessionStore | undefined;
  function Transcript(): React.JSX.Element {
    store = useChatSessionStore();
    useChatSession('mounted', 'project');
    const messages = useChatSessionSnapshot('mounted', (session) => session?.chat.messages);
    return (
      <div data-testid='transcript'>
        {messages
          ?.flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])))
          .join('|')}
      </div>
    );
  }
  const mounted = render(
    <ChatSessionStoreProvider>
      <Transcript />
    </ChatSessionStoreProvider>,
  );
  const current = store!;
  const session = current.get('mounted')!;
  const owner = createActor(projectSessionMachine, { input: { projectId: 'project' } });
  owner.start();
  current.setFocusedProject('project');
  current.setProjectSession('project', owner);
  let rows: unknown[] = [];
  let deliver: (() => void) | undefined;
  const detach = vi.fn();
  // oxlint-disable-next-line eslint/max-params -- The production subscription contract has four independently meaningful callbacks.
  const subscribe = vi.fn<AgentHostClient['subscribe']>((input, _event, _ended, batch) => {
    deliver = () =>
      batch?.({
        status: 'batch',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
        sourceGeneration: 'writer-mounted',
        chatId: 'mounted',
        cursor: input.cursor,
        nextCursor: rows.length,
        endCursor: rows.length,
        events: rows.slice(input.cursor),
      });
    queueMicrotask(() => deliver?.());
    return detach;
  });
  const hostCommand = vi.fn<AgentHostClient['hostCommand']>(async (command) => {
    rows = [
      {
        ...lifecycleRow(0, 'admitted', 'run'),
        admission: { kind: 'tau', turnId: 'u', message: { id: 'u', role: 'user', content: 'hi' } },
      },
      lifecycleRow(1, 'running', 'run'),
      logRow(2, {
        runId: 'run',
        type: 'message.appended',
        message: { id: 'a', role: 'assistant', content: [{ type: 'text', text: 'Unique mounted reply' }] },
      }),
      lifecycleRow(3, 'completed', 'run'),
    ];
    queueMicrotask(() => deliver?.());
    return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 2 };
  });
  const unconnect = current.publishProjectHostConnector('project', async () => ({
    hostCommand,
    catchUp: writerOwnedCatchUp,
    read: vi.fn(),
    subscribe,
    close: async () => undefined,
  }));
  const message = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }] } as const;
  const unadmit = publishChatTurnAdmission('mounted', async () => ({
    runId: 'run',
    leaseTurnId: undefined,
    request: {
      kind: 'send',
      message: { ...message, parts: [...message.parts] },
      command: {
        type: 'start',
        commandId: 'run',
        payload: {
          chatId: 'mounted',
          runId: 'run',
          message: { id: 'u', role: 'user', content: 'hi' },
          trigger: 'submit',
        },
      },
    },
  }));
  try {
    await act(async () => {
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      await current.requestTurn('mounted', { kind: 'send', message: { ...message, parts: [...message.parts] } });
    });
    await vi.waitFor(() => {
      expect(screen.getByTestId('transcript')).toHaveTextContent('hi|Unique mounted reply');
    });
    expect(current.get('mounted')?.chat).toBe(session.chat);
    expect(hostCommand).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    const releaseSidebar = current.observe('mounted', 'project');
    releaseSidebar();
    expect(detach).not.toHaveBeenCalled();
  } finally {
    unadmit();
    mounted.unmount();
    unconnect();
    owner.stop();
  }
  expect(detach).toHaveBeenCalledTimes(1);
});

it('should publish the first held live reasoning chunk through the actual SDK before durable completion', async () => {
  let store: ChatSessionStore | undefined;
  function IndexedMessage({ id }: { readonly id: string }): React.JSX.Element {
    const message = useChatSelector((state) => state.messagesById.get(id));
    return (
      <span>
        {message?.parts
          .flatMap((part) => (part.type === 'text' || part.type === 'reasoning' ? [part.text] : []))
          .join('|')}
      </span>
    );
  }
  function IndexedTranscript(): React.JSX.Element {
    const groups = useChatSelector((state) => state.turnGroups);
    return (
      <div data-testid='transcript'>
        {groups.flatMap((group) => group.messageIds.map((id) => <IndexedMessage key={id} id={id} />))}
      </div>
    );
  }
  function Transcript(): React.JSX.Element {
    store = useChatSessionStore();
    const acquired = useChatSession('mounted', 'project');
    dependencies.activeSession = acquired;
    return acquired === undefined ? <div /> : <IndexedTranscript />;
  }
  const mounted = render(
    <ChatSessionStoreProvider>
      <Transcript />
    </ChatSessionStoreProvider>,
  );
  const current = store!;
  const session = current.get('mounted')!;
  const owner = createActor(projectSessionMachine, { input: { projectId: 'project' } });
  owner.start();
  current.setFocusedProject('project');
  current.setProjectSession('project', owner);
  let rows: unknown[] = [];
  let deliver: (() => void) | undefined;
  const detach = vi.fn();
  let deliverLive: Parameters<AgentHostClient['subscribeLive']>[1] | undefined;
  // oxlint-disable-next-line eslint/max-params -- The production subscription contract has four independently meaningful callbacks.
  const subscribe = vi.fn<AgentHostClient['subscribe']>((input, _event, _ended, batch) => {
    deliver = () =>
      batch?.({
        status: 'batch',
        sourceHealth: { historyIntact: true, newerHistory: false, quarantined: false },
        sourceGeneration: 'writer-mounted',
        chatId: 'mounted',
        cursor: input.cursor,
        nextCursor: rows.length,
        endCursor: rows.length,
        events: rows.slice(input.cursor),
      });
    queueMicrotask(() => deliver?.());
    return detach;
  });
  const hostCommand = vi.fn<AgentHostClient['hostCommand']>(async (command) => {
    rows = [
      {
        ...lifecycleRow(0, 'admitted', 'run'),
        admission: { kind: 'tau', turnId: 'u', message: { id: 'u', role: 'user', content: 'hi' } },
      },
      lifecycleRow(1, 'running', 'run'),
    ];
    queueMicrotask(() => deliver?.());
    return { commandId: command.commandId, generation: 1, status: 'applied', effect: 'durable', cursor: 2 };
  });
  const unconnect = current.publishProjectHostConnector('project', async () => ({
    hostCommand,
    subscribeLive: (_chatId: string, listener: Parameters<AgentHostClient['subscribeLive']>[1]) => {
      deliverLive = listener;
      return vi.fn();
    },
    catchUp: writerOwnedCatchUp,
    read: vi.fn(),
    subscribe,
    close: async () => undefined,
  }));
  const message = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }] } as const;
  const unadmit = publishChatTurnAdmission('mounted', async () => ({
    runId: 'run',
    leaseTurnId: undefined,
    request: {
      kind: 'send',
      message: { ...message, parts: [...message.parts] },
      command: {
        type: 'start',
        commandId: 'run',
        payload: {
          chatId: 'mounted',
          runId: 'run',
          message: { id: 'u', role: 'user', content: 'hi' },
          trigger: 'submit',
        },
      },
    },
  }));
  try {
    await act(async () => {
      await vi.waitFor(() => {
        expect(session.persistenceActorRef.getSnapshot().context.isLoadingChat).toBe(false);
      });
      await current.requestTurn('mounted', { kind: 'send', message: { ...message, parts: [...message.parts] } });
    });
    await act(async () => {
      rows = [
        ...rows,
        logRow(2, {
          runId: 'run',
          type: 'turn.history-projection-committed',
          retainedMessageIds: [],
          message: { id: 'u', role: 'user', content: 'hi' },
          context: { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] },
        }),
      ];
      deliver?.();
    });
    await act(async () => {
      deliverLive?.('mounted', {
        sourceGeneration: 'writer-mounted',
        type: 'thinking-start',
        chatId: 'mounted',
        runId: 'run',
        messageId: 'live-a',
        contentIndex: 0,
      });
      deliverLive?.('mounted', {
        sourceGeneration: 'writer-mounted',
        type: 'thinking-delta',
        chatId: 'mounted',
        runId: 'run',
        messageId: 'live-a',
        contentIndex: 0,
        delta: 'Unique mounted held reasoning',
      });
    });
    await vi.waitFor(() => {
      expect(screen.getByTestId('transcript')).toHaveTextContent('hiUnique mounted held reasoning');
    });
    const presentation = current.getMessagePresentation('mounted');
    expect([...presentation.messagesById.values()].flatMap((entry) => entry.parts)).toContainEqual(
      expect.objectContaining({ type: 'reasoning', text: 'Unique mounted held reasoning' }),
    );
    expect(current.getLivenessSnapshot().chats['mounted']?.phase).toBe('running');
    expect(current.get('mounted')?.chat).toBe(session.chat);
    expect(hostCommand).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    const releaseSidebar = current.observe('mounted', 'project');
    releaseSidebar();
    expect(detach).not.toHaveBeenCalled();
  } finally {
    unadmit();
    mounted.unmount();
    unconnect();
    owner.stop();
  }
  expect(detach).toHaveBeenCalledTimes(1);
});
