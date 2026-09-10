/**
 * Admission over the **real** placement book (3-review S6).
 *
 * The sibling suite mocks `#lib/agent-host-placement.js` wholesale, so its
 * revision assertions prove only that the gate reads a map a test wrote. This
 * file mocks everything that suite mocks *except* that module, seeds a real
 * descriptor through `listAgentHostPlacements`, and joins the two halves that
 * were previously green and untested together (2-review B1). `vi.mock` is
 * per-file, which is why this cannot be a case inside the existing suite.
 */
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
import { listAgentHostPlacements } from '#lib/agent-host-placement.js';
import type { TauHostDescriptor } from '#lib/agent-host-placement.js';

const workspaceHarness = vi.hoisted(() => ({
  current: undefined as
    | {
        execution: { hostId: string; mode: 'direct' | 'candidate'; workspaceId: string; baseRevisionId: string };
        admitted: boolean;
      }
    | undefined,
  listeners: new Set<() => void>(),
  admissionGate: undefined as Promise<void> | undefined,
  revisionMode: 'direct' as 'direct' | 'candidate',
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
    revisionMode: () => workspaceHarness.revisionMode,
    setRevisionMode: (_chatId: string, mode: 'direct' | 'candidate') => {
      workspaceHarness.revisionMode = mode;
    },
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

beforeEach(() => {
  workspaceHarness.revisionMode = 'direct';
  vi.clearAllMocks();
  browserHostHarness.registration = undefined;
  browserHostHarness.run = undefined;
  workspaceHarness.listeners.clear();
  workspaceHarness.admissionGate = undefined;
  workspaceHarness.current = {
    execution: { hostId: 'host_test', mode: 'direct', workspaceId: 'workspace_test', baseRevisionId: 'rev_test' },
    admitted: false,
  };
  // The real authority stamps the claim's own mode onto the target it hands
  // back; the harness has to do the same or the wire assertion proves nothing.
  const mintedClaim: NonNullable<typeof workspaceHarness.current> = {
    execution: { hostId: 'host_test', mode: 'direct', workspaceId: 'workspace_test', baseRevisionId: 'rev_test' },
    admitted: false,
  };
  workspaceHarness.prepare.mockImplementation(async (_chatId: string, options?: { mode?: 'direct' | 'candidate' }) => {
    const claim = workspaceHarness.current ?? mintedClaim;
    workspaceHarness.current = {
      ...claim,
      execution: { ...claim.execution, mode: options?.mode ?? 'direct' },
    };
    return workspaceHarness.current;
  });
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

const discoverHost = async (revisions: Array<'direct' | 'candidate'> | undefined): Promise<void> => {
  const descriptor: TauHostDescriptor = {
    v: 1,
    agent: true,
    label: 'Studio',
    workspaceRoot: '/srv/tau',
    externalAgents: [{ id: 'codex', displayName: 'Codex', models: [] }],
    ...(revisions === undefined ? {} : { revisions }),
  };
  await listAgentHostPlacements({ discoverOrigin: async () => descriptor, listHosts: async () => [], desktop: false });
};

describe('admission against the placement book a real discovery pass filled', () => {
  it('admits a direct turn on a daemon that advertised only direct', async () => {
    await discoverHost(['direct']);
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    workspaceHarness.revisionMode = 'direct';
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
      expect(actions.sendMessage).toHaveBeenCalled();
    });
    const body = actions.sendMessage.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body['execution']).toEqual({ hostId: 'origin', mode: 'direct' });
    expect(persistedErrors).toEqual([]);
  });

  /* A daemon-placed chat holds no browser workspace claim, which is the whole
     reason `ProjectChatRunSettlement` settles nothing for one — and therefore
     the reason the host's own `revision.finalized` record is the turn's only
     graph node. Answering an approval must not be the one path that mints one:
     with no live host run to answer (a reload before the reattach), the stale
     affordance is dropped rather than turned into a claim (5-review N5). */
  it('claims no browser workspace when an approval is answered on a daemon-placed chat', async () => {
    await discoverHost(['direct']);
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    // No run this transport is driving: `getBrowserAgentHostRun` answers nothing.
    browserHostHarness.run = undefined;

    const { result } = renderHook(() => useCadChatClient());
    await act(async () => {
      await result.current.respondToToolApproval('approval-1', true);
    });

    expect(workspaceHarness.prepare).not.toHaveBeenCalled();
    expect(chat.addToolApprovalResponse).not.toHaveBeenCalled();
    expect(browserHostHarness.resolveInterrupt).not.toHaveBeenCalled();
  });

  it('refuses a candidate turn on the same host, with the code the host itself refuses on', async () => {
    await discoverHost(['direct']);
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    workspaceHarness.revisionMode = 'candidate';
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const surfaced = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useCadChatClient());
    act(() => {
      result.current.submit({ text: 'Build it.' });
    });

    await waitFor(() => {
      expect(surfaced.mock.calls.at(-1)?.[1]).toMatchObject({ code: 'REVISION_MODE_UNSUPPORTED' });
    });
    expect(actions.sendMessage).not.toHaveBeenCalled();
    surfaced.mockRestore();
  });
});
