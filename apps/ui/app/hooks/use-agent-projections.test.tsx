// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatStatus } from 'ai';
import type { ResolvedModel } from '#hooks/use-models.js';
import { buildAgentProjection, sortAgentProjections, useAgentProjections } from '#hooks/use-agent-projections.js';
import type { AgentProjection } from '#hooks/use-agent-projections.js';
import { useChats } from '#hooks/use-chats.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useModels } from '#hooks/use-models.js';
import { useProject } from '#hooks/use-project.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import type { PersistedRevisionGraphState } from '#types/revision.types.js';

vi.mock('@xstate/react', () => ({
  useSelector: <Snapshot, Selection>(
    actor: { getSnapshot: () => Snapshot },
    selector: (snapshot: Snapshot) => Selection,
  ): Selection => selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-chats.js', () => ({ useChats: vi.fn() }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: vi.fn() }));
vi.mock('#hooks/use-models.js', () => ({ useModels: vi.fn() }));
vi.mock('#hooks/use-project.js', () => ({ useProject: vi.fn() }));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  useRevisionActor: () => ({ getSnapshot: () => ({ context: { graph: graphRef.current } }) }),
}));

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

const approvalPart = (): MyUIMessage['parts'][number] =>
  ({
    type: 'tool-delete_file',
    toolCallId: 'tool-1',
    state: 'approval-requested',
    input: { targetFile: 'main.ts' },
    approval: { id: 'approval-1' },
  }) as unknown as MyUIMessage['parts'][number];

const chat = (id: string, updatedAt: number, messages: MyUIMessage[] = []): Chat => ({
  id,
  resourceId: 'project-1',
  name: `Agent ${id}`,
  messages,
  createdAt: updatedAt - 100,
  updatedAt,
});

const graphRef: { current: PersistedRevisionGraphState | undefined } = { current: undefined };

const buildSession = ({
  chatEntity,
  lifecycle,
  status,
  activeExecution,
  persistedError,
}: {
  readonly chatEntity: Chat;
  readonly lifecycle: 'idle' | 'invoking' | 'retrying' | 'stopping';
  readonly status: ChatStatus;
  readonly activeExecution?: Chat['activeExecution'];
  readonly persistedError?: Chat['error'];
}): ChatSession => {
  const actor = {
    getSnapshot: () => ({
      context: { activeExecution, persistedError, retryAttempt: lifecycle === 'retrying' ? 1 : 0 },
      matches: (value: unknown) =>
        typeof value === 'object' &&
        value !== null &&
        'requestLifecycle' in value &&
        value.requestLifecycle === lifecycle,
    }),
    subscribe: () => ({ unsubscribe: vi.fn() }),
  };
  return {
    chatId: chatEntity.id,
    chat: {
      messages: chatEntity.messages,
      status,
      error: undefined,
    },
    persistenceActorRef: actor,
  } as unknown as ChatSession;
};

const project = {
  editorRef: { getSnapshot: () => ({ context: { focusedChatId: 'chat-focused' } }) },
  projectId: 'project-1',
};

beforeEach(() => {
  graphRef.current = undefined;
  vi.mocked(useProject).mockReturnValue(project as unknown as ReturnType<typeof useProject>);
  vi.mocked(useModels).mockReturnValue({ selectedModel: defaultModel, resolveModel } as unknown as ReturnType<
    typeof useModels
  >);
});

describe('buildAgentProjection', () => {
  it('projects live focus, model/provider, revision branch, and running state', () => {
    const source = chat('chat-focused', 100, [message('turn-1', 200)]);
    source.hasUnreadTurn = true;
    graphRef.current = {
      activeBranch: 'experiment',
      nodes: {
        'turn-1': {
          turnId: 'turn-1',
          parentTurnIds: [],
          branchName: 'loads-v2',
          chatId: source.id,
          jobIds: [],
          status: 'complete',
        },
      },
      branches: {},
    };
    const session = buildSession({
      chatEntity: source,
      lifecycle: 'invoking',
      status: 'streaming',
      activeExecution: { kind: 'tau', model: claudeModel.id },
    });

    const projection = buildAgentProjection({
      chat: source,
      session,
      status: 'streaming',
      lifecycle: 'invoking',
      persistedGraph: graphRef.current,
      focusedChatId: source.id,
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });

    expect(projection).toMatchObject({
      state: 'running',
      focused: true,
      lastActivityAt: 200,
      model: { name: 'Claude Sonnet', provider: 'Anthropic' },
      workspace: 'tau',
      branch: 'loads-v2',
      unread: false,
    });
  });

  it('makes approvals waiting and consumes durable unread/workspace/branch state', () => {
    const source = chat('chat-waiting', 100, [message('turn-2', 300, [approvalPart()])]);
    source.hasUnreadTurn = true;
    const session = buildSession({ chatEntity: source, lifecycle: 'invoking', status: 'streaming' });
    const projection = buildAgentProjection({
      chat: source,
      session,
      status: 'streaming',
      lifecycle: 'invoking',
      focusedChatId: 'chat-focused',
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
      metadata: { workspace: 'solver-node-3', branch: 'fea/load-case-b' },
    });

    expect(projection).toMatchObject({
      state: 'waiting',
      pendingApprovalCount: 1,
      detail: '1 approval required',
      workspace: 'solver-node-3',
      branch: 'fea/load-case-b',
      unread: true,
    });
  });

  it('preserves error and idle as distinct terminal states', () => {
    const failed = chat('chat-error', 300);
    failed.error = {
      category: 'generic',
      title: 'Failed',
      message: 'Solver connection failed',
    };
    const idle = chat('chat-idle', 200);

    const failedProjection = buildAgentProjection({
      chat: failed,
      status: 'error',
      lifecycle: 'idle',
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });
    const idleProjection = buildAgentProjection({
      chat: idle,
      status: 'ready',
      lifecycle: 'idle',
      defaultModel,
      resolveModel,
      defaultWorkspace: 'tau',
    });

    expect(failedProjection).toMatchObject({ state: 'error', detail: 'Solver connection failed' });
    expect(idleProjection).toMatchObject({ state: 'idle' });
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
      totalCost: 0,
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
  it('subscribes to background sessions and projects concurrent runs without acquiring them', async () => {
    const chats = [chat('chat-focused', 100, [message('turn-focused', 120)]), chat('chat-background', 90)];
    let focusedLifecycle: 'idle' | 'invoking' = 'invoking';
    let backgroundLifecycle: 'idle' | 'invoking' = 'invoking';
    const listeners = new Set<() => void>();
    const sessions = new Map(
      chats.map((chatEntity) => {
        const actor = {
          getSnapshot: () => {
            const lifecycle = chatEntity.id === 'chat-focused' ? focusedLifecycle : backgroundLifecycle;
            return {
              context: { retryAttempt: 0 },
              matches: (value: unknown) =>
                typeof value === 'object' &&
                value !== null &&
                'requestLifecycle' in value &&
                value.requestLifecycle === lifecycle,
            };
          },
          subscribe: (listener: () => void) => {
            listeners.add(listener);
            return { unsubscribe: () => listeners.delete(listener) };
          },
        };
        return [
          chatEntity.id,
          {
            chatId: chatEntity.id,
            chat: { messages: chatEntity.messages, error: undefined },
            persistenceActorRef: actor,
          } as unknown as ChatSession,
        ] as const;
      }),
    );
    const store = {
      get: (chatId: string) => sessions.get(chatId),
      getStatus: (chatId: string) =>
        (chatId === 'chat-focused' ? focusedLifecycle : backgroundLifecycle) === 'idle' ? 'ready' : 'streaming',
      subscribeChat: (_chatId: string, listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeMembership: (_listener: () => void) => () => undefined,
      acquire: vi.fn(),
    } as unknown as ChatSessionStore;
    vi.mocked(useChats).mockReturnValue({
      chats,
      isLoading: false,
      error: undefined,
      retry: vi.fn(),
    } as unknown as ReturnType<typeof useChats>);
    vi.mocked(useChatSessionStore).mockReturnValue(store);

    const { result } = renderHook(() => useAgentProjections({ workspaceLabel: 'tau' }));
    expect(result.current.agents.map((agent) => [agent.chatId, agent.state])).toEqual([
      ['chat-focused', 'running'],
      ['chat-background', 'running'],
    ]);
    expect(store.acquire).not.toHaveBeenCalled();
    act(() => {
      backgroundLifecycle = 'idle';
      for (const listener of listeners) {
        listener();
      }
    });

    expect(result.current.agents.find((agent) => agent.chatId === 'chat-background')?.state).toBe('idle');
    expect(result.current.agents.find((agent) => agent.chatId === 'chat-focused')?.state).toBe('running');

    focusedLifecycle = 'idle';
  });
});
