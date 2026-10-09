// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import { createActor } from 'xstate';
import { expect, it, vi } from 'vitest';
import type * as ThemeModule from '#hooks/use-theme.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { createSessionsActor } from '#services/sessions-store.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { publishChatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import { lifecycleRow, logRow, writerOwnedCatchUp } from '#machines/chat-projection.fixture.js';

const dependencies = vi.hoisted(() => {
  const missing = async (): Promise<never> => {
    throw Object.assign(new Error('Missing record'), { code: 'ENOENT' });
  };
  return {
    activeSession: undefined as ChatSession | undefined,
    sessions: undefined as ReturnType<typeof createSessionsActor> | undefined,
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
  useActiveChatSession: () => ({ activeChatId: 'mounted', ...dependencies.activeSession }),
  useChatComposer: () => ({ draftActorRef: dependencies.activeSession?.draftActorRef }),
}));
vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useCadAgentConfig: () => ({
    profile: 'cad',
    execution: { kind: 'tau', model: 'test-model' },
    kernel: 'replicad',
    mode: 'agent',
    toolChoice: 'auto',
    testingEnabled: true,
  }),
}));
vi.mock('#hooks/use-models.js', () => ({ useModels: () => ({ resolveModel: vi.fn() }) }));
vi.mock('#chat-clients/_internal/use-turn-admission.js', () => ({
  useTurnAdmission: () => ({ surfaceDispatchFailure: vi.fn() }),
}));
vi.mock('#hooks/use-sessions.js', () => ({ useSessions: () => dependencies.sessions }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project' }) }));
vi.mock('#hooks/use-theme.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ThemeModule>()),
  useTheme: () => ({ theme: 'light' }),
}));
// The activity cue's GPU animation is unrelated to the real message/reasoning render path.
vi.mock('#components/chat/chat-activity-spinner.js', () => ({
  ChatActivitySpinner: () => <span />,
  warmChatActivitySpinner: async () => undefined,
}));

vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));
const { ChatSessionStoreProvider, useChatSessionStore } = await import('#hooks/chat-session-store-provider.js');
const { useChatSession } = await import('#hooks/use-chat-session.js');
const { useChatSelector } = await import('#hooks/use-chat.js');

const { ChatMessage } = await import('#routes/w.$workspace.$project/chat-message.js');
const { TooltipProvider } = await import('@taucad/ui/components/tooltip');
it('should render first held reasoning through production ChatMessage before durable completion', async () => {
  dependencies.sessions = createSessionsActor().start();
  let store: ChatSessionStore | undefined;
  function ProductionTranscript(): React.JSX.Element {
    const groups = useChatSelector((state) => state.turnGroups);
    return (
      <div data-testid='transcript'>
        {groups.flatMap((group) =>
          group.messageIds.map((id) => (
            <div key={id} data-message-id={id} data-testid={`message-${id}`}>
              <ChatMessage messageId={id} />
            </div>
          )),
        )}
      </div>
    );
  }
  function Transcript(): React.JSX.Element {
    store = useChatSessionStore();
    const acquired = useChatSession('mounted', 'project');
    dependencies.activeSession = acquired;
    return acquired === undefined ? <div /> : <ProductionTranscript />;
  }
  const mounted = render(
    <ChatSessionStoreProvider>
      <TooltipProvider>
        <Transcript />
      </TooltipProvider>
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
      expect(
        [...current.getMessagePresentation('mounted').messagesById.values()].flatMap((entry) => entry.parts),
      ).toContainEqual(expect.objectContaining({ type: 'reasoning', text: 'Unique mounted held reasoning' }));
    });
    const assistant = session.chat.messages.find((entry) => entry.role === 'assistant');
    expect(assistant).toBeDefined();
    if (assistant === undefined) {
      throw new Error('The real SDK assistant message is absent');
    }
    const presentation = current.getMessagePresentation('mounted');
    expect(presentation.messagesById.get(assistant.id)?.id).toBe(assistant.id);
    expect(session.draftActorRef.getSnapshot().context.messageEdits[assistant.id]).toBeUndefined();
    await vi.waitFor(() => {
      expect(
        within(screen.getByTestId(`message-${assistant.id}`)).getByText('Unique mounted held reasoning'),
      ).toBeVisible();
    });
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
    dependencies.sessions.stop();
  }
  expect(detach).toHaveBeenCalledTimes(1);
});
