import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@taucad/chat';

const generate = vi.fn();
const client = { generate };

vi.mock('#chat-clients/use-project-name-client.js', () => ({ useProjectNameClient: () => client }));

// Naming is project-scoped: the hook reads `projectId` off the project
// context and forwards it to the name client.
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project_test' }) }));

const { useActiveChatNaming } = await import('#routes/w.$workspace.$project/use-active-chat-naming.js');

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

  it('does nothing for an already named or message-less chat', async () => {
    const applyGeneratedChatName = vi.fn();
    const { rerender } = renderHook(
      ({ activeChat }) =>
        useActiveChatNaming({
          activeChat,
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
