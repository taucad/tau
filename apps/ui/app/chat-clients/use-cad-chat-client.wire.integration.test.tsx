import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { Chat } from '@ai-sdk/react';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
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

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: vi.fn(),
  useChatActions: vi.fn(),
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: vi.fn() }));
vi.mock('#hooks/use-chat-snapshot.js', () => ({ useChatSnapshot: vi.fn() }));
vi.mock('#hooks/use-context-payload.js', () => ({ useContextPayload: vi.fn() }));
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
  useChatSessionStore: () => ({ setLatestAgentBody: vi.fn() }),
}));

const noop = (): void => undefined;

/**
 * Integration scope for the CAD chat client wire body.
 *
 * Wires the **real** `useCadAgentConfig` assembler hook (with the producer
 * hooks at realistic mocked values) into the **real** `useCadChatClient`,
 * intercepts the `body` the client hands to `useChatActions`'s
 * `sendMessage` / `regenerate` / `retryMessage` verbs (this is the same
 * `body` the chat-session-store dispatcher forwards to `Chat.sendMessage` /
 * `Chat.regenerate`), and asserts the composed wire body parses cleanly
 * through the **shared** `chatTurnRequestSchema` from `@taucad/chat/schemas`.
 *
 * That same schema is what the API uses to validate `POST /v1/chat`, so a
 * green test here proves the client/server contract holds end-to-end.
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

const buildWireBody = (
  capturedBody: Record<string, unknown> | undefined,
  overrides: Partial<{ id: string; messages: readonly MyUIMessage[] }> = {},
): unknown => ({
  id: overrides.id ?? 'chat_integration',
  messages: overrides.messages ?? defaultMessages,
  ...capturedBody,
});

type ActionsMock = {
  sendMessage: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
  retryMessage: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const buildActions = (): ActionsMock => ({
  sendMessage: vi.fn(),
  regenerate: vi.fn(),
  retryMessage: vi.fn(),
  stop: vi.fn(),
});

const installActions = (actions: ActionsMock): void => {
  vi.mocked(useChatActions).mockReturnValue(actions as unknown as ChatActions);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useChatComposer).mockReturnValue({
    draftActorRef: { send: vi.fn() },
    model: { modelId: 'openai-gpt-5.5', model: undefined, setActiveModel: noop },
    kernel: { kernelId: 'replicad', kernel: resolveKernel('replicad'), setActiveKernel: noop },
    status: 'ready',
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
  vi.mocked(useContextPayload).mockReturnValue(undefined);
});

describe('useCadChatClient wire integration', () => {
  it('should produce a body the API schema accepts when submit fires with minimal producer-hook state', () => {
    const chat = mock<Chat<MyUIMessage>>();
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'design a vase' });
    });

    const [, options] = actions.sendMessage.mock.calls[0]! as [unknown, { body?: Record<string, unknown> } | undefined];
    const wireBody = buildWireBody(options?.body);

    expect(() => chatTurnRequestSchema.parse(wireBody)).not.toThrow();
    const parsed = chatTurnRequestSchema.parse(wireBody);
    expect(parsed.agent).toMatchObject({
      profile: 'cad',
      model: 'openai-gpt-5.5',
      kernel: 'replicad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
    });
  });

  it('should produce a body the API schema accepts when snapshot and contextPayload are present', () => {
    const snapshot: ChatSnapshot = { activeFile: { path: 'src/main.ts', name: 'main.ts' } };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `AGENTS.md` is a filesystem key, not a JS identifier
    const contextPayload: ContextPayload = { memory: { 'AGENTS.md': 'shared rules' } };
    vi.mocked(useChatSnapshot).mockReturnValue(snapshot);
    vi.mocked(useContextPayload).mockReturnValue(contextPayload);

    const chat = mock<Chat<MyUIMessage>>();
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'iterate' });
    });

    const [, options] = actions.sendMessage.mock.calls[0]! as [unknown, { body?: Record<string, unknown> } | undefined];
    const wireBody = buildWireBody(options?.body);

    const parsed = chatTurnRequestSchema.parse(wireBody);
    expect(parsed.agent).toMatchObject({ snapshot, contextPayload });
  });

  it('should produce a body the API schema accepts when retry fires for a specific message id', () => {
    const chat = mock<Chat<MyUIMessage>>();
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.retry('msg_target');
    });

    const [messageId, options] = actions.retryMessage.mock.calls[0]! as [
      string,
      { body?: Record<string, unknown> } | undefined,
    ];
    const wireBody = buildWireBody(options?.body);

    expect(() => chatTurnRequestSchema.parse(wireBody)).not.toThrow();
    expect(messageId).toBe('msg_target');
  });

  it('should produce a body the API schema accepts when regenerateTail fires', () => {
    const chat = mock<Chat<MyUIMessage>>();
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.regenerateTail();
    });

    const [options] = actions.regenerate.mock.calls[0]! as [{ body?: Record<string, unknown> } | undefined];
    const wireBody = buildWireBody(options?.body);

    expect(() => chatTurnRequestSchema.parse(wireBody)).not.toThrow();
  });

  it('should produce a body the API schema rejects with a missing-agent path when the agent block is removed', () => {
    const chat = mock<Chat<MyUIMessage>>();
    vi.mocked(useActiveChatInstance).mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'guard rail' });
    });

    const [, options] = actions.sendMessage.mock.calls[0]! as [unknown, { body?: Record<string, unknown> } | undefined];
    const goodBody = buildWireBody(options?.body) as Record<string, unknown>;
    const badBody = { ...goodBody };
    delete badBody['agent'];

    const verdict = chatTurnRequestSchema.safeParse(badBody);
    expect(verdict.success).toBe(false);
    if (!verdict.success) {
      expect(verdict.error.issues.some((issue) => issue.path[0] === 'agent')).toBe(true);
    }
  });
});
