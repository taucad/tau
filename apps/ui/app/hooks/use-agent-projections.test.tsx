// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ChatSessionActorRef, ChatSessionMachineEvent } from '#machines/chat-session.machine.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { buildAgentProjection, sortAgentProjections, useAgentProjections } from '#hooks/use-agent-projections.js';
import type { AgentProjection } from '#hooks/use-agent-projections.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useModels } from '#hooks/use-models.js';
import { useProject } from '#hooks/use-project.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';

vi.mock('@xstate/react', () => ({
  useSelector: <Snapshot, Selection>(
    actor: { getSnapshot: () => Snapshot },
    selector: (snapshot: Snapshot) => Selection,
  ): Selection => selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-chats.js', () => ({ useProjectChatUsage: vi.fn(() => new Map()) }));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: vi.fn() }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));
vi.mock('#hooks/use-models.js', () => ({ useModels: vi.fn() }));
vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));

const defaultModel: ResolvedModel = {
  id: 'openai/gpt-default',
  name: 'GPT Default',
  family: 'gpt',
  provider: { id: 'openai', name: 'OpenAI' },
  isResolved: true,
};
const claudeModel: ResolvedModel = {
  id: 'anthropic/claude-sonnet',
  name: 'Claude Sonnet',
  family: 'claude',
  provider: { id: 'anthropic', name: 'Anthropic' },
  isResolved: true,
};
const resolveModel = (id: string): ResolvedModel => (id === claudeModel.id ? claudeModel : defaultModel);

const message = (id: string, createdAt: number, parts: MyUIMessage['parts'] = []): MyUIMessage => ({
  id,
  role: 'user',
  parts,
  metadata: { createdAt, status: 'success' },
});

const usageMessage = (id: string, createdAt: number, operationId: string): MyUIMessage => ({
  ...message(id, createdAt, [
    {
      type: 'data-usage',
      data: {
        type: 'usage',
        id: `usage-${id}`,
        operationId,
        model: 'gpt-default',
        inputTokens: 1,
        outputTokens: 1,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
  ]),
  role: 'assistant',
});

const chat = (id: string, updatedAt: number, messages: MyUIMessage[] = []): Chat => ({
  id,
  resourceId: 'project-1',
  name: `Agent ${id}`,
  messages,
  createdAt: updatedAt - 100,
  updatedAt,
});

/** The chat's own machine, driven by the events the run reports (R12, D32). */
const driven = (chatId: string, events: readonly ChatSessionMachineEvent[]): ChatSessionActorRef => {
  const actor = createActor(chatSessionMachine, { input: { chatId, projectId: 'project-1' } });
  actor.start();
  for (const event of events) {
    actor.send(event);
  }
  return actor;
};

const buildSession = ({
  chatEntity,
  events = [],
  activeExecution,
}: {
  readonly chatEntity: Chat;
  readonly events?: readonly ChatSessionMachineEvent[];
  readonly activeExecution?: Chat['activeExecution'];
}): ChatSession =>
  ({
    chatId: chatEntity.id,
    get messages() {
      return chatEntity.messages;
    },
    chat: { messages: chatEntity.messages, error: undefined },
    persistenceActorRef: {
      getSnapshot: () => ({ context: { activeExecution } }),
      subscribe: () => ({ unsubscribe: vi.fn() }),
    },
    stateActorRef: driven(chatEntity.id, events),
  }) as unknown as ChatSession;

const project = {
  editorRef: { getSnapshot: () => ({ context: { focusedChatId: 'chat-focused' } }) },
  projectId: 'project-1',
};

beforeEach(() => {
  vi.mocked(useProject).mockReturnValue(project as unknown as ReturnType<typeof useProject>);
  vi.mocked(useModels).mockReturnValue({ selectedModel: defaultModel, resolveModel } as unknown as ReturnType<
    typeof useModels
  >);
});

describe('buildAgentProjection', () => {
  it('projects live focus, model/provider, the default branch, and running state', () => {
    const source = chat('chat-focused', 100, [message('turn-1', 200)]);
    const session = buildSession({
      chatEntity: source,
      events: [{ type: 'runLifecycle', phase: 'running' }],
      activeExecution: { kind: 'tau', model: claudeModel.id },
    });

    expect(
      buildAgentProjection({
        chat: source,
        session,
        focusedChatId: source.id,
        defaultModel,
        resolveModel,
        defaultWorkspace: 'tau',
      }),
    ).toMatchObject({
      state: 'running',
      detail: 'Working…',
      focused: true,
      lastActivityAt: 200,
      model: { name: 'Claude Sonnet', provider: 'Anthropic' },
      workspace: 'tau',
      /* No chat has a branch of its own — turns attach to the chat's checkout
       * and never create one (A29, S11) — and a row with no landed turn names
       * no line rather than guessing `main` (I6). */
      branch: undefined,
      unread: false,
    });
  });

  it('makes approvals waiting and consumes durable unread/workspace/branch state', () => {
    const source = chat('chat-waiting', 100, [message('turn-2', 300)]);
    const session = buildSession({
      chatEntity: source,
      events: [
        { type: 'runLifecycle', phase: 'running' },
        { type: 'interruptRecorded', state: 'requested', count: 1 },
        { type: 'runLifecycle', phase: 'completed' },
      ],
    });

    expect(
      buildAgentProjection({
        chat: source,
        session,
        unread: true,
        focusedChatId: 'chat-focused',
        defaultModel,
        resolveModel,
        defaultWorkspace: 'tau',
        metadata: { workspace: 'solver-node-3', branch: 'fea/load-case-b' },
      }),
    ).toMatchObject({
      workspace: 'solver-node-3',
      branch: 'fea/load-case-b',
      /* The completion is what the person has not seen; the store's derived answer says so, and no second record
       * does (I26, PV-S8). */
      unread: true,
    });

    const waiting = buildSession({
      chatEntity: source,
      events: [
        { type: 'runLifecycle', phase: 'running' },
        { type: 'interruptRecorded', state: 'requested', count: 1 },
      ],
    });
    expect(
      buildAgentProjection({
        chat: source,
        session: waiting,
        focusedChatId: 'chat-focused',
        defaultModel,
        resolveModel,
        defaultWorkspace: 'tau',
      }),
    ).toMatchObject({ state: 'waiting', pendingApprovalCount: 1, detail: 'Needs your approval · 1' });
  });

  it('preserves error and idle as distinct terminal states', () => {
    const failed = chat('chat-error', 300);
    const idle = chat('chat-idle', 200);

    expect(
      buildAgentProjection({
        chat: failed,
        session: buildSession({
          chatEntity: failed,
          events: [{ type: 'runLifecycle', phase: 'failed', reason: 'Solver connection failed' }],
        }),
        defaultModel,
        resolveModel,
        defaultWorkspace: 'tau',
      }),
    ).toMatchObject({ state: 'error', detail: 'Failed · Solver connection failed' });

    const idleProjection = buildAgentProjection({
      chat: idle,
      session: buildSession({ chatEntity: idle }),
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });
    expect(idleProjection).toMatchObject({ state: 'idle' });
    expect(idleProjection).not.toHaveProperty('detail');
  });

  it('uses host-log usage and message time for a parked record without transcript messages', () => {
    const { messages: _messages, ...record } = chat('chat-parked', 100);
    expect(
      buildAgentProjection({
        chat: record,
        history: {
          operationIds: ['operation-old'],
          lastActivityAt: 250,
          inputTokens: 4,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          parts: 1,
        },
        defaultModel,
        resolveModel,
        defaultWorkspace: 'tau',
      }),
    ).toMatchObject({ operationIds: ['operation-old'], lastActivityAt: 250, state: 'idle' });
  });

  it('should retain durable recency while a parked record awaits its host history', () => {
    const { messages: _messages, ...record } = chat('chat-awaiting-history', 200);
    record.recencyAt = 450;
    expect(
      buildAgentProjection({
        chat: record,
        defaultModel,
        resolveModel,
        defaultWorkspace: 'tau',
      }),
    ).toMatchObject({ lastActivityAt: 450, operationIds: [] });
  });

  it('should include live funded work while a prior history summary is catching up, then trust settled history', () => {
    const source = chat('chat-running', 200, [usageMessage('live-usage', 400, 'operation-new')]);
    const history = {
      operationIds: ['operation-old'],
      lastActivityAt: 250,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      parts: 1,
    };
    const running = buildAgentProjection({
      chat: source,
      history,
      session: buildSession({ chatEntity: source, events: [{ type: 'runLifecycle', phase: 'running' }] }),
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });
    expect(running).toMatchObject({ operationIds: ['operation-new', 'operation-old'], lastActivityAt: 400 });

    const settled = buildAgentProjection({
      chat: source,
      history,
      session: buildSession({ chatEntity: source }),
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });
    expect(settled).toMatchObject({ operationIds: ['operation-old'], lastActivityAt: 250 });
  });

  it('reads idle for a chat whose project is not live, with no second derivation', () => {
    const parked = chat('chat-parked', 100);
    parked.error = { category: 'generic', title: 'Failed', message: 'Solver connection failed' };
    const parkedProjection = buildAgentProjection({
      chat: parked,
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });
    expect(parkedProjection).toMatchObject({ state: 'idle', pendingApprovalCount: 0 });
    expect(parkedProjection).not.toHaveProperty('detail');
  });

  /* W8 (D9, I26): the chat row is no source of unread. A legacy chat whose
   * record still carries `hasUnreadTurn` reads unread only when the store says so (PV-S8). */
  it('ignores a legacy hasUnreadTurn on the chat row', () => {
    const legacy = Object.assign(chat('chat-legacy', 100), { hasUnreadTurn: true });

    expect(buildAgentProjection({ chat: legacy, defaultModel, resolveModel, defaultWorkspace: 'tau' })).toMatchObject({
      unread: false,
    });
  });

  it('orders attention and active work ahead of errors and idle agents', () => {
    const agent = (chatId: string, state: AgentProjection['state'], focused = false): AgentProjection => ({
      chatId,
      name: chatId,
      state,
      focused,
      lastActivityAt: 1,
      model: { id: defaultModel.id, name: defaultModel.name, family: defaultModel.family, provider: 'OpenAI' },
      workspace: 'tau',
      branch: 'main',
      pendingApprovalCount: 0,
      operationIds: [],
      unread: false,
    });

    expect(
      sortAgentProjections([
        agent('idle', 'idle'),
        agent('running', 'running'),
        agent('error', 'error'),
        agent('waiting', 'waiting'),
      ]).map((projection) => projection.chatId),
    ).toEqual(['waiting', 'running', 'error', 'idle']);
  });
});

describe('useAgentProjections', () => {
  it('subscribes to background sessions and projects concurrent runs without acquiring them', () => {
    const chats = [chat('chat-focused', 100, [message('turn-focused', 120)]), chat('chat-background', 90)];
    const listeners = new Set<() => void>();
    const sessions = new Map(chats.map((chatEntity) => [chatEntity.id, buildSession({ chatEntity })] as const));
    for (const session of sessions.values()) {
      session.stateActorRef.send({ type: 'runLifecycle', phase: 'running' });
    }
    const store = {
      get: (chatId: string) => sessions.get(chatId),
      subscribeChat: (_chatId: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeMembership: () => () => undefined,
      isUnread: () => false,
      subscribeUnread: () => () => undefined,
      acquire: vi.fn(),
    } as unknown as ChatSessionStore;
    vi.mocked(useChatRecords).mockReturnValue({
      chats,
      isLoading: false,
      error: undefined,
      retry: vi.fn(),
    } as unknown as ReturnType<typeof useChatRecords>);
    vi.mocked(useChatSessionStore).mockReturnValue(store);

    const { result } = renderHook(() => useAgentProjections({ workspaceLabel: 'tau' }));
    expect(result.current.agents.map((agent) => [agent.chatId, agent.state])).toEqual([
      ['chat-focused', 'running'],
      ['chat-background', 'running'],
    ]);
    expect(store.acquire).not.toHaveBeenCalled();

    act(() => {
      sessions.get('chat-background')?.stateActorRef.send({ type: 'runLifecycle', phase: 'cancelled' });
    });

    expect(result.current.agents.find((agent) => agent.chatId === 'chat-background')?.state).toBe('idle');
    expect(result.current.agents.find((agent) => agent.chatId === 'chat-focused')?.state).toBe('running');
  });

  it('should refresh a running agent for new tail usage without rebuilding for text-only updates', () => {
    const source = chat('chat-focused', 100, [message('tail', 120)]);
    const session = buildSession({ chatEntity: source, events: [{ type: 'runLifecycle', phase: 'running' }] });
    const listeners = new Set<() => void>();
    const store = {
      get: () => session,
      subscribeChat: (_chatId: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeMembership: () => () => undefined,
      isUnread: () => false,
      subscribeUnread: () => () => undefined,
    } as unknown as ChatSessionStore;
    vi.mocked(useChatRecords).mockReturnValue({
      chats: [source],
      isLoading: false,
      error: undefined,
      retry: vi.fn(),
    } as unknown as ReturnType<typeof useChatRecords>);
    vi.mocked(useChatSessionStore).mockReturnValue(store);
    const { result } = renderHook(() => useAgentProjections());
    const beforeText = result.current.agents;

    act(() => {
      source.messages = [message('tail', 120, [{ type: 'text', text: 'more' }])];
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current.agents).toBe(beforeText);

    act(() => {
      source.messages = [usageMessage('tail', 120, 'operation-new')];
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current.agents[0]).toMatchObject({ operationIds: ['operation-new'], lastActivityAt: 120 });
  });
});
