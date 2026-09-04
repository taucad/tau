import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { Chat } from '@ai-sdk/react';
import type { CadAgentConfigInput, MyUIMessage } from '@taucad/chat';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import type { ChatActions } from '#hooks/use-chat.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import type { ActiveChatSessionContextValue } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { AgentHostClientOptions, AgentHostClient } from '#services/agent-host-client.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { withChatRevisionMode } from '#utils/chat-revision-mode.js';

const workspaceHarness = vi.hoisted(() => ({
  current: undefined as
    | {
        execution: { workspaceId: string; baseRevisionId: string; hostId: string };
        admitted: boolean;
      }
    | undefined,
  listeners: new Set<() => void>(),
  admissionGate: undefined as Promise<void> | undefined,
  prepare: vi.fn(),
}));
const browserHostHarness = vi.hoisted(() => ({
  registration: undefined as
    | { createClient: () => Promise<unknown>; markRunId: (runId: string) => Promise<void> }
    | undefined,
  run: undefined as { runId: string; state: 'paused'; eventCount: number } | undefined,
  createClient: vi.fn((_options: AgentHostClientOptions): AgentHostClient => {
    const client = Object.create(null) as AgentHostClient;
    client.close = vi.fn(async () => undefined);
    return client;
  }),
  resolveInterrupt: vi.fn().mockResolvedValue(undefined),
  syncProjectRoots: vi.fn().mockResolvedValue(undefined),
  openProjectRootBridge: vi.fn(() => ({ port: new MessageChannel().port1, dispose: vi.fn() })),
  // The daemon leg: `openAgentHostChannel` → `createDaemonAgentHostTransport`
  // → `createAgentHostClient`, with no worker, bridge or workspace claim.
  openAgentHostChannel: vi.fn(async (hostId: string) => ({ hostId })),
  createDaemonClient: vi.fn((transport: unknown): AgentHostClient => {
    const client = Object.create(null) as AgentHostClient & { transport?: unknown };
    client.transport = transport;
    client.close = vi.fn(async () => undefined);
    return client;
  }),
}));

type HostAvailability =
  | { readonly status: 'pending' }
  | { readonly status: 'available'; readonly durability: string }
  | { readonly status: 'unavailable'; readonly reason: string };

const availabilityHarness = vi.hoisted(() => {
  const availability: HostAvailability = { status: 'available', durability: 'exclusive-append' };
  return { availability };
});

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: [], loading: false }),
  useCadAgentConfig: vi.fn(),
  awaitAgentHostAvailability: vi.fn(async () => availabilityHarness.availability),
}));
vi.mock('#chat-clients/_internal/use-active-chat-instance.js', () => ({
  useActiveChatInstance: vi.fn(),
}));
vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: vi.fn(),
  useChatSelector: vi.fn(),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useActiveChatSession: vi.fn(),
  useChatComposer: () => ({
    model: {
      model: {
        id: 'openai-gpt-5.5',
        provider: { id: 'openai', name: 'OpenAI' },
        model: {
          id: 'openai-gpt-5.5',
          provider: { id: 'openai', name: 'OpenAI' },
          details: { family: 'gpt', contextWindow: 200_000, maxTokens: 32_000 },
          support: { modalities: { input: ['text', 'image'], output: ['text'] } },
        },
      },
    },
  }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: vi.fn(),
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    resolveModel: (id: string) => {
      const retry = id === 'openai-gpt-retry';
      const model = {
        id,
        name: retry ? 'GPT Retry' : 'GPT 5.5',
        provider: { id: 'openai', name: 'OpenAI' },
        details: {
          family: 'gpt',
          contextWindow: retry ? 64_000 : 200_000,
          maxTokens: retry ? 8000 : 32_000,
          knowledgeCutoff: '2025-06',
          cost: { inputTokens: 1, outputTokens: 4, cacheReadTokens: 0.1, cacheWriteTokens: 1.25 },
        },
        support: { modalities: { input: ['text', ...(retry ? [] : ['image'])], output: ['text'] }, tools: true },
      };
      return {
        id,
        name: model.name,
        family: 'gpt',
        provider: model.provider,
        isResolved: true,
        model,
      };
    },
  }),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'proj_test', mainEntryPath: 'main.ts', geometryUnits: new Map() }),
}));
vi.mock('#hooks/use-file-manager.js', () => {
  const fileManager = () => ({
    workspace: { syncProjectRoots: browserHostHarness.syncProjectRoots },
    fileManagerRef: {
      getSnapshot: () => ({
        context: {
          rootDirectory: '/projects/proj_test',
          openFileSystemBridge: browserHostHarness.openProjectRootBridge,
        },
      }),
    },
  });
  return { useFileManager: fileManager, useOptionalFileManager: fileManager };
});
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  registerAgentHost: (_chatId: string, registration: typeof browserHostHarness.registration) => {
    browserHostHarness.registration = registration;
    return () => {
      browserHostHarness.registration = undefined;
    };
  },
  getBrowserAgentHostRun: () => browserHostHarness.run,
  resolveBrowserAgentHostInterrupt: browserHostHarness.resolveInterrupt,
}));
vi.mock('#services/agent-host-client.js', () => ({
  createAgentHostClient: browserHostHarness.createDaemonClient,
  createBrowserAgentHostClient: browserHostHarness.createClient,
  isBrowserAgentHostProviderKind: (providerKind: string) => providerKind !== 'tau' && providerKind !== 'ollama',
}));
vi.mock('#services/daemon-agent-host-client.js', () => ({
  // The real transport takes a dial function so it can re-dial a dead channel;
  // the mock keeps it so a test can prove the dial reaches the ladder.
  createDaemonAgentHostTransport: (dial: () => Promise<unknown>) => ({ dial }),
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  openAgentHostChannel: browserHostHarness.openAgentHostChannel,
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectFileSystemConfig: async () => ({
    projectId: 'proj_test',
    backend: 'indexeddb',
    providerBasePath: 'project-test',
  }),
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  readRootedBridgeCapabilities: async (openFileSystemBridge: () => { dispose: () => void }) => {
    openFileSystemBridge().dispose();
    return {
      persistent: true,
      writable: true,
      quotaBased: true,
      durability: 'transactional-rewrite',
    };
  },
  useOptionalChatWorkspaceAuthority: () => ({
    get: () => workspaceHarness.current,
    prepare: workspaceHarness.prepare,
    finalize: async () => undefined,
    discard: async () => undefined,
    markAdmitted: async () => {
      await workspaceHarness.admissionGate;
      workspaceHarness.current = { ...workspaceHarness.current!, admitted: true };
    },
    markCancelled: async () => undefined,
    markRunId: async () => undefined,
    subscribe: (listener: () => void) => {
      workspaceHarness.listeners.add(listener);
      return () => workspaceHarness.listeners.delete(listener);
    },
  }),
}));

const useCadAgentConfigMock = vi.mocked(useCadAgentConfig);
const useActiveChatInstanceMock = vi.mocked(useActiveChatInstance);
const useChatActionsMock = vi.mocked(useChatActions);
const useChatSelectorMock = vi.mocked(useChatSelector);

const buildAgent = (overrides: Partial<CadAgentConfigInput> = {}): CadAgentConfigInput => ({
  profile: 'cad',
  execution: { kind: 'tau', model: 'openai-gpt-5.5' },
  kernel: 'replicad',
  mode: 'agent',
  toolChoice: 'auto',
  testingEnabled: true,
  ...overrides,
});

type ActionsMock = {
  sendMessage: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
  retryMessage: ReturnType<typeof vi.fn>;
  editMessage: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setMessages: ReturnType<typeof vi.fn>;
};

const buildActions = (): ActionsMock => ({
  sendMessage: vi.fn(),
  regenerate: vi.fn(),
  retryMessage: vi.fn(),
  editMessage: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
});

const mountAgentMock = (agent: CadAgentConfigInput): void => {
  useCadAgentConfigMock.mockReturnValue(agent);
};

const installActions = (actions: ActionsMock): void => {
  useChatActionsMock.mockReturnValue(actions as unknown as ChatActions);
};

/** Records every `setPersistedError` the client raises on the chat banner. */
const persistedErrors: unknown[] = [];
const sessionWithPersistedErrors = ((): ChatSessionStore['get'] =>
  ((_chatId: string) => ({
    persistenceActorRef: {
      send: (event: { readonly type: string; readonly error?: unknown }) => {
        if (event.type === 'setPersistedError') {
          persistedErrors.push(event.error);
        }
      },
    },
  })) as unknown as ChatSessionStore['get'])();

const installSessionStore = (partial: Partial<ChatSessionStore>): void => {
  vi.mocked(useChatSessionStore).mockReturnValue(partial as ChatSessionStore);
};

/** The store's host-log reattach, re-armed per test. */
let reattachHostChat = vi.fn();

const installActiveSession = (activeChatId: string): void => {
  vi.mocked(useActiveChatSession).mockReturnValue({
    activeChatId,
  } as unknown as ActiveChatSessionContextValue);
};

/* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.objectContaining` is typed `any` by vitest. */
const expectAnyHostAdmission: unknown = expect.objectContaining({ config: expect.any(Object) });

const expectRunBody = (agent: CadAgentConfigInput = buildAgent()): Record<string, unknown> => ({
  agent,
  projectId: 'proj_test',
  execution: { workspaceId: 'workspace_test', baseRevisionId: 'rev_test', hostId: 'host_test' },
  admission: {
    version: 1,
    idempotencyKey: expect.stringMatching(/^req_/u) as unknown,
  },
  // The browser host is the only Tau placement: every Tau turn admits one.
  browserHost: expectAnyHostAdmission,
});

beforeEach(() => {
  vi.clearAllMocks();
  browserHostHarness.registration = undefined;
  browserHostHarness.run = undefined;
  workspaceHarness.listeners.clear();
  workspaceHarness.admissionGate = undefined;
  workspaceHarness.current = {
    execution: { workspaceId: 'workspace_test', baseRevisionId: 'rev_test', hostId: 'host_test' },
    admitted: false,
  };
  workspaceHarness.prepare.mockImplementation(async () => workspaceHarness.current!);
  mountAgentMock(buildAgent());
  useChatSelectorMock.mockReturnValue('ready');
  installActiveSession('chat_test');
  persistedErrors.length = 0;
  reattachHostChat = vi.fn();
  installSessionStore({
    setLatestAgentBody: vi.fn(),
    startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
    endRun: vi.fn(),
    reattachHostChat,
    get: sessionWithPersistedErrors,
  });
});

describe('useCadChatClient', () => {
  it('does not dispatch execution until the admitted claim is durably committed', async () => {
    const admission = Promise.withResolvers<void>();
    workspaceHarness.admissionGate = admission.promise;
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'commit before dispatch' });
    });

    expect(actions.sendMessage).not.toHaveBeenCalled();
    admission.resolve();
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledOnce();
    });
  });

  it('surfaces a bounded admission wait on the chat error banner instead of dropping the submit', async () => {
    const send = vi.fn();
    installSessionStore({
      setLatestAgentBody: vi.fn(),
      startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
      endRun: vi.fn(),
      get: vi.fn(() => ({ persistenceActorRef: { send } })),
    } as unknown as Partial<ChatSessionStore>);
    // A claim left `admitted` by a run that died never clears on its own.
    workspaceHarness.current = { ...workspaceHarness.current!, admitted: true };
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useCadChatClient());
      act(() => {
        result.current.submit({ text: 'wedged behind a dead run' });
      });

      await act(async () => vi.advanceTimersByTimeAsync(20_000));

      expect(actions.sendMessage).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith({
        type: 'setPersistedError',
        error: expect.objectContaining({
          message: expect.stringContaining('still holding a workspace from an earlier run') as unknown,
        }) as unknown,
      });
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }
  });

  it('initializes browser placement with the canonical prompt, authority, and catalog provider', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderHook(() => useCadChatClient());
    await waitFor(() => {
      expect(browserHostHarness.registration).toBeDefined();
    });
    await browserHostHarness.registration!.createClient();

    expect(browserHostHarness.syncProjectRoots).toHaveBeenCalledOnce();
    expect(browserHostHarness.syncProjectRoots.mock.invocationCallOrder[0]).toBeLessThan(
      browserHostHarness.openProjectRootBridge.mock.invocationCallOrder[0]!,
    );
    const options = browserHostHarness.createClient.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options?.authority).toEqual({ projectId: 'proj_test', workspaceId: 'workspace_test' });
    expect(options?.projectStorage).toMatchObject({ projectId: 'proj_test', backend: 'indexeddb' });
    expect(options?.durability).toBe('transactional-rewrite');
    expect(options?.openProjectRootBridge).toEqual(expect.any(Function));
    expect(options?.model).toMatchObject({
      id: 'openai-gpt-5.5',
      providerKind: 'openai',
      cost: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1.25 },
    });
    expect(options?.systemPrompt).toContain('<role>');
    // Two blocks, not three: the workspace slot is empty on this path, and
    // emitting it anyway spent one of Anthropic's cache breakpoints on nothing.
    expect(options?.systemPromptBlocks).toHaveLength(2);
    expect(options?.systemPromptBlocks[0]?.text).toContain('<role>');
    expect(options?.systemPromptBlocks[0]?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(options?.systemPromptBlocks[1]?.text).toContain('<environment>');
    expect(options?.systemPromptBlocks[1]?.cacheControl).toBeUndefined();
  });

  it('places a Tau Host turn on the daemon channel, claiming no browser workspace', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());
    await waitFor(() => {
      expect(browserHostHarness.registration).toBeDefined();
    });
    await browserHostHarness.registration!.createClient();

    /* The transport is given a *dial*, not an open channel: a relayed channel
     * dies for reasons unrelated to the run, and only a dial can heal it. */
    expect(browserHostHarness.openAgentHostChannel).not.toHaveBeenCalled();
    const [transport] = browserHostHarness.createDaemonClient.mock.calls.at(-1) as [{ dial: () => Promise<unknown> }];
    await expect(transport.dial()).resolves.toEqual({ hostId: 'origin' });
    expect(browserHostHarness.openAgentHostChannel).toHaveBeenCalledWith('origin');
    // The daemon owns its workspace: no worker, no bridge, no project storage.
    expect(browserHostHarness.createClient).not.toHaveBeenCalled();
    expect(browserHostHarness.syncProjectRoots).not.toHaveBeenCalled();

    act(() => {
      result.current.submit({ text: 'Build it.' });
    });
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalled();
    });
    const body = actions.sendMessage.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    // No browser workspace claim was prepared or admitted for this turn...
    expect(workspaceHarness.prepare).not.toHaveBeenCalled();
    // ...so the body names none, and carries the host on the execution instead.
    expect(body).not.toHaveProperty('execution');
    expect(body['agent']).toMatchObject({ execution: { kind: 'tau', hostId: 'origin' } });
  });

  it('places an external-agent turn on its daemon, naming the agent and no Tau model', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());
    await waitFor(() => {
      expect(browserHostHarness.registration).toBeDefined();
    });
    await browserHostHarness.registration!.createClient();

    // Dialled through the same ladder and driven over the same daemon transport
    // as a Tau Host turn: one client, N channels.
    const [externalTransport] = browserHostHarness.createDaemonClient.mock.calls.at(-1) as [
      { dial: () => Promise<unknown> },
    ];
    await expect(externalTransport.dial()).resolves.toEqual({ hostId: 'origin' });
    expect(browserHostHarness.openAgentHostChannel).toHaveBeenCalledWith('origin');
    expect(browserHostHarness.createClient).not.toHaveBeenCalled();
    expect(browserHostHarness.syncProjectRoots).not.toHaveBeenCalled();

    act(() => {
      result.current.submit({ text: 'Build it.' });
    });
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalled();
    });
    const body = actions.sendMessage.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(workspaceHarness.prepare).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty('execution');
    expect(body['agent']).toMatchObject({ execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } });
    // The admission names the agent and nothing else: no model, no prompt
    // blocks, no tool grant — the external agent brings its own (X6).
    expect(body['browserHost']).toEqual({ trigger: 'submit', agent: { kind: 'acp', id: 'codex' } });
  });

  it('reattaches a daemon-placed chat to the daemon log no browser claim substantiates', async () => {
    // A daemon owns its workspace, so this chat writes no claim — and reload
    // discovery, which reads claims, never retains its run. Without a reattach
    // driven by the registration itself, a reloaded page rebuilds the transcript
    // from its own storage and never sees what the daemon finished unattended.
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderHook(() => useCadChatClient());

    await waitFor(() => {
      expect(reattachHostChat).toHaveBeenCalledWith({ chatId: 'chat_test', hostId: 'origin' });
    });
    // Ordering, not just occurrence: the transport answers a reconnect from the
    // API until this chat's host registration exists.
    expect(browserHostHarness.registration).toBeDefined();
  });

  it('leaves a browser-placed chat to reload discovery, which its workspace claim substantiates', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderHook(() => useCadChatClient());

    await waitFor(() => {
      expect(browserHostHarness.registration).toBeDefined();
    });
    expect(reattachHostChat).not.toHaveBeenCalled();
  });

  it('refuses a branch-mode Tau Host turn instead of silently writing to the live workspace', async () => {
    mountAgentMock(
      buildAgent({
        execution: withChatRevisionMode({ kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' }, 'branch'),
      }),
    );
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());
    act(() => {
      result.current.submit({ text: 'Build it.' });
    });

    await waitFor(() => {
      expect(persistedErrors.at(-1)).toMatchObject({
        /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.stringContaining` is typed `any` by vitest. */
        message: expect.stringContaining('writes directly to that computer'),
      });
    });
    expect(actions.sendMessage).not.toHaveBeenCalled();
  });

  it('builds browser start config from the request agent and resolves retry-model metadata per admission', async () => {
    const agent = buildAgent({
      execution: { kind: 'tau', model: 'openai-gpt-5.5' },
      mode: 'plan',
      toolChoice: ['read_file'],
      snapshot: { activeFile: { path: 'main.ts', name: 'main.ts' } },
      contextPayload: { memory: { 'AGENTS.md': 'Browser rules' } },
    });
    mountAgentMock(agent);
    const messages: MyUIMessage[] = [
      { id: 'user-before-retry', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] },
      { id: 'assistant-before-retry', role: 'assistant', parts: [{ type: 'text', text: 'Prior answer.' }] },
    ];
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => messages });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());
    act(() => {
      result.current.retry('assistant-before-retry', 'openai-gpt-retry');
    });
    await waitFor(() => {
      expect(actions.retryMessage).toHaveBeenCalledOnce();
    });

    const body = actions.retryMessage.mock.calls[0]?.[1]?.body as {
      readonly agent: CadAgentConfigInput;
      readonly browserHost: {
        readonly trigger: string;
        readonly retainedMessageIds: readonly string[];
        readonly config: {
          readonly systemPrompt: string;
          readonly systemPromptBlocks: ReadonlyArray<{ readonly text: string }>;
          readonly model: {
            readonly id: string;
            readonly providerKind: string;
            readonly contextWindow: number;
            readonly cost: {
              readonly input: number;
              readonly output: number;
              readonly cacheRead: number;
              readonly cacheWrite: number;
            };
          };
          readonly toolChoice: unknown;
          readonly allowedTools: readonly string[];
          readonly snapshot: unknown;
          readonly contextPayload: unknown;
          readonly contextMessages: ReadonlyArray<{
            readonly id: string;
            readonly role: string;
            readonly content: string;
            readonly metadata: {
              readonly tauInternal: { readonly kind: string; readonly anchorId: string; readonly pruning: string };
            };
          }>;
        };
      };
    };
    expect(body.agent.execution).toEqual({ kind: 'tau', model: 'openai-gpt-retry' });
    expect(body.browserHost).toMatchObject({
      trigger: 'retry',
      retainedMessageIds: [],
      config: {
        model: {
          id: 'openai-gpt-retry',
          providerKind: 'openai',
          contextWindow: 64_000,
          maxTokens: 8000,
          cost: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1.25 },
        },
        toolChoice: ['read_file'],
        allowedTools: ['read_file'],
        snapshot: agent.snapshot,
        contextPayload: agent.contextPayload,
      },
    });
    expect(body.browserHost.config.systemPromptBlocks).toHaveLength(2);
    expect(body.browserHost.config.systemPromptBlocks[0]?.text).toContain('<role>');
    expect(body.browserHost.config.systemPrompt).toContain('<plan_mode>');
    expect(body.browserHost.config.systemPromptBlocks[1]?.text).toContain('Model: openai-gpt-retry');
    const [snapshotContext] = body.browserHost.config.contextMessages;
    expect(snapshotContext?.id).toMatch(/^tau:snapshot-context:req_/u);
    expect(snapshotContext?.content).toContain('The file currently being rendered by the CAD engine: main.ts');
    expect(snapshotContext).toMatchObject({
      role: 'user',
      metadata: {
        tauInternal: {
          kind: 'snapshot-context',
          anchorId: 'chat_test',
          pruning: 'replace-by-id',
        },
      },
    });
  });

  it('resolves a browser-host approval on the attached run without opening another admission', async () => {
    browserHostHarness.run = { runId: 'run-paused', state: 'paused', eventCount: 4 };
    const messages = [
      {
        id: 'assistant-approval',
        role: 'assistant',
        parts: [
          {
            type: 'tool-edit_file',
            toolCallId: 'call-edit',
            state: 'approval-requested',
            input: { targetFile: 'main.ts', oldString: 'a', newString: 'b' },
            approval: { id: 'interrupt-1' },
          },
        ],
      },
    ] as MyUIMessage[];
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => messages });
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('streaming');
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());
    await act(async () => result.current.respondToToolApproval('interrupt-1', true, 'Proceed'));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledWith({
      chatId: 'chat_test',
      runId: 'run-paused',
      interruptId: 'interrupt-1',
      approved: true,
      reason: 'Proceed',
    });
    expect(actions.setMessages).toHaveBeenCalledWith([
      {
        ...messages[0],
        parts: [
          {
            ...messages[0]!.parts[0],
            state: 'approval-responded',
            approval: { id: 'interrupt-1', approved: true, reason: 'Proceed' },
          },
        ],
      },
    ]);
    expect(chat.addToolApprovalResponse).not.toHaveBeenCalled();
  });

  it('should call actions.sendMessage with body.agent built from useCadAgentConfig when submit fires', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'hello world' });
    });

    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledTimes(1);
    });
    const [sentMessage, options] = actions.sendMessage.mock.calls[0]! as [
      MyUIMessage,
      { body?: Record<string, unknown> } | undefined,
    ];
    expect(sentMessage).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'hello world' }],
    });
    expect(options).toEqual({ body: expectRunBody() });
  });

  it.each(['submitted', 'streaming'] as const)(
    'should ignore submit/edit/retry/regenerate while a %s request is in flight',
    (status) => {
      const chat = mock<Chat<MyUIMessage>>();
      useActiveChatInstanceMock.mockReturnValue(chat);
      useChatSelectorMock.mockReturnValue(status);
      const actions = buildActions();
      installActions(actions);

      const { result } = renderHook(() => useCadChatClient());

      act(() => {
        result.current.submit({ text: 'double submit' });
        result.current.edit('msg_edit', { text: 'edit while busy' });
        result.current.retry('msg_retry');
        result.current.regenerateTail();
      });

      expect(actions.sendMessage).not.toHaveBeenCalled();
      expect(actions.editMessage).not.toHaveBeenCalled();
      expect(actions.retryMessage).not.toHaveBeenCalled();
      expect(actions.regenerate).not.toHaveBeenCalled();
      // A refused verb must say so: a silently dropped submit looked to the
      // operator like the message vanished — no row, no request, no banner.
      expect(persistedErrors).toHaveLength(4);
    },
  );

  it('should still allow stop while a request is in flight', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('streaming');
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.stop();
    });

    expect(actions.stop).toHaveBeenCalledTimes(1);
  });

  it('should call actions.retryMessage with body.agent and the supplied messageId when retry fires', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.retry('msg_42');
    });

    await waitFor(() => {
      expect(actions.retryMessage).toHaveBeenCalledTimes(1);
    });
    expect(actions.retryMessage).toHaveBeenCalledWith('msg_42', { body: expectRunBody() });
  });

  it('dispatches a retry selected while the prior workspace publication is settling', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    workspaceHarness.current = {
      execution: { workspaceId: 'workspace_old', baseRevisionId: 'rev_old', hostId: 'host_test' },
      admitted: true,
    };
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', {
      get: () => [
        { id: 'user_retry', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] },
        { id: 'assistant_retry', role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] },
      ],
    });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.retry('assistant_retry', 'openai-gpt-retry');
    });
    expect(actions.retryMessage).not.toHaveBeenCalled();

    workspaceHarness.current = {
      execution: { workspaceId: 'workspace_retry', baseRevisionId: 'rev_retry', hostId: 'host_test' },
      admitted: false,
    };
    act(() => {
      for (const listener of workspaceHarness.listeners) {
        listener();
      }
    });

    await waitFor(() => {
      expect(actions.retryMessage).toHaveBeenCalledOnce();
    });
    const [messageId, options] = actions.retryMessage.mock.calls[0]! as [
      string,
      {
        readonly body: {
          readonly execution: {
            readonly workspaceId: string;
            readonly baseRevisionId: string;
            readonly hostId: string;
          };
          readonly browserHost: { readonly trigger: string; readonly retainedMessageIds: readonly string[] };
        };
      },
    ];
    expect(messageId).toBe('assistant_retry');
    expect(options.body.execution).toEqual({
      workspaceId: 'workspace_retry',
      baseRevisionId: 'rev_retry',
      hostId: 'host_test',
    });
    expect(options.body.browserHost).toMatchObject({ trigger: 'retry', retainedMessageIds: [] });
  });

  it('should override `body.agent.execution` with Tau when retry is given a modelId', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.retry('msg_42', 'anthropic-claude-4.7');
    });

    await waitFor(() => {
      expect(actions.retryMessage).toHaveBeenCalledTimes(1);
    });
    expect(actions.retryMessage).toHaveBeenCalledWith('msg_42', {
      body: expectRunBody(buildAgent({ execution: { kind: 'tau', model: 'anthropic-claude-4.7' } })),
    });
  });

  it('should call actions.editMessage with body.agent and the rebuilt content when edit fires', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = {
      ...buildActions(),
      editMessage: vi.fn(),
    };
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.edit('msg_99', { text: 'edited content', imageUrls: ['data:image/png;base64,AAA'] });
    });

    await waitFor(() => {
      expect(actions.editMessage).toHaveBeenCalledTimes(1);
    });
    expect(actions.editMessage).toHaveBeenCalledWith('msg_99', 'edited content', {
      imageUrls: ['data:image/png;base64,AAA'],
      body: expectRunBody(),
    });
  });

  it('should call actions.regenerate with body.agent when regenerateTail fires', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.regenerateTail();
    });

    await waitFor(() => {
      expect(actions.regenerate).toHaveBeenCalledTimes(1);
    });
    expect(actions.regenerate).toHaveBeenCalledWith({ body: expectRunBody() });
  });

  it('should call actions.stop when stop fires', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.stop();
    });

    expect(actions.stop).toHaveBeenCalledTimes(1);
  });

  it('should expose messages and error from the bound chat instance, and status from useChatSelector', () => {
    const chat = mock<Chat<MyUIMessage>>();
    const messages: readonly MyUIMessage[] = [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
    Object.defineProperty(chat, 'messages', { get: () => messages });
    const error = new Error('network');
    Object.defineProperty(chat, 'error', { get: () => error });
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('streaming');
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    expect(result.current.messages).toBe(messages);
    expect(result.current.status).toBe('streaming');
    expect(result.current.error).toBe(error);
  });

  it('should keep the body object reference stable across renders when the agent identity does not change', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const agentRef = buildAgent();
    mountAgentMock(agentRef);

    const { result, rerender } = renderHook(() => useCadChatClient());
    const firstAgent = result.current.agent;
    rerender();
    const secondAgent = result.current.agent;

    expect(secondAgent).toBe(firstAgent);
  });

  it('should publish the latest agent body to the session and leave it owned by the session on view unmount', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const setLatestAgentBody = vi.fn();
    installSessionStore({ setLatestAgentBody });

    const { unmount } = renderHook(() => useCadChatClient());

    await waitFor(() => {
      expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', expect.any(Function));
    });
    // The published value composes the body (and admits the workspace) at
    // dispatch time; a snapshot could name a workspace already discarded.
    const compose = setLatestAgentBody.mock.calls.at(-1)?.[1] as () => Promise<Record<string, unknown>>;
    await expect(compose()).resolves.toEqual(expectRunBody());
    expect(workspaceHarness.current?.admitted).toBe(true);

    unmount();

    // The store keeps the factory after the view goes: a run may outlive it.
    expect(setLatestAgentBody).not.toHaveBeenCalledWith('chat_test', undefined);
  });

  it('composes a seeded dispatch against the current claim, never a stale prepared snapshot', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    const setLatestAgentBody = vi.fn();
    installSessionStore({
      setLatestAgentBody,
      startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
      endRun: vi.fn(),
    });

    renderHook(() => useCadChatClient());
    await waitFor(() => {
      expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', expect.any(Function));
    });
    const compose = setLatestAgentBody.mock.calls.at(-1)?.[1] as () => Promise<Record<string, unknown>>;

    // The claim the composer saw at mount was discarded (a revision-mode switch,
    // a settled run) and `prepare` now mints a different workspace. A body
    // snapshotted at mount would dispatch the seeded turn against a workspace no
    // claim on disk carries — the run then executes but can never settle.
    workspaceHarness.current = undefined;
    workspaceHarness.prepare.mockImplementation(async () => {
      workspaceHarness.current = {
        execution: { workspaceId: 'workspace_second', baseRevisionId: 'rev_second', hostId: 'host_test' },
        admitted: false,
      };
      return workspaceHarness.current;
    });

    const body = await compose();

    expect(body['execution']).toEqual({
      workspaceId: 'workspace_second',
      baseRevisionId: 'rev_second',
      hostId: 'host_test',
    });
    expect((workspaceHarness.current as { readonly admitted: boolean } | undefined)?.admitted).toBe(true);
  });

  /** Mounts the client over a fixed transcript and returns the published bodyless-dispatch factory. */
  const composeSeededBody = async (messages: MyUIMessage[]): Promise<Record<string, unknown>> => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => messages });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    const setLatestAgentBody = vi.fn();
    installSessionStore({
      setLatestAgentBody,
      startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
      endRun: vi.fn(),
      get: sessionWithPersistedErrors,
    });

    renderHook(() => useCadChatClient());
    await waitFor(() => {
      expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', expect.any(Function));
    });
    const compose = setLatestAgentBody.mock.calls.at(-1)?.[1] as () => Promise<Record<string, unknown>>;
    return compose();
  };

  it('admits a seeded first turn as a submit, because an empty durable log has no prefix to retain', async () => {
    // "New project → first prompt" is replayed by hydration as a `regenerate`.
    // Admitted as one, `packages/agent-host` refused it with
    // HISTORY_PREFIX_INVALID against the chat's empty log and the operator's
    // primary flow never ran on the browser host.
    const body = await composeSeededBody([
      {
        id: 'user-seeded',
        role: 'user',
        parts: [{ type: 'text', text: 'Create the browser-host proof file.' }],
        metadata: { status: 'pending', createdAt: 1 },
      },
    ]);

    expect(body['browserHost']).toEqual({ trigger: 'submit', config: expect.anything() as unknown });
  });

  it('keeps a hydration regenerate rewinding the durable history prefix it retains', async () => {
    const body = await composeSeededBody([
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] },
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] },
      { id: 'user-2', role: 'user', parts: [{ type: 'text', text: 'Again.' }] },
      { id: 'assistant-2', role: 'assistant', parts: [{ type: 'text', text: 'Done again.' }] },
    ]);

    expect(body['browserHost']).toMatchObject({
      trigger: 'regenerate',
      retainedMessageIds: ['user-1', 'assistant-1'],
    });
  });

  it('should republish the agent body under the new chat id when activeChatId changes', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const setLatestAgentBody = vi.fn();
    installSessionStore({ setLatestAgentBody });

    const { rerender } = renderHook(() => useCadChatClient());

    await waitFor(() => {
      expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', expect.any(Function));
    });

    installActiveSession('chat_second');
    rerender();

    await waitFor(() => {
      expect(setLatestAgentBody).toHaveBeenCalledWith('chat_second', expect.any(Function));
    });
  });

  it('should hold a second turn until settlement supplies a fresh workspace', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    mountAgentMock(buildAgent({ kernel: 'replicad' }));

    const { result, rerender } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'first' });
    });
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledOnce();
    });
    expect(actions.sendMessage.mock.calls.at(-1)?.[1]).toEqual({
      body: expectRunBody(buildAgent({ kernel: 'replicad' })),
    });

    mountAgentMock(buildAgent({ kernel: 'openscad' }));
    rerender();

    act(() => {
      result.current.submit({ text: 'second' });
    });

    expect(actions.sendMessage).toHaveBeenCalledTimes(1);

    workspaceHarness.current = {
      execution: { workspaceId: 'workspace_test', baseRevisionId: 'rev_test', hostId: 'host_test' },
      admitted: false,
    };
    act(() => {
      for (const listener of workspaceHarness.listeners) {
        listener();
      }
    });

    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(actions.sendMessage.mock.calls.at(-1)?.[1]).toEqual({
      body: expectRunBody(buildAgent({ kernel: 'openscad' })),
    });
  });

  it('forwards the revision mode derived from the active execution to every prepare call site', async () => {
    mountAgentMock(
      buildAgent({
        execution: withChatRevisionMode({ kind: 'tau', model: 'openai-gpt-5.5' }, 'branch'),
      }),
    );
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    // No retained claim: every verb must mint one through `prepare`.
    const prepared = workspaceHarness.current!;
    workspaceHarness.current = undefined;
    workspaceHarness.prepare.mockImplementation(async () => prepared);

    const setLatestAgentBody = vi.fn();
    installSessionStore({
      setLatestAgentBody,
      startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
      endRun: vi.fn(),
    });
    const { result } = renderHook(() => useCadChatClient());
    // 1. the browser-host client factory.
    await waitFor(() => {
      expect(browserHostHarness.registration).toBeDefined();
    });
    await browserHostHarness.registration!.createClient();
    // 2. the bodyless (seeded) dispatch, which composes and admits on demand.
    const compose = setLatestAgentBody.mock.calls.at(-1)?.[1] as () => Promise<Record<string, unknown>>;
    await compose();
    // 3. the admission path shared by submit / edit / retry / regenerate.
    // No retained claim: the submit must mint one through `prepare` too.
    workspaceHarness.current = undefined;
    act(() => {
      result.current.submit({ text: 'branch mode' });
    });
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledOnce();
    });
    // 4. the tool-approval resume path.
    await act(async () => result.current.respondToToolApproval('interrupt-1', true));

    expect(workspaceHarness.prepare.mock.calls.length).toBeGreaterThanOrEqual(4);
    for (const call of workspaceHarness.prepare.mock.calls) {
      expect(call).toEqual(['chat_test', { mode: 'branch' }]);
    }
  });

  it('defaults to local mode and keeps the client-only mode off the strict turn wire', async () => {
    mountAgentMock(buildAgent({ execution: withChatRevisionMode({ kind: 'tau', model: 'openai-gpt-5.5' }, 'branch') }));
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const { result, rerender } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'no revision on the wire' });
    });
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledOnce();
    });

    const body = actions.sendMessage.mock.calls[0]?.[1]?.body as { readonly agent: CadAgentConfigInput };
    expect(body.agent.execution).toEqual({ kind: 'tau', model: 'openai-gpt-5.5' });

    mountAgentMock(buildAgent());
    workspaceHarness.current = undefined;
    rerender();
    act(() => {
      result.current.submit({ text: 'default mode' });
    });
    await waitFor(() => {
      expect(workspaceHarness.prepare.mock.calls.at(-1)).toEqual(['chat_test', { mode: 'local' }]);
    });
  });
});
