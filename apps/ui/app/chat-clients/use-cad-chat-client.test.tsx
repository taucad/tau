import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { Chat } from '@ai-sdk/react';
import type { CadAgentConfigInput, CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import type { ChatActions } from '#hooks/use-chat.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import type { ActiveChatSessionContextValue } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { AgentHostClientOptions, AgentHostClient } from '#services/agent-host-client.js';
import type * as AgentHostClientModule from '#services/agent-host-client.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatTurnHost } from '#chat-clients/chat-turn-host.js';
import { chatTurnAdmit, resetChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import type { StoredAttachmentRef } from '#utils/attachment.utils.js';
import { storedRef } from '#utils/attachment.test-utils.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import type { HostCommand } from '@taucad/agent-host/wire';

/* Whether the project's revision root is connected yet (W8 TS-S5): the host places turns through it. */
const revisionRoot = vi.hoisted(() => ({ connected: true }));
const browserHostHarness = vi.hoisted(() => ({
  run: undefined as { runId: string; state?: 'paused'; eventCount?: number } | undefined,
  /** Whether this chat has a browser host registered, and whether its run can be resumed. */
  placed: false,
  resumable: false,
  /** The run the host last named for this chat when no stream of this page publishes one (a daemon-placed chat). */
  hostRunId: undefined as string | undefined,
  projectedFailure: undefined as { code: string; message: string } | undefined,
  runKind: 'tau' as 'tau' | 'external',
  createClient: vi.fn((_options: AgentHostClientOptions): AgentHostClient => {
    const client = Object.create(null) as AgentHostClient;
    client.close = vi.fn(async () => undefined);
    return client;
  }),
  resolveInterrupt: vi.fn().mockResolvedValue(undefined),
  syncProjectRoots: vi.fn().mockResolvedValue(undefined),
  selectedRoot: '/projects/proj_test',
  openProjectRootBridge: vi.fn((_root: string, _plane: string) => ({
    port: new MessageChannel().port1,
    dispose: vi.fn(),
  })),
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
  /** Set by a test to hold the admission at its availability wait. */
  return { availability, gate: undefined as Promise<void> | undefined };
});
const creditPreflightHarness = vi.hoisted(() => ({
  /** Every `(routeId, modelName)` the client pre-flighted, in dispatch order. */
  calls: [] as Array<readonly [string, string]>,
  /** Set by a test to make the pre-flight refuse this dispatch. */
  refuse: undefined as (() => void) | undefined,
}));
const placementHarness = vi.hoisted(() => ({
  localHostId: undefined as 'desktop' | undefined,
}));

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: [], loading: false }),
  useCadAgentConfig: vi.fn(),
  awaitAgentHostAvailability: vi.fn(async () => {
    await availabilityHarness.gate;
    return availabilityHarness.availability;
  }),
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
    execution: { setActiveExecution: () => undefined },
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
    ensureModelCatalog: async () => ({ status: 'loaded', models: [] }),
    defaultExecution: { kind: 'tau', model: 'openai-gpt-5.5' },
    resolveModel: (id: string) => {
      /* What the real hook answers while the catalog cannot load: no row, so no provider. */
      if (id === 'openai-gpt-offline') {
        return { id, name: id, family: 'unknown', provider: { id: 'unknown', name: 'Unknown' }, isResolved: false };
      }
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
        configuration: { streaming: true, reasoning: { effort: 'high', summary: 'auto' } },
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
/* R9's turn-start pre-flight. The real hook reads the balance and the estimates
 * through React Query; this suite drives its *decision* instead, so the client's
 * own refusal path is what the assertions cover. Its own thresholds are proved in
 * `use-credit-preflight.test.tsx`. */
vi.mock('#hooks/use-credit-preflight.js', () => ({
  useCreditPreflight: () => (routeId: string, modelName: string) => {
    creditPreflightHarness.calls.push([routeId, modelName]);
    creditPreflightHarness.refuse?.();
  },
}));
vi.mock('#hooks/use-file-manager.js', () => {
  const fileManager = () => ({
    workspace: { syncProjectRoots: browserHostHarness.syncProjectRoots },
    fileManagerRef: {
      getSnapshot: () => ({
        context: {
          rootDirectory: browserHostHarness.selectedRoot,
          openFileSystemBridge: browserHostHarness.openProjectRootBridge,
        },
      }),
    },
  });
  return { useFileManager: fileManager, useOptionalFileManager: fileManager };
});
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getBrowserAgentHostRun: () => browserHostHarness.run,
  isBrowserAgentHostPlaced: () => browserHostHarness.placed,
  resumableBrowserAgentHostRunId: () =>
    browserHostHarness.resumable ? (browserHostHarness.run?.runId ?? browserHostHarness.hostRunId) : undefined,
  resolveBrowserAgentHostInterrupt: browserHostHarness.resolveInterrupt,
}));
vi.mock('#services/agent-host-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentHostClientModule>()),
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
  desktopWorkspaceRoot: async () => '/Users/test/Tau/home/proj_test',
  localAgentHostId: () => placementHarness.localHostId,
  daemonPlacementOf: (execution: CadAgentExecution) =>
    execution.kind === 'tau' ? (execution.hostId ?? placementHarness.localHostId) : execution.hostId,
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
}));
/* ChatTurnHost composes a registration only once the project's revision root is connected (W8 TS-S5). */
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => (revisionRoot.connected ? {} : undefined),
}));
/* ChatTurnHost reads the usage-metrics preference through react-query; this scope has no query client. */
vi.mock('#hooks/use-privacy-preferences.js', () => ({ usePrivacyPreferences: () => ({ preferences: undefined }) }));

const toastHarness = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastHarness }));

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
  editMessage: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setMessages: ReturnType<typeof vi.fn>;
};

/** Every turn one row's verbs admitted, in order. */
const admittedTurns: ChatTurn[] = [];

/**
 * Admit a turn the way the chat's session actor does.
 *
 * The verbs are gestures now (C3): `submit` hands one to `useChatActions`,
 * which sends it to the chat's session actor, whose `queued` state invokes the
 * admission `ChatTurnHost` published. These rows stand in for the actor so the
 * seam under test is the published admission itself.
 */
const composeTurn = async (gesture: ChatTurnGesture): Promise<ChatTurn> => {
  await waitFor(() => {
    expect(chatTurnAdmit('chat_test')).toBeDefined();
  });
  const turn = await chatTurnAdmit('chat_test')!(gesture);
  admittedTurns.push(turn);
  return turn;
};

/** The composed request of the turn a verb admitted. */
type AdmittedRequest = Record<string, unknown> & { readonly body?: Record<string, unknown> };

const admittedRequest = async (index = 0): Promise<AdmittedRequest> => {
  await waitFor(() => {
    expect(admittedTurns.length).toBeGreaterThan(index);
  });
  return admittedTurns[index]!.request as unknown as AdmittedRequest;
};

/** The gesture reaches the chat's admission; a refusal is the row's to assert. */
const requestTurn = async (gesture: ChatTurnGesture): Promise<void> => {
  try {
    await composeTurn(gesture);
  } catch {
    /* The refusal is the admission's own; the rows that care assert it there. */
  }
};

const buildActions = (): ActionsMock => ({
  sendMessage: vi.fn(async (message: MyUIMessage, options?: { attachments?: readonly StoredAttachmentRef[] }) =>
    requestTurn({ kind: 'send', message, ...options }),
  ),
  regenerate: vi.fn(async () => requestTurn({ kind: 'regenerate' })),
  editMessage: vi.fn(
    async (messageId: string, text: string, options?: { attachments?: readonly StoredAttachmentRef[] }) =>
      requestTurn({ kind: 'edit', messageId, text, ...options }),
  ),
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
  /* Merged, not replaced: the chat's turn host is mounted beside every view
   * these rows render, and it calls the store's placement and body seams. */
  vi.mocked(useChatSessionStore).mockReturnValue({
    requestTurn: vi.fn(),
    startPendingSeed: vi.fn(),
    setTurnPlacement: vi.fn(),
    respondToProjectedApproval: browserHostHarness.resolveInterrupt,
    getProjection: () => {
      const runId = browserHostHarness.run?.runId ?? browserHostHarness.hostRunId;
      if (runId === undefined) {
        return undefined;
      }
      return {
        ledger: {
          position: { cursor: 1 },
          currentRunId: runId,
          runs: {
            [runId]: browserHostHarness.projectedFailure
              ? { lifecycle: 'failed', failure: browserHostHarness.projectedFailure }
              : { lifecycle: browserHostHarness.run?.state ?? 'paused' },
          },
        },
        endCursor: 1,
      } as unknown as ChatProjection;
    },
    ...partial,
  } as unknown as ChatSessionStore);
};

/** The store's draft-attachment promotion, re-armed per test. */
let promoteDraftAttachments = vi.fn<ChatSessionStore['promoteDraftAttachments']>();

const imageAttachment = storedRef({ hash: 'a'.repeat(64), mediaType: 'image/png', byteLength: 11 });
const pdfAttachment = storedRef({ hash: 'b'.repeat(64), mediaType: 'application/pdf', filename: 'bracket-spec.pdf' });

/**
 * Mount a chat view beside the chat's one turn host.
 *
 * In the app they are separate mounts: `useCadChatClient` is a *view* (the
 * history, the examples, the stack trace, the approval banner and one per
 * transcript message), and `ChatTurnHost` is the single owner of the chat's
 * agent-host binding and its bodyless body factory. These rows drive both,
 * because they assert across that seam.
 */
const renderClient = (): ReturnType<typeof renderHook<ReturnType<typeof useCadChatClient>, unknown>> =>
  renderHook(() => useCadChatClient(), {
    wrapper: ({ children }) => (
      <>
        <ChatTurnHost />
        {children}
      </>
    ),
  });

const installActiveSession = (activeChatId: string): void => {
  vi.mocked(useActiveChatSession).mockReturnValue({
    activeChatId,
  } as unknown as ActiveChatSessionContextValue);
};

beforeEach(() => {
  placementHarness.localHostId = undefined;
  creditPreflightHarness.calls.length = 0;
  creditPreflightHarness.refuse = undefined;
  vi.clearAllMocks();
  resetChatTurnServices();
  admittedTurns.length = 0;
  browserHostHarness.run = undefined;
  browserHostHarness.placed = false;
  browserHostHarness.resumable = false;
  browserHostHarness.hostRunId = undefined;
  browserHostHarness.projectedFailure = undefined;
  browserHostHarness.runKind = 'tau';
  availabilityHarness.gate = undefined;
  revisionRoot.connected = true;
  mountAgentMock(buildAgent());
  useChatSelectorMock.mockReturnValue('ready');
  installActiveSession('chat_test');
  persistedErrors.length = 0;
  promoteDraftAttachments = vi.fn(async () => undefined);
  installSessionStore({
    promoteDraftAttachments,
    get: sessionWithPersistedErrors,
  });
});

describe('useCadChatClient', () => {
  it('should register no agent host, however many views mount it', async () => {
    /* The hook is mounted by the history, the examples, the stack trace, the
     * approval banner and once *per transcript message*. Every instance used
     * to write the one module-level registry, so the last one to unmount
     * deleted the chat's binding — and a rewinding dispatch unmounts exactly
     * those newest instances. The binding belongs to the chat's session actor;
     * these views only read. */
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const views = [renderClient(), renderClient()];
    await waitFor(() => {
      expect(views[0]!.result.current.submit).toBeInstanceOf(Function);
    });
    views.at(-1)!.unmount();

    expect(browserHostHarness.createClient).not.toHaveBeenCalled();
  });

  it('does not dispatch execution until the admission answers', async () => {
    const admission = Promise.withResolvers<void>();
    availabilityHarness.gate = admission.promise;
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const { result } = renderClient();

    act(() => {
      void result.current.submit({ text: 'commit before dispatch' });
    });

    /* The gesture reaches the owner at once; what waits is the admission the
     * owner invokes, and nothing is dispatched until it answers. */
    expect(admittedTurns).toEqual([]);
    admission.resolve();
    await waitFor(() => {
      expect(admittedTurns).toHaveLength(1);
    });
  });

  it('keeps submit pending until the admitted message is handed to the chat (S01)', async () => {
    const admission = Promise.withResolvers<void>();
    availabilityHarness.gate = admission.promise;
    useActiveChatInstanceMock.mockReturnValue(mock<Chat<MyUIMessage>>());
    const actions = buildActions();
    installActions(actions);
    const { result } = renderClient();

    let settled = false;
    const submitAndRecord = async (): Promise<void> => {
      await result.current.submit({ text: 'wait for admission' });
      settled = true;
    };
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = submitAndRecord();
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    admission.resolve();
    await act(async () => pending);
    expect(settled).toBe(true);
    expect(actions.sendMessage).toHaveBeenCalledOnce();
  });

  it('does not poll the catalog before answering a send with an unresolved model', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-offline' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const { result } = renderClient();
    act(() => {
      void result.current.submit({ text: 'Build it.' });
    });

    await waitFor(
      () => {
        expect(persistedErrors).toHaveLength(1);
      },
      { timeout: 300 },
    );
    expect(admittedTurns).toHaveLength(0);
  });

  it('uses the startup request id as the seeded first turn’s host command id', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', {
      get: () => [{ id: 'seed-user', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
    });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderClient();
    const turn = await composeTurn({ kind: 'regenerate', requestId: 'req_startup-1' });

    expect(turn.runId).toBe('req_startup-1');
    expect(turn.request.command).toMatchObject({
      type: 'start',
      commandId: 'req_startup-1',
      payload: { runId: 'req_startup-1' },
    });
  });

  it('refuses a turn the balance cannot fund, on the existing credits banner', async () => {
    creditPreflightHarness.refuse = () => {
      throw new Error(
        JSON.stringify({
          category: 'credits',
          title: 'Credit Limit Reached',
          message: 'Add credits to start a turn on GPT 5.5.',
          code: 'INSUFFICIENT_CREDIT',
          httpStatus: 402,
          details: {
            requiredCreditAtoms: '3084332',
            availableCreditAtoms: '1000000',
            routeId: 'openai-gpt-5.5',
          },
        }),
      );
    };
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    act(() => {
      void result.current.submit({ text: 'Build it.' });
    });

    await waitFor(() => {
      expect(persistedErrors).toHaveLength(1);
    });
    // The same ChatError `chat-error.tsx` already routes to `<ChatErrorCredits>`,
    // carrying W2's shortfall so the card can name the amount.
    expect(persistedErrors[0]).toMatchObject({
      category: 'credits',
      title: 'Credit Limit Reached',
      code: 'INSUFFICIENT_CREDIT',
      httpStatus: 402,
      details: {
        requiredCreditAtoms: '3084332',
        availableCreditAtoms: '1000000',
        routeId: 'openai-gpt-5.5',
      },
    });
    expect(admittedTurns).toEqual([]);
  });

  it('pre-flights the route the turn will run and dispatches when nothing refuses it', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    act(() => {
      void result.current.submit({ text: 'Build it.' });
    });

    await waitFor(() => {
      expect(creditPreflightHarness.calls).toEqual([['openai-gpt-5.5', 'GPT 5.5']]);
    });
    await admittedRequest();
    expect(persistedErrors).toHaveLength(0);
  });

  it('admits a turn on a host that advertises nothing about revisions', async () => {
    /* Every host records every turn through its own revision tree, and the
       descriptor stopped carrying a mode array at all (W3c, W3d-a2). A client
       that still read one would stop every desktop and daemon turn before a
       body is composed. */
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    act(() => {
      void result.current.submit({ text: 'Build it.' });
    });

    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledOnce();
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

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', true, { reason: 'Proceed' }));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledExactlyOnceWith('chat_test', 'interrupt-1', {
      approved: true,
      reason: 'Proceed',
      optionId: undefined,
    });
    expect(actions.setMessages).not.toHaveBeenCalled();
    expect(chat.addToolApprovalResponse).not.toHaveBeenCalled();
  });

  it('should retain a resumed host reply that arrives before approval resolution returns', async () => {
    browserHostHarness.run = { runId: 'run-paused', state: 'paused', eventCount: 4 };
    let messages = [
      {
        id: 'assistant-approval',
        role: 'assistant',
        parts: [
          {
            type: 'tool-request_job',
            toolCallId: 'call-print',
            state: 'approval-requested',
            input: { targetFile: 'main.scad' },
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
    actions.setMessages.mockImplementation((next: MyUIMessage[]) => {
      messages = next;
    });
    installActions(actions);
    browserHostHarness.resolveInterrupt.mockImplementationOnce(async () => {
      messages = [
        ...messages,
        { id: 'resumed-reply', role: 'assistant', parts: [{ type: 'text', text: 'Print started.' }] },
      ];
    });

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', true));

    expect(messages.some((message) => message.id === 'resumed-reply')).toBe(true);
  });

  it('does not open an SDK approval request for a projected paused run', async () => {
    browserHostHarness.resumable = true;
    browserHostHarness.hostRunId = 'run-stale';
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('ready');
    installActions(buildActions());

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-stale', true));

    expect(chat.addToolApprovalResponse).not.toHaveBeenCalled();
    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledExactlyOnceWith('chat_test', 'interrupt-stale', {
      approved: true,
      reason: undefined,
      optionId: undefined,
    });
  });

  it('delegates a denied approval to the projection-backed command path', async () => {
    browserHostHarness.run = { runId: 'run-paused', state: 'paused', eventCount: 4 };
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', false));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledExactlyOnceWith('chat_test', 'interrupt-1', {
      approved: false,
      reason: undefined,
      optionId: undefined,
    });
  });

  it('delegates an external approval without sending an SDK request', async () => {
    browserHostHarness.run = { runId: 'run-external-paused', state: 'paused', eventCount: 4 };
    browserHostHarness.runKind = 'external';
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', true));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledExactlyOnceWith('chat_test', 'interrupt-1', {
      approved: true,
      reason: undefined,
      optionId: undefined,
    });
    expect(chat.resumeStream).not.toHaveBeenCalled();
  });

  it("answers a daemon-placed chat's paused run without an SDK-side resume (GM.r1 H1)", async () => {
    placementHarness.localHostId = 'desktop';
    browserHostHarness.hostRunId = 'run-daemon-paused';
    browserHostHarness.resumable = true;
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('ready');
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', true));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledExactlyOnceWith('chat_test', 'interrupt-1', {
      approved: true,
      reason: undefined,
      optionId: undefined,
    });
    expect(chat.resumeStream).not.toHaveBeenCalled();
    expect(actions.setMessages).not.toHaveBeenCalled();
    expect(chat.addToolApprovalResponse).not.toHaveBeenCalled();
  });

  /* The option the human chose has to survive the whole chain, and the two
   * browser hops are the only ones with no product-path coverage: if either
   * dropped the field every other test still passes (4-review S2). */
  it('carries the exact option a human chose to the projected approval command', async () => {
    browserHostHarness.run = { runId: 'run-paused', state: 'paused', eventCount: 4 };
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('streaming');
    installActions(buildActions());

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', true, { optionId: 'allow-always' }));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledExactlyOnceWith('chat_test', 'interrupt-1', {
      approved: true,
      reason: undefined,
      optionId: 'allow-always',
    });
  });

  it('should admit one Start command when submit hands over the user message', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

    act(() => {
      void result.current.submit({ text: 'hello world' });
    });

    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledTimes(1);
    });
    const [sentMessage] = actions.sendMessage.mock.calls[0]! as [MyUIMessage];
    expect(sentMessage).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'hello world' }],
    });
    const request = await admittedRequest();
    expect(request).toMatchObject({ kind: 'send', message: sentMessage });
    expect(request['command']).toMatchObject({
      type: 'start',
      payload: { chatId: 'chat_test', message: { id: sentMessage.id, role: 'user' }, trigger: 'submit' },
    });
    expect((request['command'] as HostCommand).commandId).toBe(
      (request['command'] as HostCommand & { payload: { runId: string } }).payload.runId,
    );
  });

  it('should promote draft attachments into the chat before sending a message that references them', async () => {
    useActiveChatInstanceMock.mockReturnValue(mock<Chat<MyUIMessage>>());
    const actions = buildActions();
    installActions(actions);
    const { result } = renderClient();

    act(() => {
      void result.current.submit({ text: 'look at this', attachments: [imageAttachment] });
    });

    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(promoteDraftAttachments).toHaveBeenCalledWith('chat_test', [imageAttachment]);
    expect(promoteDraftAttachments.mock.invocationCallOrder[0]).toBeLessThan(
      actions.sendMessage.mock.invocationCallOrder[0]!,
    );
    const [sentMessage] = actions.sendMessage.mock.calls[0]! as [MyUIMessage];
    expect(sentMessage.parts).toEqual([
      {
        type: 'file',
        mediaType: 'image/png',
        url: `attachments/${imageAttachment.hash}.png`,
        providerMetadata: { common: { byteLength: 11 } },
      },
      { type: 'text', text: 'look at this' },
    ]);
  });

  it('should send nothing and toast once when an attachment cannot be promoted', async () => {
    useActiveChatInstanceMock.mockReturnValue(mock<Chat<MyUIMessage>>());
    const actions = buildActions();
    installActions(actions);
    promoteDraftAttachments.mockRejectedValue(new Error('Attachment is missing; nothing was copied.'));
    const { result } = renderClient();

    act(() => {
      void result.current.submit({ text: 'look at this', attachments: [imageAttachment] });
    });

    await waitFor(() => {
      expect(toastHarness.error).toHaveBeenCalledOnce();
    });
    expect(toastHarness.error).toHaveBeenCalledWith(expect.stringMatching(/wasn't sent/u), {
      id: 'chat-attachment-promotion',
    });
    expect(actions.sendMessage).not.toHaveBeenCalled();
  });

  it('should refuse a PDF the selected model cannot read, naming the model, before promoting anything', () => {
    useActiveChatInstanceMock.mockReturnValue(mock<Chat<MyUIMessage>>());
    const actions = buildActions();
    installActions(actions);
    const { result } = renderClient();

    act(() => {
      void result.current.submit({ text: 'read the spec', attachments: [pdfAttachment] });
    });

    expect(promoteDraftAttachments).not.toHaveBeenCalled();
    expect(actions.sendMessage).not.toHaveBeenCalled();
    expect(persistedErrors).toEqual([
      expect.objectContaining({ message: "GPT 5.5 can't read PDFs. Remove the PDF or pick another model." }),
    ]);
  });

  /*
   * V2: a gesture over a live turn is *queued* by the chat's session actor,
   * never refused at the verb and never given a second lease. The two policies
   * that used to disagree — this hook refusing up front while
   * `chat-persistence` pre-empted — are one owner now, and the rows that pin
   * it are `chatSessionMachine`'s ("should hold a gesture made over a live
   * turn until it settles", "should queue a turn requested while finishing").
   */

  it('should call actions.editMessage with the rebuilt content, and admit its own turn, when edit fires', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    /* An edit rewinds to a message the transcript holds: `turnIntentOf` refuses
     * one whose message is absent, because there is no rewind point to lease
     * against (T3-D5). A fixture with no transcript was asserting an admission
     * the product no longer makes. */
    chat.messages = [{ id: 'msg_99', role: 'user', parts: [{ type: 'text', text: 'original' }] }];
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

    act(() => {
      result.current.edit('msg_99', { text: 'edited content', attachments: [imageAttachment] });
    });

    await waitFor(() => {
      expect(actions.editMessage).toHaveBeenCalledTimes(1);
    });
    // Rewritten for W7: an edit carries attachment references, promoted into the chat first.
    expect(promoteDraftAttachments).toHaveBeenCalledWith('chat_test', [imageAttachment]);
    expect(actions.editMessage).toHaveBeenCalledWith('msg_99', 'edited content', {
      attachments: [imageAttachment],
    });
    expect(await admittedRequest()).toMatchObject({
      kind: 'edit',
      messageId: 'msg_99',
      content: 'edited content',
      attachments: [imageAttachment],
      command: { type: 'start', payload: { trigger: 'edit', message: { id: 'msg_99' } } },
    });
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

    const { result } = renderClient();

    expect(result.current.messages).toBe(messages);
    expect(result.current.status).toBe('streaming');
    expect(result.current.error).toBe(error);
  });

  it('should keep the agent snapshot reference stable across renders when its identity does not change', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const agentRef = buildAgent();
    mountAgentMock(agentRef);

    const { result, rerender } = renderClient();
    const firstAgent = result.current.agent;
    rerender();
    const secondAgent = result.current.agent;

    expect(secondAgent).toBe(firstAgent);
  });

  it('should unpublish the focused admission on view unmount without interrupting its composed command', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    chat.messages = [{ id: 'user-owned', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }];
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const { unmount } = renderClient();

    // The published admission composes a host command when the owner invokes it.
    const turn = await composeTurn({ kind: 'regenerate' });
    expect(turn.request.command).toMatchObject({ type: 'start', payload: { trigger: 'submit' } });

    unmount();

    // An admitted command is already composed; a later seed must not call stale route hooks.
    expect(chatTurnAdmit('chat_test')).toBeUndefined();
  });

  /** Mounts the client over a fixed transcript and returns its durable Start command. */
  const composeSeededCommand = async (messages: MyUIMessage[]): Promise<HostCommand> => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => messages });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    installSessionStore({
      get: sessionWithPersistedErrors,
    });

    renderClient();
    const turn = await composeTurn({ kind: 'regenerate' });
    return turn.request.command!;
  };

  it('admits a seeded first turn as a submit, because an empty durable log has no prefix to retain', async () => {
    // "New project → first prompt" is replayed by hydration as a `regenerate`.
    // Admitted as one, `packages/agent-host` refused it with
    // HISTORY_PREFIX_INVALID against the chat's empty log and the operator's
    // primary flow never ran on the browser host.
    const command = await composeSeededCommand([
      {
        id: 'user-seeded',
        role: 'user',
        parts: [{ type: 'text', text: 'Create the browser-host proof file.' }],
        metadata: { status: 'pending', createdAt: 1 },
      },
    ]);

    expect(command).toMatchObject({ type: 'start', payload: { trigger: 'submit' } });
  });

  it('keeps a hydration regenerate rewinding the durable history prefix it retains', async () => {
    const command = await composeSeededCommand([
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] },
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] },
      { id: 'user-2', role: 'user', parts: [{ type: 'text', text: 'Again.' }] },
      { id: 'assistant-2', role: 'assistant', parts: [{ type: 'text', text: 'Done again.' }] },
    ]);

    expect(command).toMatchObject({
      type: 'start',
      payload: { trigger: 'regenerate', retainedMessageIds: ['user-1', 'assistant-1'] },
    });
  });

  it('should republish the chat admission under the new chat id when activeChatId changes', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const { rerender } = renderClient();

    await waitFor(() => {
      expect(chatTurnAdmit('chat_test')).toBeDefined();
    });

    installActiveSession('chat_second');
    rerender();

    await waitFor(() => {
      expect(chatTurnAdmit('chat_second')).toBeDefined();
    });
    expect(chatTurnAdmit('chat_test')).toBeUndefined();
  });

  /* Resume never changes kind into a replay after its gesture was taken. */
  it('refuses Resume for a projected paused run and resumes its failed run once observed', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    /* One user message, because a continuation leases it: a transcript with
     * none has no turn to continue and `turnIntentOf` refuses it (W10-B). */
    Object.defineProperty(chat, 'messages', { get: () => [{ id: 'user_1', role: 'user', parts: [] }] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    renderClient();

    browserHostHarness.placed = true;
    browserHostHarness.resumable = false;
    browserHostHarness.run = { runId: 'run_live', state: 'paused' };
    await expect(composeTurn({ kind: 'continue' })).rejects.toThrow('This turn cannot be resumed.');

    browserHostHarness.projectedFailure = { code: 'RUN_ABANDONED', message: 'The host closed.' };
    await expect(composeTurn({ kind: 'continue' })).resolves.toMatchObject({
      runId: 'run_live',
      request: { kind: 'continue' },
    });

    // A placement with no browser host answers its own resume over the wire.
    browserHostHarness.placed = false;
    await expect(composeTurn({ kind: 'continue' })).resolves.toMatchObject({ request: { kind: 'continue' } });
  });

  /*
   * I1 / T2-D3, T2-D4. A continuation is an ordinary attempt: it names the
   * turn it continues and the run id the host already holds, and the host
   * places and settles it as that run's next attempt (W8 TS-A12).
   */
  it('continues the turn a resume names, under the run the host already holds', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', {
      get: () => [
        { id: 'user_1', role: 'user', parts: [] },
        { id: 'run_live', role: 'assistant', parts: [] },
      ],
    });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    renderClient();

    browserHostHarness.placed = true;
    browserHostHarness.run = { runId: 'run_live' };
    browserHostHarness.projectedFailure = { code: 'RUN_ABANDONED', message: 'The host closed.' };

    await expect(composeTurn({ kind: 'continue' })).resolves.toMatchObject({
      runId: 'run_live',
      leaseTurnId: 'user_1',
      request: { kind: 'continue', command: { type: 'resume', payload: { runId: 'run_live' } } },
    });
  });

  it('sends the selected model in Start config without a page checkout or mode', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const { result } = renderClient();

    act(() => {
      void result.current.submit({ text: 'no revision on the wire' });
    });
    await waitFor(() => {
      expect(actions.sendMessage).toHaveBeenCalledOnce();
    });

    const request = await admittedRequest();
    expect(request['command']).toMatchObject({
      type: 'start',
      payload: { config: { model: { id: 'openai-gpt-5.5' } } },
    });
  });
});
