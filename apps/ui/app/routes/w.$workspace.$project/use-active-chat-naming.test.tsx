import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@taucad/chat';

const generate = vi.fn();
const client = { generate };

vi.mock('#chat-clients/use-project-name-client.js', () => ({ useProjectNameClient: () => client }));

// Naming is project-scoped: the hook reads `projectId` off the project
// context and forwards it to the name client.
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project_test' }) }));

const { namingDeferral, useActiveChatNaming } = await import('#routes/w.$workspace.$project/use-active-chat-naming.js');

const makeChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: 'chat_new',
  resourceId: 'project_test',
  name: 'New chat',
  messages: [
    {
      id: 'msg_user',
      role: 'user',
      parts: [{ type: 'text', text: 'design a bracket' }],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('useActiveChatNaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies a generated name from the first user message exactly once per active chat', async () => {
    const applyGeneratedChatName = vi.fn().mockResolvedValue(undefined);
    generate.mockResolvedValue('  Bracket design  ');
    const { rerender } = renderHook(
      ({ activeChat }) =>
        useActiveChatNaming({
          activeChat,
          firstMessage: activeChat.messages[0],
          isProjectLoading: false,
          isChatsLoading: false,
          applyGeneratedChatName,
        }),
      { initialProps: { activeChat: makeChat() } },
    );

    await waitFor(() => {
      expect(generate).toHaveBeenCalledWith({ projectId: 'project_test', text: 'design a bracket' });
      expect(applyGeneratedChatName).toHaveBeenCalledWith('chat_new', 'Bracket design');
    });
    rerender({ activeChat: makeChat({ updatedAt: 2 }) });
    expect(generate).toHaveBeenCalledOnce();
  });

  /* Chat performance WP-05 (server audit S-09): naming must not contend with the chat's first model step. */
  it('waits for the first model step to answer before it names the chat', async () => {
    const applyGeneratedChatName = vi.fn().mockResolvedValue(undefined);
    generate.mockResolvedValue('Bracket design');
    const activeChat = makeChat();
    const { rerender } = renderHook(
      ({ isAwaitingFirstStep }) =>
        useActiveChatNaming({
          activeChat,
          firstMessage: activeChat.messages[0],
          isProjectLoading: false,
          isChatsLoading: false,
          isAwaitingFirstStep,
          applyGeneratedChatName,
        }),
      { initialProps: { isAwaitingFirstStep: true } },
    );
    await Promise.resolve();
    expect(generate).not.toHaveBeenCalled();

    rerender({ isAwaitingFirstStep: false });

    await waitFor(() => {
      expect(applyGeneratedChatName).toHaveBeenCalledWith('chat_new', 'Bracket design');
    });
  });

  it('names the chat anyway when the first model step has not answered within the deferral', async () => {
    vi.useFakeTimers();
    try {
      const applyGeneratedChatName = vi.fn().mockResolvedValue(undefined);
      generate.mockResolvedValue('Bracket design');
      const activeChat = makeChat();
      renderHook(() =>
        useActiveChatNaming({
          activeChat,
          firstMessage: activeChat.messages[0],
          isProjectLoading: false,
          isChatsLoading: false,
          isAwaitingFirstStep: true,
          applyGeneratedChatName,
        }),
      );
      await vi.advanceTimersByTimeAsync(namingDeferral - 1);
      expect(generate).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(generate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing for an already named or message-less chat', async () => {
    const applyGeneratedChatName = vi.fn();
    const { rerender } = renderHook(
      ({ activeChat }) =>
        useActiveChatNaming({
          activeChat,
          firstMessage: activeChat.messages[0],
          isProjectLoading: false,
          isChatsLoading: false,
          applyGeneratedChatName,
        }),
      { initialProps: { activeChat: makeChat({ name: 'Custom' }) } },
    );
    rerender({ activeChat: makeChat({ id: 'chat_empty', messages: [] }) });

    await Promise.resolve();
    expect(generate).not.toHaveBeenCalled();
    expect(applyGeneratedChatName).not.toHaveBeenCalled();
  });

  it('contains generator failures without crashing the shell', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generate.mockRejectedValue(new Error('timeout'));
    renderHook(() =>
      useActiveChatNaming({
        activeChat: makeChat(),
        firstMessage: makeChat().messages[0],
        isProjectLoading: false,
        isChatsLoading: false,
        applyGeneratedChatName: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledOnce();
    });
    consoleError.mockRestore();
  });
});
