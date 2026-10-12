import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { Chat } from '@ai-sdk/react';
import { commandPayloads } from '@taucad/agent-host/wire';
import type { ChatSnapshot, ContextPayload, MyUIMessage } from '@taucad/chat';
import { resolveKernel } from '@taucad/types/constants';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import { useChatSelector, useChatActions } from '#hooks/use-chat.js';
import type { ChatActions } from '#hooks/use-chat.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useChatSnapshot } from '#hooks/use-chat-snapshot.js';
import { useContextPayload } from '#hooks/use-context-payload.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatTurnHost } from '#chat-clients/chat-turn-host.js';
import { chatTurnAdmit, resetChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type * as CadAgentConfigModuleShape from '#hooks/use-cad-agent-config.js';

type CadAgentConfigModule = typeof CadAgentConfigModuleShape;

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: vi.fn(),
  useChatActions: vi.fn(),
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: vi.fn() }));
vi.mock('#hooks/use-chat-snapshot.js', () => ({ useChatSnapshot: vi.fn() }));
vi.mock('#hooks/use-context-payload.js', () => ({ useContextPayload: vi.fn() }));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    ensureModelCatalog: async () => ({ status: 'loaded', models: [] }),
    resolveModel: () => ({
      id: 'openai-gpt-5.5',
      isResolved: true,
      provider: { id: 'openai', name: 'OpenAI' },
      model: { id: 'openai-gpt-5.5', provider: { id: 'openai' }, details: { contextWindow: 128_000 } },
    }),
  }),
}));
// The assembler itself stays real — only the asynchronous capability probe,
// which needs a mounted project filesystem this scope does not have, is stubbed.
vi.mock('#hooks/use-cad-agent-config.js', async (importOriginal) => ({
  ...(await importOriginal<CadAgentConfigModule>()),
  awaitAgentHostAvailability: async () => ({ status: 'available', durability: 'exclusive-append' }),
}));
vi.mock('#chat-clients/_internal/use-active-chat-instance.js', () => ({
  useActiveChatInstance: vi.fn(),
}));
// Unified provider: `useCadAgentConfig` reads model + kernel via
// `useChatComposer()`; `useCadChatClient` reads `activeChatId` via
// `useActiveChatSession()`. Both stub-return the same active id so this
// integration test exercises the real assembler + client wiring.
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: vi.fn(),
  useActiveChatSession: () => ({ activeChatId: 'chat_integration' }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({
    get: () => undefined,
    getProjection: () => undefined,
    requestTurn: vi.fn(),
    startPendingSeed: vi.fn(),
    setTurnPlacement: vi.fn(),
  }),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'proj_integration' }) }));
/* The turn-start pre-flight (R9) is proved in `use-credit-preflight.test.tsx` and
 * `use-cad-chat-client.test.tsx`; this scope funds every turn. */
vi.mock('#hooks/use-credit-preflight.js', () => ({ useCreditPreflight: () => () => undefined }));
/* ChatTurnHost composes a registration only once the project's revision root is connected (W8 TS-S5). */
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionClient: () => ({}) }));
/* ChatTurnHost reads the usage-metrics preference through react-query; this scope has no query client. */
vi.mock('#hooks/use-privacy-preferences.js', () => ({ usePrivacyPreferences: () => ({ preferences: undefined }) }));

const noop = (): void => undefined;
const contextPayloadMock = useContextPayload as unknown as ReturnType<typeof vi.fn>;

/** Mount the client beside the chat's one turn host, which owns the admission. */
const renderClient = (): ReturnType<typeof renderHook<ReturnType<typeof useCadChatClient>, unknown>> =>
  renderHook(() => useCadChatClient(), {
    wrapper: ({ children }) => (
      <>
        <ChatTurnHost />
        {children}
      </>
    ),
  });

/** The host command this chat's admission composes for a fresh turn. */
const admittedCommand = async () => {
  const admit = chatTurnAdmit('chat_integration');
  expect(admit).toBeDefined();
  const turn = await admit!({ kind: 'regenerate' });
  const { command } = turn.request;
  if (command?.type !== 'start') {
    throw new Error('Expected a host Start command.');
  }
  return command;
};

/**
 * Integration scope for the CAD host admission command.
 *
 * Wires the **real** `useCadAgentConfig` assembler hook (with the producer
 * hooks at realistic mocked values) into the **real** `useCadChatClient`,
 * Asserts the focused turn owner composes one Start command accepted by the
 * portable host wire schema, including optional CAD context.
 *
 * @public
 */
const defaultMessages: readonly MyUIMessage[] = [
  {
    id: 'msg_integration',
    role: 'user',
    parts: [{ type: 'text', text: 'integration scope' }],
  },
];

type ActionsMock = {
  sendMessage: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const buildActions = (): ActionsMock => ({
  sendMessage: vi.fn(),
  regenerate: vi.fn(),
  stop: vi.fn(),
});

const installActions = (actions: ActionsMock): void => {
  vi.mocked(useChatActions).mockReturnValue(actions as unknown as ChatActions);
};

beforeEach(() => {
  resetChatTurnServices();
  vi.clearAllMocks();
  vi.mocked(useChatComposer).mockReturnValue({
    draftActorRef: { send: vi.fn() },
    model: {
      modelId: 'openai-gpt-5.5',
      model: { id: 'openai-gpt-5.5', provider: { id: 'openai', name: 'OpenAI' } },
      setActiveModel: noop,
    },
    execution: {
      execution: { kind: 'tau', model: 'openai-gpt-5.5' },
      setActiveExecution: noop,
    },
    kernel: { kernelId: 'replicad', kernel: resolveKernel('replicad'), setActiveKernel: noop },
    status: 'ready',
    agentActivity: 'ready',
    stop: noop,
    contextUsage: undefined,
    session: undefined,
  } as unknown as ChatComposerContextValue);
  vi.mocked(useChatSelector).mockImplementation((selector) =>
    selector({ draftMode: 'agent', draftToolChoice: 'auto', status: 'ready' } as unknown as Parameters<
      typeof selector
    >[0]),
  );
  vi.mocked(useCookie).mockReturnValue([true, noop, noop] as unknown as ReturnType<typeof useCookie>);
  vi.mocked(useChatSnapshot).mockReturnValue(undefined);
  contextPayloadMock.mockReturnValue(undefined);
});

describe('useCadChatClient host admission integration', () => {
  it('should produce a host Start payload accepted by the wire schema', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    chat.messages = [...defaultMessages];
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

    await act(async () => {
      void result.current.submit({ text: 'design a vase' });
    });

    const command = await admittedCommand();
    expect(commandPayloads.start.safeParse(command.payload).success).toBe(true);
    expect(command.payload.config).toMatchObject({
      model: { id: 'openai-gpt-5.5', providerKind: 'openai' },
    });
    expect(command.commandId).toBe(command.payload.runId);
  });

  it('should include snapshot and contextPayload in the host Start config', async () => {
    const snapshot: ChatSnapshot = { activeFile: { path: 'src/main.ts', name: 'main.ts' } };
    const contextPayload: ContextPayload = { memory: { 'AGENTS.md': 'shared rules' } };
    vi.mocked(useChatSnapshot).mockReturnValue(snapshot);
    contextPayloadMock.mockReturnValue(contextPayload);

    const chat = mock<Chat<MyUIMessage>>();
    chat.messages = [...defaultMessages];
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

    await act(async () => {
      void result.current.submit({ text: 'iterate' });
    });

    const command = await admittedCommand();
    expect(commandPayloads.start.safeParse(command.payload).success).toBe(true);
    expect(command.payload.config).toMatchObject({ snapshot, contextPayload });
  });

  it('should reject a Start payload without its user message', async () => {
    const chat = mock<Chat<MyUIMessage>>();
    chat.messages = [...defaultMessages];
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderClient();

    await act(async () => {
      void result.current.submit({ text: 'guard rail' });
    });

    const command = await admittedCommand();
    const badPayload: Record<string, unknown> = { ...command.payload };
    delete badPayload['message'];
    const verdict = commandPayloads.start.safeParse(badPayload);
    expect(verdict.success).toBe(false);
    if (!verdict.success) {
      expect(verdict.error.issues.some((issue) => issue.path.join('.') === 'message')).toBe(true);
    }
  });
});
