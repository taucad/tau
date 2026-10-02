import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useCadAgentConfig: vi.fn(),
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
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: vi.fn(),
}));

const useCadAgentConfigMock = vi.mocked(useCadAgentConfig);
const useActiveChatInstanceMock = vi.mocked(useActiveChatInstance);
const useChatActionsMock = vi.mocked(useChatActions);
const useChatSelectorMock = vi.mocked(useChatSelector);

const buildAgent = (overrides: Partial<CadAgentConfigInput> = {}): CadAgentConfigInput => ({
  profile: 'cad',
  model: 'openai-gpt-5.5',
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
};

const buildActions = (): ActionsMock => ({
  sendMessage: vi.fn(),
  regenerate: vi.fn(),
  retryMessage: vi.fn(),
  editMessage: vi.fn(),
  stop: vi.fn(),
});

const mountAgentMock = (agent: CadAgentConfigInput): void => {
  useCadAgentConfigMock.mockReturnValue(agent);
};

const installActions = (actions: ActionsMock): void => {
  useChatActionsMock.mockReturnValue(actions as unknown as ChatActions);
};

const installSessionStore = (partial: Partial<ChatSessionStore>): void => {
  vi.mocked(useChatSessionStore).mockReturnValue(partial as ChatSessionStore);
};

const installActiveSession = (activeChatId: string): void => {
  vi.mocked(useActiveChatSession).mockReturnValue({
    activeChatId,
  } as unknown as ActiveChatSessionContextValue);
};

beforeEach(() => {
  vi.clearAllMocks();
  mountAgentMock(buildAgent());
  useChatSelectorMock.mockReturnValue('ready');
  installActiveSession('chat_test');
  installSessionStore({ setLatestAgentBody: vi.fn() });
});

describe('useCadChatClient', () => {
  it('should call actions.sendMessage with body.agent built from useCadAgentConfig when submit fires', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'hello world' });
    });

    expect(actions.sendMessage).toHaveBeenCalledTimes(1);
    const [sentMessage, options] = actions.sendMessage.mock.calls[0]! as [
      MyUIMessage,
      { body?: Record<string, unknown> } | undefined,
    ];
    expect(sentMessage).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'hello world' }],
    });
    expect(options).toEqual({ body: { agent: buildAgent() } });
  });

  it('should call actions.retryMessage with body.agent and the supplied messageId when retry fires', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.retry('msg_42');
    });

    expect(actions.retryMessage).toHaveBeenCalledTimes(1);
    expect(actions.retryMessage).toHaveBeenCalledWith('msg_42', { body: { agent: buildAgent() } });
  });

  it('should override `body.agent.model` when retry is given a modelId, leaving every other agent field intact', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.retry('msg_42', 'anthropic-claude-4.7');
    });

    expect(actions.retryMessage).toHaveBeenCalledTimes(1);
    expect(actions.retryMessage).toHaveBeenCalledWith('msg_42', {
      body: { agent: buildAgent({ model: 'anthropic-claude-4.7' }) },
    });
  });

  it('should call actions.editMessage with body.agent and the rebuilt content when edit fires', () => {
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

    expect(actions.editMessage).toHaveBeenCalledTimes(1);
    expect(actions.editMessage).toHaveBeenCalledWith('msg_99', 'edited content', {
      imageUrls: ['data:image/png;base64,AAA'],
      body: { agent: buildAgent() },
    });
  });

  it('should call actions.regenerate with body.agent when regenerateTail fires', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);

    const { result } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.regenerateTail();
    });

    expect(actions.regenerate).toHaveBeenCalledTimes(1);
    expect(actions.regenerate).toHaveBeenCalledWith({ body: { agent: buildAgent() } });
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

  it('should publish the latest agent body to the chat-session store on mount and clear on unmount', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const setLatestAgentBody = vi.fn();
    installSessionStore({ setLatestAgentBody });

    const { unmount } = renderHook(() => useCadChatClient());

    expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', { agent: buildAgent() });

    unmount();

    expect(setLatestAgentBody).toHaveBeenLastCalledWith('chat_test', undefined);
  });

  it('should republish the agent body under the new chat id when activeChatId changes', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    const setLatestAgentBody = vi.fn();
    installSessionStore({ setLatestAgentBody });

    const { rerender } = renderHook(() => useCadChatClient());

    expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', { agent: buildAgent() });

    installActiveSession('chat_second');
    rerender();

    // Cleanup of the previous chat fires first, then the new chat's publish.
    expect(setLatestAgentBody).toHaveBeenCalledWith('chat_test', undefined);
    expect(setLatestAgentBody).toHaveBeenCalledWith('chat_second', { agent: buildAgent() });
  });

  it('should rebuild submit when the agent identity changes so a fresh body is sent on the next call', () => {
    const chat = mock<Chat<MyUIMessage>>();
    useActiveChatInstanceMock.mockReturnValue(chat);
    const actions = buildActions();
    installActions(actions);
    mountAgentMock(buildAgent({ kernel: 'replicad' }));

    const { result, rerender } = renderHook(() => useCadChatClient());

    act(() => {
      result.current.submit({ text: 'first' });
    });
    expect(actions.sendMessage.mock.calls.at(-1)?.[1]).toEqual({
      body: { agent: buildAgent({ kernel: 'replicad' }) },
    });

    mountAgentMock(buildAgent({ kernel: 'openscad' }));
    rerender();

    act(() => {
      result.current.submit({ text: 'second' });
    });
    expect(actions.sendMessage.mock.calls.at(-1)?.[1]).toEqual({
      body: { agent: buildAgent({ kernel: 'openscad' }) },
    });
  });
});
