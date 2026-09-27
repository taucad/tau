import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
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
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatTurnHost } from '#chat-clients/chat-turn-host.js';
import {
  chatHostBinding,
  chatHostServices,
  chatTurnAdmit,
  resetChatHostServices,
  resetChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import type { AttachmentReference } from '#utils/attachment.utils.js';

/* Whether the project's revision root is connected yet (W8 TS-S5): the host places turns through it. */
const revisionRoot = vi.hoisted(() => ({ connected: true }));
const browserHostHarness = vi.hoisted(() => ({
  registration: undefined as { createClient: () => Promise<unknown> } | undefined,
  run: undefined as { runId: string; state?: 'paused'; eventCount?: number } | undefined,
  /** Whether this chat has a browser host registered, and whether its run can be resumed. */
  placed: false,
  resumable: false,
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
  /** How many times anything registered this chat's agent host. */
  registrations: 0,
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
    browserHostHarness.registrations += 1;
    browserHostHarness.registration = registration;
    return () => {
      browserHostHarness.registration = undefined;
    };
  },
  getBrowserAgentHostRun: () => browserHostHarness.run,
  isBrowserAgentHostPlaced: () => browserHostHarness.placed,
  resumableBrowserAgentHostRunId: () => (browserHostHarness.resumable ? browserHostHarness.run?.runId : undefined),
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

/** The wire body the admission composed for one turn. */
const admittedBody = async (index = 0): Promise<Record<string, unknown>> => {
  const request = await admittedRequest(index);
  return request.body!;
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
  sendMessage: vi.fn(async (message: MyUIMessage, options?: { attachments?: readonly AttachmentReference[] }) =>
    requestTurn({ kind: 'send', message, ...options }),
  ),
  regenerate: vi.fn(async () => requestTurn({ kind: 'regenerate' })),
  editMessage: vi.fn(
    async (messageId: string, text: string, options?: { attachments?: readonly AttachmentReference[] }) =>
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
    setTurnPlacement: vi.fn(),
    reattachHostChat,
    ...partial,
  } as ChatSessionStore);
};

/** The store's host-log reattach, re-armed per test. */
let reattachHostChat = vi.fn();
/** The store's draft-attachment promotion, re-armed per test. */
let promoteDraftAttachments = vi.fn<ChatSessionStore['promoteDraftAttachments']>();

const imageAttachment = { hash: 'a'.repeat(64), mediaType: 'image/png', byteLength: 11 };
const pdfAttachment = { hash: 'b'.repeat(64), mediaType: 'application/pdf', filename: 'bracket-spec.pdf' };

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

/** Every binding actor a row started, stopped after it. */
const bindings: Array<Actor<typeof chatHostBinding>> = [];

/**
 * Run the chat's real host binding, as its session actor does.
 *
 * The binding is invoked by `chat-session.machine`'s `host` region in the app;
 * here the row starts the same actor directly, so the registration under test
 * is the one the published services actually compose.
 */
const bindChatHost = async (chatId = 'chat_test'): Promise<void> => {
  await waitFor(() => {
    expect(chatHostServices(chatId)).toBeDefined();
  });
  const actor = createActor(chatHostBinding, {
    input: { chatId, placement: chatHostServices(chatId)!.placement },
  });
  bindings.push(actor);
  actor.start();
  await waitFor(() => {
    expect(browserHostHarness.registration).toBeDefined();
  });
};

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
  /* The page's resident host places the turn itself, so the target names only that host (W8 TS-S5). */
  execution: { hostId: expect.stringMatching(/^host_/u) as unknown },
  admission: {
    version: 1,
    idempotencyKey: expect.stringMatching(/^req_/u) as unknown,
  },
  // The browser host is the only Tau placement: every Tau turn admits one.
  browserHost: expectAnyHostAdmission,
});

beforeEach(() => {
  placementHarness.localHostId = undefined;
  creditPreflightHarness.calls.length = 0;
  creditPreflightHarness.refuse = undefined;
  vi.clearAllMocks();
  for (const binding of bindings.splice(0)) {
    binding.stop();
  }
  resetChatHostServices();
  resetChatTurnServices();
  admittedTurns.length = 0;
  browserHostHarness.registration = undefined;
  browserHostHarness.registrations = 0;
  browserHostHarness.run = undefined;
  browserHostHarness.placed = false;
  browserHostHarness.resumable = false;
  availabilityHarness.gate = undefined;
  revisionRoot.connected = true;
  mountAgentMock(buildAgent());
  useChatSelectorMock.mockReturnValue('ready');
  installActiveSession('chat_test');
  persistedErrors.length = 0;
  reattachHostChat = vi.fn();
  promoteDraftAttachments = vi.fn(async () => undefined);
  installSessionStore({
    promoteDraftAttachments,
    startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
    endRun: vi.fn(),
    reattachHostChat,
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

    expect(browserHostHarness.registrations).toBe(0);
  });

  it('places an implicit desktop Tau turn on the services utility', async () => {
    placementHarness.localHostId = 'desktop';
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderClient();
    await bindChatHost();
    await browserHostHarness.registration!.createClient();

    const [transport] = browserHostHarness.createDaemonClient.mock.calls.at(-1) as [{ dial: () => Promise<unknown> }];
    await expect(transport.dial()).resolves.toEqual({ hostId: 'desktop' });
    expect(browserHostHarness.openAgentHostChannel).toHaveBeenCalledWith('desktop', {
      projectId: 'proj_test',
      workspaceRoot: '/Users/test/Tau/home/proj_test',
    });
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

  it('initializes browser placement with the canonical prompt, authority, and catalog provider', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderClient();
    await bindChatHost();
    await browserHostHarness.registration!.createClient();

    expect(browserHostHarness.syncProjectRoots).toHaveBeenCalledOnce();
    expect(browserHostHarness.syncProjectRoots.mock.invocationCallOrder[0]).toBeLessThan(
      browserHostHarness.openProjectRootBridge.mock.invocationCallOrder[0]!,
    );
    const options = browserHostHarness.createClient.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    /* The host works on the project's live checkout; each attempt's checkout arrives with its placement (W8 TS-S5). */
    expect(options?.authority).toEqual({ projectId: 'proj_test', workspaceId: 'live' });
    expect(options?.openPlacementPort).toEqual(expect.any(Function));
    expect(options?.openRevisionsPort).toEqual(expect.any(Function));
    expect(options?.projectStorage).toMatchObject({ projectId: 'proj_test', backend: 'indexeddb' });
    expect(options?.durability).toBe('transactional-rewrite');
    expect(options?.openProjectRootBridge).toEqual(expect.any(Function));
    expect(options?.model).toMatchObject({
      id: 'openai-gpt-5.5',
      providerKind: 'openai',
      cost: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1.25 },
      reasoning: { effort: 'high', summary: 'auto' },
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

  /*
   * A bodyless Resume names no admission, so the host falls back to the model
   * its worker was initialised with — this registration's. Composed once, at
   * chat open, that was the model live when the chat was focused: not the one
   * the failed attempt ran on, and not the one the INVALID_REQUEST card just
   * told the person to change. A resume runs on the model selected *now*,
   * exactly as a send would.
   */
  it('creates the client for a resume on the model selected now, not the one the registration composed on', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const view = renderClient();
    await bindChatHost();
    // The person changes the model on the refusal card and presses Resume. The
    // placement does not move, so nothing re-composes the registration.
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-retry' } }));
    view.rerender({});
    await browserHostHarness.registration!.createClient();

    expect(browserHostHarness.createClient.mock.calls[0]?.[0]?.model).toMatchObject({
      id: 'openai-gpt-retry',
      contextWindow: 64_000,
    });
  });

  it('places a Tau Host turn on the daemon channel, claiming no browser workspace', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'origin' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    await bindChatHost();
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
      void result.current.submit({ text: 'Build it.' });
    });
    const body = await admittedBody();
    // The target names no browser workspace — only the daemon that writes and the mode
    // it must record the turn in (V18).
    expect(body['execution']).toEqual({ hostId: 'origin' });
    expect(body['agent']).toMatchObject({ execution: { kind: 'tau', hostId: 'origin' } });
  });

  /*
   * R9. The pre-flight runs inside `admitExecution`, the one path every verb
   * and every bodyless dispatch shares, and *before* the host is asked to
   * place anything — a turn refused for credit must leave nothing behind.
   */
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

  /*
   * "Retry with a different model" is the credits card's own way out, so the
   * admission — and with it the pre-flight and the browser-wire check — has to
   * see the overriding row, not the selection the composer still shows.
   */

  it('places an external-agent turn on its daemon, naming the agent and no Tau model', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    await bindChatHost();
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
      void result.current.submit({ text: 'Build it.' });
    });
    const body = await admittedBody();
    expect(body['execution']).toEqual({ hostId: 'origin' });
    expect(body['agent']).toMatchObject({ execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } });
    // The admission names the agent and the CAD context the client composed —
    // and nothing a Tau turn negotiates: no model row, no prompt blocks, no
    // tool grant, because the external agent brings its own (X6/V12).
    expect(body['browserHost']).toMatchObject({ trigger: 'submit', agent: { kind: 'acp', id: 'codex' } });
    const external = z.object({ context: z.record(z.string(), z.unknown()) }).safeParse(body['browserHost']);
    const context = external.data?.context ?? {};
    expect(Object.keys(context).toSorted()).toEqual(['systemPrompt']);
    expect(String(context['systemPrompt'])).toContain('<workflow>');
  });

  it('carries the adapter model an external-agent execution names, and nothing else', async () => {
    mountAgentMock(
      buildAgent({ execution: { kind: 'acp', hostId: 'origin', agentId: 'codex', model: 'gpt-5.3-codex-spark' } }),
    );
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();
    await bindChatHost();
    await browserHostHarness.registration!.createClient();
    act(() => {
      void result.current.submit({ text: 'Build it.' });
    });
    const body = await admittedBody();
    expect(body['browserHost']).toMatchObject({
      trigger: 'submit',
      agent: { kind: 'acp', id: 'codex', model: 'gpt-5.3-codex-spark' },
    });
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

    renderClient();
    await bindChatHost();

    // Ordering, not just occurrence: the reattach rides the registration, which
    // is the first moment the transport can answer a reconnect for this chat
    // with the daemon rather than the API.
    expect(reattachHostChat).toHaveBeenCalledWith({ chatId: 'chat_test', hostId: 'origin' });
    expect(browserHostHarness.registration).toBeDefined();
  });

  /*
   * T2-D1 / I7. Reload discovery substantiates a run from this browser's
   * workspace claim, and the document that held the claim is the one that
   * died — so a browser-placed run was never reattached at all: no adopt, no
   * *Reconnecting…*, a chat that looked idle with no reply, and a durable run
   * left `running` until the next gesture's attach dragged it back by
   * accident. The placement is the trigger, the host's log is the authority.
   */
  it('reattaches a browser-placed chat to the host log its dead document left behind', async () => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    renderClient();

    await bindChatHost();
    expect(reattachHostChat).toHaveBeenCalledWith({ chatId: 'chat_test', hostId: 'tau' });
  });

  /*
   * The file manager's worker arrives after this component's first render, so
   * the binding's one composition was the one whose `createClient` could not
   * prepare: `prepare` threw "This project has no revision root", the AI SDK
   * swallowed it into `onError`, and the chat's durable log was never attached
   * — no `RUN_ABANDONED`, no settlement, and the chat's first send wedged
   * behind the failed resume. `reattachHostChat` latches on the hostId, so the
   * retry has to be the composition, not the store.
   */
  it('waits for the revision root before reattaching, then reattaches once it connects', async () => {
    revisionRoot.connected = false;
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const view = renderClient();
    await waitFor(() => {
      expect(chatHostServices('chat_test')).toBeDefined();
    });
    const actor = createActor(chatHostBinding, {
      input: { chatId: 'chat_test', placement: chatHostServices('chat_test')!.placement },
    });
    bindings.push(actor);
    actor.start();
    expect(browserHostHarness.registration).toBeUndefined();
    expect(reattachHostChat).not.toHaveBeenCalled();

    revisionRoot.connected = true;
    view.rerender({});

    await waitFor(() => {
      expect(browserHostHarness.registration).toBeDefined();
    });
    expect(reattachHostChat).toHaveBeenCalledWith({ chatId: 'chat_test', hostId: 'tau' });
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

  /* The option the human chose has to survive the whole chain, and the two
   * browser hops are the only ones with no product-path coverage: if either
   * dropped the field every other test still passes (4-review S2). */
  it('carries the exact option a human chose down to the browser transport', async () => {
    browserHostHarness.run = { runId: 'run-paused', state: 'paused', eventCount: 4 };
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => [] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('streaming');
    installActions(buildActions());

    const { result } = renderClient();
    await act(async () => result.current.respondToToolApproval('interrupt-1', true, { optionId: 'allow-always' }));

    expect(browserHostHarness.resolveInterrupt).toHaveBeenCalledWith({
      chatId: 'chat_test',
      runId: 'run-paused',
      interruptId: 'interrupt-1',
      approved: true,
      reason: undefined,
      optionId: 'allow-always',
    });
  });

  it('should call actions.sendMessage with body.agent built from useCadAgentConfig when submit fires', async () => {
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
    /* The verb hands over a gesture; the body is the chat admission's answer,
     * composed once per turn by its owner rather than once per call site. */
    expect(await admittedRequest()).toEqual({ kind: 'send', message: sentMessage, body: expectRunBody() });
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

  it('should still allow stop while a request is in flight', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    useChatSelectorMock.mockReturnValue('streaming');
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

    act(() => {
      result.current.stop();
    });

    expect(actions.stop).toHaveBeenCalledTimes(1);
  });

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
    expect(await admittedRequest()).toEqual({
      kind: 'edit',
      messageId: 'msg_99',
      content: 'edited content',
      attachments: [imageAttachment],
      body: expectRunBody(),
    });
  });

  it('should call actions.stop when stop fires', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

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

    const { result } = renderClient();

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

    const { result, rerender } = renderClient();
    const firstAgent = result.current.agent;
    rerender();
    const secondAgent = result.current.agent;

    expect(secondAgent).toBe(firstAgent);
  });

  it('should publish the chat admission and leave it owned by the session on view unmount', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());

    const { unmount } = renderClient();

    // The published admission composes the body when the owner invokes it.
    const turn = await composeTurn({ kind: 'regenerate' });
    expect(turn.request.body).toEqual(expectRunBody());

    unmount();

    // The registry keeps the admission after the view goes: a run may outlive it.
    expect(chatTurnAdmit('chat_test')).toBeDefined();
  });

  /** Mounts the client over a fixed transcript and returns the published bodyless-dispatch factory. */
  const composeSeededBody = async (messages: MyUIMessage[]): Promise<Record<string, unknown>> => {
    mountAgentMock(buildAgent({ execution: { kind: 'tau', model: 'openai-gpt-5.5' } }));
    const chat = mock<Chat<MyUIMessage>>();
    Object.defineProperty(chat, 'messages', { get: () => messages });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    installSessionStore({
      startRun: vi.fn((_chatId: string, body: Readonly<Record<string, unknown>>) => body),
      endRun: vi.fn(),
      get: sessionWithPersistedErrors,
    });

    renderClient();
    const turn = await composeTurn({ kind: 'regenerate' });
    return turn.request.body as Record<string, unknown>;
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
  });

  /*
   * Moved here from `chat-session-store.test.ts` with C3: whether *Try again*
   * resumes the stream or runs a new turn is the admission's call, because only
   * it knows whether the host can still continue the run. A turn the gateway
   * refused at admission leaves a terminal run and no live stream, so resuming
   * it replayed the same failure and the banner's Try again looked inert.
   */
  it('re-runs the turn when a browser-placed chat has no resumable run, and resumes when it has', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    /* One user message, because a continuation leases it: a transcript with
     * none has no turn to continue and `turnIntentOf` refuses it (W10-B). */
    Object.defineProperty(chat, 'messages', { get: () => [{ id: 'user_1', role: 'user', parts: [] }] });
    useActiveChatInstanceMock.mockReturnValue(chat);
    installActions(buildActions());
    renderClient();

    browserHostHarness.placed = true;
    browserHostHarness.resumable = false;
    await expect(composeTurn({ kind: 'continue' })).resolves.toMatchObject({ request: { kind: 'regenerate' } });

    browserHostHarness.resumable = true;
    browserHostHarness.run = { runId: 'run_live' };
    await expect(composeTurn({ kind: 'continue' })).resolves.toMatchObject({
      runId: 'run_live',
      request: { kind: 'continue' },
    });

    // A placement with no browser host answers its own resume over the wire.
    browserHostHarness.placed = false;
    browserHostHarness.resumable = false;
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
    browserHostHarness.resumable = true;
    browserHostHarness.run = { runId: 'run_live' };

    await expect(composeTurn({ kind: 'continue' })).resolves.toEqual({
      runId: 'run_live',
      leaseTurnId: 'user_1',
      request: { kind: 'continue' },
    });
  });

  it('names the host on the execution target and never a checkout or a mode', async () => {
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

    const body = (await admittedBody()) as unknown as {
      readonly agent: CadAgentConfigInput;
      readonly execution: Record<string, unknown>;
    };
    expect(body.agent.execution).toEqual({ kind: 'tau', model: 'openai-gpt-5.5' });
    expect(body.execution).toEqual({ hostId: expect.stringMatching(/^host_/u) as unknown });
  });
});
